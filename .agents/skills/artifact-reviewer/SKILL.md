---
name: artifact-reviewer
description: 审查契约与设计制品 PR；当契约、术语、架构文档或验收场景发生变化需要审查时使用
---

单次扫描完整审查清单，输出全部发现，完成后调用提交脚本

## 审查清单

- 术语：`context.md` 与契约字段、场景用词一致，无同义词漂移
- ADR：遵循 `docs/adr/` 既有准则与格式，见 /domain-modeling
- 契约：`contracts/` 下 proto 与事件 schema 的字段形态、命名全局一致
- 场景：`tests/features/` 为黑盒 Given-When-Then，未实现场景带 @pending
- 制品边界：契约阶段只允许设计制品，不含业务实现

## 提交结论

1. 有发现时写入 `.review-findings.json`：`[{"severity":"P0|P1|P2","file":"路径","summary":"一句话"}]`
2. 执行 `bun tools/review-submit/submit.ts --verdict block --findings-file .review-findings.json`，无 P0 时执行 `--verdict pass`

P0 阻断合并，P1/P2 不阻断
