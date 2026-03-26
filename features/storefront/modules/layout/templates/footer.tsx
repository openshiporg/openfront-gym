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
    heading: "Info",
    links: [
      { label: "Facilities", href: "/facilities" },
      { label: "Contact", href: "/contact" },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="border-t border-white/10 bg-[#0e0e0e] py-14">
      <div className="mx-auto flex max-w-7xl flex-col gap-12 px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col justify-between gap-10 md:flex-row md:items-start">
          <div>
            <div className="font-[family-name:var(--font-space-grotesk)] text-3xl font-black uppercase tracking-[-0.08em] text-white">
              Monolith
            </div>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-[#c4c7c7]">
              High-discipline coaching, engineered class programming, and membership access built for people who train with intent.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-10 sm:grid-cols-3">
            {COLS.map((col) => (
              <div key={col.heading}>
                <h4 className="font-[family-name:var(--font-space-grotesk)] text-xs font-bold uppercase tracking-[0.2em] text-[#ffb59e]">
                  {col.heading}
                </h4>
                <ul className="mt-5 space-y-3">
                  {col.links.map((link) => (
                    <li key={link.label}>
                      <Link
                        href={link.href}
                        className="text-xs font-medium uppercase tracking-[0.18em] text-[#c4c7c7] transition-colors hover:text-[#ffb59e]"
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

        <div className="flex flex-col justify-between gap-4 border-t border-white/10 pt-6 text-[10px] uppercase tracking-[0.25em] text-[#c4c7c7]/60 md:flex-row">
          <p>© {new Date().getFullYear()} Openfront Gym. All rights reserved.</p>
          <p>Built for disciplined training.</p>
        </div>
      </div>
    </footer>
  );
}
