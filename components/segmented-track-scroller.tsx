"use client";

import { useEffect } from "react";

const TRACKS = ".sf-seg, [data-seg-track]";
const SELECTED = [
  '[aria-current]:not([aria-current="false"])',
  '[aria-pressed="true"]',
  '[aria-selected="true"]',
  '[aria-checked="true"]',
  '[data-state="active"]',
  "[data-active]",
  "input:checked",
].join(", ");

/** Scrolls each overflowing segmented track so its selected tab is visible. Never scrolls the page. */
function revealSelectedTabs() {
  document.querySelectorAll<HTMLElement>(TRACKS).forEach((track) => {
    if (track.scrollWidth <= track.clientWidth) return;
    const marked = track.querySelector<HTMLElement>(SELECTED);
    const selected = marked?.matches("input") ? marked.closest<HTMLElement>("label") : marked;
    if (!selected) return;
    const box = track.getBoundingClientRect();
    const tab = selected.getBoundingClientRect();
    if (tab.left >= box.left && tab.right <= box.right) return;
    track.scrollLeft += tab.left - box.left - (box.width - tab.width) / 2;
  });
}

/** Mounted once per shell (storefront, dashboard); covers server-rendered and client-updated tracks. */
export function SegmentedTrackScroller() {
  useEffect(() => {
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(revealSelectedTabs);
    };
    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["aria-current", "aria-pressed", "aria-selected", "aria-checked", "data-state"],
    });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", schedule);
    };
  }, []);
  return null;
}
