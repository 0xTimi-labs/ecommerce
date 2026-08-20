import { expect, test } from "bun:test";
import { judge } from "./gate";

test("全部 success 时放行", () => {
  expect(judge({ rust: { result: "success" }, tools: { result: "success" } })).toEqual([]);
});

test("任一非 success 即拦截", () => {
  expect(judge({ rust: { result: "failure" }, tools: { result: "success" } })).toEqual(["rust"]);
});

test("skipped 与 cancelled 同样拦截（fail-closed）", () => {
  expect(judge({ rust: { result: "skipped" } })).toEqual(["rust"]);
  expect(judge({ rust: { result: "cancelled" } })).toEqual(["rust"]);
});

test("空结果同样拦截（fail-closed）", () => {
  expect(judge({})).toEqual(["(无结果)"]);
});
