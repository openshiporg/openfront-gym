 'use client';
 
 import React from 'react';
 import Link from 'next/link';
 import { 
   CreditCard, 
   DollarSign, 
   AlertTriangle,
   CheckCircle,
   XCircle,
   Clock,
   ArrowUpRight,
   Users
 } from 'lucide-react';
 import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
 import { Badge } from '@/components/ui/badge';
 import { Button } from '@/components/ui/button';
 import {
   Table,
   TableBody,
   TableCell,
   TableHead,
   TableHeader,
   TableRow,
 } from '@/components/ui/table';
 import type { BillingStats } from '../actions/billing';
 
 interface BillingDashboardClientProps {
   stats: BillingStats | null;
   recentPayments: any[];
   recentSubscriptions: any[];
 }
 
 function formatCurrency(amount: number): string {
   return new Intl.NumberFormat('en-US', {
     style: 'currency',
     currency: 'USD'
   }).format(amount);
 }
 
 function formatDate(dateString: string | null): string {
   if (!dateString) return '-';
   return new Date(dateString).toLocaleDateString('en-US', {
     month: 'short',
     day: 'numeric',
     year: 'numeric'
   });
 }
 
 function getStatusBadge(status: string) {
   const variants: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline', icon: any }> = {
     active: { variant: 'default', icon: CheckCircle },
     completed: { variant: 'default', icon: CheckCircle },
     cancelled: { variant: 'secondary', icon: XCircle },
     past_due: { variant: 'destructive', icon: AlertTriangle },
     'past-due': { variant: 'destructive', icon: AlertTriangle },
     pending: { variant: 'outline', icon: Clock },
   };
   
   const { variant, icon: Icon } = variants[status] || { variant: 'outline', icon: Clock };
   return (
     <Badge variant={variant} className="gap-1 capitalize">
       <Icon className="h-3 w-3" />
       {status.replace(/[-_]/g, ' ')}
     </Badge>
   );
 }
 
 export function BillingDashboardClient({ stats, recentPayments, recentSubscriptions }: BillingDashboardClientProps) {
   return (
     <div className="w-full p-4 md:p-6 space-y-6">
       {/* Stats Grid */}
       <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
         <Card>
           <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
             <CardTitle className="text-sm font-medium">Monthly Revenue</CardTitle>
             <DollarSign className="h-4 w-4 text-muted-foreground" />
           </CardHeader>
           <CardContent>
             <div className="text-2xl font-bold">{stats ? formatCurrency(stats.monthlyRevenue) : '...'}</div>
             <p className="text-xs text-muted-foreground">Current month revenue</p>
           </CardContent>
         </Card>
         <Card>
           <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
             <CardTitle className="text-sm font-medium">Active Subscriptions</CardTitle>
             <CreditCard className="h-4 w-4 text-muted-foreground" />
           </CardHeader>
           <CardContent>
             <div className="text-2xl font-bold">{stats?.activeSubscriptions ?? '...'}</div>
             <p className="text-xs text-muted-foreground">Total active recurring</p>
           </CardContent>
         </Card>
         <Card>
           <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
             <CardTitle className="text-sm font-medium">Active Memberships</CardTitle>
             <Users className="h-4 w-4 text-muted-foreground" />
           </CardHeader>
           <CardContent>
             <div className="text-2xl font-bold">{stats?.activeMemberships ?? '...'}</div>
             <p className="text-xs text-muted-foreground">Total active members</p>
           </CardContent>
         </Card>
         <Card className={stats?.pastDueCount && stats.pastDueCount > 0 ? 'border-destructive' : ''}>
           <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
             <CardTitle className="text-sm font-medium">Past Due</CardTitle>
             <AlertTriangle className={`h-4 w-4 ${stats?.pastDueCount && stats.pastDueCount > 0 ? 'text-destructive' : 'text-muted-foreground'}`} />
           </CardHeader>
           <CardContent>
             <div className={`text-2xl font-bold ${stats?.pastDueCount && stats.pastDueCount > 0 ? 'text-destructive' : ''}`}>
               {stats?.pastDueCount ?? '...'}
             </div>
             <p className="text-xs text-muted-foreground">Requires attention</p>
           </CardContent>
         </Card>
       </div>
 
       <div className="grid gap-6 lg:grid-cols-2">
         {/* Recent Subscriptions */}
         <Card>
           <CardHeader className="flex flex-row items-center justify-between">
             <div>
               <CardTitle>Recent Subscriptions</CardTitle>
               <CardDescription>Latest subscription signups and changes</CardDescription>
             </div>
             <Button variant="ghost" size="sm" asChild>
               <Link href="/dashboard/subscriptions">
                 View All
                 <ArrowUpRight className="ml-2 h-4 w-4" />
               </Link>
             </Button>
           </CardHeader>
           <CardContent>
             <Table>
               <TableHeader>
                 <TableRow>
                   <TableHead>Member</TableHead>
                   <TableHead>Status</TableHead>
                   <TableHead className="text-right">Start Date</TableHead>
                 </TableRow>
               </TableHeader>
               <TableBody>
                 {recentSubscriptions.map((sub: any) => (
                   <TableRow key={sub.id}>
                     <TableCell className="font-medium">{sub.member?.name || 'Unknown'}</TableCell>
                     <TableCell>{getStatusBadge(sub.status)}</TableCell>
                     <TableCell className="text-right text-muted-foreground">{formatDate(sub.startDate)}</TableCell>
                   </TableRow>
                 ))}
               </TableBody>
             </Table>
           </CardContent>
         </Card>
 
         {/* Recent Payments */}
         <Card>
           <CardHeader className="flex flex-row items-center justify-between">
             <div>
               <CardTitle>Recent Payments</CardTitle>
               <CardDescription>Last transactions processed</CardDescription>
             </div>
             <Button variant="ghost" size="sm" asChild>
               <Link href="/dashboard/membership-payments">
                 View All
                 <ArrowUpRight className="ml-2 h-4 w-4" />
               </Link>
             </Button>
           </CardHeader>
           <CardContent>
             <Table>
               <TableHeader>
                 <TableRow>
                   <TableHead>Member</TableHead>
                   <TableHead>Amount</TableHead>
                   <TableHead className="text-right">Date</TableHead>
                 </TableRow>
               </TableHeader>
               <TableBody>
                 {recentPayments.map((payment: any) => (
                   <TableRow key={payment.id}>
                     <TableCell className="font-medium">{payment.member?.name || 'Unknown'}</TableCell>
                     <TableCell>{formatCurrency(payment.amount)}</TableCell>
                     <TableCell className="text-right text-muted-foreground">{formatDate(payment.paymentDate)}</TableCell>
                   </TableRow>
                 ))}
               </TableBody>
             </Table>
           </CardContent>
         </Card>
       </div>
     </div>
   );
 }
