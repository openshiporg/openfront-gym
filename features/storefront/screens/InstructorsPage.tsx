import { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { UsersRound } from "lucide-react";
import { getInstructorPage } from "@/features/storefront/lib/data/instructors";
import { documentText, initials } from "@/features/storefront/lib/presentation";
import { PageHead } from "@/features/storefront/modules/common/page-head";
import { ArrowLink, EmptyState } from "@/features/storefront/modules/common/ui";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Coaches", description: "The coaching team and the classes each coach leads." };
}

export async function InstructorsPage({ searchParams }: { searchParams?: Promise<{ after?: string | string[] }> } = {}) {
  const resolved = searchParams ? await searchParams : undefined;
  const after = typeof resolved?.after === "string" ? resolved.after.slice(0, 100) : undefined;
  const page = await getInstructorPage(after);
  const instructors = [...page.items].sort((left, right) => left.user.name.localeCompare(right.user.name));

  return (
    <div className="sf-page">
      <div className="sf-wrap">
        <PageHead title="Coaches" />

        {instructors.length ? (
          <div className="sf-grid" data-cols="coaches">
            {instructors.map((instructor) => {
              const bio = documentText(instructor.bio);
              return (
                <article key={instructor.id} className="sf-coach">
                  <div className="sf-coach-photo">
                    {instructor.photo ? <Image src={instructor.photo} alt={instructor.user.name} width={600} height={750} sizes="(max-width: 899px) 50vw, 25vw" unoptimized /> : <span className="sf-monogram" aria-hidden="true">{initials(instructor.user.name)}</span>}
                  </div>
                  <div className="sf-stack" data-gap="sm">
                    <h2 className="sf-h3"><Link href={`/instructors/${instructor.id}`}>{instructor.user.name}</Link></h2>
                    {instructor.specialties?.length ? <p>{instructor.specialties.join(", ")}</p> : null}
                    {bio ? <p className="sf-text-2" style={{ display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{bio}</p> : null}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <EmptyState headingLevel={2} icon={<UsersRound aria-hidden="true" />} title={after ? "No more coaches" : "No coaches published"} action={after ? <ArrowLink href="/instructors">First coaches</ArrowLink> : <ArrowLink href="/contact">Contact</ArrowLink>} />
        )}
        {after || page.nextAfter ? (
          <nav className="sf-row" data-between aria-label="Coach pages" style={{ marginTop: 24 }}>
            {after ? <Link className="sf-link" href="/instructors">First coaches</Link> : <span />}
            {page.nextAfter ? <Link className="sf-link" href={`/instructors?after=${encodeURIComponent(page.nextAfter)}`}>More coaches</Link> : <span />}
          </nav>
        ) : null}
      </div>
    </div>
  );
}
