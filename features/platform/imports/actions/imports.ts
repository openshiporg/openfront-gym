'use server';
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';
import { parseContactCsv } from '../lib/csv';
export async function importContactsAction(_previous: any, form: FormData) {
  try {
    const rows = parseContactCsv(String(form.get('csv') || ''));
    const result = await keystoneClient<{ importMemberContacts: any }>(`mutation ImportMemberContacts($source: String!, $rows: JSON!, $dryRun: Boolean!) { importMemberContacts(source: $source, rows: $rows, dryRun: $dryRun) }`, { source: String(form.get('source') || ''), rows, dryRun: form.get('mode') !== 'import' });
    if (!result.success) return { error: 'Import could not be processed. Check your member management permissions and contact details.' };
    return { ...result.data.importMemberContacts, error: null };
  } catch (error) { return { error: error instanceof Error ? error.message : 'Unable to read the import' }; }
}
