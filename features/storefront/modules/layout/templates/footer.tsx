import Link from "next/link";

const COLS = [
  {
    heading: "Train",
    links: [
      { label: "Classes", href: "/classes" },
      { label: "Schedule", href: "/schedule" },
      { label: "Instructors", href: "/instructors" },
    ],
  },
  {
    heading: "Membership",
    links: [
      { label: "Plans", href: "/memberships" },
      { label: "Join", href: "/join" },
      { label: "Account", href: "/account" },
    ],
  },
  {
    heading: "Explore",
    links: [
      { label: "Facilities", href: "/facilities" },
      { label: "Contact", href: "/contact" },
    ],
  },
];

export default function Footer({
  config,
}: {
  config?: { name?: string | null; footerTagline?: string | null; copyrightName?: string | null } | null;
}) {
  const brandName = config?.name || 'Openfront Gym';
  const footerTagline =
    config?.footerTagline ||
    'Structured programming, confident operations, and a better member experience.';
  const copyrightName = config?.copyrightName || brandName;

  return (
    <footer className="bg-[#0e0e0e]">
      {/* Accent top line — indigo */}
      <div className="h-[1px] w-full bg-[linear-gradient(90deg,#818cf8_0%,rgba(129,140,248,0.3)_40%,transparent_70%)]" />

      <div className="mx-auto flex max-w-7xl flex-col gap-14 px-4 py-16 sm:px-6 lg:px-8">
        <div className="flex flex-col justify-between gap-12 md:flex-row md:items-start">
          {/* Brand */}
          <div className="max-w-xs">
            <Link href="/" className="flex items-center transition-opacity hover:opacity-75">
              <span className="font-[family-name:var(--font-space-grotesk)] text-lg font-black uppercase tracking-[-0.07em] text-white">
                {brandName.split(' ')[0]}
              </span>
              {brandName.split(' ').slice(1).join(' ') && (
                <span className="ml-1.5 font-[family-name:var(--font-space-grotesk)] text-lg font-light uppercase tracking-[-0.03em] text-[#818cf8]">
                  {brandName.split(' ').slice(1).join(' ')}
                </span>
              )}
            </Link>
            <p className="mt-4 text-sm leading-relaxed text-[#c4c7c7]">
              {footerTagline}
            </p>
          </div>

          {/* Link columns */}
          <div className="grid grid-cols-2 gap-10 sm:grid-cols-3">
            {COLS.map((col) => (
              <div key={col.heading}>
                <h4 className="font-[family-name:var(--font-space-grotesk)] text-[10px] font-bold uppercase tracking-[0.22em] text-[#818cf8]">
                  {col.heading}
                </h4>
                <ul className="mt-4 space-y-3">
                  {col.links.map((link) => (
                    <li key={link.label}>
                      <Link
                        href={link.href}
                        className="text-xs font-medium uppercase tracking-[0.16em] text-[#c4c7c7] transition-colors hover:text-[#818cf8]"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom bar */}
        <div className="flex flex-col justify-between gap-4 border-t border-white/10 pt-6 text-[10px] uppercase tracking-[0.22em] text-[#c4c7c7]/50 md:flex-row">
          <p>© {new Date().getFullYear()} {copyrightName}. All rights reserved.</p>
          <p>Built for disciplined training.</p>
        </div>
      </div>
    </footer>
  );
}

