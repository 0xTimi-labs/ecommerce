// 聚合门禁判定：读 needs 结果，全部 success 才放行
// 输入：GATE_RESULTS 环境变量（workflow 中 toJson(needs) 生成）

export function judge(results: Record<string, { result?: string }>): string[] {
  if (Object.keys(results).length === 0) return ["(无结果)"];
  return Object.entries(results)
    .filter(([, v]) => v.result !== "success")
    .map(([name]) => name);
}

if (import.meta.main) {
  const results = JSON.parse(process.env.GATE_RESULTS ?? "{}") as Record<string, { result?: string }>;
  const failed = judge(results);
  if (failed.length > 0) {
    console.error(`gate: 未通过（${failed.join(", ")}）`);
    process.exit(1);
  }
  console.log("gate: 全部通过");
}
