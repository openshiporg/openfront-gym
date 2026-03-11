import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { keystoneContext } from '@/features/keystone/context';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 });
    }

    const user = await keystoneContext.sudo().query.User.findOne({
      where: { id: userId },
      query: 'id stripeCustomerId',
    });

    if (!user?.stripeCustomerId) {
      return NextResponse.json(
        { error: 'No Stripe customer found for this user' },
        { status: 400 }
      );
    }

    const baseUrl = process.env.NEXT_PUBLIC_URL || 'http://localhost:3000';

    const { url } = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${baseUrl}/member/account`,
    });

    return NextResponse.json({ url });
  } catch (error: any) {
    console.error('Error creating portal link:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
