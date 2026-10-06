import { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, UsersRound } from "lucide-react";
import { getStorefrontBrandName } from "@/features/storefront/lib/brand";
import { getInstructors } from "@/features/storefront/lib/data/instructors";
import { getStorefrontConfig } from "@/features/storefront/lib/data/gym-settings";

export async function generateMetadata(): Promise<Metadata> {
  const config = await getStorefrontConfig();
  return { title: `Our instructors — ${getStorefrontBrandName(config)}`, description: "Meet the coaches behind the programming." };
}

function getBioText(bio: unknown): string {
  if (typeof bio === "string") return bio;
  if (!bio || typeof bio !== "object") return "";
  const document = (bio as { document?: Array<{ children?: Array<{ text?: string }> }> }).document;
  return document?.flatMap((node) => node.children || []).map((child) => child.text || "").join(" ").trim() || "";
}

export async function InstructorsPage() {
  const instructors = await getInstructors();

  return (
    <div className="sf-page">
      <div className="sf-container">
        <header className="sf-page-header">
          <div><p className="sf-eyebrow">Your coaching team</p><h1 className="sf-display mt-4 text-[var(--text-display-s)]">The people behind the programming</h1></div>
          <p className="max-w-md text-base leading-7 text-[var(--sf-muted)]">Find a coach whose approach fits your goals, then explore their upcoming classes.</p>
        </header>

        {instructors.length ? (
          <div className="sf-coach-grid">
            {instructors.map((instructor) => {
              const bio = getBioText(instructor.bio);
              return (
                <Link key={instructor.id} href={`/instructors/${instructor.id}`} className="sf-coach-card">
                  <div className="sf-coach-photo">
                    {instructor.photo ? <Image src={instructor.photo} alt={`${instructor.user.name} coaching portrait`} width={480} height={600} sizes="(max-width: 700px) 45vw, 30vw" className="h-full w-full object-cover grayscale-[20%]" unoptimized /> : <span>Portrait not published</span>}
                  </div>
                  <h2 className="text-2xl font-bold tracking-[-0.04em]">{instructor.user.name}</h2>
                  <div>{bio ? <p className="line-clamp-2 text-sm leading-6 text-[var(--sf-muted)]">{bio}</p> : null}<p className="mt-2 text-xs font-semibold text-[var(--sf-primary)]">{instructor.specialties?.length ? instructor.specialties.join(" / ") : "Specialties not published"}</p></div>
                  <ArrowRight className="h-4 w-4 text-[var(--sf-muted)] transition-transform group-hover:translate-x-1 group-hover:text-[var(--sf-foreground)]" aria-hidden="true" />
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="border border-[var(--sf-border)] bg-[var(--sf-surface)] p-8 sm:p-10"><UsersRound className="h-8 w-8 text-[var(--sf-primary)]" aria-hidden="true" /><h2 className="mt-7 text-2xl font-bold">No active instructors are published.</h2></div>
        )}
      </div>
    </div>
  );
}
