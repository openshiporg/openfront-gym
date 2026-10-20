import { randomUUID } from "node:crypto";
import { Banknote, History, PackagePlus, Receipt, ShoppingBag, Undo2 } from "lucide-react";
import { requireDashboardUser } from "@/features/platform/lib/current-user";
import { PageContainer } from "@/features/dashboard/components/PageContainer";
import { Button } from "@/components/ui/button";
import {
  CheckField,
  DataTable,
  Disclosure,
  EmptyBlock,
  FieldInput,
  FormField,
  NativeSelect,
  Notice,
  PaginationBar,
  Panel,
  PanelBody,
  PanelHeader,
  PlatformBody,
  PlatformHeader,
  SectionNav,
  StatusPill,
  Td,
  Th,
  Tr,
  humanize,
} from "@/features/platform/components/platform-ui";
import { loadRetailWorkspace, loadSaleItemsAction, quoteRetailSaleAction, retailAction } from "../actions/retail";
import { CounterSaleForm } from "../components/CounterSaleForm";
import { CardPaymentsPanel } from "@/features/platform/components/CardPaymentsPanel";
import { DiscardRetainedRequest, RetainedRequestNotice } from "@/features/platform/components/RetainedRequest";
import { retryIntentFor, retryKeyFor, retryList, retryValue, type RetryDraft } from "@/features/platform/lib/retry-draft";
import { loadPendingIntents, loadRetryIntent } from "@/features/platform/lib/staff-intent";
import { firstParam } from "@/features/platform/lib/search-params";

const RETAIL_PATH = "/dashboard/platform/retail";

function RetailForm({ operation, scope = "", retry, submitLabel, children, className, extraAction, retainedSummary }: { operation: string; scope?: string; retry?: RetryDraft; submitLabel: string; children: React.ReactNode; className?: string; extraAction?: React.ReactNode; retainedSummary?: React.ReactNode }) {
  // While an earlier request on the same record is unconfirmed, the form is locked to it: Retry
  // resends that recorded request under its key, and only an explicit discard frees the form.
  const intentId = retryIntentFor(retry, operation, scope);
  if (intentId && retry) {
    return (
      <div className="grid gap-3">
        <form action={retailAction} className="grid gap-3">
          <input type="hidden" name="intentId" value={intentId} />
          <RetainedRequestNotice retry={retry} summary={retainedSummary} />
          <div className="flex justify-end"><Button type="submit">Retry {submitLabel.toLowerCase()}</Button></div>
        </form>
        <DiscardRetainedRequest intentId={intentId} returnTo={RETAIL_PATH} />
      </div>
    );
  }
  return (
    <form action={retailAction} className={className ?? "grid gap-4"}>
      <input type="hidden" name="operation" value={operation} />
      <input type="hidden" name="requestKey" value={retryKeyFor(retry, operation, scope, randomUUID)} />
      {scope ? <input type="hidden" name="retryScope" value={scope} /> : null}
      {children}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {extraAction}
        <Button type="submit">{submitLabel}</Button>
      </div>
    </form>
  );
}

function SiteSelect({ locations, includeInactive = false, value = "" }: { locations: any[]; includeInactive?: boolean; value?: string }) {
  return (
    <FormField label="Location">
      <NativeSelect name="locationId" required defaultValue={value}>
        <option value="">Select a location</option>
        {locations.filter((row) => includeInactive || row.isActive).map((row) => (
          <option key={row.id} value={row.id}>{row.name}{row.isActive ? "" : " (inactive)"}</option>
        ))}
      </NativeSelect>
    </FormField>
  );
}

function utcStamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(date)} UTC`;
}

export default async function RetailPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireDashboardUser();
  const raw = await searchParams;
  const params = { skip: firstParam(raw.skip), cardSkip: firstParam(raw.cardSkip), itemSkip: firstParam(raw.itemSkip), itemSite: firstParam(raw.itemSite, 100), error: firstParam(raw.error, 1000), success: firstParam(raw.success, 1000), cardCheckout: firstParam(raw.cardCheckout, 260), cardAttempt: firstParam(raw.cardAttempt, 100), intent: firstParam(raw.intent, 100) };
  const [data, retry, pendingIntents] = await Promise.all([
    loadRetailWorkspace({ skip: Number(params.skip || 0), cardSkip: Number(params.cardSkip || 0), itemSkip: Number(params.itemSkip || 0), itemSite: params.itemSite || undefined }),
    loadRetryIntent(params.intent, "retail"),
    loadPendingIntents("retail"),
  ]);
  const kept = (operation: string, field: string, scope = "") => retryValue(retry, operation, field, scope);
  const otherPending = pendingIntents.filter((row) => row.id !== retry?.intentId);
  const returnedCheckout = /^cs_[A-Za-z0-9_]{1,250}$/.test(params.cardCheckout || "") ? params.cardCheckout : undefined;
  const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value / 100);
  const siteName = (id: string) => data.locations.find((site: any) => site.id === id)?.name || "Unknown location";

  const header = (
    <PlatformHeader
      eyebrow="Front desk retail"
      title="Retail"
      description="Staffed counter sales in USD. Card payments run through Stripe checkout and refund to the card; cash and external payments are recorded as evidence."
    />
  );
  const breadcrumbs = [
    { type: "link" as const, label: "Dashboard", href: "/dashboard" },
    { type: "page" as const, label: "Platform" },
    { type: "page" as const, label: "Retail" },
  ];

  return (
    <PageContainer title="Retail" header={header} breadcrumbs={breadcrumbs}>
      <PlatformBody>
        {params.error ? <Notice tone="danger" title={retry ? "Not confirmed" : "Not recorded"}>{params.error}</Notice> : null}
        {otherPending.length ? (
          <Notice tone="warning" title="Unconfirmed requests">
            These requests were sent but never confirmed (for example, the page was closed or the connection dropped).{" "}
            {otherPending.map((row, index) => <span key={row.id}>{index ? " · " : ""}<a className="underline" href={`${RETAIL_PATH}?intent=${encodeURIComponent(row.id)}`}>{humanize(row.operation)} from {utcStamp(row.createdAt)}</a></span>)}
          </Notice>
        ) : null}
        {params.success ? <Notice tone="positive">{params.success}</Notice> : null}
        <Notice tone="info">
          Taxes are not calculated here. Enter externally determined gross prices and retain tax evidence with your bookkeeping.
        </Notice>

        <SectionNav
          items={[
            { id: "sale", label: "Counter sale" },
            { id: "card-payments", label: "Card payments", count: (data.cardPayments || []).length },
            { id: "sales", label: "Sales & returns", count: data.sales.length },
            { id: "catalog", label: "Catalog & stock", count: data.items.length },
            { id: "drawer", label: "Cash drawer", count: data.closes.length },
            { id: "ledger", label: "Stock ledger", count: data.stockEntries.length },
          ]}
        />

        <Panel id="sale">
          <PanelHeader
            icon={ShoppingBag}
            title="Counter sale"
            description="Only items at the selected site can be sold together. Prices and stock are checked before a sale is recorded."
          />
          <PanelBody>
            {retryIntentFor(retry, "sale") ? (
              <RetailForm operation="sale" retry={retry} submitLabel="Sale">{null}</RetailForm>
            ) : (
              <CounterSaleForm
                action={retailAction}
                loadItems={loadSaleItemsAction}
                quote={quoteRetailSaleAction}
                locations={data.locations}
                requestKey={retryKeyFor(retry, "sale", "", randomUUID)}
              />
            )}
            {data.locationsTruncated ? <p className="mt-2 text-xs text-muted-foreground">Showing the first 500 locations by name.</p> : null}
          </PanelBody>
        </Panel>

        <CardPaymentsPanel rows={data.cardPayments || []} surface="retail" timeZone="UTC" returnedCheckout={returnedCheckout} closedCheckout={Boolean(params.cardAttempt)}
          olderHref={data.cardPaymentsHasMore ? `${RETAIL_PATH}?cardSkip=${data.cardSkip + 50}#card-payments` : null}
          newerHref={data.cardSkip > 0 ? `${RETAIL_PATH}?cardSkip=${Math.max(0, data.cardSkip - 50)}#card-payments` : null} />

        <Panel id="sales">
          <PanelHeader
            icon={Receipt}
            title="Sales and returns"
            count={data.sales.length}
            description="Previously returned units cannot be refunded again. Current catalog price changes do not change the original refund price."
          />
          {data.sales.length === 0 ? (
            <EmptyBlock compact icon={Receipt} title="No sales on this page" />
          ) : (
            <ul className="divide-y">
              {data.sales.map((sale: any) => (
                <li key={sale.id} className="space-y-3 px-4 py-4 sm:px-5">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold tabular-nums">{money(sale.totalAmount)}</p>
                        <StatusPill tone={sale.tender === "cash" ? "neutral" : "info"} dot={false}>{humanize(sale.tender)}</StatusPill>
                        <span className="font-mono text-[11px] text-muted-foreground">{sale.id}</span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {utcStamp(sale.soldAt)} · {sale.paymentReference || "cash"}
                      </p>
                    </div>
                  </div>
                  <ul className="space-y-1 rounded-lg bg-muted/30 px-3 py-2 text-xs">
                    {sale.lines.map((line: any) => (
                      <li key={line.itemId} className="flex justify-between gap-3 tabular-nums">
                        <span><span className="font-medium">{line.quantity} ×</span> {line.name}</span>
                        <span className="text-muted-foreground">{money(line.unitAmount)} each</span>
                      </li>
                    ))}
                  </ul>
                  <Disclosure summary={<span className="inline-flex items-center gap-1.5"><Undo2 className="size-3.5" aria-hidden /> Record refund and returned units…</span>}>
                    <RetailForm operation="return" scope={sale.id} retry={retry} submitLabel="Record return" retainedSummary={retryIntentFor(retry, "return", sale.id) ? (
                      <ul className="mt-2 space-y-0.5 text-xs">
                        {retryList(retry, "return", "itemId", sale.id).map((itemId, index) => {
                          const line = sale.lines.find((row: any) => row.itemId === itemId);
                          const units = retryList(retry, "return", "quantity", sale.id)[index];
                          return Number(units) > 0 ? <li key={itemId}>{units} × {line?.name || itemId}{kept("return", `restock:${itemId}`, sale.id) === "yes" ? " · restock" : ""}</li> : null;
                        })}
                        <li>Reason: {kept("return", "reason", sale.id) || "—"}</li>
                        {kept("return", "settledRefundAmount", sale.id) ? <li>Refunded: {money(Number(kept("return", "settledRefundAmount", sale.id)))}{kept("return", "refundReference", sale.id) ? ` · ${kept("return", "refundReference", sale.id)}` : ""}</li> : null}
                      </ul>
                    ) : undefined}>
                      <input type="hidden" name="saleId" value={sale.id} />
                      <div className="grid gap-3">
                        {sale.lines.map((line: any) => (
                          <div key={line.itemId} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_8rem] sm:items-end">
                            <input type="hidden" name="itemId" value={line.itemId} />
                            <div className="min-w-0 sm:order-1">
                              <p className="text-sm font-medium">{line.name}</p>
                              <p className="text-xs text-muted-foreground">{line.quantity} originally sold</p>
                              <CheckField name={`restock:${line.itemId}`} value="yes" className="mt-2">Returned units are resalable; restore stock.</CheckField>
                            </div>
                            <FormField label="Units returned" className="sm:order-2">
                              <FieldInput name="quantity" type="number" defaultValue={0} required className="tabular-nums" />
                            </FormField>
                          </div>
                        ))}
                      </div>
                      {sale.tender === "card" ? (
                        <>
                          <div className="grid gap-4 sm:grid-cols-3">
                            <FormField label="Return reason"><FieldInput name="reason" required /></FormField>
                          </div>
                          <CheckField name="settled" value="yes" required confirm>
                            Refund the original price of these units to the customer&apos;s card through Stripe.
                          </CheckField>
                        </>
                      ) : (
                        <>
                          <div className="grid gap-4 sm:grid-cols-3">
                            <FormField label="Return reason"><FieldInput name="reason" required /></FormField>
                            <FormField label="Refunded (USD cents)"><FieldInput name="settledRefundAmount" type="number" required className="tabular-nums" defaultValue={kept("return", "settledRefundAmount", sale.id)} /></FormField>
                            <FormField label="External refund reference" hint="Required for external tender."><FieldInput name="refundReference" defaultValue={kept("return", "refundReference", sale.id)} /></FormField>
                          </div>
                          <CheckField name="settled" value="yes" required confirm>
                            I refunded the original price for these units through the original tender.
                          </CheckField>
                        </>
                      )}
                    </RetailForm>
                  </Disclosure>
                </li>
              ))}
            </ul>
          )}
          {data.returns.length ? (
            <div className="border-t">
              <p className="bg-muted/40 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground sm:px-5">Returns recorded</p>
              <DataTable label="Returns recorded" minWidth="34rem">
                <thead>
                  <tr><Th>Return</Th><Th>Sale</Th><Th>Reason</Th><Th align="right">Refunded</Th></tr>
                </thead>
                <tbody>
                  {data.returns.map((row: any) => (
                    <Tr key={row.id}>
                      <Td className="font-mono text-[11px]">{row.id}</Td>
                      <Td className="font-mono text-[11px] text-muted-foreground">{row.saleId}</Td>
                      <Td className="text-muted-foreground">{row.reason}</Td>
                      <Td align="right">{money(row.refundAmount)}</Td>
                    </Tr>
                  ))}
                </tbody>
              </DataTable>
            </div>
          ) : null}
        </Panel>

        <Panel id="catalog">
          <PanelHeader
            icon={PackagePlus}
            title="Catalog and reasoned stock adjustment"
            count={data.items.length}
            description="Create an item, or update one by entering its existing SKU at the same site. Every price or stock change records its reason."
            actions={
              <form className="flex items-center gap-2" action={RETAIL_PATH}>
                <NativeSelect name="itemSite" defaultValue={params.itemSite || ""} aria-label="Show items at location">
                  <option value="">All locations</option>
                  {data.locations.map((site: any) => <option key={site.id} value={site.id}>{site.name}</option>)}
                </NativeSelect>
                <Button type="submit" size="sm" variant="outline">Show</Button>
              </form>
            }
          />
          {data.items.length ? (
            <DataTable label="Retail catalog" minWidth="38rem">
              <thead>
                <tr><Th>SKU</Th><Th>Item</Th><Th>Location</Th><Th align="right">Price</Th><Th align="right">Stock</Th><Th>Status</Th></tr>
              </thead>
              <tbody>
                {data.items.map((row: any) => (
                  <Tr key={row.id}>
                    <Td className="font-mono text-[11px]">{row.sku}</Td>
                    <Td className="font-medium">{row.name}</Td>
                    <Td className="text-muted-foreground">{siteName(row.locationId)}</Td>
                    <Td align="right">{money(row.unitAmount)}</Td>
                    <Td align="right">{row.stockOnHand}</Td>
                    <Td><StatusPill tone={row.isActive ? "positive" : "neutral"}>{row.isActive ? "Active" : "Archived"}</StatusPill></Td>
                  </Tr>
                ))}
              </tbody>
            </DataTable>
          ) : <EmptyBlock compact icon={PackagePlus} title={params.itemSite ? "No items at this location" : "No catalog items"} />}
          {data.itemSkip > 0 || data.itemsHasMore ? (
            <div className="border-t px-4 py-2 sm:px-5">
              <PaginationBar
                summary={`Items ${data.itemSkip + 1}–${data.itemSkip + data.items.length}`}
                previousHref={data.itemSkip > 0 ? `${RETAIL_PATH}?${new URLSearchParams({ ...(params.itemSite ? { itemSite: params.itemSite } : {}), itemSkip: String(Math.max(0, data.itemSkip - 100)) })}#catalog` : null}
                nextHref={data.itemsHasMore ? `${RETAIL_PATH}?${new URLSearchParams({ ...(params.itemSite ? { itemSite: params.itemSite } : {}), itemSkip: String(data.itemSkip + 100) })}#catalog` : null}
              />
            </div>
          ) : null}
          <div className="border-t bg-muted/20 px-4 py-4 sm:px-5">
            <RetailForm operation="item" retry={retry} submitLabel="Save item">
              <div className="grid gap-4 sm:grid-cols-3">
                <SiteSelect locations={data.locations} value={kept("item", "locationId")} />
                <FormField label="SKU" hint="Matches an existing item at this site when updating."><FieldInput name="sku" required className="font-mono" defaultValue={kept("item", "sku")} /></FormField>
                <FormField label="Item name"><FieldInput name="name" required defaultValue={kept("item", "name")} /></FormField>
                <FormField label="Gross unit price (USD cents)" hint="Taxes not calculated."><FieldInput name="unitAmount" type="number" required className="tabular-nums" defaultValue={kept("item", "unitAmount")} /></FormField>
                <FormField label="Stock adjustment" hint="+received / −damaged"><FieldInput name="stockDelta" type="number" defaultValue={kept("item", "stockDelta") ?? 0} required className="tabular-nums" /></FormField>
                <FormField label="Status">
                  <NativeSelect name="isActive" defaultValue={kept("item", "isActive") ?? "yes"}><option value="yes">Active</option><option value="no">Archived for future sales</option></NativeSelect>
                </FormField>
              </div>
              <FormField label="Adjustment or price-change reason"><FieldInput name="reason" required /></FormField>
            </RetailForm>
          </div>
        </Panel>

        <Panel id="drawer">
          <PanelHeader
            icon={Banknote}
            title="Retail cash drawer close"
            count={data.closes.length}
            description="Expected cash = opening float + recorded cash sales − recorded cash refunds. External card/bank payments require separate statement reconciliation. Closed periods cannot overlap."
          />
          <PanelBody>
            <RetailForm operation="close" retry={retry} submitLabel="Close drawer">
              <div className="grid gap-4 sm:grid-cols-3">
                <SiteSelect locations={data.locations} includeInactive value={kept("close", "locationId")} />
                <FormField label="Period start (UTC, inclusive)"><FieldInput name="periodStart" type="datetime-local" required defaultValue={kept("close", "periodStart")} /></FormField>
                <FormField label="Period end (UTC, exclusive)"><FieldInput name="periodEnd" type="datetime-local" required defaultValue={kept("close", "periodEnd")} /></FormField>
                <FormField label="Opening cash (USD cents)"><FieldInput name="openingAmount" type="number" defaultValue={kept("close", "openingAmount") ?? 0} required className="tabular-nums" /></FormField>
                <FormField label="Cash counted (USD cents)"><FieldInput name="countedAmount" type="number" required className="tabular-nums" defaultValue={kept("close", "countedAmount")} /></FormField>
                <FormField label="Variance reason and follow-up" optional><FieldInput name="reason" /></FormField>
              </div>
            </RetailForm>
          </PanelBody>
          {data.closes.length ? (
            <DataTable label="Drawer closes" minWidth="40rem" className="border-t">
              <thead>
                <tr><Th>Period (UTC)</Th><Th align="right">Expected</Th><Th align="right">Counted</Th><Th align="right">Variance</Th><Th>Reason</Th></tr>
              </thead>
              <tbody>
                {data.closes.map((row: any) => (
                  <Tr key={row.id}>
                    <Td className="whitespace-nowrap text-xs">{utcStamp(row.periodStart)} → {utcStamp(row.periodEnd)}</Td>
                    <Td align="right">{money(row.expectedAmount)}</Td>
                    <Td align="right">{money(row.countedAmount)}</Td>
                    <Td align="right" className={row.varianceAmount === 0 ? "text-muted-foreground" : "font-medium text-rose-600 dark:text-rose-400"}>{money(row.varianceAmount)}</Td>
                    <Td className="text-muted-foreground">{row.reason || "—"}</Td>
                  </Tr>
                ))}
              </tbody>
            </DataTable>
          ) : null}
        </Panel>

        <Panel id="ledger">
          <PanelHeader icon={History} title="Stock evidence" count={data.stockEntries.length} description="Every stock movement with its resulting balance." />
          {data.stockEntries.length === 0 ? (
            <EmptyBlock compact icon={History} title="No stock movements on this page" />
          ) : (
            <DataTable label="Stock ledger" minWidth="36rem">
              <thead>
                <tr><Th>When</Th><Th>SKU</Th><Th align="right">Change</Th><Th align="right">Balance</Th><Th>Reason</Th></tr>
              </thead>
              <tbody>
                {data.stockEntries.map((row: any) => (
                  <Tr key={row.id}>
                    <Td className="whitespace-nowrap text-xs text-muted-foreground">{utcStamp(row.createdAt)}</Td>
                    <Td className="font-mono text-[11px]">{row.item?.sku || row.itemId}</Td>
                    <Td align="right" className={row.quantity > 0 ? "font-medium text-emerald-700 dark:text-emerald-400" : "font-medium text-rose-600 dark:text-rose-400"}>{row.quantity > 0 ? "+" : ""}{row.quantity}</Td>
                    <Td align="right">{row.balanceAfter}</Td>
                    <Td className="text-muted-foreground">{row.reason}</Td>
                  </Tr>
                ))}
              </tbody>
            </DataTable>
          )}
        </Panel>

        {data.skip > 0 || data.hasMore ? (
          <PaginationBar
            summary={!data.sales.length && !data.returns.length && !data.closes.length && !data.stockEntries.length ? "No history this far back" : `Showing history from record ${data.skip + 1}`}
            previousHref={data.skip > 0 ? `?skip=${!data.sales.length && !data.returns.length && !data.closes.length && !data.stockEntries.length ? 0 : Math.max(0, data.skip - 50)}` : null}
            nextHref={data.hasMore ? `?skip=${data.skip + 50}` : null}
          />
        ) : null}
      </PlatformBody>
    </PageContainer>
  );
}
