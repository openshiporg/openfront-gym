export default function StorefrontLoading() {
  return (
    <div className="sf-page" role="status" aria-label="Loading">
      <span className="sr-only">Loading…</span>
      <div aria-hidden="true" className="sf-wrap sf-stack" data-gap="lg">
        <div className="sf-skel" style={{ height: 56, width: "min(420px, 70%)" }} />
        <div className="sf-skel" style={{ height: 64, borderRadius: 22 }} />
        <div className="sf-stack">
          {Array.from({ length: 5 }, (_, index) => <div key={index} className="sf-skel" style={{ height: 76 }} />)}
        </div>
      </div>
    </div>
  );
}
