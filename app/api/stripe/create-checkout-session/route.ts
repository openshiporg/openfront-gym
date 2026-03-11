import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { keystoneContext } from '@/features/keystone/context';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

const createOrRetrieveCustomer = async (userId: string, email: string) => {
  const query = keystoneContext.sudo().query;

  const user = await query.User.findOne({
    where: { id: userId },
    query: 'id email stripeCustomerId',
  });

  if (!user) {
    throw new Error('User not found');
  }

  if (user.stripeCustomerId) {
    return user.stripeCustomerId;
  }

  const customer = await stripe.customers.create({
    email: email,
    metadata: { userId: userId },
  });

  await query.User.updateOne({
    where: { id: userId },
    data: { stripeCustomerId: customer.id },
  });

  return customer.id;
};

export async function POST(request: NextRequest) {
  try {
    const { priceId, userId, userEmail, membershipId, billingCycle } = await request.json();

    if (!priceId) {
      return NextResponse.json({ error: 'Price ID required' }, { status: 400 });
    }

    if (!userId || !userEmail) {
      return NextResponse.json({ error: 'User information required' }, { status: 400 });
    }

    const customerId = await createOrRetrieveCustomer(userId, userEmail);

    const baseUrl = process.env.NEXT_PUBLIC_URL || 'http://localhost:3000';

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      customer: customerId,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${baseUrl}/member/account?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/member/pricing`,
      metadata: {
        userId: userId,
        membershipId: membershipId || '',
        billingCycle: billingCycle || 'monthly',
      },
      subscription_data: {
        metadata: {
          userId: userId,
          membershipId: membershipId || '',
          billingCycle: billingCycle || 'monthly',
        },
      },
    });

    return NextResponse.json({ sessionId: session.id, url: session.url });
  } catch (error: any) {
    console.error('Error creating checkout session:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
