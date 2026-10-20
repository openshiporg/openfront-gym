'use client';
import { useActionState } from 'react';
import { Eye, FileUp, ListChecks, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DataTable,
  FieldInput,
  FieldTextarea,
  FormField,
  Notice,
  Panel,
  PanelBody,
  PanelHeader,
  PlatformBody,
  SplitLayout,
  StatusPill,
  Td,
  Th,
  Tr,
  humanize,
  type Tone,
} from '@/features/platform/components/platform-ui';
import { importContactsAction } from '../actions/imports';

function resultTone(status?: string): Tone {
  if (!status) return 'neutral';
  if (/conflict|error|invalid|reject|fail|duplicate/i.test(status)) return 'danger';
  if (/skip|exist|review|warn/i.test(status)) return 'warning';
  if (/create|import|ready|match|link|new|ok|success/i.test(status)) return 'positive';
  return 'neutral';
}

export function ImportsClient() {
  const [state, action, pending] = useActionState(importContactsAction, null);
  const results: any[] = state?.results || [];
  const tally = results.reduce((counts: Record<string, number>, row: any) => {
    counts[row.status] = (counts[row.status] ?? 0) + 1;
    return counts;
  }, {});

  return <PlatformBody>
    <SplitLayout
      asideWidth="narrow"
      main={
        <Panel>
          <PanelHeader icon={FileUp} title="Contact CSV" description="Paste rows exported from your previous system. Use the same source and external IDs when retrying so contacts are matched, not duplicated." />
          <PanelBody>
            <form action={action} className="grid gap-4">
              <FormField label="Source name" hint="Identifies the system these contacts came from.">
                <FieldInput name="source" required maxLength={100} defaultValue={state?.input?.source ?? ""} placeholder="Previous gym system" className="sm:max-w-sm" />
              </FormField>
              <FormField label="Rows">
                <FieldTextarea
                  name="csv"
                  required
                  defaultValue={state?.input?.csv ?? ""}
                  rows={12}
                  spellCheck={false}
                  className="min-h-64 font-mono text-xs leading-5"
                  placeholder={'externalId,name,email,phone\nmember-1,Alex Smith,alex@example.com,5550101'}
                />
              </FormField>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
                <Button disabled={pending} name="mode" value="preview" variant="outline">
                  <Eye aria-hidden /> {pending ? 'Working…' : 'Preview'}
                </Button>
                <Button disabled={pending} name="mode" value="import">
                  <Upload aria-hidden /> Import contacts
                </Button>
              </div>
            </form>
          </PanelBody>
        </Panel>
      }
      aside={
        <Panel>
          <PanelHeader icon={ListChecks} title="Before you import" />
          <PanelBody className="space-y-4 text-sm">
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">Required header, exactly</p>
              <code className="block rounded-md border bg-muted/50 px-3 py-2 font-mono text-xs">externalId,name,email,phone</code>
            </div>
            <ul className="space-y-2 text-xs leading-5 text-muted-foreground">
              <li>• 1–100 rows per import, four columns each. Quote values that contain commas.</li>
              <li>• Preview first: it reports what would happen without changing anything.</li>
              <li>• Imports prepare member accounts only. Memberships and payments require the normal purchase workflow.</li>
              <li>• Members set up sign-in themselves with Forgot password, which emails a link to their own address. Staff never set or see member passwords.</li>
            </ul>
          </PanelBody>
        </Panel>
      }
    />

    {state?.error ? <Notice tone="danger" title="Import could not be processed">{state.error}</Notice> : null}

    {state?.results ? <Panel>
      <PanelHeader
        title={state.dryRun ? 'Preview results' : 'Import results'}
        count={results.length}
        description={state.dryRun ? 'Nothing has been imported yet. Resolve conflicts, then run Import with the same source and IDs.' : 'Contacts were processed. When retrying, use the same source and external IDs.'}
        actions={<div className="flex flex-wrap gap-1.5">{Object.entries(tally).map(([status, count]) => <StatusPill key={status} tone={resultTone(status)}>{humanize(status)} · {count as number}</StatusPill>)}</div>}
      />
      <div aria-live="polite">
        <DataTable label={state.dryRun ? 'Preview results' : 'Import results'} minWidth="32rem">
          <thead><tr><Th>External ID</Th><Th>Result</Th><Th>Review</Th></tr></thead>
          <tbody>{results.map((row: any) => <Tr key={row.externalId}>
            <Td className="font-mono text-xs">{row.externalId}</Td>
            <Td><StatusPill tone={resultTone(row.status)}>{humanize(row.status)}</StatusPill></Td>
            <Td className="text-muted-foreground">{row.message || (row.memberId ? 'Member account ready' : '')}</Td>
          </Tr>)}</tbody>
        </DataTable>
      </div>
    </Panel> : null}
  </PlatformBody>;
}
