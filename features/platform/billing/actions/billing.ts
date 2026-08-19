 'use server';
 
 import { redirect } from 'next/navigation';
 import { revalidatePath } from 'next/cache';
 import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';
 import { parseMajorUnitsToMinor } from '@/features/platform/lib/currency';
 
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
 
 export async function getBillingWorkspaceData() {
   try {
     const response = await keystoneClient<{ billingWorkspace: any }>(`
       query BillingWorkspace { billingWorkspace }
     `);
     if (!response.success) return { success: false as const, error: response.error };
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

 export async function changeMembershipTierOperatorAction(formData: FormData): Promise<void> {
   const membershipId = formData.get('membershipId')?.toString();
   const newTierId = formData.get('newTierId')?.toString();
   const idempotencyKey = formData.get('idempotencyKey')?.toString().trim() || '';
   if (!membershipId || !newTierId || idempotencyKey.length < 12 || idempotencyKey.length > 200 || formData.get('confirmTierChange') !== 'yes') {
     redirect('/dashboard/platform/billing?error=Confirm+the+membership+plan+change');
   }

   try {
     const response = await keystoneClient(`
       mutation OperatorChangeMembershipTier($membershipId: ID!, $newTierId: ID!, $idempotencyKey: String!) {
         changeMembershipTier(membershipId: $membershipId, newTierId: $newTierId, idempotencyKey: $idempotencyKey) {
           message
         }
       }
     `, { membershipId, newTierId, idempotencyKey });
     if (!response.success) throw new Error(response.error);
   } catch (error) {
     const message = error instanceof Error ? error.message : 'Membership plan change failed';
     redirect(`/dashboard/platform/billing?error=${encodeURIComponent(message)}`);
   }

   revalidatePath('/dashboard/platform/billing');
   revalidatePath('/account/membership');
   redirect('/dashboard/platform/billing?success=tier-updated');
 }

 export async function refundPaymentAction(formData: FormData): Promise<void> {
   const paymentId = formData.get('paymentId')?.toString();
   const amountText = formData.get('amount')?.toString().trim() || '';
   const reason = formData.get('reason')?.toString().trim() || '';
   const idempotencyKey = formData.get('idempotencyKey')?.toString().trim() || '';
   if (!paymentId || idempotencyKey.length < 12 || idempotencyKey.length > 200 || formData.get('confirmRefund') !== 'yes') {
     redirect('/dashboard/platform/billing?error=Confirm+the+refund+before+submitting');
   }

   try {
     const paymentResponse = await keystoneClient<{
       gymPayment?: { id: string; currencyCode: string } | null;
     }>(`
       query RefundPaymentCurrency($id: ID!) {
         gymPayment(where: { id: $id }) { id currencyCode }
       }
     `, { id: paymentId });
     if (!paymentResponse.success || !paymentResponse.data.gymPayment) {
       throw new Error(paymentResponse.success ? 'Payment not found' : paymentResponse.error);
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
     if (!response.success) throw new Error(response.error);
   } catch (error) {
     const message = error instanceof Error ? error.message : 'Refund failed';
     redirect(`/dashboard/platform/billing?error=${encodeURIComponent(message)}`);
   }

   revalidatePath('/dashboard/platform/billing');
   revalidatePath('/dashboard/platform/reports');
   redirect('/dashboard/platform/billing?success=refund-completed');
 }
