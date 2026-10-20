import { getStorefrontConfig } from "../lib/data/gym-settings";
import { PageHead } from "../modules/common/page-head";
import { ArrowLink } from "../modules/common/ui";

const SECTIONS = [
  { id: "bookings", title: "Bookings and waitlists" },
  { id: "credits", title: "Class credits and billing" },
  { id: "participation", title: "Participation and privacy" },
  { id: "arriving", title: "Arriving" },
  { id: "training", title: "Personal training" },
];

export default async function PoliciesPage() {
  const config = await getStorefrontConfig();
  return (
    <div className="sf-page">
      <div className="sf-wrap">
        <PageHead title="Policies" />
        <div className="sf-doc-layout">
          <nav className="sf-toc" aria-label="On this page">
            {SECTIONS.map(section => <a key={section.id} href={`#${section.id}`}>{section.title}</a>)}
          </nav>
          <div className="sf-doc">
            <section id="bookings">
              <h2>Bookings and waitlists</h2>
              <p>Bookings are for dated sessions. Capacity, membership eligibility and class credits are checked when you book. A confirmed booking holds a place; a waitlist entry does not.</p>
              <p>When a place opens, an eligible waitlisted member can be promoted and a class credit used.</p>
              <div><ArrowLink href="/account/bookings">Bookings</ArrowLink></div>
            </section>
            <section id="credits">
              <h2>Class credits and billing</h2>
              <p>Class allowances follow service months. Annual billing does not release a year of credits at once. Credits returned on cancellation keep their original allowance and expiry.</p>
              <p>Ending renewal stops the next payment and does not issue a refund. Access continues through the paid period.</p>
              <div><ArrowLink href="/account/membership">Membership</ArrowLink></div>
            </section>
            <section id="participation">
              <h2>Participation and privacy</h2>
              <p>The current participation document and your recorded acceptance are in your account. Health information is optional and stored only with your consent. You can withdraw consent or make a privacy request there.</p>
              <div className="sf-actions"><ArrowLink href="/waiver">Participation terms</ArrowLink><ArrowLink href="/account/participation">Participation and privacy</ArrowLink></div>
            </section>
            <section id="arriving">
              <h2>Arriving</h2>
              <p>Show a current check-in code at the front desk. Codes expire quickly and refresh on the check-in page.</p>
              {config?.address ? <p className="sf-strong">{config.address}</p> : null}
              <div><ArrowLink href="/facilities">Facilities and hours</ArrowLink></div>
            </section>
            <section id="training">
              <h2>Personal training</h2>
              <p>Packages appear in your account once the club records them. Each appointment uses the package’s service, location, length and expiry.</p>
              <div><ArrowLink href="/account/training">Personal training</ArrowLink></div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
