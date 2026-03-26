import { ThemeProvider } from "next-themes";
import { getUser } from "@/features/storefront/lib/data/user";
import { MainLayout } from "./MainLayout";

/**
 * StorefrontServer — async root wrapper for all storefront routes.
 * Fetches session user once server-side, passes down to layout.
 * ThemeProvider lives here so it wraps all storefront pages consistently.
 * Mirrors openfront-restaurant StorefrontServer.tsx pattern.
 */
export default async function StorefrontServer({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      disableTransitionOnChange
    >
      <MainLayout user={user}>{children}</MainLayout>
    </ThemeProvider>
  );
}
