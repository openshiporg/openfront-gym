import { loadOperations } from '@/features/platform/operations/actions';
import { ParticipationClient } from './ParticipationClient';
export async function ParticipationPage() {
  const data = await loadOperations(true);
  return <div className="max-w-3xl space-y-6"><header><p className="sf-eyebrow">Prepare for your visit</p><h1 className="sf-display text-[var(--text-display-s)] mt-3">Participation and privacy</h1><p className="sf-muted mt-4">Read the club’s current participation document, review your recorded acceptance and manage optional health consent.</p></header><ParticipationClient data={data} /></div>;
}
