import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SUBMIT = join(import.meta.dir, "submit.ts");

function runSubmit(dir: string, args: string[]): { exitCode: number; resultFile: string } {
  const resultFile = join(dir, "result.json");
  const proc = Bun.spawnSync(["bun", SUBMIT, ...args], {
    env: { ...process.env, REVIEW_RESULT_FILE: resultFile },
    cwd: dir,
    encoding: "utf-8",
  });
  return { exitCode: proc.exitCode, resultFile };
}

test("缺少 --verdict 退出 2", () => {
  const dir = mkdtempSync(join(tmpdir(), "submit-"));
  const { exitCode } = runSubmit(dir, []);
  expect(exitCode).toBe(2);
});

test("verdict=pass 写入结果文件", () => {
  const dir = mkdtempSync(join(tmpdir(), "submit-"));
  const { exitCode, resultFile } = runSubmit(dir, ["--verdict", "pass"]);
  expect(exitCode).toBe(0);
  expect(JSON.parse(readFileSync(resultFile, "utf-8"))).toEqual({ verdict: "pass" });
});

test("verdict=block 缺少 findings 文件退出 2", () => {
  const dir = mkdtempSync(join(tmpdir(), "submit-"));
  const { exitCode } = runSubmit(dir, ["--verdict", "block"]);
  expect(exitCode).toBe(2);
});

test("verdict=block 携带合法 findings 写入结果", () => {
  const dir = mkdtempSync(join(tmpdir(), "submit-"));
  const findings = join(dir, "findings.json");
  writeFileSync(findings, JSON.stringify([{ severity: "P0", file: "a.rs", summary: "x" }]));
  const { exitCode, resultFile } = runSubmit(dir, ["--verdict", "block", "--findings-file", findings]);
  expect(exitCode).toBe(0);
  const parsed = JSON.parse(readFileSync(resultFile, "utf-8"));
  expect(parsed.verdict).toBe("block");
  expect(parsed.findings).toHaveLength(1);
});

test("findings 非数组退出 2", () => {
  const dir = mkdtempSync(join(tmpdir(), "submit-"));
  const findings = join(dir, "findings.json");
  writeFileSync(findings, JSON.stringify({ not: "array" }));
  const { exitCode } = runSubmit(dir, ["--verdict", "block", "--findings-file", findings]);
  expect(exitCode).toBe(2);
});

test("非法 verdict 退出 2", () => {
  const dir = mkdtempSync(join(tmpdir(), "submit-"));
  const { exitCode } = runSubmit(dir, ["--verdict", "maybe"]);
  expect(exitCode).toBe(2);
});
