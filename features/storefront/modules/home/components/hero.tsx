import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { getStorefrontConfig } from "@/features/storefront/lib/data/gym-settings";

const HERO_IMAGE = 'url("https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=1920&q=80")';

function getMaskWord(config: Awaited<ReturnType<typeof getStorefrontConfig>>) {
  const brandSource = config?.name?.trim() || config?.tagline?.trim() || "Openfront Gym";
  const [firstWord = "MOVE"] = brandSource.split(/\s+/);
  return firstWord.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 9) || "MOVE";
}

export default async function Hero() {
  const config = await getStorefrontConfig();
  const brandName = config?.name || "Openfront Gym";
  const eyebrow = config?.heroEyebrow || config?.tagline || brandName;
  const headline = config?.heroHeadline || "Movement is art. The body of work is you.";
  const subheadline =
    config?.heroSubheadline ||
    "Membership access, class booking, instructor programming, and member operations all running from one coordinated platform.";
  const maskWord = getMaskWord(config);

  return (
    <section className="relative isolate min-h-[40rem] overflow-hidden bg-[#111515] text-white">
      <div className="absolute inset-0">
        <div
          className="absolute inset-[-5%] scale-[1.06] bg-cover bg-center"
          style={{
            backgroundImage: HERO_IMAGE,
            filter: "blur(28px) saturate(0.82) brightness(0.5)",
          }}
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(203,204,204,0.72)_0%,rgba(162,171,175,0.34)_24%,rgba(39,69,80,0.16)_54%,rgba(12,21,22,0.52)_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(255,222,201,0.24),transparent_22%),radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.07),transparent_48%),linear-gradient(180deg,rgba(0,0,0,0.04)_0%,rgba(0,0,0,0.18)_100%)]" />
        <div className="absolute inset-x-0 top-0 h-px bg-white/35" />
      </div>

      <div className="relative flex min-h-[calc(100dvh-5rem)] items-center justify-center px-6 pb-24 pt-20 sm:px-8 lg:px-12">
        <div className="absolute inset-x-[8%] top-[18%] h-[30rem] rounded-full bg-white/[0.04] blur-3xl" />

        <svg aria-hidden="true" className="absolute inset-0 size-full">
          <defs>
            <mask id="hero-image-word-mask">
              <rect width="100%" height="100%" fill="black" />
              <text
                x="50%"
                y="56%"
                textAnchor="middle"
                dominantBaseline="middle"
                fill="white"
                style={{
                  fontFamily: "var(--font-space-grotesk)",
                  fontSize: "clamp(6rem, 21vw, 16rem)",
                  fontWeight: 900,
                }}
              >
                {maskWord}
              </text>
            </mask>
          </defs>

          <image
            href="https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=1920&q=80"
            width="100%"
            height="100%"
            preserveAspectRatio="xMidYMid slice"
            mask="url(#hero-image-word-mask)"
            opacity="0.98"
          />

          <text
            x="50%"
            y="56%"
            textAnchor="middle"
            dominantBaseline="middle"
            fill="none"
            stroke="rgba(255,255,255,0.52)"
            strokeWidth="1.3"
            style={{
              fontFamily: "var(--font-space-grotesk)",
              fontSize: "clamp(6rem, 21vw, 16rem)",
              fontWeight: 900,
              filter: "drop-shadow(0 0 18px rgba(255,255,255,0.08))",
            }}
          >
            {maskWord}
          </text>
        </svg>

        <div className="pointer-events-none absolute left-6 top-6 z-10 sm:left-8 sm:top-8 lg:left-12 lg:top-10">
          <p className="max-w-[28rem] text-[0.78rem] font-semibold uppercase tracking-[0.34em] text-white/85 [text-wrap:balance]">
            {eyebrow}
          </p>
        </div>

        <div className="sr-only">
          <h1>{headline}</h1>
          <p>{subheadline}</p>
          <Link href={config?.heroPrimaryCtaHref || "/join"}>{config?.heroPrimaryCtaLabel || "Start membership"}</Link>
          <Link href={config?.heroSecondaryCtaHref || "/schedule"}>{config?.heroSecondaryCtaLabel || "View schedule"}</Link>
        </div>

        <div className="pointer-events-none absolute bottom-8 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-3 text-center sm:bottom-10">
          <span className="text-[0.78rem] font-medium uppercase tracking-[0.34em] text-[#e9d2c2]/80">
            Scroll to explore
          </span>
          <div className="h-12 w-px bg-white/30" />
          <ChevronDown className="h-4 w-4 text-white/75" />
        </div>
      </div>
    </section>
  );
}
