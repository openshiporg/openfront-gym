/**
 * Storefront photos are the club's own uploads (S3, through the dashboard): ClassType.photo,
 * Instructor.portrait and Location.photo. Nothing ships in the repo as a stand-in; a record without
 * an upload renders its text-only layout.
 */
export const classTypePhoto = (classType: { imageUrl?: string | null } | null | undefined) => classType?.imageUrl || null;
export const coachPhoto = (own: string | null | undefined) => own || null;
