import { createHash, randomBytes } from 'node:crypto';
import { operationKey } from '../lib/operational-notices';
import { lockParticipationPolicy } from '../lib/operational-policy';
import { guardKeystonePrismaResults } from '../lib/prisma-result';
import { ACCEPTANCE_EVIDENCE, HEALTH_CONSENT_EVIDENCE, disclosedHealthPurpose, effectiveAcceptanceWhere, effectiveHealthConsentWhere, evidenceState, isEffectiveEvidence } from '../lib/participation-evidence';
import { isParticipationTermsPlaceholder } from '../lib/participation-terms';
import { assertActiveOrganization } from '../security/tenant-status';

const EVIDENCE_PAGE = 20;
/** A member's own withdrawals and privacy requests stay available while the club is suspended. */
const SUSPENDED_MEMBER_COMMANDS = ['privacy.request', 'waiver.revoke'];

export function operationsActor(context: any, manager = true) {
  const session = context.session;
  const organizationId = session?.data?.organization?.id;
  if (!session?.itemId || !organizationId) throw new Error('Authentication required');
  if (manager && !session.data?.role?.canManageAllRecords) throw new Error('Operations manager access required');
  return { organizationId: String(organizationId), userId: String(session.itemId) };
}
export function boundedText(value: unknown, name: string, max = 2000) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`${name} is required (maximum ${max} characters)`);
  return value.trim();
}
function dateValue(value: unknown, required = false): Date | null {
  if (!value && !required) return null;
  const date = new Date(String(value));
  if (!Number.isFinite(date.getTime())) throw new Error('A valid date is required');
  return date;
}
async function memberInTenant(tx: any, organizationId: string, id: unknown, userId?: string) {
  tx = guardKeystonePrismaResults(tx);
  const member = await tx.member.findFirst({ where: { organizationId, ...(id ? { id: String(id) } : {}), ...(userId ? { userId } : {}) } });
  if (!member) throw new Error('Member not found');
  return member;
}
function history(row: any, userId: string, action: string, note: string) {
  return [...(Array.isArray(row.history) ? row.history : []), { at: new Date().toISOString(), userId, action, note }];
}

type OperationsWorkspaceArgs = {
  caseAfterId?: string | null; noticeSkip?: number | null; eventSkip?: number | null; resourceSkip?: number | null;
  credentialScope?: string | null; credentialSkip?: number | null; memberQuery?: string | null;
};

/**
 * Manager queues: each list is filtered in the query, then paged with a look-ahead row, so a
 * notice, payment event, resource or credential past the first page stays reachable. Credentials
 * default to the active scope; expired and revoked ones are a separate, read-only history.
 */
export async function operationsWorkspace(_root: unknown, args: OperationsWorkspaceArgs, context: any) {
  const { organizationId } = operationsActor(context);
  const tx = guardKeystonePrismaResults(context.prisma as any);
  const where = { organizationId };
  const page = (value: unknown) => Number.isSafeInteger(value) && (value as number) > 0 ? Math.min(value as number, 1_000_000) : 0;
  const skips = { notices: page(args.noticeSkip), events: page(args.eventSkip), resources: page(args.resourceSkip), credentials: page(args.credentialSkip) };
  const asOf = new Date();
  const credentialHistory = args.credentialScope === 'history';
  const search = String(args.memberQuery || '').trim().slice(0, 100);
  const [notices, cases, policies, credentials, members, locations, paymentEvents, resources] = await Promise.all([
    tx.operationalNotice.findMany({ where: { ...where, status: { not: 'resolved' } }, skip: skips.notices, take: QUEUE_PAGE + 1, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], include: { member: { select: { id: true, name: true, email: true, phone: true } } } }),
    tx.operationsCase.findMany({ where: { ...where, status: { not: 'resolved' }, ...(args.caseAfterId ? { id: { gt: args.caseAfterId } } : {}) }, take: 101, orderBy: { id: 'asc' } }),
    tx.participationPolicy.findMany({ where, take: 10, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }),
    tx.integrationCredential.findMany({
      where: { ...where, ...(credentialHistory ? { OR: [{ revokedAt: { not: null } }, { expiresAt: { lte: asOf } }] } : { revokedAt: null, expiresAt: { gt: asOf } }) },
      skip: skips.credentials, take: QUEUE_PAGE + 1, orderBy: [{ expiresAt: credentialHistory ? 'desc' : 'asc' }, { id: 'asc' }],
      select: { id: true, label: true, partner: true, scopes: true, expiresAt: true, revokedAt: true },
    }),
    tx.member.findMany({ where: { ...where, ...(search ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { email: { contains: search, mode: 'insensitive' } }] } : {}) }, take: 201, orderBy: [{ name: 'asc' }, { id: 'asc' }], select: { id: true, name: true, email: true } }),
    tx.location.findMany({ where, take: 501, orderBy: [{ name: 'asc' }, { id: 'asc' }], select: { id: true, name: true } }),
    tx.paymentEvent.findMany({ where: { ...where, OR: [{ status: 'failed' }, { status: 'processing', lockedUntil: { lt: asOf } }] }, skip: skips.events, take: QUEUE_PAGE + 1, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { id: true, providerEventId: true, eventType: true, status: true, attempts: true } }),
    tx.gymResource.findMany({ where, skip: skips.resources, take: QUEUE_PAGE + 1, orderBy: [{ name: 'asc' }, { id: 'asc' }], select: { id: true, name: true, capacity: true, isActive: true, isExclusive: true, setupBufferMinutes: true, cleanupBufferMinutes: true } }),
  ]);
  // Credential state is derived at one server instant: revoked, expired, or active.
  const credentialState = (credential: any) => credential.revokedAt ? "revoked" : !credential.expiresAt || !Number.isFinite(new Date(credential.expiresAt).getTime()) || new Date(credential.expiresAt) <= asOf ? "expired" : "active";
  const trim = (rows: any[]) => rows.slice(0, QUEUE_PAGE);
  return {
    notices: trim(notices), cases: cases.slice(0, 100), nextCaseAfterId: cases.length > 100 ? cases[99].id : null, policies,
    credentials: trim(credentials).map((credential) => ({ ...credential, state: credentialState(credential) })), credentialsAsOf: asOf.toISOString(),
    credentialScope: credentialHistory ? 'history' : 'active',
    members: members.slice(0, 200), membersHasMore: members.length > 200, memberQuery: search,
    locations: locations.slice(0, 500), locationsTruncated: locations.length > 500,
    paymentEvents: trim(paymentEvents), resources: trim(resources),
    pages: {
      size: QUEUE_PAGE,
      notices: { skip: skips.notices, hasMore: notices.length > QUEUE_PAGE },
      events: { skip: skips.events, hasMore: paymentEvents.length > QUEUE_PAGE },
      resources: { skip: skips.resources, hasMore: resources.length > QUEUE_PAGE },
      credentials: { skip: skips.credentials, hasMore: credentials.length > QUEUE_PAGE },
    },
    caseRequestKey: randomBytes(24).toString('hex'), evidenceRequestKey: randomBytes(24).toString('hex'),
    limits: { queue: QUEUE_PAGE, memberSelector: 200 }, waiverConfigured: policies.length > 0,
  };
}
const QUEUE_PAGE = 100;

async function openConsentWithdrawalCase(tx: any, organizationId: string, memberId: string, userId: string, now: Date) {
  const caseKey = operationKey(organizationId, `consent-withdrawal:${memberId}:${now.toISOString()}`);
  await tx.operationsCase.upsert({ where: { key: caseKey }, update: {}, create: {
    organizationId, memberId, key: caseKey, kind: 'privacy', status: 'open', openedBy: userId, history: [],
    summary: 'Member withdrew optional health consent. Review purpose and retention; clear health fields when appropriate.',
  } });
}

/**
 * Withdraws every live health permission of the member (all policies). A health-only grant is
 * simply revoked. An older single record that combined acceptance with health consent is revoked
 * too, and when it was the member's current acceptance, that same acceptance continues in a new
 * record without health consent (same accepted time, document and expiry), so the member keeps
 * the acceptance they actually gave and nothing new is invented.
 */
async function withdrawHealthConsent(tx: any, organizationId: string, memberId: string, currentPolicyId: string, userId: string, now: Date, reason: string) {
  const healthOnly = await tx.participationEvidence.updateMany({ where: { organizationId, memberId, healthConsent: true, kind: HEALTH_CONSENT_EVIDENCE, revokedAt: null }, data: { revokedAt: now, revocationReason: reason } });
  const combined = await tx.participationEvidence.findMany({ where: { organizationId, memberId, healthConsent: true, kind: ACCEPTANCE_EVIDENCE, revokedAt: null } });
  for (const row of combined) {
    await tx.participationEvidence.update({ where: { id: row.id }, data: { revokedAt: now, revocationReason: `${reason}; acceptance continues without health consent` } });
    if (!isEffectiveEvidence(row, currentPolicyId, now.getTime())) continue;
    const key = operationKey(organizationId, `health-consent-withdrawn:${row.id}`);
    await tx.participationEvidence.upsert({ where: { key }, update: {}, create: {
      organizationId, memberId, policyId: row.policyId, key, kind: ACCEPTANCE_EVIDENCE,
      requestHash: operationKey(organizationId, JSON.stringify({ continues: row.id, healthConsent: false })),
      documentReference: row.documentReference, verifiedBy: row.verifiedBy, acceptedAt: row.acceptedAt, expiresAt: row.expiresAt, healthConsent: false,
    } });
  }
  const withdrawn = healthOnly.count + combined.length;
  if (!withdrawn) return { reused: true };
  await openConsentWithdrawalCase(tx, organizationId, memberId, userId, now);
  return { withdrawn };
}

/**
 * The member's participation standing. Current acceptance and health consent come from the
 * complete evidence set in the database; the history list is only a page, with its own continuation.
 */
export async function participationWorkspace(_root: unknown, { evidenceAfterId }: { evidenceAfterId?: string | null }, context: any) {
  const { organizationId, userId } = operationsActor(context, false);
  const member = await memberInTenant(context.prisma, organizationId, null, userId);
  const prisma = guardKeystonePrismaResults(context.prisma as any);
  const now = new Date();
  const after = typeof evidenceAfterId === 'string' && evidenceAfterId ? await prisma.participationEvidence.findFirst({ where: { id: evidenceAfterId, organizationId, memberId: member.id }, select: { id: true } }) : null;
  const [policy, evidence, requests] = await Promise.all([
    prisma.participationPolicy.findFirst({ where: { organizationId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }),
    prisma.participationEvidence.findMany({ where: { organizationId, memberId: member.id }, take: EVIDENCE_PAGE + 1, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], ...(after ? { cursor: { id: after.id }, skip: 1 } : {}) }),
    prisma.operationsCase.findMany({ where: { organizationId, memberId: member.id, kind: 'privacy' }, take: 20, orderBy: { createdAt: 'desc' }, select: { id: true, summary: true, status: true, createdAt: true, closedAt: true } }),
  ]);
  const healthPurpose = disclosedHealthPurpose(policy);
  const [acceptances, consents] = policy ? await Promise.all([
    prisma.participationEvidence.count({ where: effectiveAcceptanceWhere(organizationId, member.id, policy.id, now) }),
    healthPurpose ? prisma.participationEvidence.count({ where: effectiveHealthConsentWhere(organizationId, member.id, policy.id, now) }) : 0,
  ]) : [0, 0];
  // The onboarding placeholder is never presented to members as terms to accept.
  const publicPolicy = policy && isParticipationTermsPlaceholder(String(policy.documentText || ''))
    ? { ...policy, documentText: '', enforceWaiver: false, placeholder: true }
    : policy;
  return {
    policy: publicPolicy ? { ...publicPolicy, healthPurpose: healthPurpose ?? '' } : publicPolicy,
    evidence: evidence.slice(0, EVIDENCE_PAGE).map((entry: any) => ({ ...entry, state: evidenceState(entry, now.getTime()) })),
    evidenceNextAfterId: evidence.length > EVIDENCE_PAGE ? evidence[EVIDENCE_PAGE - 1].id : null,
    acceptedCurrent: acceptances > 0,
    healthConsentCurrent: consents > 0,
    requests,
    requestKey: randomBytes(24).toString('hex'),
  };
}

export async function runOperationsCommand(_root: unknown, { command, data }: { command: string; data: Record<string, unknown> }, context: any) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Command data is required');
  const memberCommand = ['privacy.request', 'waiver.accept', 'waiver.revoke', 'health.consent'].includes(command);
  const { organizationId, userId } = operationsActor(context, !memberCommand);
  // Suspension pauses new activity and staff edits; a member's own withdrawal or privacy request continues.
  const withdrawal = SUSPENDED_MEMBER_COMMANDS.includes(command) || (command === 'health.consent' && data.grant !== true);
  if (!withdrawal) await assertActiveOrganization(context, organizationId);
  return context.transaction(async (tc: any) => {
    const tx = guardKeystonePrismaResults(tc.prisma as any);
    if (command.startsWith('waiver.') || command.startsWith('policy.') || command.startsWith('case.') || command.startsWith('privacy.') || command === 'health.consent') await lockParticipationPolicy(tx, organizationId);
    if (command === 'health.consent') {
      // Optional health-storage permission is its own choice: it needs the policy's disclosed
      // purpose, not a legal acceptance, and it never counts as accepting the terms.
      const member = await memberInTenant(tx, organizationId, null, userId);
      const policy = await tx.participationPolicy.findFirst({ where: { organizationId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
      if (!policy || policy.id !== data.policyId) throw new Error('Review the current participation policy first');
      const now = new Date();
      const requestKey = boundedText(data.requestKey, 'Request key', 200);
      if (data.grant === true) {
        if (!disclosedHealthPurpose(policy)) throw new Error('This club does not collect optional health information');
        if (await tx.participationEvidence.findFirst({ where: effectiveHealthConsentWhere(organizationId, member.id, policy.id, now) })) return { reused: true };
        const key = operationKey(organizationId, `health-consent:${member.id}:${policy.id}:${requestKey}`);
        return tx.participationEvidence.upsert({ where: { key }, update: {}, create: {
          organizationId, memberId: member.id, policyId: policy.id, key, kind: HEALTH_CONSENT_EVIDENCE,
          requestHash: operationKey(organizationId, JSON.stringify({ memberId: member.id, policyId: policy.id, healthConsent: true })),
          documentReference: policy.documentReference, verifiedBy: userId, acceptedAt: now, expiresAt: null, healthConsent: true,
        } });
      }
      return withdrawHealthConsent(tx, organizationId, member.id, policy.id, userId, now, 'Member withdrew optional health consent');
    }
    if (command === 'policy.publish') {
      if (data.adultOnly === false) throw new Error('Guardian-supported participation is not implemented; this workflow supports adults only');
      const retentionDays = Number(data.retentionDays);
      if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 3650) throw new Error('Retention must be 1–3650 days');
      const documentReference = boundedText(data.documentReference, 'Document reference', 1000);
      if (!/^https:\/\//.test(documentReference)) throw new Error('Publish an HTTPS document reference');
      return tx.participationPolicy.create({ data: {
        organizationId, version: boundedText(data.version, 'Version', 100), documentReference,
        enforceWaiver: data.enforceWaiver !== false, adultOnly: true,
        healthPurpose: boundedText(data.healthPurpose, 'Health-data purpose', 1000), retentionDays, publishedBy: userId,
      } });
    }
    if (command === 'waiver.verify' || command === 'waiver.accept') {
      const member = await memberInTenant(tx, organizationId, data.memberId, command === 'waiver.accept' ? userId : undefined);
      const policy = await tx.participationPolicy.findFirst({ where: { organizationId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
      if (!policy || policy.id !== data.policyId) throw new Error('Review the current participation policy before accepting');
      if (data.accepted !== true) throw new Error('Explicit acceptance or staff verification is required');
      const healthConsent = data.healthConsent === true;
      if (healthConsent && !disclosedHealthPurpose(policy)) throw new Error('This club does not collect optional health information');
      const expiresAt = command === 'waiver.verify' ? dateValue(data.expiresAt) : null;
      if (expiresAt && expiresAt <= new Date()) throw new Error('Verification expiry must be in the future');
      const documentReference = command === 'waiver.verify' ? boundedText(data.documentReference, 'External signed document reference', 1000) : policy.documentReference;
      const key = operationKey(organizationId, `waiver:${member.id}:${policy.id}:${boundedText(data.requestKey, 'Request key', 200)}`);
      const requestHash = operationKey(organizationId, JSON.stringify({ memberId: member.id, policyId: policy.id, documentReference, expiresAt, healthConsent }));
      const existing = await tx.participationEvidence.findUnique({ where: { key } });
      if (existing && existing.requestHash !== requestHash) throw new Error('This request key was already used for different waiver evidence');
      const acceptedAt = existing?.acceptedAt ?? new Date();
      // The acceptance and the optional health permission are two records, so either can be
      // withdrawn on its own without inventing a new acceptance.
      const acceptance = await tx.participationEvidence.upsert({ where: { key }, update: {}, create: {
        organizationId, memberId: member.id, policyId: policy.id, key, requestHash, documentReference, kind: ACCEPTANCE_EVIDENCE,
        verifiedBy: userId, acceptedAt, expiresAt, healthConsent: false,
      } });
      if (healthConsent) {
        const healthKey = operationKey(organizationId, `waiver-health:${member.id}:${policy.id}:${String(data.requestKey)}`);
        await tx.participationEvidence.upsert({ where: { key: healthKey }, update: {}, create: {
          organizationId, memberId: member.id, policyId: policy.id, key: healthKey, requestHash, documentReference, kind: HEALTH_CONSENT_EVIDENCE,
          verifiedBy: userId, acceptedAt, expiresAt, healthConsent: true,
        } });
      }
      return acceptance;
    }
    if (command === 'waiver.revoke') {
      // "Withdraw acceptance and consent" withdraws every live acceptance and every live health
      // permission of this member. Rows are revoked, never deleted or rewritten otherwise.
      const member = await memberInTenant(tx, organizationId, null, userId);
      const now = new Date();
      const reason = boundedText(data.reason, 'Reason', 500);
      const acceptances = await tx.participationEvidence.updateMany({ where: { organizationId, memberId: member.id, kind: ACCEPTANCE_EVIDENCE, healthConsent: false, revokedAt: null }, data: { revokedAt: now, revocationReason: reason } });
      const health = await tx.participationEvidence.updateMany({ where: { organizationId, memberId: member.id, healthConsent: true, revokedAt: null }, data: { revokedAt: now, revocationReason: reason } });
      if (health.count) await openConsentWithdrawalCase(tx, organizationId, member.id, userId, now);
      return { withdrawnAcceptances: acceptances.count, withdrawnHealthConsents: health.count };
    }
    if (command === 'privacy.request' || command === 'case.open') {
      const allowed = ['incident', 'inspection', 'closure', 'finance', 'integration', 'privacy'];
      const kind = command === 'privacy.request' ? 'privacy' : String(data.kind);
      if (!allowed.includes(kind)) throw new Error('Unsupported case type');
      const member = command === 'privacy.request'
        ? await memberInTenant(tx, organizationId, null, userId)
        : data.memberId ? await memberInTenant(tx, organizationId, data.memberId) : null;
      const locationId = data.locationId ? String(data.locationId) : '';
      if (locationId && !await tx.location.findFirst({ where: { id: locationId, organizationId } })) throw new Error('Location not found');
      const key = operationKey(organizationId, `case:${userId}:${boundedText(data.requestKey, 'Request key', 200)}`);
      const summary = boundedText(data.summary, 'Summary');
      const reference = typeof data.reference === 'string' ? data.reference.slice(0, 200) : '';
      const requestHash = operationKey(organizationId, JSON.stringify({ kind, memberId: member?.id || null, locationId, summary, reference }));
      const existing = await tx.operationsCase.findUnique({ where: { key } });
      if (existing && existing.requestHash !== requestHash) throw new Error('This request key was already used for a different case; refresh before starting a new case');
      return tx.operationsCase.upsert({ where: { key }, update: {}, create: {
        organizationId, memberId: member?.id, key, requestHash, kind, locationId,
        reference, summary, status: 'open', openedBy: userId,
        history: [{ at: new Date().toISOString(), userId, action: 'opened', note: 'Case opened' }],
      } });
    }
    if (command === 'case.transition') {
      const row = await tx.operationsCase.findFirst({ where: { id: String(data.id), organizationId } });
      if (!row) throw new Error('Case not found');
      const status = String(data.status);
      if (!['open', 'review', 'resolved'].includes(status)) throw new Error('Unsupported case state');
      const note = boundedText(data.note, 'Resolution or review evidence');
      return tx.operationsCase.update({ where: { id: row.id }, data: {
        status, assignedTo: userId, closedAt: status === 'resolved' ? new Date() : null,
        history: history(row, userId, status, note),
      } });
    }
    if (command === 'privacy.clearHealth') {
      const row = await tx.operationsCase.findFirst({ where: { id: String(data.id), organizationId, kind: 'privacy', status: { not: 'resolved' } } });
      if (!row?.memberId) throw new Error('Open member privacy case required');
      const note = boundedText(data.note, 'Retention review and clearing reason');
      const cleared = await tx.member.update({ where: { id: row.memberId }, data: { healthNotes: { conditions: [], injuries: [], notes: '' }, emergencyContactName: '', emergencyContactPhone: '' } });
      if (cleared.userId) await tx.user.updateMany({ where: { id: cleared.userId, organizationId }, data: { emergencyContact: '' } });
      return tx.operationsCase.update({ where: { id: row.id }, data: {
        status: 'resolved', assignedTo: userId, closedAt: new Date(), history: history(row, userId, 'clear-health', note),
      } }); // Financial identity and evidence are deliberately retained.
    }
    if (command === 'notice.followUp') {
      const id = String(data.id);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`notice:${organizationId}:${id}`}))`;
      const row = await tx.operationalNotice.findFirst({ where: { id, organizationId } });
      if (!row) throw new Error('Notice not found');
      if (row.status === 'resolved') return { id, reused: true };
      const note = boundedText(data.note, 'Contact outcome', 1000);
      const success = data.success === true;
      return tx.operationalNotice.update({ where: { id }, data: {
        attempts: { increment: 1 }, status: success ? 'resolved' : 'failed', resolvedAt: success ? new Date() : null,
        lastError: success ? '' : note, history: history(row, userId, success ? 'delivered-manually' : 'contact-failed', note),
      } });
    }
    if (command === 'credential.create') {
      await lockParticipationPolicy(tx, organizationId);
      if (await tx.integrationCredential.count({ where: { organizationId, revokedAt: null, expiresAt: { gt: new Date() } } }) >= 100) throw new Error('Revoke an active credential before creating another; the tenant limit is 100');
      const scopes = Array.isArray(data.scopes) ? [...new Set(data.scopes)] : [];
      if (!scopes.length || scopes.some(s => !['classes:read', 'bookings:create'].includes(String(s)))) throw new Error('Choose supported integration scopes');
      const token = `gym_${randomBytes(32).toString('base64url')}`;
      const expiresAt = dateValue(data.expiresAt, true)!;
      if (expiresAt <= new Date() || expiresAt.getTime() > Date.now() + 366 * 86400000) throw new Error('Credential expiry must be within one year');
      const row = await tx.integrationCredential.create({ data: {
        organizationId, label: boundedText(data.label, 'Label', 120), partner: boundedText(data.partner, 'Partner', 120),
        scopes, digest: createHash('sha256').update(token).digest('hex'), expiresAt, createdBy: userId,
      } });
      return { id: row.id, token }; // Returned exactly once; digest never appears in projections.
    }
    if (command === 'credential.revoke') {
      const row = await tx.integrationCredential.findFirst({ where: { id: String(data.id), organizationId } });
      if (!row) throw new Error('Credential not found');
      await tx.integrationCredential.update({ where: { id: row.id }, data: { revokedAt: row.revokedAt || new Date() } });
      return { id: row.id };
    }
    throw new Error('Unknown operations command');
  });
}

export async function exportOperatingData(_root: unknown, { kind, from, to }: { kind: string; from: string; to: string }, context: any) {
  const { organizationId } = operationsActor(context);
  const start = dateValue(from, true)!; const end = dateValue(to, true)!;
  if (end <= start || end.getTime() - start.getTime() > 93 * 86400000) throw new Error('Export window must be 1–93 days');
  const where = { organizationId, createdAt: { gte: start, lt: end } };
  const prisma = guardKeystonePrismaResults(context.prisma as any);
  let rows;
  if (kind === 'payments') rows = await prisma.membershipPayment.findMany({ where: { organizationId, paymentDate: { gte: start, lt: end } }, take: 5001, orderBy: [{ paymentDate: 'asc' }, { id: 'asc' }], select: { id: true, amount: true, refundAmount: true, currencyCode: true, status: true, paymentDate: true, stripeInvoiceId: true, stripePaymentIntentId: true } });
  else if (kind === 'members') rows = await prisma.member.findMany({ where, take: 5001, orderBy: { id: 'asc' }, select: { id: true, name: true, email: true, phone: true, status: true, joinDate: true } });
  else if (kind === 'cases') rows = await prisma.operationsCase.findMany({ where, take: 5001, orderBy: { id: 'asc' } });
  else throw new Error('Unsupported export');
  if (rows.length > 5000) throw new Error('Narrow the export window; more than 5000 records match');
  return { schemaVersion: 1, organizationId, kind, from: start, to: end, generatedAt: new Date(), basis: kind === 'payments' ? 'Payment effective date; refundAmount is cumulative, not refund-date cash flow. Reconcile provider fees, payouts and disputes separately.' : 'Record creation date', rows };
}
