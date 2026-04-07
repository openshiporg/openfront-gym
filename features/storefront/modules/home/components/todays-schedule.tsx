import Link from "next/link";
import { getTodaysClasses } from "@/features/storefront/lib/data/classes";

function isClassNow(startTime: string, durationMin: number): boolean {
  try {
    const now = new Date();
    const [h, m] = startTime.split(":").map(Number);
    const start = new Date(now);
    start.setHours(h, m, 0, 0);
    const end = new Date(start.getTime() + durationMin * 60 * 1000);
    return now >= start && now < end;
  } catch {
    return false;
  }
}

export default async function TodaysSchedule() {
  const classes = await getTodaysClasses();
  if (!classes.length) return null;

  return (
    <section className="bg-[#1c1b1b] py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-10 flex items-end justify-between gap-6">
          <div>
            <p className="gym-eyebrow">Today</p>
            <h2 className="gym-heading">Live now &amp; next</h2>
            <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.28em] text-[#c4c7c7]">
              Precision class tracking
            </p>
          </div>
          <Link href="/schedule" className="hidden sm:inline-flex items-center gap-1 border-b border-[#818cf8] pb-1 text-xs font-bold uppercase tracking-[0.22em] text-[#818cf8] hover:opacity-75 transition-opacity">
            Full schedule
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-px bg-white/[0.07] md:grid-cols-2 xl:grid-cols-4">
          {classes.slice(0, 4).map((cls: any) => {
            const duration = cls.classType?.duration ?? 60;
            const isNow = isClassNow(cls.startTime, duration);
            const spotsLeft = (cls.maxCapacity ?? 0) - (cls.currentCapacity ?? 0);
            const isFull = spotsLeft <= 0;

            return (
              <Link
                key={cls.id}
                href="/schedule"
                className={`group flex min-h-[320px] flex-col justify-between p-8 transition-colors ${
                  isNow
                    ? "bg-[#4f46e5] text-white"
                    : "bg-[#252525] text-white hover:bg-[#2c2c2c]"
                }`}
              >
                <div>
                  <span
                    className={`inline-block px-3 py-1 text-[10px] font-bold uppercase tracking-[0.24em] ${
                      isNow ? "bg-white/15 text-white" : "bg-white/10 text-[#c4c7c7]"
                    }`}
                  >
                    {isNow ? "Live now" : `Starts ${cls.startTime}`}
                  </span>
                  <h3 className="mt-8 font-[family-name:var(--font-space-grotesk)] text-4xl font-black uppercase leading-none tracking-[-0.06em] text-white">
                    {(cls.classType?.name ?? cls.name).split(" ").slice(0, 2).join(" ")}
                  </h3>
                </div>

                <div className="space-y-4 text-sm uppercase tracking-[0.16em]">
                  <div className="flex items-center justify-between border-b border-white/20 pb-4">
                    <span className="text-white/60">Instructor</span>
                    <span className="font-medium">{cls.instructor?.name ?? "TBD"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-white/60">Spots left</span>
                    <span className="font-[family-name:var(--font-space-grotesk)] text-2xl font-black tracking-[-0.05em]">
                      {isFull ? "FULL" : String(spotsLeft).padStart(2, "0")}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
