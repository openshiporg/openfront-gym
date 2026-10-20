import { Metadata } from "next";
import Link from "next/link";
import { PasswordRedeemForm } from "@/features/storefront/modules/account/components/password-redeem-form";
import { PageHead } from "@/features/storefront/modules/common/page-head";
import { Banner } from "@/features/storefront/modules/common/ui";
import { safeStorefrontReturnPath } from "@/features/storefront/lib/return-path";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Set your password", robots: { index: false } };
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

/** Customer landing page for reset and account-setup links. */
export async function ResetPasswordPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const token = first(params.token).slice(0, 200);
  const email = first(params.email).slice(0, 254);
  // An explicit destination wins; otherwise the reset action uses the one saved when the link was requested.
  const next = safeStorefrontReturnPath(first(params.next), "");
  return (
    <div className="sf-page">
      <div className="sf-wrap">
        <PageHead crumb={{ href: "/account", label: "Sign in" }} title="Set your password" />
        {token && email ? (
          <PasswordRedeemForm email={email} token={token} next={next} />
        ) : (
          <div className="sf-stack">
            <Banner tone="bad" title="This link is incomplete">Open the link from your email again, or request a new one.</Banner>
            <div className="sf-actions">
              <Link className="sf-btn" href="/forgot-password">Request a new link</Link>
              <Link className="sf-btn" data-variant="ghost" href="/account">Back to sign in</Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ResetPasswordPage;
