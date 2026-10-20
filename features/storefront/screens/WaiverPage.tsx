import { getStorefrontConfig } from "../lib/data/gym-settings";
import { PageHead } from "../modules/common/page-head";
import { ArrowLink, Banner } from "../modules/common/ui";

/** Participation terms pasted by the gym in Store Settings; members accept the version shown here. */
export default async function WaiverPage() {
  const config = await getStorefrontConfig();
  const terms = config?.participationTerms;
  return (
    <div className="sf-page">
      <div className="sf-wrap">
        <PageHead crumb={{ href: "/policies", label: "Policies" }} title="Participation terms" aside={terms ? <p className="sf-meta">Version {terms.version}</p> : undefined} />
        {terms ? (
          <div className="sf-doc" style={{ maxWidth: 760 }}>
            <p style={{ whiteSpace: "pre-wrap" }}>{terms.text}</p>
            <div className="sf-actions">
              <ArrowLink href="/account/participation">Your acceptance</ArrowLink>
              <ArrowLink href="/contact?topic=general&from=%2Fwaiver">Questions</ArrowLink>
            </div>
          </div>
        ) : (
          <Banner title="No participation terms published">The club hasn’t published participation terms online. Ask the front desk if you have questions about taking part.</Banner>
        )}
      </div>
    </div>
  );
}
