/**
 * The standard gym participation agreement a club can publish on day one.
 * It follows the usual shape of US fitness-club waivers: assumption of risk,
 * health statement, release and indemnity, rules, emergency care, photos,
 * belongings and severability. The club edits it in Store Settings like any terms.
 */
export function waiverTemplate(clubName: string) {
  const club = clubName.trim() || 'the club'
  return `Participation Agreement, Assumption of Risk and Release of Liability

This agreement is between you and ${club} ("the club"), including its owners, managers, employees, coaches, instructors, contractors and volunteers. It applies every time you enter the club, use its equipment or facilities, or take part in any class, personal training session, assessment, event or program run by the club, on or off site. Read it carefully: it affects your legal rights.

1. Assumption of risk
Strength training, conditioning, cycling, boxing, high-intensity interval training, yoga, Pilates and other physical activity involve risk. Risks include, but are not limited to: muscle, tendon and ligament injuries; sprains, strains, dislocations and broken bones; back, neck and joint injuries; dizziness, fainting, heat illness and dehydration; heart attack, stroke and other cardiovascular events; injuries from falling, from free weights, machines, bars, plates, kettlebells, bikes, ropes, boxes or other equipment; contact with other members; and slippery or uneven surfaces. Some of these injuries can be serious, permanent or fatal. You understand these risks, you take part voluntarily, and you accept all of them, whether known or unknown.

2. Your health
You confirm that you are in good health and physically able to take part, and that no doctor or other health professional has told you not to exercise. You are responsible for consulting a doctor before you start, and again if your health changes. You will tell a coach before class about any injury, illness, heart or breathing condition, pregnancy, recent surgery or medication that could affect your safety. You will work within your own limits, rest when you need to, and stop at once and tell a member of staff if you feel pain, faintness, chest pain, shortness of breath or any other warning sign.

3. Release and waiver of claims
In return for being allowed to use the club, you release, waive and discharge the club from any and all claims, demands and causes of action for injury, illness, death, or loss of or damage to property arising from your use of the club or your participation in any activity, including claims arising from the negligence of the club. This release does not apply to injury caused by the club's gross negligence or wilful misconduct, or to anything that the law does not allow to be released.

4. Indemnity
You agree to indemnify and hold the club harmless against any claim, cost or liability, including reasonable legal fees, brought by you or by anyone else because of your participation, your guests, or your breach of this agreement or the club rules.

5. Club rules and equipment
You will follow staff instructions and the club rules posted in the club and on its website. You will use equipment only for its intended purpose and as shown, warm up properly, use collars and spotters where needed, re-rack weights, wipe equipment after use, wear suitable clothing and closed footwear, and report any damaged or unsafe equipment to staff straight away. The club may refuse entry to, or remove, anyone whose behaviour puts themselves or others at risk.

6. Emergency medical care
If you are injured or become ill, you authorise the club to give first aid and to call emergency services, and you consent to emergency medical treatment. You are responsible for any resulting medical and transport costs. Keep your emergency contact details in your account up to date.

7. Personal training and programs
Advice from coaches is general fitness guidance, not medical advice. Any exercise plan, nutrition guidance or assessment is followed at your own risk.

8. Photos and video
The club may take photos or video in classes and common areas for safety, coaching and promotion. Tell a member of staff if you do not want to appear in material the club publishes.

9. Personal property
Lockers are provided for convenience only. The club is not responsible for loss of, theft of or damage to personal belongings, including items left in lockers or vehicles.

10. Minors
Members under 18 may take part only with the written consent of a parent or guardian, who accepts this agreement on their behalf and is bound by it.

11. General
This agreement stays in effect for every visit until you withdraw your acceptance in your account. It is governed by the laws of the state in which the club is located. If any part of it is found invalid or unenforceable, the rest remains in full force. This agreement binds you, your heirs, executors, administrators and anyone who may claim on your behalf.

By accepting, you confirm that you are at least 18 years old (or a parent or guardian accepting for a minor), that you have read and understood this agreement, and that you agree to it freely and voluntarily.`
}
