// AI review 驱动：选择 skill → 创建 check run → 调 pi 审查 → 读结果文件 → 发布结论
// 判定链 fail-closed：任何异常路径（缺凭证、pi 失败、无结果文件、文件非法）都落 failure

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";

const PI_MODEL = "deepseek/deepseek-v4-pro";
const SESSION_DIR = ".pi_session";

export interface Finding {
  severity: "P0" | "P1" | "P2";
  file: string;
  summary: string;
}

export interface ReviewResult {
  verdict: "pass" | "block";
  findings?: Finding[];
}

// 审查状态机
// ReviewMode（事件与会话决定审查形态）：
//   FRESH    — 无会话：全量审查，新建会话
//   CONTINUE — 同 PR 后续 push 且有会话：续接复查（聚焦既有发现与新增 diff）
//   GROUP    — merge_group 组合 SHA：独立全量审查，不复用会话
// 判定状态流转：in_progress → completed(success|failure)；任何异常 → failure（fail-closed）
export type ReviewMode = "FRESH" | "CONTINUE" | "GROUP";

export function resolveReviewMode(eventName: string, sessionFile: string | null): ReviewMode {
  if (eventName === "merge_group") return "GROUP";
  return sessionFile ? "CONTINUE" : "FRESH";
}

export function buildPrompt(mode: ReviewMode, skill: string): string {
  const base = `/skill:${skill}`;
  if (mode === "CONTINUE") {
    return `${base}\n这是同一 PR 的后续推送：复查既有发现的关闭情况，并审查新增变更`;
  }
  return base;
}

// 契约相关文件变更 → artifact-reviewer；否则 code-reviewer
export function pickReviewSkill(changedFiles: string[]): string {
  const contractMarker = /^(contracts\/|docs\/|tests\/features\/|context\.md|context-map\.md)/;
  return changedFiles.some((f) => contractMarker.test(f)) ? "artifact-reviewer" : "code-reviewer";
}

// 取目录中 mtime 最新且 header 合法的会话文件
export function latestSessionFile(dir: string): string | null {
  let candidate: { path: string; mtime: number } | null = null;
  let names: string[] = [];
  try {
    names = readdirSync(dir);
  } catch {
    return null;
  }
  for (const name of names) {
    if (!name.endsWith(".jsonl")) continue;
    const path = join(dir, name);
    try {
      const headerLine = readFileSync(path, "utf-8").split("\n", 1)[0] ?? "";
      const header = JSON.parse(headerLine);
      if (header?.type !== "session") continue;
      const mtime = statSync(path).mtimeMs;
      if (!candidate || mtime > candidate.mtime) candidate = { path, mtime };
    } catch {
      // 损坏文件跳过
    }
  }
  return candidate?.path ?? null;
}

// 严格解析结果文件，不猜测内容
export function parseResult(content: string): ReviewResult {
  const data = JSON.parse(content) as ReviewResult;
  if (data?.verdict !== "pass" && data?.verdict !== "block") {
    throw new Error(`未知 verdict: ${String(data?.verdict)}`);
  }
  return data;
}

function changedFilesForPr(repo: string, prNumber: string): string[] {
  const proc = spawnSync("gh", ["pr", "diff", prNumber, "--name-only", "--repo", repo], {
    encoding: "utf-8",
  });
  if (proc.status !== 0) throw new Error(`gh pr diff 失败: ${proc.stderr}`);
  return proc.stdout.split("\n").map((l) => l.trim()).filter(Boolean);
}

function changedFilesForMergeGroup(baseRef: string): string[] {
  const proc = spawnSync("git", ["diff", "--name-only", `origin/${baseRef}...HEAD`], {
    encoding: "utf-8",
  });
  if (proc.status !== 0) return [];
  return proc.stdout.split("\n").map((l) => l.trim()).filter(Boolean);
}

function createCheckRun(repo: string, headSha: string): number {
  const proc = spawnSync(
    "gh",
    [
      "api",
      `repos/${repo}/check-runs`,
      "-X", "POST",
      "-f", "name=AI Review",
      "-f", `head_sha=${headSha}`,
      "-f", "status=in_progress",
    ],
    { encoding: "utf-8" },
  );
  if (proc.status !== 0) throw new Error(`创建 check run 失败: ${proc.stderr}`);
  const id = JSON.parse(proc.stdout).id;
  if (!id) throw new Error("check run 响应缺少 id");
  return id;
}

function finishCheckRun(repo: string, checkRunId: number, conclusion: string, summary: string): void {
  const completedAt = new Date().toISOString();
  const proc = spawnSync(
    "gh",
    [
      "api",
      `repos/${repo}/check-runs/${checkRunId}`,
      "-X", "PATCH",
      "-f", "status=completed",
      "-f", `conclusion=${conclusion}`,
      "-f", `completed_at=${completedAt}`,
      "-F", "output[title]=AI Review",
      "-F", `output[summary]=${summary}`,
    ],
    { encoding: "utf-8" },
  );
  if (proc.status !== 0) console.error(`发布结论失败: ${proc.stderr}`);
}

function formatFinding(f: Finding): string {
  return `- [${f.severity}] ${f.file}: ${f.summary}`;
}

if (import.meta.main) {
  const eventName = process.env.GITHUB_EVENT_NAME ?? "";
  const repo = process.env.GITHUB_REPOSITORY ?? "";
  const headSha = process.env.HEAD_SHA ?? "";
  const prNumber = process.env.PR_NUMBER || undefined;
  const isFork = process.env.IS_FORK === "true";

  if (!repo || !headSha) {
    console.error("缺少 GITHUB_REPOSITORY 或 HEAD_SHA");
    process.exit(1);
  }

  // fork PR：GITHUB_TOKEN 只读且拿不到模型凭证，无法发布 check run 也无法审查
  // exit 1 让 Review / Required 变红：外部 PR 不因跳过而获绿，需人类处理（fail-closed）
  if (eventName === "pull_request" && isFork) {
    console.error("fork PR：无审查能力，Review / Required 阻断");
    process.exit(1);
  }
  if (!process.env.DEEPSEEK_API_KEY) {
    console.error("缺少 DEEPSEEK_API_KEY");
    process.exit(1);
  }

  const changedFiles =
    eventName === "merge_group"
      ? changedFilesForMergeGroup(process.env.BASE_REF ?? "main")
      : changedFilesForPr(repo, prNumber ?? "");
  const skill = pickReviewSkill(changedFiles);

  const sessionFile = latestSessionFile(join(process.cwd(), SESSION_DIR));
  const mode = resolveReviewMode(eventName, sessionFile);
  const prompt = buildPrompt(mode, skill);

  const checkRunId = createCheckRun(repo, headSha);
  const finish = (conclusion: string, summary: string): void =>
    finishCheckRun(repo, checkRunId, conclusion, summary);

  const piArgs = [
    "-p", prompt,
    "--approve",
    "--session-dir", SESSION_DIR,
    "--model", PI_MODEL,
  ];
  if (mode === "CONTINUE" && sessionFile) piArgs.push("--session", sessionFile);

  console.log(`审查启动: mode=${mode} skill=${skill} session=${sessionFile ?? "(新会话)"}`);
  const pi = spawnSync("pi", piArgs, { encoding: "utf-8", env: process.env });
  if (pi.status !== 0) {
    finish("failure", `审查未完成：pi 退出码 ${pi.status}`);
    process.exit(1);
  }

  // pi 运行后再取最新会话作为保留目标（FRESH 模式下新会话刚生成）
  const sessionDir = join(process.cwd(), SESSION_DIR);
  const activeSession = latestSessionFile(sessionDir);
  for (const name of existsSync(sessionDir) ? readdirSync(sessionDir) : []) {
    const path = join(sessionDir, name);
    if (path !== activeSession && name.endsWith(".jsonl")) {
      try {
        unlinkSync(path);
      } catch {
        // 清理失败不影响门禁
      }
    }
  }

  const resultFile = process.env.REVIEW_RESULT_FILE ?? join(process.cwd(), ".review-result.json");
  if (!existsSync(resultFile)) {
    finish("failure", "未收到审查结论（审查未调用 submit 脚本）");
    process.exit(1);
  }

  let result: ReviewResult;
  try {
    result = parseResult(readFileSync(resultFile, "utf-8"));
  } catch (e) {
    finish("failure", `结果文件非法: ${String(e)}`);
    process.exit(1);
  }

  if (result.verdict === "pass") {
    const notes = result.findings ?? [];
    const summary =
      notes.length > 0
        ? `审查通过（${notes.length} 条建议）：\n${notes.map(formatFinding).join("\n")}`
        : "审查通过，无 P0 阻断";
    finish("success", summary);
  } else {
    const lines = (result.findings ?? []).map(formatFinding);
    finish("failure", `审查阻断（P0）：\n${lines.join("\n")}`);
    process.exit(1);
  }
}
