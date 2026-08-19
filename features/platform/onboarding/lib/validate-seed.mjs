#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const seedPath = path.join(root, 'features/platform/onboarding/lib/seed.json');
const publicDir = path.join(root, 'public');
const requiredKeys = [
  'gymSettings',
  'location',
  'membershipTiers',
  'classTypes',
  'instructors',
  'schedules',
  'paymentProviders',
];
const failures = [];
const fail = (message) => failures.push(message);

let seed = {};
try {
  seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
} catch (error) {
  fail(`seed.json is not valid JSON: ${error.message}`);
}

for (const key of requiredKeys) {
  if (!(key in seed)) fail(`missing required section ${key}`);
}
for (const forbidden of [
  'demoMember',
  'demoPaymentMethods',
  'demoSubscriptions',
  'demoGymPayments',
  'demoMembershipPayments',
]) {
  if (forbidden in seed) fail(`${forbidden} must not be part of production onboarding`);
}

const expectArray = (value, label) => {
  if (!Array.isArray(value) || value.length === 0) {
    fail(`${label} must be a non-empty array`);
    return [];
  }
  return value;
};
const expectUnique = (items, field, label) => {
  const seen = new Set();
  for (const item of items) {
    const value = item?.[field];
    if (typeof value !== 'string' || !value.trim()) {
      fail(`${label}.${field} must be a non-empty string`);
    } else if (seen.has(value)) {
      fail(`${label}.${field} has duplicate value ${JSON.stringify(value)}`);
    }
    seen.add(value);
  }
};

if (!seed.gymSettings?.name) fail('gymSettings.name must be configured');
if (seed.gymSettings?.email !== 'hello@example.invalid') {
  fail('starter gym contact email must use the reserved example.invalid domain');
}
if (!seed.location?.name) fail('location.name must be configured');
const heroImage = seed.gymSettings?.heroImageUrl;
if (typeof heroImage !== 'string' || !heroImage.startsWith('/images/')) {
  fail('gymSettings.heroImageUrl must use a local /images/... path');
} else if (!fs.existsSync(path.join(publicDir, heroImage.slice(1)))) {
  fail(`gymSettings.heroImageUrl references missing asset ${heroImage}`);
}

const tiers = expectArray(seed.membershipTiers, 'membershipTiers');
const classTypes = expectArray(seed.classTypes, 'classTypes');
const instructors = expectArray(seed.instructors, 'instructors');
const schedules = expectArray(seed.schedules, 'schedules');
const providers = expectArray(seed.paymentProviders, 'paymentProviders');
expectUnique(tiers, 'handle', 'membershipTiers');
expectUnique(classTypes, 'handle', 'classTypes');
expectUnique(instructors, 'handle', 'instructors');
expectUnique(instructors, 'email', 'instructors');
expectUnique(providers, 'code', 'paymentProviders');

const classTypeHandles = new Set(classTypes.map((item) => item.handle));
const instructorHandles = new Set(instructors.map((item) => item.handle));
for (const schedule of schedules) {
  if (!classTypeHandles.has(schedule.classTypeHandle)) {
    fail(`schedule ${schedule.name} references missing class type ${schedule.classTypeHandle}`);
  }
  if (!instructorHandles.has(schedule.instructorHandle)) {
    fail(`schedule ${schedule.name} references missing instructor ${schedule.instructorHandle}`);
  }
}
for (const instructor of instructors) {
  if (typeof instructor.email !== 'string' || !instructor.email.endsWith('@example.invalid')) {
    fail(`instructor ${instructor.handle}.email must use the reserved @example.invalid domain`);
  }
  if (instructor.photo && (typeof instructor.photo !== 'string' || !instructor.photo.startsWith('/images/'))) {
    fail(`instructor ${instructor.handle}.photo must be empty or use a local /images/... path`);
  } else if (instructor.photo && !fs.existsSync(path.join(publicDir, instructor.photo.slice(1)))) {
    fail(`instructor ${instructor.handle}.photo references missing asset ${instructor.photo}`);
  }
}
for (const provider of providers) {
  if (provider.isInstalled !== false) fail(`payment provider ${provider.code} must start disabled until credentials are verified`);
  if ('credentials' in provider) fail(`payment provider ${provider.code} must not seed credentials`);
}

console.log('Gym onboarding seed validation');
console.log(`sections=${requiredKeys.join(',')}`);
console.log(`counts=tiers:${tiers.length} classes:${classTypes.length} instructors:${instructors.length} schedules:${schedules.length} providers:${providers.length}`);
if (failures.length) {
  for (const message of failures) console.error(`FAIL ${message}`);
  console.error(`VALIDATION FAILED failures=${failures.length}`);
  process.exit(1);
}
console.log('VALIDATION PASSED failures=0');
