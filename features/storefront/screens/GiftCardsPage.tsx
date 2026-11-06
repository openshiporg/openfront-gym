import type { Metadata } from "next";
import { PageHead } from "@/features/storefront/modules/common/page-head";
import { ArrowLink, Banner } from "@/features/storefront/modules/common/ui";
import { GiftCardBuy } from "@/features/storefront/modules/gift-cards/gift-card-buy";
import { getGiftCardOptions } from "@/features/storefront/lib/actions/gift-cards";
import { contactPath } from "@/features/storefront/lib/contact-config";

export const metadata: Metadata = {
  title: "Gift cards",
  description: "Digital gift cards for classes, passes and the shop, emailed with a code.",
};

/** Digital gift cards, emailed with a code that pays at the front desk. */
export async function GiftCardsPage() {
  const options = await getGiftCardOptions();
  return (
    <div className="sf-page">
      <div className="sf-wrap">
        <PageHead title="Gift cards" aside={<ArrowLink href="/schedule" size="sm">See the schedule</ArrowLink>} />
        <div className="sf-stack" data-gap="lg" style={{ maxWidth: "40rem" }}>
          <p className="sf-lead">Classes, drop-ins or something from the shop. Emailed in minutes, good for a year.</p>
          {options.online && options.amounts.length ? (
            <div className="sf-card"><GiftCardBuy amounts={options.amounts} /></div>
          ) : (
            <Banner title="Gift cards are sold at the front desk" action={<ArrowLink href={contactPath("general", "/gift-cards")} size="sm">Contact the club</ArrowLink>}>
              Online gift cards aren’t available right now.
            </Banner>
          )}
        </div>
      </div>
    </div>
  );
}
