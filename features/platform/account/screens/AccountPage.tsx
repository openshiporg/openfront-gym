import { KeyRound, Mail } from "lucide-react";
import { PageContainer } from "@/features/dashboard/components/PageContainer";
import { requireDashboardUser } from "@/features/platform/lib/current-user";
import { Notice, Panel, PanelBody, PanelHeader, PlatformBody, PlatformHeader } from "@/features/platform/components/platform-ui";
import { mailDeliveryEnabled } from "@/features/keystone/lib/mail";
import { ConfirmEmailForm, EmailForm, PasswordForm } from "../components/AccountForms";

const breadcrumbs = [
  { type: "link" as const, label: "Dashboard", href: "/dashboard" },
  { type: "page" as const, label: "Platform" },
  { type: "page" as const, label: "Your account" },
];

/** The signed-in person's own sign-in email and password. Nobody can change another person's. */
export default async function AccountPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireDashboardUser();
  const params = searchParams ? await searchParams : {};
  const header = <PlatformHeader title="Your account" description="Change your own sign-in email and password. Staff can't change anyone else's." />;
  return (
    <PageContainer title="Your account" header={header} breadcrumbs={breadcrumbs}>
      <PlatformBody>
        {params.emailChanged ? <Notice tone="positive">Your sign-in email is now {user.email}.</Notice> : null}
        <Panel>
          <PanelHeader icon={Mail} title="Sign-in email" description={`Currently ${user.email}. A new address is confirmed from its own inbox before it replaces this one.`} />
          <PanelBody>{mailDeliveryEnabled() ? <EmailForm /> : <Notice tone="info">Changing your sign-in email needs email delivery, which is turned off for this deployment.</Notice>}</PanelBody>
        </Panel>
        <Panel>
          <PanelHeader icon={KeyRound} title="Password" />
          <PanelBody><PasswordForm /></PanelBody>
        </Panel>
      </PlatformBody>
    </PageContainer>
  );
}

export async function AccountConfirmEmailPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  await requireDashboardUser();
  const params = searchParams ? await searchParams : {};
  const token = (Array.isArray(params.token) ? params.token[0] : params.token)?.slice(0, 200) || "";
  const header = <PlatformHeader title="Confirm your new email" />;
  return (
    <PageContainer title="Confirm your new email" header={header} breadcrumbs={breadcrumbs}>
      <PlatformBody>
        <Panel><PanelBody>{token ? <ConfirmEmailForm token={token} /> : <Notice tone="danger">This link is incomplete. Open it from your email again.</Notice>}</PanelBody></Panel>
      </PlatformBody>
    </PageContainer>
  );
}
