.PHONY: check test fmt lint

# 本地开发入口
check: fmt lint test

test:
	cargo nextest run --workspace
	bun test tools/review-submit

fmt:
	cargo fmt --all --check

lint:
	cargo clippy --all-targets --all-features -- -D warnings
