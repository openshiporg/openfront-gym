import { SegmentedTrackScroller } from '@/components/segmented-track-scroller';

/** Gym platform pages: keeps the selected tab of an overflowing segmented track in view. */
export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <SegmentedTrackScroller />
    </>
  );
}
