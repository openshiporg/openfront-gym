import { ConfirmEmailForm } from "@/features/storefront/modules/account/components/confirm-email-form";
import { Banner } from "@/features/storefront/modules/common/ui";

/** Landing page for the link sent to a new sign-in email; nothing changes until the holder confirms. */
export default async function AccountConfirmEmailPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const token = (Array.isArray(params.token) ? params.token[0] : params.token)?.slice(0, 200) || "";
  return (
    <>
      <h1 className="sf-h2">Confirm your new email</h1>
      <section className="sf-card" style={{ maxWidth: 560 }}>
        {token ? <ConfirmEmailForm token={token} /> : <Banner tone="bad" title="This link is incomplete">Open the link from your email again, or request the change from your profile.</Banner>}
      </section>
    </>
  );
}
