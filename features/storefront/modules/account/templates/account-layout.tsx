import AccountNav from "../components/account-nav";

interface AccountLayoutProps {
  user: any;
  children: React.ReactNode;
}

export default function AccountLayout({ user, children }: AccountLayoutProps) {
  const isAuthView = !user;

  return (
    <div className="flex-1 bg-[#131313] text-[#e5e2e1]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {isAuthView ? (
          <div className="flex min-h-[calc(100vh-10rem)] items-center justify-center py-12">{children}</div>
        ) : (
          <div className="grid grid-cols-1 gap-10 py-12 md:grid-cols-[260px_1fr]">
            <AccountNav user={user} />
            <div className="min-w-0">{children}</div>
          </div>
        )}
      </div>
    </div>
  );
}
