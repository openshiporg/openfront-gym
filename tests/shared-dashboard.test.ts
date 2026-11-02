import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { creditsLabel, specialtiesLabel } from "../lib/list-labels";

test("the shared dashboard carries no gym-only code", () => {
  const files = execFileSync("git", ["ls-files", "features/dashboard"], { encoding: "utf8" }).split("\n").filter(Boolean);
  const hits = files.filter((file) => /class-credits|list-labels|formatIntegerValue|formatJsonCell/.test(readFileSync(file, "utf8")));
  assert.deepEqual(hits, []);
});

test("gym list columns read as text: unlimited credits and specialties", () => {
  assert.equal(creditsLabel(-1), "Unlimited");
  assert.equal(creditsLabel(4), "4");
  assert.equal(creditsLabel(null), null);
  assert.equal(specialtiesLabel(["Spin", "Zumba"]), "Spin, Zumba");
  assert.equal(specialtiesLabel([]), null);
  assert.equal(specialtiesLabel("yoga"), null);
});
