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
            <h2 className="font-[family-name:var(--font-space-grotesk)] text-4xl font-black uppercase tracking-[-0.06em] text-white sm:text-5xl">
              Live now & next
            </h2>
            <p className="mt-2 text-[11px] font-bold uppercase tracking-[0.28em] text-[#c4c7c7]">
              Precision class instrumentation
            </p>
          </div>
          <Link href="/schedule" className="hidden border-b border-[#ffb59e] pb-1 text-xs font-bold uppercase tracking-[0.22em] text-[#ffb59e] sm:inline-flex">
            View full schedule
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-1 md:grid-cols-2 xl:grid-cols-4">
          {classes.slice(0, 4).map((cls: any) => {
            const duration = cls.classType?.duration ?? 60;
            const isNow = isClassNow(cls.startTime, duration);
            const spotsLeft = (cls.maxCapacity ?? 0) - (cls.currentCapacity ?? 0);
            const isFull = spotsLeft <= 0;

            return (
              <Link
                key={cls.id}
                href="/schedule"
                className={`flex min-h-[320px] flex-col justify-between p-8 transition-colors ${
                  isNow ? "bg-[#00eefc] text-[#00363a]" : "bg-[#353535] text-white hover:bg-[#393939]"
                }`}
              >
                <div>
                  <span className={`inline-block px-3 py-1 text-[10px] font-bold uppercase tracking-[0.24em] ${
                    isNow ? "bg-[#00363a] text-[#d3fbff]" : "text-[#c4c7c7]"
                  }`}>
                    {isNow ? "Live now" : `Starts ${cls.startTime}`}
                  </span>
                  <h3 className="mt-8 font-[family-name:var(--font-space-grotesk)] text-4xl font-black uppercase leading-none tracking-[-0.06em]">
                    {(cls.classType?.name ?? cls.name).split(" ").slice(0, 2).join(" ")}
                  </h3>
                </div>

                <div className="space-y-4 text-sm uppercase tracking-[0.16em]">
                  <div className={`flex items-center justify-between border-b pb-4 ${isNow ? "border-[#00363a]/20" : "border-white/10"}`}>
                    <span className={isNow ? "text-[#004f54]" : "text-[#c4c7c7]"}>Instructor</span>
                    <span className="font-medium">{cls.instructor?.name ?? "TBD"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={isNow ? "text-[#004f54]" : "text-[#c4c7c7]"}>Spots left</span>
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
