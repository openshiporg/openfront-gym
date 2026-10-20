'use server';
import { gymGraphql as keystoneClient } from '@/features/platform/lib/gym-graphql';
import { parseContactCsv } from '../lib/csv';
export async function importContactsAction(_previous: any, form: FormData) {
  // Echo the submitted text so the form keeps it after a preview (React resets action forms).
  const input = { source: String(form.get('source') || ''), csv: String(form.get('csv') || '') };
  try {
    const rows = parseContactCsv(input.csv);
    const result = await keystoneClient<{ importMemberContacts: any }>(`mutation ImportMemberContacts($source: String!, $rows: JSON!, $dryRun: Boolean!) { importMemberContacts(source: $source, rows: $rows, dryRun: $dryRun) }`, { source: input.source, rows, dryRun: form.get('mode') !== 'import' });
    if (!result.success) return { input, error: 'Import could not be processed. Check your member management permissions and contact details.' };
    return { ...result.data.importMemberContacts, input, error: null };
  } catch (error) { return { input, error: error instanceof Error ? error.message : 'Unable to read the import' }; }
}
