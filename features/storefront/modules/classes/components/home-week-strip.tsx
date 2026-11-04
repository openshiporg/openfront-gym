"use client";

import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Desktop home "Weekly Schedule": a scroll-snap row of day cards with ‹ › buttons in the header.
 * The buttons scroll by one card and disable at either end; trackpad and keyboard scrolling still work.
 */
export default function HomeWeekStrip({ title, more, children }: { title: ReactNode; more: ReactNode; children: ReactNode }) {
  const rowRef = useRef<HTMLOListElement>(null);
  const [ends, setEnds] = useState({ start: true, end: true });

  const measure = useCallback(() => {
    const row = rowRef.current;
    if (!row) return;
    const max = row.scrollWidth - row.clientWidth;
    setEnds({ start: row.scrollLeft <= 1, end: row.scrollLeft >= max - 1 });
  }, []);

  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    measure();
    row.addEventListener("scroll", measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    return () => { row.removeEventListener("scroll", measure); observer.disconnect(); };
  }, [measure]);

  const step = (direction: 1 | -1) => {
    const row = rowRef.current;
    if (!row) return;
    const card = row.querySelector<HTMLElement>(":scope > li");
    const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
    row.scrollBy({ left: direction * ((card?.offsetWidth ?? 280) + gap), behavior: "smooth" });
  };

  return (
    <div className="sf-rg-week">
      <div className="sf-rg-head">
        {title}
        <div className="sf-rg-head-actions">
          {more}
          <button type="button" className="sf-rg-arrow" aria-label="Previous days" aria-controls="home-week-row" disabled={ends.start} onClick={() => step(-1)}>
            <ChevronLeft aria-hidden="true" />
          </button>
          <button type="button" className="sf-rg-arrow" aria-label="Next days" aria-controls="home-week-row" disabled={ends.end} onClick={() => step(1)}>
            <ChevronRight aria-hidden="true" />
          </button>
        </div>
      </div>
      <ol id="home-week-row" ref={rowRef} className="sf-rg-strip" tabIndex={0} aria-label="This week, one card per day">
        {children}
      </ol>
    </div>
  );
}
