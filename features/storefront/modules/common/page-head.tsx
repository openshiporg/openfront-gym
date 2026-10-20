import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export function Crumb({ href, children }: { href: string; children: ReactNode }) {
  return <Link href={href} className="sf-crumb"><ArrowLeft aria-hidden="true" />{children}</Link>;
}

/** Page title block. `lead` is reserved for merchant-published text; `aside` holds a label or control. */
export function PageHead({
  title,
  lead,
  crumb,
  aside,
}: {
  title: ReactNode;
  lead?: ReactNode;
  crumb?: { href: string; label: string };
  aside?: ReactNode;
}) {
  return (
    <>
      {crumb ? <Crumb href={crumb.href}>{crumb.label}</Crumb> : null}
      <header className="sf-page-head sf-rise" data-split={aside ? true : undefined}>
        <div className="sf-stack" data-gap="sm">
          <h1 className="sf-h1">{title}</h1>
          {lead ? <p className="sf-lead">{lead}</p> : null}
        </div>
        {aside ? <div>{aside}</div> : null}
      </header>
    </>
  );
}
