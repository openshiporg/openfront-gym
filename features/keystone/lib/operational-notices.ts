import { createHash } from 'node:crypto';

export const operationKey = (organizationId: string, key: string) => createHash('sha256').update(`${organizationId}:${key}`).digest('hex');

export async function enqueueOperationalNotice(tx: any, input: {
  organizationId: string; memberId: string; key: string; kind: string; message: string;
}) {
  const key = operationKey(input.organizationId, input.key);
  return tx.operationalNotice.upsert({ where: { key }, update: {}, create: {
    organizationId: input.organizationId, memberId: input.memberId, key,
    kind: input.kind, message: input.message.slice(0, 2000), status: 'pending', history: [],
  } });
}

export async function createFinanceException(tx: any, input: {
  organizationId: string; key: string; kind: string; reference: string; summary: string;
}) {
  const key = operationKey(input.organizationId, `finance:${input.key}`);
  return tx.operationsCase.upsert({ where: { key }, update: {}, create: {
    organizationId: input.organizationId, key, kind: 'finance', reference: input.reference.slice(0, 200),
    summary: `${input.kind}: ${input.summary}`.slice(0, 2000), status: 'open', openedBy: 'provider', history: [],
  } });
}
