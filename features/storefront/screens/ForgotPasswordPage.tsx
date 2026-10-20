import { Metadata } from "next";
import Link from "next/link";
import { getStorefrontConfig } from "@/features/storefront/lib/data/gym-settings";
import { mailDeliveryEnabled } from "@/features/keystone/lib/mail";
import { publicSupportEmail } from "@/features/storefront/lib/contact-config";
import { ContactForm } from "@/features/storefront/modules/contact/components/contact-form";
import { PasswordResetForm } from "@/features/storefront/modules/account/components/password-reset-form";
import { PageHead } from "@/features/storefront/modules/common/page-head";
import { Banner } from "@/features/storefront/modules/common/ui";
import { safeStorefrontReturnPath } from "@/features/storefront/lib/return-path";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Reset password", robots: { index: false } };
}

/**
 * Storefront password recovery. The account holder requests a reset link to their own mailbox;
 * it opens the storefront's own reset page. Staff never issue, see or set passwords, so without
 * email delivery the reset is unavailable and the page says so.
 */
export async function ForgotPasswordPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const params = searchParams ? await searchParams : {};
  const requested = Array.isArray(params.returnTo) ? params.returnTo[0] : params.returnTo;
  // Where the customer was going (a booking or join step) survives the reset when it's a safe storefront path.
  const returnTo = safeStorefrontReturnPath(requested, "");
  const config = await getStorefrontConfig();
  const mailAvailable = mailDeliveryEnabled();
  const phone = config?.phone?.trim() || null;
  const supportEmail = publicSupportEmail(config?.email) || publicSupportEmail(process.env.CONTACT_FORM_TO) || null;

  return (
    <div className="sf-page">
      <div className="sf-wrap">
        <PageHead crumb={{ href: "/account", label: "Sign in" }} title="Reset password" />
        <div className="sf-split">
          <section className="sf-stack" aria-labelledby="reset-email">
            {mailAvailable ? (
              <>
                <h2 id="reset-email" className="sf-h3">Email a reset link</h2>
                <PasswordResetForm returnTo={returnTo} />
              </>
            ) : (
              <>
                <h2 id="reset-email" className="sf-h3">Password reset is unavailable</h2>
                <Banner title="Reset emails are turned off right now">
                  A password reset link is only ever sent to your own email address, and the club isn’t sending email at the moment. Please try again later, or contact the club.
                </Banner>
                <div className="sf-actions">
                  {phone ? <a className="sf-btn" data-variant="secondary" href={`tel:${phone.replace(/[^\d+]/g, "")}`}>Call {phone}</a> : null}
                  <Link className="sf-btn" data-variant="ghost" href="/account">Back to sign in</Link>
                </div>
              </>
            )}
          </section>
          <section className="sf-card" aria-labelledby="reset-help">
            <h2 id="reset-help" className="sf-h2">{mailAvailable ? "No email arriving?" : "Account help request"}</h2>
            <ContactForm
              topic="account"
              from="/forgot-password"
              phone={phone}
              supportEmail={supportEmail}
              sentNote={mailAvailable
                ? "Staff read messages in the club inbox and reply to the email address you entered."
                : "Staff can see your request. They can't reset passwords; resetting works again once the club is sending email."}
            />
          </section>
        </div>
      </div>
    </div>
  );
}
