import { createHash } from 'node:crypto';
import { inviteMember } from './memberInvitation';
import { lockTransactionKey } from './classCapacity';
import { guardKeystonePrismaResults } from '../lib/prisma-result';

export type MemberImportRow = { externalId: string; name: string; email: string; phone: string };
export function normalizeMemberImportRows(value: unknown): MemberImportRow[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100) throw new Error('Import must contain between 1 and 100 contacts');
  const ids = new Set<string>();
  return value.map((row, index) => {
    if (!row || typeof row !== 'object' || Object.keys(row).some(key => !['externalId', 'name', 'email', 'phone'].includes(key))) throw new Error(`Row ${index + 1}: only contact fields are accepted`);
    const normalized = { externalId: String(row.externalId || '').trim(), name: String(row.name || '').trim(), email: String(row.email || '').trim().toLowerCase(), phone: String(row.phone || '').trim() };
    if (!normalized.externalId || normalized.externalId.length > 120 || ids.has(normalized.externalId)) throw new Error(`Row ${index + 1}: external ID is missing, duplicate or too long`);
    if (!normalized.name || normalized.name.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized.email) || normalized.email.length > 254 || normalized.phone.length > 40) throw new Error(`Row ${index + 1}: contact details are invalid`);
    ids.add(normalized.externalId); return normalized;
  });
}

/** Contact-only migration. Existing commercial state is never imported or overwritten. */
export async function importMemberContacts(_root: unknown, args: { source: string; rows: unknown; dryRun?: boolean }, context: any) {
  const session = context.session;
  const organizationId = session?.data?.organization?.id;
  if (!session?.itemId || !organizationId || !session.data?.role?.canManagePeople) throw new Error('Member import permission required');
  const source = args.source?.trim();
  if (!source || source.length > 100 || !/^[\w .-]+$/.test(source)) throw new Error('Import source must be a stable name of 100 characters or fewer');
  const rows = normalizeMemberImportRows(args.rows);
  const prisma = guardKeystonePrismaResults(context.prisma as any);
  const results = [];
  for (const row of rows) {
    const key = createHash('sha256').update(JSON.stringify([organizationId, source, row.externalId])).digest('hex');
    const payloadHash = createHash('sha256').update(JSON.stringify(row)).digest('hex');
    const existing = await prisma.memberImportRecord.findUnique({ where: { key } });
    if (existing && existing.payloadHash !== payloadHash) { results.push({ externalId: row.externalId, status: 'conflict', message: 'External ID was previously used for different contact details; review the existing record' }); continue; }
    if (existing?.status === 'completed') { results.push({ externalId: row.externalId, status: 'already-imported', memberId: existing.memberId }); continue; }
    const accounts = await context.sudo().query.User.findMany({ where: { email: { equals: row.email } }, take: 1, query: 'id organization { id }' });
    if (accounts[0] && accounts[0].organization?.id !== organizationId) { results.push({ externalId: row.externalId, status: 'conflict', message: 'Contact cannot be imported with this identity; review it with the account owner' }); continue; }
    if (accounts[0]) {
      const profiles = await context.sudo().query.Member.findMany({ where: { AND: [{ user: { id: { equals: accounts[0].id } } }, { organization: { id: { equals: organizationId } } }] }, take: 1, query: 'id name email phone' });
      const profile = profiles[0];
      if (!profile || profile.name !== row.name || (profile.phone || '') !== row.phone) { results.push({ externalId: row.externalId, status: 'conflict', message: 'Existing account contact details differ; review the member before importing' }); continue; }
    }
    if (args.dryRun !== false) { results.push({ externalId: row.externalId, status: accounts[0] ? 'will-link' : 'will-create' }); continue; }
    try {
      const record = await prisma.$transaction(async (tx: any) => {
        await lockTransactionKey(tx, `member-import:${key}`);
        const current = await tx.memberImportRecord.findUnique({ where: { key } });
        if (current && current.payloadHash !== payloadHash) throw new Error('Import identity changed concurrently');
        return current || tx.memberImportRecord.create({ data: { organizationId, key, source, externalId: row.externalId, payloadHash, status: 'processing' } });
      });
      // inviteMember itself is transactional and idempotent by account identity;
      // a crash before receipt finalization can safely retry this same contact.
      const member = await inviteMember(null, { data: row }, context);
      await prisma.memberImportRecord.update({ where: { id: record.id }, data: { memberId: member.memberId, status: 'completed', completedAt: new Date(), lastError: '' } });
      results.push({ externalId: row.externalId, status: 'imported', memberId: member.memberId });
    } catch {
      await prisma.memberImportRecord.updateMany({ where: { key, payloadHash, status: { not: 'completed' } }, data: { status: 'failed', lastError: 'Import could not complete; review the identity and retry the same source and external ID' } });
      results.push({ externalId: row.externalId, status: 'failed', message: 'Import could not complete; review the identity and retry the same source and external ID' });
    }
  }
  return { dryRun: args.dryRun !== false, source, results };
}
