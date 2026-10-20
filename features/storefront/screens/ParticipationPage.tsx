import { loadOperations } from '@/features/platform/operations/actions';
import { ParticipationClient } from './ParticipationClient';
export async function ParticipationPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const params = searchParams ? await searchParams : {};
  const after = Array.isArray(params.after) ? params.after[0] : params.after;
  const data = await loadOperations(true, undefined, typeof after === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(after) ? after : undefined);
  return <><h1 className="sf-h2">Participation and privacy</h1><ParticipationClient data={data} /></>;
}
