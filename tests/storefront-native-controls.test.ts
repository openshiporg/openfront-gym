// Owner rule: customer surfaces use the popover select/date controls, never native <select> or date/time inputs.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");
function files(dir: string): string[] {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) return files(rel);
    return /\.tsx$/.test(entry.name) ? [rel] : [];
  });
}
const hits = (pattern: RegExp) => ["features/storefront", "features/member"].flatMap(files).flatMap((file) => fs.readFileSync(path.join(root, file), "utf8").split("\n")
  .flatMap((line, i) => (pattern.test(line) && !/^\s*(\/?\*|\/\/)/.test(line) ? [`${file}:${i + 1}`] : [])));

test("storefront has no native <select>", () => assert.deepEqual(hits(/<select\b/), []));
test("storefront has no native date/time inputs", () => assert.deepEqual(hits(/type=["'](?:date|time|datetime-local)["']/), []));
