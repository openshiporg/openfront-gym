 import { keystoneClient } from "@/features/dashboard/lib/keystoneClient";
 import BillingDashboardClient from "./BillingDashboardClient";
 
 export default async function BillingAdminPage() {
   const queryDocument = `
     query BillingDashboardData {
       getBillingStats {
         totalRevenue
         monthlyRevenue
         activeSubscriptions
         activeMemberships
         pastDueCount
       }
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
 
   const response = await keystoneClient<{
     getBillingStats: {
       totalRevenue: number;
       monthlyRevenue: number;
       activeSubscriptions: number;
       activeMemberships: number;
       pastDueCount: number;
     };
     recentPayments: any[];
     recentSubscriptions: any[];
   }>(queryDocument);
 
   const stats = response.success ? response.data.getBillingStats : {
     totalRevenue: 0,
     monthlyRevenue: 0,
     activeSubscriptions: 0,
     activeMemberships: 0,
     pastDueCount: 0
   };
   
   const recentPayments = response.success ? response.data.recentPayments : [];
   const recentSubscriptions = response.success ? response.data.recentSubscriptions : [];
 
   return (
     <div className="min-h-screen bg-muted/40">
       <div className="mx-auto max-w-6xl px-6 py-10">
         <div className="flex flex-col gap-2">
           <h1 className="text-3xl font-semibold">Billing Management</h1>
           <p className="text-sm text-muted-foreground">
             Monitor revenue, active subscriptions, and payment health across the facility.
           </p>
         </div>
 
         <div className="mt-8">
           <BillingDashboardClient 
             stats={stats} 
             recentPayments={recentPayments} 
             recentSubscriptions={recentSubscriptions} 
           />
         </div>
       </div>
     </div>
   );
 }
