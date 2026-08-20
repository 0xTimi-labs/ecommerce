// 审查结论提交脚本（确定性，供审查 skill 调用）
// 用法：bun tools/review-submit/submit.ts --verdict pass|block [--findings-file <path>]
// 结果写入 REVIEW_RESULT_FILE 环境变量指定的路径（默认 .review-result.json）

const args = Bun.argv.slice(2);

function valueOf(flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined;
}

const verdict = valueOf("--verdict");
const findingsFile = valueOf("--findings-file");

if (verdict !== "pass" && verdict !== "block") {
  console.error("用法：submit.ts --verdict pass|block [--findings-file <path>]");
  process.exit(2);
}

const result: { verdict: string; findings?: unknown } = { verdict };

if (verdict === "block") {
  if (!findingsFile) {
    console.error("verdict=block 时必须提供 --findings-file");
    process.exit(2);
  }
  let findings: unknown;
  try {
    findings = JSON.parse(await Bun.file(findingsFile).text());
  } catch {
    console.error(`findings 文件不可读或非法 JSON: ${findingsFile}`);
    process.exit(2);
  }
  if (!Array.isArray(findings)) {
    console.error("findings 必须是数组");
    process.exit(2);
  }
  result.findings = findings;
}

const outFile = process.env.REVIEW_RESULT_FILE ?? ".review-result.json";
await Bun.write(outFile, JSON.stringify(result, null, 2));
console.log(`结论已提交: verdict=${verdict}`);
