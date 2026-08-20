import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildPrompt, latestSessionFile, parseResult, pickReviewSkill, resolveReviewMode } from "./run";

test("契约相关文件选择 artifact-reviewer", () => {
  expect(pickReviewSkill(["contracts/proto/ordering/v1/ordering.proto"])).toBe("artifact-reviewer");
  expect(pickReviewSkill(["docs/adr/0001-x.md"])).toBe("artifact-reviewer");
  expect(pickReviewSkill(["tests/features/order_creation.feature"])).toBe("artifact-reviewer");
  expect(pickReviewSkill(["context.md"])).toBe("artifact-reviewer");
});

test("实现文件选择 code-reviewer", () => {
  expect(pickReviewSkill(["crates/ordering/src/domain/order.rs"])).toBe("code-reviewer");
  expect(pickReviewSkill(["apps/web/src/index.ts"])).toBe("code-reviewer");
});

test("latestSessionFile 取 mtime 最新且 header 合法", () => {
  const dir = mkdtempSync(join(tmpdir(), "session-"));
  mkdirSync(dir, { recursive: true });
  const old = join(dir, "old.jsonl");
  const fresh = join(dir, "fresh.jsonl");
  writeFileSync(old, '{"type":"session","id":"a"}\n{"x":1}\n');
  writeFileSync(fresh, '{"type":"session","id":"b"}\n');
  // mtime 调整：fresh 更新
  const now = new Date();
  utimesSync(old, now, new Date(now.getTime() - 60000));
  utimesSync(fresh, now, now);
  expect(latestSessionFile(dir)).toBe(fresh);
});

test("latestSessionFile 跳过损坏文件", () => {
  const dir = mkdtempSync(join(tmpdir(), "session-"));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "broken.jsonl"), "not-json\n");
  expect(latestSessionFile(dir)).toBeNull();
});

test("latestSessionFile 目录不存在返回 null", () => {
  expect(latestSessionFile("/nonexistent/path")).toBeNull();
});

test("parseResult 只接受 pass 与 block", () => {
  expect(parseResult('{"verdict":"pass"}').verdict).toBe("pass");
  expect(parseResult('{"verdict":"block","findings":[]}').verdict).toBe("block");
  expect(() => parseResult('{"verdict":"maybe"}')).toThrow();
  expect(() => parseResult("not json")).toThrow();
});

test("状态机：merge_group 为 GROUP，pull_request 按会话分 FRESH/CONTINUE", () => {
  expect(resolveReviewMode("merge_group", null)).toBe("GROUP");
  expect(resolveReviewMode("merge_group", "session.jsonl")).toBe("GROUP");
  expect(resolveReviewMode("pull_request", null)).toBe("FRESH");
  expect(resolveReviewMode("pull_request", "session.jsonl")).toBe("CONTINUE");
});

test("状态机：CONTINUE 追加复查指令，其余模式保持单一 skill 触发", () => {
  expect(buildPrompt("FRESH", "code-reviewer")).toBe("/skill:code-reviewer");
  expect(buildPrompt("GROUP", "artifact-reviewer")).toBe("/skill:artifact-reviewer");
  expect(buildPrompt("CONTINUE", "code-reviewer")).toContain("/skill:code-reviewer");
  expect(buildPrompt("CONTINUE", "code-reviewer")).toContain("复查既有发现");
});
