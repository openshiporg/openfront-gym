import { NextResponse } from 'next/server'
import { getDashboardUser } from '@/features/dashboard/lib/current-user'
import { generateUpcomingInstances } from '@/features/platform/scheduling/actions/scheduling'

export async function POST(request: Request) {
  try {
    const user = await getDashboardUser()

    if (!user?.role?.canManageAllRecords) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const weeks = Number(body?.weeks || 4)
    const result = await generateUpcomingInstances(weeks)
    return NextResponse.json(result)
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Failed to generate instances' }, { status: 500 })
  }
}
