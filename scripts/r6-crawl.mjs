// Crawl every dashboard and storefront page; PASS/FAIL per page. 404 expected for /nope123 ids.
// Usage: CRAWL_BASE=... CRAWL_EMAIL=... CRAWL_PASSWORD=... node scripts/r6-crawl.mjs
import { chromium } from '/Users/junaid/Code/vibeghost/vibeghost/node_modules/playwright/index.mjs'
const BASE = process.env.CRAWL_BASE
async function gql(query, cookie) {
  const r = await fetch(BASE + '/api/graphql', { method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify({ query }) })
  return r.json()
}
const auth = await (await fetch(BASE + '/api/graphql', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: 'mutation($e:String!,$p:String!){authenticateUserWithPassword(email:$e,password:$p){... on UserAuthenticationWithPasswordSuccess{sessionToken}}}', variables: { e: process.env.CRAWL_EMAIL, p: process.env.CRAWL_PASSWORD } }) })).json()
const cookie = 'keystonejs-session=' + auth.data?.authenticateUserWithPassword?.sessionToken
const d = (await gql('{classInstances(take:1){id} members(take:1){id} instructors(take:1){id}}', cookie)).data
if (!d) { console.log('CHECK id lookup: FAIL'); process.exit(1) }
const P = '/dashboard/'
const dash = ['platform/membership-plans', 'platform/rosters', 'platform/check-in', 'platform/scheduling', 'platform/training', 'platform/store-settings', 'platform/class-catalog', 'platform/retail', 'platform/imports', 'platform/operations', 'platform/instructors', 'platform/locations', 'platform/members', 'platform/account', 'platform/billing', 'platform/reports', 'gym/billing', 'members', 'class-instances', 'class-bookings', 'users']
  .map(p => P + p)
const dashIds = [d.classInstances[0] && `${P}platform/rosters/${d.classInstances[0].id}`, d.members[0] && `${P}platform/members/${d.members[0].id}`].filter(Boolean)
const store = ['/', '/classes', '/schedule', '/schedule/drop-in', '/memberships', '/join', '/instructors', '/facilities', '/policies', '/waiver', '/contact', '/gift-cards', '/portal', '/forgot-password', '/reset-password', '/account', '/account/bookings', '/account/membership', '/account/profile', '/account/training', '/account/participation',
  d.classInstances[0] && `/classes/${d.classInstances[0].id}`, d.instructors[0] && `/instructors/${d.instructors[0].id}`].filter(Boolean)
const nope = [`${P}platform/rosters/nope123`, `${P}platform/members/nope123`, '/classes/nope123', '/instructors/nope123']
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium_headless_shell-1254/chrome-headless-shell-mac-arm64/chrome-headless-shell' })
let bad = 0, n = 0
const check = async (p, path, expect, label) => {
  const r = await p.goto(BASE + path, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => null)
  const txt = await p.evaluate(() => document.body.innerText).catch(() => '')
  const http = r?.status() ?? 0
  const broken = /this page could not be loaded|something went wrong|application error|QUERY_TOO_BROAD|internal server error/i.test(txt)
  const ok = expect === 404 ? http === 404 : http > 0 && http < 400 && !broken
  n++; if (!ok) bad++
  console.log(`CHECK ${label} ${path}: ${ok ? 'PASS' : 'FAIL'} (${http})`)
}
const anon = await (await b.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true })).newPage()
for (const s of store.filter(s => !s.startsWith('/account'))) await check(anon, s, 200, 'anon')
await check(anon, '/classes/nope123', 404, 'anon'); await check(anon, '/instructors/nope123', 404, 'anon')
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true })
const p = await ctx.newPage()
await p.goto(BASE + '/dashboard/signin')
await p.fill('input[name=email]', process.env.CRAWL_EMAIL); await p.fill('input[name=password]', process.env.CRAWL_PASSWORD)
await Promise.all([p.waitForURL(u => !u.pathname.includes('signin'), { timeout: 30000 }), p.click('button[type=submit]')])
for (const s of [...dash, ...dashIds, ...store]) await check(p, s, 200, 'admin')
for (const s of nope) await check(p, s, 404, 'admin')
await b.close()
console.log(`CHECK all pages: ${bad ? 'FAIL' : 'PASS'} (${n} loads, ${bad} failed)`)
