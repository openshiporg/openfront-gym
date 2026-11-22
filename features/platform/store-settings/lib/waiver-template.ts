/**
 * Standard liability waiver a club can publish on day one and then adapt.
 * It follows the usual shape of US fitness-club waivers (assumption of risk,
 * release, medical acknowledgement). Store Settings marks it "edit before use"
 * until the club changes the text; members only ever see the clean text.
 */
export function waiverTemplate(clubName: string) {
  const club = clubName.trim() || 'the club'
  return `Participation agreement and release of liability

Please read this carefully. By joining, booking or taking part in any class, session or use of the facilities at ${club} ("the club"), you agree to the terms below.

1. Assumption of risk
Exercise and physical training carry risks, including muscle strains, sprains, broken bones, heart problems and, in rare cases, death. These risks can come from your own actions, from other people, from equipment or from the condition of the facilities. You take part voluntarily and you accept these risks.

2. Release of liability
To the fullest extent allowed by law, you release the club, its owners, staff, coaches and contractors from any claim for injury, loss or damage arising from your participation, except where caused by their gross negligence or wilful misconduct. This release binds you, your heirs and anyone acting for you.

3. Medical acknowledgement
You confirm that you are physically able to take part and that no doctor has advised you against exercise. You will tell a coach about any condition, injury or pregnancy that may affect your safety, and you will stop and tell staff if you feel unwell. In an emergency you allow the club to call for medical help on your behalf, at your cost.

4. Rules and equipment
You will follow staff instructions and posted club rules, use equipment only as shown, and report damaged equipment straight away.

5. Personal property
The club is not responsible for lost or stolen belongings.

6. Your agreement
You have read this agreement, understand it, and agree to it. If any part is found unenforceable, the rest still applies.`
}

/** True while the published text is still the untouched template. */
export function isUntouchedWaiverTemplate(text: string | null | undefined, clubName: string) {
  return Boolean(text) && text!.trim() === waiverTemplate(clubName).trim()
}
