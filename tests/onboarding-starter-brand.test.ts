import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_GYM_LOGO_ICON, DEFAULT_LIBRARY_LOGO_COLOR } from "../features/keystone/lib/storefront-branding";
import { adoptedSettingsLogoPatch, starterSettingsValues } from "../features/platform/onboarding/lib/starterBrand";
import seed from "../features/keystone/onboarding/seed.json";

test("onboarding writes the starter logoIcon and logoColor to a new club's Store Settings", () => {
  const { participationTerms: _terms, ...seedSettings } = (seed as any).gymSettings;
  const values = starterSettingsValues(seedSettings);
  assert.equal(values.logoIcon, DEFAULT_GYM_LOGO_ICON);
  assert.equal(values.logoColor, DEFAULT_LIBRARY_LOGO_COLOR);
  assert.equal(values.name, "Kinetic Performance Club");
  assert.match(values.logoIcon, /^<svg/);
});

test("a seeded logo wins, and an adopted record only gets a missing mark", () => {
  assert.equal(starterSettingsValues({ logoColor: "40" }).logoColor, "40");
  assert.deepEqual(adoptedSettingsLogoPatch({ logoIcon: null }), { logoIcon: DEFAULT_GYM_LOGO_ICON });
  assert.equal(adoptedSettingsLogoPatch({ logoIcon: "<svg/>" }), null);
});
