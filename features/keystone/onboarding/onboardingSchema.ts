import { z } from 'zod';

const shortText = z.string().trim().min(1).max(200);
const optionalText = (max = 2_000) => z.string().trim().max(max).optional();
const handle = z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use a lowercase kebab-case handle');
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour HH:MM time');
const localImage = z.string().trim().refine(
  (value) => value === '' || (/^\/images\/[^?#\\]+$/.test(value) && !value.includes('..')),
  'Use an existing local /images path',
);

const gymSettingsSchema = z.object({
  name: shortText,
  tagline: optionalText(300),
  description: optionalText(),
  address: optionalText(500),
  phone: optionalText(50),
  email: z.string().trim().email().max(320).optional(),
  currencyCode: z.string().trim().regex(/^[A-Za-z]{3}$/).transform((value) => value.toUpperCase()),
  locale: z.string().trim().min(2).max(20),
  timezone: z.string().trim().min(1).max(100),
  countryCode: z.string().trim().regex(/^[A-Za-z]{2}$/).transform((value) => value.toUpperCase()),
  hours: z.record(z.string().max(100)).optional(),
  logoIcon: optionalText(20_000),
  brandHue: z.number().min(0).max(360).optional(),
  heroEyebrow: optionalText(200),
  heroHeadline: optionalText(1_000),
  heroSubheadline: optionalText(),
  heroPrimaryCtaLabel: optionalText(100),
  heroPrimaryCtaHref: z.string().trim().startsWith('/').max(500).optional(),
  heroSecondaryCtaLabel: optionalText(100),
  heroSecondaryCtaHref: z.string().trim().startsWith('/').max(500).optional(),
  promoBanner: optionalText(500),
  footerTagline: optionalText(500),
  copyrightName: optionalText(200),
  facilityHeadline: optionalText(300),
  facilityDescription: optionalText(),
  facilityHighlights: z.array(z.unknown()).max(20).optional(),
  heroStats: z.array(z.unknown()).max(20).optional(),
  contactTopics: z.array(z.unknown()).max(20).optional(),
  rating: z.number().min(0).max(5).nullable().optional(),
  reviewCount: z.number().int().min(0).max(1_000_000).optional(),
  heroImageUrl: localImage,
}).strict();

const locationSchema = z.object({
  name: shortText,
  address: optionalText(500).default(''),
  phone: optionalText(50).default(''),
  isActive: z.boolean().default(true),
}).strict();

const membershipTierSchema = z.object({
  handle,
  name: shortText,
  monthlyPrice: z.number().finite().min(0).max(1_000_000),
  annualPrice: z.number().finite().min(0).max(10_000_000),
  classCreditsPerMonth: z.number().int().min(-1).max(10_000),
  accessHours: z.string().trim().max(200).default('limited'),
  guestPasses: z.number().int().min(0).max(1_000).default(0),
  personalTrainingSessions: z.number().int().min(0).max(1_000).default(0),
  freezeAllowed: z.boolean().default(false),
  contractLength: z.number().int().min(0).max(120).default(0),
  description: optionalText().default(''),
}).strict();

const equipment = z.enum([
  'mat', 'weights', 'resistance_bands', 'jump_rope', 'boxing_gloves',
  'cycling_shoes', 'kettlebells', 'medicine_ball', 'none',
]);
const classTypeSchema = z.object({
  handle,
  name: shortText,
  difficulty: z.enum(['beginner', 'intermediate', 'advanced', 'all-levels']).default('all-levels'),
  duration: z.number().int().min(1).max(1_440),
  caloriesBurn: z.number().int().min(0).max(10_000).optional(),
  equipmentNeeded: z.array(equipment).max(9).default([]),
  description: optionalText().default(''),
}).strict();

const instructorSchema = z.object({
  handle,
  firstName: shortText,
  lastName: shortText,
  email: z.string().trim().email().max(320).refine(
    (value) => value.endsWith('@example.invalid'),
    'Starter instructor emails must use the reserved @example.invalid domain',
  ),
  specialties: z.array(z.string().trim().min(1).max(100)).max(30).default([]),
  certifications: z.array(z.string().trim().min(1).max(100)).max(30).default([]),
  bio: optionalText().default(''),
  isActive: z.boolean().default(true),
  teachesClassTypes: z.array(handle).max(50).default([]),
  photo: localImage.default(''),
}).strict();

const scheduleSchema = z.object({
  name: shortText,
  classTypeHandle: handle,
  instructorHandle: handle,
  dayOfWeek: z.enum(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']),
  startTime: time,
  endTime: time,
  maxCapacity: z.number().int().min(1).max(10_000),
  isActive: z.boolean().default(true),
  description: optionalText().default(''),
}).strict().superRefine((schedule, context) => {
  if (schedule.endTime <= schedule.startTime) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['endTime'], message: 'End time must be later than start time' });
  }
});

const paymentProviderSchema = z.object({
  name: z.literal('Stripe'),
  code: z.literal('pp_stripe'),
  adapterKey: z.literal('stripe'),
  isInstalled: z.literal(false),
  metadata: z.record(z.unknown()).optional(),
}).strict();

export const gymOnboardingSeedSchema = z.object({
  gymSettings: gymSettingsSchema,
  location: locationSchema,
  membershipTiers: z.array(membershipTierSchema).min(1).max(20),
  classTypes: z.array(classTypeSchema).min(1).max(50),
  instructors: z.array(instructorSchema).min(1).max(50),
  schedules: z.array(scheduleSchema).min(1).max(200),
  paymentProviders: z.array(paymentProviderSchema).length(1),
}).strict().superRefine((data, context) => {
  const unique = (items: Array<Record<string, unknown>>, field: string, path: string) => {
    const seen = new Set<unknown>();
    items.forEach((item, index) => {
      const value = item[field];
      if (seen.has(value)) context.addIssue({ code: z.ZodIssueCode.custom, path: [path, index, field], message: `${field} must be unique` });
      seen.add(value);
    });
  };
  unique(data.membershipTiers, 'handle', 'membershipTiers');
  unique(data.membershipTiers, 'name', 'membershipTiers');
  unique(data.classTypes, 'handle', 'classTypes');
  unique(data.classTypes, 'name', 'classTypes');
  unique(data.instructors, 'handle', 'instructors');
  unique(data.instructors, 'email', 'instructors');

  const classTypes = new Set(data.classTypes.map((item) => item.handle));
  const instructors = new Set(data.instructors.map((item) => item.handle));
  data.instructors.forEach((instructor, instructorIndex) => {
    instructor.teachesClassTypes.forEach((classTypeHandle, classTypeIndex) => {
      if (!classTypes.has(classTypeHandle)) context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['instructors', instructorIndex, 'teachesClassTypes', classTypeIndex],
        message: `Unknown class type handle: ${classTypeHandle}`,
      });
    });
  });
  data.schedules.forEach((schedule, index) => {
    if (!classTypes.has(schedule.classTypeHandle)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['schedules', index, 'classTypeHandle'], message: `Unknown class type handle: ${schedule.classTypeHandle}` });
    if (!instructors.has(schedule.instructorHandle)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['schedules', index, 'instructorHandle'], message: `Unknown instructor handle: ${schedule.instructorHandle}` });
  });
  unique(data.schedules.map((item) => ({ key: `${item.name}\u0000${item.dayOfWeek}\u0000${item.startTime}\u0000${item.instructorHandle}` })), 'key', 'schedules');
});

export type GymOnboardingSeed = z.infer<typeof gymOnboardingSeedSchema>;

export function parseGymOnboardingSeed(value: unknown): GymOnboardingSeed {
  const result = gymOnboardingSeedSchema.safeParse(value);
  if (result.success) return result.data;
  const details = result.error.issues.slice(0, 8).map((issue) => `${issue.path.join('.') || 'configuration'}: ${issue.message}`).join('; ');
  throw new Error(`Invalid gym onboarding configuration: ${details}`);
}
