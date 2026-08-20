# ecommerce

AI 友好型架构最佳实践演示项目：契约优先、DDD + 端口适配器、垂直切片交付。

## 阶段状态

- [x] 基建：CI 门禁、AI review、merge queue
- [ ] 契约设计：产品、架构、UI/UX 制品与机器契约
- [ ] 需求拆分：垂直切片 Issue
- [ ] 切片实现：双层垂直 TDD
- [ ] 方法论沉淀

## 结构

- `contracts/` API 与事件契约（proto、JSON Schema）
- `crates/` Rust 限界上下文
- `apps/` 前端（Astro + Bun）
- `tools/` 项目工具（文档校验、审查结论提交）
- `docs/` 产品、架构、设计文档与 ADR
- `.agents/skills/` 项目 skill
- `.github/` CI 编排与驱动（工作流侧代码，与项目代码隔离）

## 本地开发

依赖：Rust stable（1.85+）、Bun、cargo-nextest（安装见 https://nexte.st/book/pre-built-binaries.html ）。

```bash
make check   # 全部检查
make test    # 全部测试
```

## 门禁

每个 PR 必须通过 `CI / Required` 与 `Review / Required`（AI 审查）；合并经 merge queue，在组合 SHA 上重验。
