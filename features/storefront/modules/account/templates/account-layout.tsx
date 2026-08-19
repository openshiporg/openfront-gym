import AccountNav from "../components/account-nav";

interface AccountLayoutProps {
  user: any;
  children: React.ReactNode;
}

export default function AccountLayout({ user, children }: AccountLayoutProps) {
  const isAuthView = !user;

  return (
    <div className="flex-1 bg-[var(--color-paper)] text-[var(--color-ink)]">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        {isAuthView ? (
          <div className="flex min-h-[calc(100vh-10rem)] items-center justify-center py-12">{children}</div>
        ) : (
          <div className="grid grid-cols-1 gap-8 py-10 md:grid-cols-[220px_minmax(0,1fr)] md:gap-10 md:py-12">
            <AccountNav user={user} />
            <div className="min-w-0">{children}</div>
          </div>
        )}
      </div>
    </div>
  );
}
