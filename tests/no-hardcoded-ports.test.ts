import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

// Same pattern the Openfront conformance audit (C14) uses for code, config and env.example.
const PORT_PATTERN = /localhost:[0-9]{4}|127\.0\.0\.1:[0-9]{4}|(--port|-p)\s+[0-9]{4}|PORT\s*(\|\||\?\?|=)\s*['"]?[0-9]{4}|port:\s*[0-9]{4}/;
const SCANNED = /\.(ts|tsx|js|mjs|cjs|json|toml|ya?ml)$|(^|\/)(env\.example|\.env\.example)$/;

test("no tracked code, config or env.example hard-codes a local port", () => {
  const files = execFileSync("git", ["ls-files"], { encoding: "utf8" })
    .split("\n")
    .filter((file) => SCANNED.test(file) && !file.startsWith("tests/") && !file.startsWith(".keystone/") && file !== "package-lock.json");
  const hits: string[] = [];
  for (const file of files) {
    let text = "";
    try { text = readFileSync(file, "utf8"); } catch { continue; }
    text.split("\n").forEach((line, index) => { if (PORT_PATTERN.test(line)) hits.push(`${file}:${index + 1}`); });
  }
  assert.deepEqual(hits, []);
});

test("the same-process loopback uses the running server's port and never guesses one", async () => {
  const { loopbackOrigin } = await import("../features/keystone/lib/internal-origin");
  assert.equal(loopbackOrigin("4123"), "http://127.0.0.1:4123");
  assert.throws(() => loopbackOrigin(""), /INTERNAL_APP_URL/);
  assert.throws(() => loopbackOrigin("70000"), /INTERNAL_APP_URL/);
});
