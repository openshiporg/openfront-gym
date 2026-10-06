// Server Component
import { Logo } from "../../components/Logo";
import { ResetForm } from "./ResetForm";

type ResetPageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export async function ResetPage({ searchParams }: ResetPageProps) {
  const resolvedSearchParams = await searchParams;
  const token =
    typeof resolvedSearchParams.token === "string"
      ? resolvedSearchParams.token
      : null;
  const mode = token ? "reset" : "request";

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <div className="flex items-center space-x-1.5">
          <Logo aria-hidden="true" />
        </div>
        <h1 className="mt-6 text-lg font-semibold text-foreground dark:text-foreground">
          {mode === "reset" ? "Reset your password" : "Reset password"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground dark:text-muted-foreground">
          {mode === "reset"
            ? "Enter your new password below."
            : process.env.MAIL_ENABLED === "false"
              ? "Reset email is unavailable. Contact the club for account recovery help."
              : "Enter your email address. If an eligible account exists and email delivery is available, reset instructions may be sent."}
        </p>

        {mode === "reset" || process.env.MAIL_ENABLED !== "false" ? <ResetForm mode={mode} token={token} /> : null}
      </div>
    </div>
  );
}