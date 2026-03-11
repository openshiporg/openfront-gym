 "use client";
 
 import {
   CreditCard,
   DollarSign,
   AlertTriangle,
   CheckCircle,
   XCircle,
   Clock,
   Users,
   TrendingUp,
   History,
 } from "lucide-react";
 import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
 import { Badge } from "@/components/ui/badge";
 import {
   Table,
   TableBody,
   TableCell,
   TableHead,
   TableHeader,
   TableRow,
 } from "@/components/ui/table";
 
 interface BillingStats {
   totalRevenue: number;
   monthlyRevenue: number;
   activeSubscriptions: number;
   activeMemberships: number;
   pastDueCount: number;
 }
 
 interface BillingDashboardClientProps {
   stats: BillingStats;
   recentPayments: any[];
   recentSubscriptions: any[];
 }
 
 function formatCurrency(amount: number): string {
   return new Intl.NumberFormat("en-US", {
     style: "currency",
     currency: "USD",
   }).format(amount);
 }
 
 function formatDate(dateString: string | null): string {
   if (!dateString) return "-";
   return new Date(dateString).toLocaleDateString("en-US", {
     month: "short",
     day: "numeric",
     year: "numeric",
   });
 }
 
 function getStatusBadge(status: string) {
   const variants: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; icon: any }> = {
     active: { variant: "default", icon: CheckCircle },
     completed: { variant: "default", icon: CheckCircle },
     cancelled: { variant: "secondary", icon: XCircle },
     past_due: { variant: "destructive", icon: AlertTriangle },
     "past-due": { variant: "destructive", icon: AlertTriangle },
     pending: { variant: "outline", icon: Clock },
   };
 
   const { variant, icon: Icon } = variants[status] || {
     variant: "outline",
     icon: Clock,
   };
   return (
     <Badge variant={variant} className="gap-1 capitalize">
       <Icon className="h-3 w-3" />
       {status.replace(/[-_]/g, " ")}
     </Badge>
   );
 }
 
 export default function BillingDashboardClient({
   stats,
   recentPayments,
   recentSubscriptions,
 }: BillingDashboardClientProps) {
   return (
     <div className="space-y-8">
       {/* Stats Grid */}
       <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
         <Card className="shadow-sm border-none bg-primary/5">
           <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
             <CardTitle className="text-sm font-medium">Monthly Revenue</CardTitle>
             <TrendingUp className="h-4 w-4 text-primary" />
           </CardHeader>
           <CardContent>
             <div className="text-2xl font-bold">{formatCurrency(stats.monthlyRevenue)}</div>
             <p className="text-xs text-muted-foreground mt-1">
               Current month performance
             </p>
           </CardContent>
         </Card>
         <Card className="shadow-sm border-none">
           <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
             <CardTitle className="text-sm font-medium">Active Subscriptions</CardTitle>
             <CreditCard className="h-4 w-4 text-muted-foreground" />
           </CardHeader>
           <CardContent>
             <div className="text-2xl font-bold">{stats.activeSubscriptions}</div>
             <p className="text-xs text-muted-foreground mt-1">
               Stripe recurring billing
             </p>
           </CardContent>
         </Card>
         <Card className="shadow-sm border-none">
           <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
             <CardTitle className="text-sm font-medium">Active Members</CardTitle>
             <Users className="h-4 w-4 text-muted-foreground" />
           </CardHeader>
           <CardContent>
             <div className="text-2xl font-bold">{stats.activeMemberships}</div>
             <p className="text-xs text-muted-foreground mt-1">
               Total memberships
             </p>
           </CardContent>
         </Card>
         <Card className={`shadow-sm border-none ${stats.pastDueCount > 0 ? "bg-destructive/5" : ""}`}>
           <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
             <CardTitle className="text-sm font-medium">Past Due</CardTitle>
             <AlertTriangle className={`h-4 w-4 ${stats.pastDueCount > 0 ? "text-destructive" : "text-muted-foreground"}`} />
           </CardHeader>
           <CardContent>
             <div className={`text-2xl font-bold ${stats.pastDueCount > 0 ? "text-destructive" : ""}`}>
               {stats.pastDueCount}
             </div>
             <p className="text-xs text-muted-foreground mt-1">
               Requires intervention
             </p>
           </CardContent>
         </Card>
       </div>
 
       <div className="grid gap-8 lg:grid-cols-2">
         {/* Recent Subscriptions */}
         <Card className="shadow-sm border-none">
           <CardHeader className="flex flex-row items-center justify-between">
             <div className="space-y-1">
               <CardTitle className="flex items-center gap-2">
                 <Users className="h-5 w-5 text-muted-foreground" />
                 New Subscriptions
               </CardTitle>
             </div>
           </CardHeader>
           <CardContent>
             <Table>
               <TableHeader>
                 <TableRow className="hover:bg-transparent">
                   <TableHead>Member</TableHead>
                   <TableHead>Status</TableHead>
                   <TableHead className="text-right">Started</TableHead>
                 </TableRow>
               </TableHeader>
               <TableBody>
                 {recentSubscriptions.map((sub: any) => (
                   <TableRow key={sub.id}>
                     <TableCell className="font-medium">{sub.member?.name || "Unknown"}</TableCell>
                     <TableCell>{getStatusBadge(sub.status)}</TableCell>
                     <TableCell className="text-right text-muted-foreground">
                       {formatDate(sub.startDate)}
                     </TableCell>
                   </TableRow>
                 ))}
                 {recentSubscriptions.length === 0 && (
                   <TableRow>
                     <TableCell colSpan={3} className="text-center py-8 text-muted-foreground italic">
                       No recent subscription activity
                     </TableCell>
                   </TableRow>
                 )}
               </TableBody>
             </Table>
           </CardContent>
         </Card>
 
         {/* Recent Payments */}
         <Card className="shadow-sm border-none">
           <CardHeader className="flex flex-row items-center justify-between">
             <div className="space-y-1">
               <CardTitle className="flex items-center gap-2">
                 <History className="h-5 w-5 text-muted-foreground" />
                 Recent Payments
               </CardTitle>
             </div>
           </CardHeader>
           <CardContent>
             <Table>
               <TableHeader>
                 <TableRow className="hover:bg-transparent">
                   <TableHead>Member</TableHead>
                   <TableHead>Amount</TableHead>
                   <TableHead className="text-right">Date</TableHead>
                 </TableRow>
               </TableHeader>
               <TableBody>
                 {recentPayments.map((payment: any) => (
                   <TableRow key={payment.id}>
                     <TableCell className="font-medium">{payment.member?.name || "Unknown"}</TableCell>
                     <TableCell className="font-semibold text-primary">
                       {formatCurrency(payment.amount)}
                     </TableCell>
                     <TableCell className="text-right text-muted-foreground">
                       {formatDate(payment.paymentDate)}
                     </TableCell>
                   </TableRow>
                 ))}
                 {recentPayments.length === 0 && (
                   <TableRow>
                     <TableCell colSpan={3} className="text-center py-8 text-muted-foreground italic">
                       No recent payment history
                     </TableCell>
                   </TableRow>
                 )}
               </TableBody>
             </Table>
           </CardContent>
         </Card>
       </div>
     </div>
   );
 }
