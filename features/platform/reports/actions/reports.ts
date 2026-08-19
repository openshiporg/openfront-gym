'use server';

import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';

export type OperatorSummary = {
  activeMembers: number;
  checkInsToday: number;
  upcomingSessionsToday: number;
  liveOrStartingSoon: number;
  waitlistPressure: number;
  pastDueMemberships: number;
};

export type RevenueSummary = {
  monthlyRevenue: number;
  totalRevenue: number;
  currencyCode: string;
  settledPayments: number;
  monthlySettledPayments: number;
  averagePayment: number;
};

export type AttendanceSummary = {
  totalMarked: number;
  attendedCount: number;
  lateCount: number;
  noShowCount: number;
  attendanceRate: number;
  noShowRate: number;
};

export type UtilizationRow = {
  id: string;
  name: string;
  instructorName: string;
  nextSessionDate: string | null;
  maxCapacity: number;
  confirmedBookings: number;
  waitlistCount: number;
  utilizationPercent: number;
};

export type MembershipHealthRow = {
  id: string;
  name: string;
  email: string;
  membershipStatus: string;
  planName: string;
  creditsRemaining: number | null;
  attendanceRate: number;
  lastCheckIn: string | null;
};

export type ReportsDashboardData = {
  timeZone: string;
  operator: OperatorSummary;
  revenue: RevenueSummary;
  attendance: AttendanceSummary;
  utilization: UtilizationRow[];
  membershipHealth: MembershipHealthRow[];
};

export async function getReportsDashboardData(): Promise<ReportsDashboardData> {
  const response = await keystoneClient<{ reportsDashboard: ReportsDashboardData }>(`
    query ReportsDashboard { reportsDashboard }
  `);
  if (!response.success) throw new Error(response.error);
  return response.data.reportsDashboard;
}
