 'use server';
 
 import { redirect } from 'next/navigation';
 import { revalidatePath } from 'next/cache';
 import { gymGraphql as keystoneClient } from '@/features/platform/lib/gym-graphql';
 import { parseMajorUnitsToMinor } from '@/features/platform/lib/currency';
 import { staffActionError } from '@/features/platform/lib/action-error';
 import { openStaffIntent, settleStaffIntent } from '@/features/platform/lib/staff-intent';

 const BILLING_PATH = '/dashboard/platform/billing';
 const RETURN_PARAMS = ['q', 'recoverySkip', 'failedSkip', 'planSkip', 'refundSkip', 'tierQuery', 'tierSkip'];

 /** The queue view a billing form was submitted from, so a result returns to the same place. */
 function returnQuery(form: FormData, extra: Record<string, string> = {}) {
   const params = new URLSearchParams();
   const source = new URLSearchParams(String(form.get('returnQuery') || ''));
   for (const name of RETURN_PARAMS) {
     const value = source.get(name);
     if (value && /^[\w .@+-]{1,100}$/.test(value)) params.set(name, value);
   }
   for (const [name, value] of Object.entries(extra)) params.set(name, value);
   return params.toString();
 }
 
 export interface BillingStats {
   totalRevenue: number;
   monthlyRevenue: number;
   currencyCode: string;
   timeZone: string;
   activeSubscriptions: number;
   activeMemberships: number;
   pastDueCount: number;
 }

 export interface ManagedMembershipRow {
   id: string;
   idempotencyKey?: string;
   retainedTierId?: string;
   retained?: boolean;
   status: string;
   billingCycle: string;
   stripeSubscriptionId?: string | null;
   tier?: { id: string; name?: string | null } | null;
   member?: { id: string; name?: string | null; email?: string | null } | null;
 }

 export interface MembershipTierOption {
   id: string;
   name: string;
 }

 export interface BillingRecoveryMember {
   id: string;
   status: string;
   nextBillingDate?: string | null;
   stripeSubscriptionId?: string | null;
   tier?: { id: string; name?: string | null } | null;
   member?: {
     id: string;
     name?: string | null;
     email?: string | null;
   } | null;
 }

 export interface RefundablePaymentRow {
   id: string;
   idempotencyKey?: string;
   retainedAmount?: string;
   retained?: boolean;
   amount: number;
   currencyCode: string;
   refundAmount?: number | null;
   paymentDate?: string | null;
   receiptNumber?: string | null;
   description?: string | null;
   member?: { id: string; name?: string | null; email?: string | null } | null;
 }

 export interface FailedPaymentRow {
   id: string;
   amount: number;
   currencyCode: string;
   paymentDate?: string | null;
   description?: string | null;
   membership?: {
     id: string;
     member?: {
       id: string;
       name?: string | null;
       email?: string | null;
     } | null;
   } | null;
 }
 
 export type BillingQueueQuery = { q?: string; recoverySkip?: number; failedSkip?: number; planSkip?: number; refundSkip?: number; tierQuery?: string; tierSkip?: number; pinnedTierId?: string };

 export async function getBillingWorkspaceData(query: BillingQueueQuery = {}) {
   try {
     const response = await keystoneClient<{ billingWorkspace: any }>(`
       query BillingWorkspace($q: String, $recoverySkip: Int, $failedSkip: Int, $planSkip: Int, $refundSkip: Int, $tierQuery: String, $tierSkip: Int, $pinnedTierId: ID) {
         billingWorkspace(q: $q, recoverySkip: $recoverySkip, failedSkip: $failedSkip, planSkip: $planSkip, refundSkip: $refundSkip, tierQuery: $tierQuery, tierSkip: $tierSkip, pinnedTierId: $pinnedTierId)
       }
     `, query);
     if (!response.success) return { success: false as const, error: staffActionError(response, 'Billing data could not be loaded. Refresh to try again.') };
     return { success: true as const, data: response.data.billingWorkspace };
   } catch (error) {
     return { success: false as const, error: error instanceof Error ? error.message : 'Unable to load billing workspace' };
   }
 }

 /**
  * Fetch aggregated billing statistics from the custom GraphQL resolver
  */
 export async function getBillingStats() {
   try {
     const query = `
       query GetBillingStats {
         getBillingStats {
           totalRevenue
           monthlyRevenue
           currencyCode
           activeSubscriptions
           activeMemberships
           pastDueCount
         }
       }
     `;
 
     const response = await keystoneClient(query);
 
     if (!response.success) {
       return { success: false, error: response.error };
     }
 
     return { success: true, data: response.data.getBillingStats as BillingStats };
   } catch (error) {
     console.error('Error fetching billing stats:', error);
     return {
       success: false,
       error: error instanceof Error ? error.message : 'An unexpected error occurred'
     };
   }
 }
 
 /**
  * Fetch recent billing activity (payments and subscriptions)
  */
 export async function getRecentBillingActivity() {
   try {
     const query = `
       query GetRecentBillingActivity {
         recentPayments: membershipPayments(
           take: 10
           orderBy: { paymentDate: desc }
         ) {
           id
           amount
           currencyCode
           refundAmount
           status
           paymentDate
           paymentType
           member {
             id
             name
           }
         }
         recentSubscriptions: subscriptions(
           take: 10
           orderBy: { startDate: desc }
         ) {
           id
           status
           startDate
           member {
             id
             name
           }
           membershipTier {
             name
           }
         }
         managedMemberships: memberships(
           where: { status: { in: ["active", "frozen", "past-due"] } }
           take: 50
           orderBy: { updatedAt: desc }
         ) {
           id
           status
           billingCycle
           stripeSubscriptionId
           tier { id name }
           member { id name email }
         }
         availableTiers: membershipTiers(take: 100, orderBy: { monthlyPrice: asc }) {
           id
           name
         }
         billingRecoveryMembers: memberships(
           where: { status: { equals: "past-due" } }
           take: 8
           orderBy: { updatedAt: desc }
         ) {
           id
           status
           nextBillingDate
           stripeSubscriptionId
           tier {
             id
             name
           }
           member {
             id
             name
             email
           }
         }
         refundablePayments: gymPayments(
           where: { status: { equals: "succeeded" } }
           take: 20
           orderBy: { paymentDate: desc }
         ) {
           id
           amount
           currencyCode
           refundAmount
           paymentDate
           receiptNumber
           description
           member { id name email }
         }
         failedPayments: membershipPayments(
           where: { status: { equals: "failed" } }
           take: 8
           orderBy: { paymentDate: desc }
         ) {
           id
           amount
           currencyCode
           paymentDate
           description
           membership {
             id
             member {
               id
               name
               email
             }
           }
         }
       }
     `;
 
     const response = await keystoneClient<{
       recentPayments: any[];
       recentSubscriptions: any[];
       managedMemberships: ManagedMembershipRow[];
       availableTiers: MembershipTierOption[];
       billingRecoveryMembers: BillingRecoveryMember[];
       refundablePayments: RefundablePaymentRow[];
       failedPayments: FailedPaymentRow[];
     }>(query);
 
     if (!response.success) {
       return { success: false, error: response.error };
     }
 
     return { success: true, data: response.data };
   } catch (error) {
     console.error('Error fetching recent billing activity:', error);
     return {
       success: false,
       error: error instanceof Error ? error.message : 'An unexpected error occurred'
     };
   }
 }

 export async function changeMembershipTierOperatorAction(submitted: FormData): Promise<void> {
   let intentId = '';
   let formData = submitted;
   try {
     // Recorded before it is sent; a retry resends exactly this request, whatever the queue shows now.
     const intent = await openStaffIntent('billing', submitted, 'idempotencyKey');
     intentId = intent.id;
     formData = intent.form;
     const membershipId = formData.get('membershipId')?.toString();
     const newTierId = formData.get('newTierId')?.toString();
     const idempotencyKey = intent.requestKey;
     if (!membershipId || !newTierId || idempotencyKey.length < 12 || idempotencyKey.length > 200 || formData.get('confirmTierChange') !== 'yes') {
       throw new Error('Confirm the membership plan change');
     }
     const response = await keystoneClient(`
       mutation OperatorChangeMembershipTier($membershipId: ID!, $newTierId: ID!, $idempotencyKey: String!) {
         changeMembershipTier(membershipId: $membershipId, newTierId: $newTierId, idempotencyKey: $idempotencyKey) {
           message
         }
       }
     `, { membershipId, newTierId, idempotencyKey });
     if (!response.success) throw new Error(staffActionError(response, 'Membership plan change did not complete. Retry it: the same request is never applied twice.'));
     await settleStaffIntent(intentId, 'succeeded');
   } catch (error) {
     const message = error instanceof Error ? error.message : 'Membership plan change failed';
     if (intentId) await settleStaffIntent(intentId, 'failed', message);
     redirect(`${BILLING_PATH}?${returnQuery(formData, { error: message, ...(intentId ? { intent: intentId } : {}) })}#plan-changes`);
   }

   revalidatePath(BILLING_PATH);
   revalidatePath('/account/membership');
   redirect(`${BILLING_PATH}?${returnQuery(formData, { success: 'tier-updated' })}#plan-changes`);
 }

 export async function refundPaymentAction(submitted: FormData): Promise<void> {
   let intentId = '';
   let formData = submitted;
   try {
     // Recorded before it is sent (amount, reason, payment); a retry resends exactly this request.
     const intent = await openStaffIntent('billing', submitted, 'idempotencyKey');
     intentId = intent.id;
     formData = intent.form;
     const paymentId = formData.get('paymentId')?.toString();
     const amountText = formData.get('amount')?.toString().trim() || '';
     const reason = formData.get('reason')?.toString().trim() || '';
     const idempotencyKey = intent.requestKey;
     if (!paymentId || idempotencyKey.length < 12 || idempotencyKey.length > 200 || formData.get('confirmRefund') !== 'yes') {
       throw new Error('Confirm the refund before submitting');
     }
     const paymentResponse = await keystoneClient<{
       gymPayment?: { id: string; currencyCode: string } | null;
     }>(`
       query RefundPaymentCurrency($id: ID!) {
         gymPayment(where: { id: $id }) { id currencyCode }
       }
     `, { id: paymentId });
     if (!paymentResponse.success || !paymentResponse.data.gymPayment) {
       throw new Error(paymentResponse.success ? 'Payment not found' : staffActionError(paymentResponse, 'The payment could not be loaded. Try again.'));
     }
     const amount = amountText
       ? parseMajorUnitsToMinor(amountText, paymentResponse.data.gymPayment.currencyCode)
       : null;
     const response = await keystoneClient(`
       mutation RefundGymPayment($paymentId: ID!, $amount: Int, $reason: String, $idempotencyKey: String!) {
         refundGymPayment(paymentId: $paymentId, amount: $amount, reason: $reason, idempotencyKey: $idempotencyKey) {
           id
           status
           refundAmount
         }
       }
     `, {
       paymentId,
       amount,
       reason: reason || null,
       idempotencyKey,
     });
     if (!response.success) throw new Error(staffActionError(response, 'The refund did not complete. Retry it: the same refund request is never sent twice.'));
     await settleStaffIntent(intentId, 'succeeded');
   } catch (error) {
     const message = error instanceof Error ? error.message : 'Refund failed';
     if (intentId) await settleStaffIntent(intentId, 'failed', message);
     redirect(`${BILLING_PATH}?${returnQuery(formData, { error: message, ...(intentId ? { intent: intentId } : {}) })}#refunds`);
   }

   revalidatePath(BILLING_PATH);
   revalidatePath('/dashboard/platform/reports');
   redirect(`${BILLING_PATH}?${returnQuery(formData, { success: 'refund-completed' })}#refunds`);
 }
