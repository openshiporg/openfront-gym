import Link from "next/link";

/** Branded 404 body shared by the storefront group and the root not-found route. */
export function NotFoundContent() {
  return (
    <div className="sf-wrap">
      <div className="sf-outcome sf-rise">
        <p className="sf-code" aria-hidden="true">404</p>
        <h1 className="sf-h1">Page not found</h1>
        <div className="sf-actions">
          <Link href="/schedule" className="sf-btn" data-variant="accent" data-size="lg">Schedule</Link>
          <Link href="/" className="sf-btn" data-variant="secondary" data-size="lg">Home</Link>
          <Link href="/contact" className="sf-btn" data-variant="ghost" data-size="lg">Contact</Link>
        </div>
      </div>
    </div>
  );
}
