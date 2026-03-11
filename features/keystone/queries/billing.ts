 import { KeystoneContext } from "@keystone-6/core/types";
 
 export async function getBillingStats(
   root: any,
   args: any,
   context: KeystoneContext
 ) {
   const now = new Date();
   const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
 
   // Use context.sudo() to bypass access control for aggregation if needed
   const sudoContext = context.sudo();
 
   const [
     activeSubscriptions,
     activeMemberships,
     pastDueSubscriptions,
     pastDueMemberships,
     completedPayments,
   ] = await Promise.all([
     sudoContext.query.Subscription.count({
       where: { status: { equals: "active" } },
     }),
     sudoContext.query.Membership.count({
       where: { status: { equals: "active" } },
     }),
     sudoContext.query.Subscription.count({
       where: { status: { equals: "past_due" } },
     }),
     sudoContext.query.Membership.count({
       where: { status: { equals: "past-due" } },
     }),
     sudoContext.query.MembershipPayment.findMany({
       where: { status: { equals: "completed" } },
       query: "amount paymentDate",
     }),
   ]);
 
   const totalRevenue = completedPayments.reduce(
     (sum: number, p: any) => sum + (p.amount || 0),
     0
   );
   
   const monthlyRevenue = completedPayments
     .filter((p: any) => new Date(p.paymentDate) >= startOfMonth)
     .reduce((sum: number, p: any) => sum + (p.amount || 0), 0);
 
   return {
     totalRevenue,
     monthlyRevenue,
     activeSubscriptions,
     activeMemberships,
     pastDueCount: pastDueSubscriptions + pastDueMemberships,
   };
 }
