import { createHash, randomBytes } from 'node:crypto';
import { operationKey } from '../lib/operational-notices';
import { lockParticipationPolicy } from '../lib/operational-policy';
import { guardKeystonePrismaResults } from '../lib/prisma-result';

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

export async function operationsWorkspace(_root: unknown, { caseAfterId }: { caseAfterId?: string | null }, context: any) {
  const { organizationId } = operationsActor(context);
  const tx = guardKeystonePrismaResults(context.prisma as any);
  const where = { organizationId };
  const [notices, cases, policies, credentials, members, locations, paymentEvents, resources] = await Promise.all([
    tx.operationalNotice.findMany({ where: { ...where, status: { not: 'resolved' } }, take: 100, orderBy: { createdAt: 'asc' }, include: { member: { select: { id: true, name: true, email: true, phone: true } } } }),
    tx.operationsCase.findMany({ where: { ...where, status: { not: 'resolved' }, ...(caseAfterId ? { id: { gt: caseAfterId } } : {}) }, take: 101, orderBy: { id: 'asc' } }),
    tx.participationPolicy.findMany({ where, take: 10, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }),
    tx.integrationCredential.findMany({ where: { ...where, revokedAt: null, expiresAt: { gt: new Date() } }, take: 100, orderBy: { expiresAt: 'asc' }, select: { id: true, label: true, partner: true, scopes: true, expiresAt: true, revokedAt: true } }),
    tx.member.findMany({ where, take: 200, orderBy: { name: 'asc' }, select: { id: true, name: true, email: true } }),
    tx.location.findMany({ where, take: 100, select: { id: true, name: true } }),
    tx.paymentEvent.findMany({ where: { ...where, OR: [{ status: 'failed' }, { status: 'processing', lockedUntil: { lt: new Date() } }] }, take: 100, orderBy: { createdAt: 'asc' }, select: { id: true, providerEventId: true, eventType: true, status: true, attempts: true } }),
    tx.gymResource.findMany({ where, take: 100, orderBy: { name: 'asc' }, select: { id: true, name: true, capacity: true, isActive: true, isExclusive: true, setupBufferMinutes: true, cleanupBufferMinutes: true } }),
  ]);
  return { notices, cases: cases.slice(0, 100), nextCaseAfterId: cases.length > 100 ? cases[99].id : null, policies, credentials, members, locations, paymentEvents, resources, caseRequestKey: randomBytes(24).toString('hex'), evidenceRequestKey: randomBytes(24).toString('hex'), limits: { queue: 100, memberSelector: 200 }, waiverConfigured: policies.length > 0 };
}

export async function participationWorkspace(_root: unknown, _args: unknown, context: any) {
  const { organizationId, userId } = operationsActor(context, false);
  const member = await memberInTenant(context.prisma, organizationId, null, userId);
  const prisma = guardKeystonePrismaResults(context.prisma as any);
  const [policy, evidence, requests] = await Promise.all([
    prisma.participationPolicy.findFirst({ where: { organizationId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }),
    prisma.participationEvidence.findMany({ where: { organizationId, memberId: member.id }, take: 20, orderBy: { createdAt: 'desc' } }),
    prisma.operationsCase.findMany({ where: { organizationId, memberId: member.id, kind: 'privacy' }, take: 20, orderBy: { createdAt: 'desc' }, select: { id: true, summary: true, status: true, createdAt: true, closedAt: true } }),
  ]);
  return { policy, evidence, requests, requestKey: randomBytes(24).toString('hex') };
}

export async function runOperationsCommand(_root: unknown, { command, data }: { command: string; data: Record<string, unknown> }, context: any) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Command data is required');
  const memberCommand = ['privacy.request', 'waiver.accept', 'waiver.revoke'].includes(command);
  const { organizationId, userId } = operationsActor(context, !memberCommand);
  return context.transaction(async (tc: any) => {
    const tx = guardKeystonePrismaResults(tc.prisma as any);
    if (command.startsWith('waiver.') || command.startsWith('policy.') || command.startsWith('case.') || command.startsWith('privacy.')) await lockParticipationPolicy(tx, organizationId);
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
      const expiresAt = command === 'waiver.verify' ? dateValue(data.expiresAt) : null;
      if (expiresAt && expiresAt <= new Date()) throw new Error('Verification expiry must be in the future');
      const documentReference = command === 'waiver.verify' ? boundedText(data.documentReference, 'External signed document reference', 1000) : policy.documentReference;
      const key = operationKey(organizationId, `waiver:${member.id}:${policy.id}:${boundedText(data.requestKey, 'Request key', 200)}`);
      const requestHash = operationKey(organizationId, JSON.stringify({ memberId: member.id, policyId: policy.id, documentReference, expiresAt, healthConsent: data.healthConsent === true }));
      const existing = await tx.participationEvidence.findUnique({ where: { key } });
      if (existing && existing.requestHash !== requestHash) throw new Error('This request key was already used for different waiver evidence');
      return tx.participationEvidence.upsert({ where: { key }, update: {}, create: {
        organizationId, memberId: member.id, policyId: policy.id, key, requestHash, documentReference,
        verifiedBy: userId, acceptedAt: new Date(), expiresAt, healthConsent: data.healthConsent === true,
      } });
    }
    if (command === 'waiver.revoke') {
      const member = await memberInTenant(tx, organizationId, null, userId);
      const row = await tx.participationEvidence.findFirst({ where: { id: String(data.id), organizationId, memberId: member.id } });
      if (!row) throw new Error('Evidence not found');
      if (row.revokedAt) return { id: row.id, reused: true };
      if (row.healthConsent) await tx.operationsCase.upsert({ where: { key: operationKey(organizationId, `consent-withdrawal:${row.id}`) }, update: {}, create: {
        organizationId, memberId: member.id, key: operationKey(organizationId, `consent-withdrawal:${row.id}`), kind: 'privacy',
        summary: 'Member withdrew optional health consent. Review purpose and retention; clear health fields when appropriate.', status: 'open', openedBy: userId, history: [],
      } });
      return tx.participationEvidence.update({ where: { id: row.id }, data: { revokedAt: new Date(), revocationReason: boundedText(data.reason, 'Reason', 500) } });
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
      await tx.member.update({ where: { id: row.memberId }, data: { healthNotes: { conditions: [], injuries: [], notes: '' }, emergencyContactName: '', emergencyContactPhone: '' } });
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
