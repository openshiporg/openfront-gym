import AccountNav from "../components/account-nav";

interface AccountLayoutProps {
  user: any;
  children: React.ReactNode;
}

export default function AccountLayout({ user, children }: AccountLayoutProps) {
  const isAuthView = !user;

  return (
    <div className="flex-1 bg-[var(--sf-background)] text-[var(--sf-foreground)]">
      <div className="sf-container">
        {isAuthView ? (
          <div className="grid min-h-[calc(100dvh-12rem)] items-center py-12 lg:grid-cols-[minmax(0,0.7fr)_minmax(21rem,0.38fr)] lg:gap-16"><div className="hidden lg:block"><p className="sf-eyebrow">Member account</p><h2 className="sf-display mt-5 max-w-[13ch] text-6xl">Your next session starts here.</h2><p className="mt-6 max-w-lg leading-7 text-[var(--sf-muted)]">Sign in to see your next booking, open your check-in code and manage your membership.</p></div><div className="border border-[var(--sf-border)] bg-[var(--sf-surface)] p-7 sm:p-8">{children}</div></div>
        ) : (
          <div className="grid grid-cols-1 gap-8 py-10 md:grid-cols-[220px_minmax(0,1fr)] md:gap-10 md:py-14">
            <AccountNav user={user} />
            <div className="min-w-0">{children}</div>
          </div>
        )}
      </div>
    </div>
  );
}
