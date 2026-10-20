import type { ReactNode } from "react";
import Link from "next/link";
import { AlertCircle, ArrowUpRight, CheckCircle2, Info, TriangleAlert } from "lucide-react";

type Tone = "ok" | "warn" | "bad" | "info";

const ICON = { ok: CheckCircle2, warn: TriangleAlert, bad: AlertCircle, info: Info } as const;

/** One-sentence state or error. `role` defaults to alert for errors and status otherwise. */
export function Banner({ tone = "info", title, children, action, role }: { tone?: Tone; title?: ReactNode; children?: ReactNode; action?: ReactNode; role?: "alert" | "status" | "note" }) {
  const Icon = ICON[tone];
  return (
    <div className="sf-banner" data-tone={tone === "info" ? undefined : tone} role={role ?? (tone === "bad" ? "alert" : "status")}>
      <Icon aria-hidden="true" />
      <div>
        {title ? <strong>{title}</strong> : null}
        {children ? <div>{children}</div> : null}
        {action}
      </div>
    </div>
  );
}

export function EmptyState({ title, icon, action, children, headingLevel = 3 }: { title: ReactNode; icon?: ReactNode; action?: ReactNode; children?: ReactNode; headingLevel?: 2 | 3 }) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <div className="sf-empty">
      {icon}
      <Heading>{title}</Heading>
      {children ? <p>{children}</p> : null}
      {action}
    </div>
  );
}

export function SectionHead({ id, title, href, linkLabel }: { id?: string; title: ReactNode; href?: string; linkLabel?: string }) {
  return (
    <div className="sf-section-head">
      <h2 id={id} className="sf-h2">{title}</h2>
      {href && linkLabel ? <ArrowLink href={href}>{linkLabel}</ArrowLink> : null}
    </div>
  );
}

export function ArrowLink({ href, children, size }: { href: string; children: ReactNode; size?: "sm" }) {
  return <Link href={href} className="sf-link" data-size={size}>{children}<ArrowUpRight aria-hidden="true" /></Link>;
}
