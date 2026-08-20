.PHONY: check test rust-check rust-test tools-check

check: rust-check tools-check
test: rust-test tools-check

# workspace 无成员（契约阶段之前）时跳过，机器证据来自 cargo metadata
rust-check:
	@if cargo metadata --no-deps --format-version 1 2>/dev/null | tr -d '\n ' | grep -q '"packages":\[\]'; then \
		echo "rust: N/A（workspace 无成员）"; \
	else \
		cargo fmt --all --check && cargo clippy --all-targets --all-features -- -D warnings; \
	fi

rust-test:
	@if cargo metadata --no-deps --format-version 1 2>/dev/null | tr -d '\n ' | grep -q '"packages":\[\]'; then \
		echo "rust: N/A（workspace 无成员）"; \
	else \
		cargo nextest run --workspace; \
	fi

tools-check:
	cd tools/review-submit && bun test
