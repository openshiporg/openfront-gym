import { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getStorefrontBrandName } from "@/features/storefront/lib/brand";
import { getInstructors } from "@/features/storefront/lib/data/instructors";
import { getStorefrontConfig } from "@/features/storefront/lib/data/gym-settings";

export async function generateMetadata(): Promise<Metadata> {
  const config = await getStorefrontConfig();
  return {
    title: `Our instructors — ${getStorefrontBrandName(config)}`,
    description: "Meet the coaches behind the programming.",
  };
}

function getBioText(bio: any): string {
  if (typeof bio === "string") return bio;
  if (!bio?.document?.[0]?.children?.[0]?.text) return "";
  return bio.document[0].children[0].text;
}

export async function InstructorsPage() {
  const instructors = await getInstructors();

  return (
    <div className="sf-page px-5 pb-24 pt-12 sm:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="sf-page-header border-b border-[var(--color-rule)] pb-12">
          <div>
            <p className="sf-eyebrow">Coaching team</p>
            <h1 className="sf-display mt-4 text-[var(--text-display-s)]">The people behind the programming</h1>
          </div>
          <p className="max-w-md text-base leading-relaxed text-[var(--color-ink-muted)]">
            Every class and schedule is led by a coach with a defined specialty and teaching focus.
          </p>
        </header>

        {instructors.length === 0 ? (
          <div className="mt-14 border border-[var(--color-rule)] bg-[var(--color-surface)] px-6 py-16 text-sm text-[var(--color-ink-muted)]">
            No instructors available yet.
          </div>
        ) : (
          <div className="mt-14 grid grid-cols-1 gap-8 md:grid-cols-2 xl:grid-cols-3">
            {instructors.map((instructor) => (
              <Link
                key={instructor.id}
                href={`/instructors/${instructor.id}`}
                className="group min-w-0 border border-[var(--color-rule)] bg-[var(--color-surface)] transition hover:border-[var(--color-accent)]/50"
              >
                <div className="relative flex aspect-[5/4] items-end overflow-hidden bg-[var(--color-accent-soft)] p-6">
                  {instructor.photo ? (
                    <Image
                      src={instructor.photo}
                      alt={`${instructor.user.name} coaching portrait`}
                      width={800}
                      height={640}
                      sizes="(max-width: 768px) 100vw, 33vw"
                      className="absolute inset-0 h-full w-full object-cover"
                      unoptimized
                    />
                  ) : (
                    <span className="sf-display text-7xl text-[var(--color-accent)]/35">{instructor.user.name.charAt(0)}</span>
                  )}
                </div>

                <div className="p-6">
                  <p className="sf-label">Coach</p>
                  <h3 className="mt-2 text-2xl font-semibold group-hover:text-[var(--color-accent)]">{instructor.user.name}</h3>
                  {getBioText(instructor.bio) ? (
                    <p className="mt-4 line-clamp-3 text-sm leading-relaxed text-[var(--color-ink-muted)]">
                      {getBioText(instructor.bio)}
                    </p>
                  ) : null}

                  {instructor.specialties && instructor.specialties.length > 0 ? (
                    <p className="mt-5 text-sm text-[var(--color-ink-muted)]">{instructor.specialties.slice(0, 3).join(" · ")}</p>
                  ) : null}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
