"use server";

import { redirect } from "next/navigation";
import crypto from "node:crypto";
import { gql } from "graphql-request";
import { gymClient } from "@/features/storefront/lib/config";
import { getAuthHeaders } from "@/features/storefront/lib/data/cookies";
import { getUser } from "@/features/storefront/lib/data/user";
import { getBaseUrl } from "@/features/dashboard/lib/getBaseUrl";

async function requireUserWithMembership() {
  const user = await getUser();
  if (!user) {
    throw new Error("Please sign in first.");
  }
  if (!user.membership?.id) {
    throw new Error("No active membership found for this account.");
  }
  return user;
}

export async function cancelMembershipAction(formData: FormData): Promise<void> {
  try {
    const user = await requireUserWithMembership();
    const reason = formData.get("reason")?.toString().trim() || undefined;
    if (formData.get("confirmEndOfTerm") !== "yes") {
      throw new Error("Confirm that renewal should end after the current paid period.");
    }
    const headers = await getAuthHeaders();

    await gymClient.request(
      gql`
        mutation CancelMembership($membershipId: ID!, $reason: String, $idempotencyKey: String!) {
          cancelMembership(membershipId: $membershipId, reason: $reason, idempotencyKey: $idempotencyKey) {
            message
          }
        }
      `,
      {
        membershipId: user.membership!.id,
        reason,
        idempotencyKey: crypto.randomUUID(),
      },
      headers
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to cancel membership.";
    redirect(`/account/membership?error=${encodeURIComponent(message)}`);
  }

  redirect("/account/membership?success=cancelled");
}

export async function freezeMembershipAction(formData: FormData): Promise<void> {
  try {
    const user = await requireUserWithMembership();
    const endDate = formData.get("endDate")?.toString();
    if (!endDate) throw new Error("Freeze end date is required.");

    const end = new Date(`${endDate}T23:59:59.999Z`);
    if (Number.isNaN(end.getTime()) || end <= new Date()) {
      throw new Error("Freeze end date must be in the future.");
    }

    const headers = await getAuthHeaders();
    await gymClient.request(
      gql`
        mutation FreezeMembership($membershipId: ID!, $endDate: String!, $idempotencyKey: String!) {
          freezeMembership(membershipId: $membershipId, endDate: $endDate, idempotencyKey: $idempotencyKey) {
            message
          }
        }
      `,
      {
        membershipId: user.membership!.id,
        endDate: end.toISOString(),
        idempotencyKey: crypto.randomUUID(),
      },
      headers
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to freeze membership.";
    redirect(`/account/membership?error=${encodeURIComponent(message)}`);
  }

  redirect("/account/membership?success=frozen");
}

export async function resumeMembershipAction(_formData: FormData): Promise<void> {
  try {
    const user = await requireUserWithMembership();
    const headers = await getAuthHeaders();

    await gymClient.request(
      gql`
        mutation ResumeMembership($membershipId: ID!, $idempotencyKey: String!) {
          unfreezeMembership(membershipId: $membershipId, idempotencyKey: $idempotencyKey) {
            message
          }
        }
      `,
      {
        membershipId: user.membership!.id,
        idempotencyKey: crypto.randomUUID(),
      },
      headers
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to resume membership.";
    redirect(`/account/membership?error=${encodeURIComponent(message)}`);
  }

  redirect("/account/membership?success=resumed");
}

export async function openBillingPortalAction(): Promise<void> {
  const user = await requireUserWithMembership();
  const headers = await getAuthHeaders();
  const returnUrl = `${await getBaseUrl()}/account/membership`;

  let portalUrl: string | undefined;

  try {
    const result = await gymClient.request<{ getStripeBillingPortal: { url: string } }>(
      gql`
        mutation OpenBillingPortal($userId: ID!, $returnUrl: String!) {
          getStripeBillingPortal(userId: $userId, returnUrl: $returnUrl) {
            url
          }
        }
      `,
      {
        userId: user.id,
        returnUrl,
      },
      headers
    );

    portalUrl = result.getStripeBillingPortal.url;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to open billing portal.";
    redirect(`/account/membership?error=${encodeURIComponent(message)}`);
  }

  if (!portalUrl) {
    redirect("/account/membership?error=Unable%20to%20open%20billing%20portal.");
  }

  redirect(portalUrl);
}
