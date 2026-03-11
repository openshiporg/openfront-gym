 'use server';
 
 import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';
 
 export interface BillingStats {
   totalRevenue: number;
   monthlyRevenue: number;
   activeSubscriptions: number;
   activeMemberships: number;
   pastDueCount: number;
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
       }
     `;
 
     const response = await keystoneClient(query);
 
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
