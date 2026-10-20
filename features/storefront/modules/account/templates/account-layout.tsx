import Image from "next/image";
import Link from "next/link";
import { QrCode } from "lucide-react";
import { signOut } from "@/features/storefront/lib/data/user";
import { initials } from "@/features/storefront/lib/presentation";
import AccountNav from "../components/account-nav";

interface AccountLayoutProps {
  user: any;
  photo?: string | null;
  children: React.ReactNode;
}

export function membershipTone(status?: string | null) {
  if (status === "active") return "ok";
  if (status === "frozen" || status === "past-due") return "low";
  if (status === "cancelled") return "bad";
  return "neutral";
}

export function statusLabel(status?: string | null) {
  if (!status) return "No membership";
  const text = status.replace(/[-_]+/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export default function AccountLayout({ user, photo, children }: AccountLayoutProps) {
  if (!user) {
    return (
      <div className="sf-wrap sf-auth-page">
        <div className="sf-rise">{children}</div>
        {photo ? (
          <figure className="sf-photo sf-desktop-only" style={{ aspectRatio: "4 / 3", margin: 0 }}>
            <Image src={photo} alt="" fill priority sizes="(max-width: 1279px) 55vw, 720px" unoptimized />
          </figure>
        ) : null}
      </div>
    );
  }

  const membership = user.membership;
  const planName = membership?.agreementSnapshot?.tierName || membership?.tier?.name;
  return (
    <div>
      <div className="sf-account-top">
        <div className="sf-wrap">
          <div className="sf-account-id">
            <div>
              <span className="sf-avatar" data-size="lg" aria-hidden="true">{initials(user.name)}</span>
              <div className="sf-stack" data-gap="sm" style={{ gap: 2, minWidth: 0 }}>
                <div className="sf-titleline">
                  <p className="sf-h3">{user.name || "Member"}</p>
                  <span className="sf-state" data-tone={membershipTone(membership?.status)}>{membership ? `${planName ? `${planName} · ` : ""}${statusLabel(membership.status)}` : "No membership"}</span>
                </div>
                <p className="sf-meta sf-break">{user.email}</p>
              </div>
            </div>
            <div className="sf-actions">
              <Link href="/member/check-in-code" className="sf-btn" data-size="sm"><QrCode aria-hidden="true" />Check-in code</Link>
              <form action={signOut}><button type="submit" className="sf-btn" data-variant="ghost" data-size="sm">Sign out</button></form>
            </div>
          </div>
          <div className="sf-account-tabs">
            <AccountNav user={user} />
          </div>
        </div>
      </div>
      <div className="sf-wrap sf-account-body">{children}</div>
    </div>
  );
}
