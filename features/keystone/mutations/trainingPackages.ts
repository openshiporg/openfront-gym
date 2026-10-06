import { enqueueOperationalNotice } from "../lib/operational-notices";
import { guardKeystonePrismaResults } from "../lib/prisma-result";
import { lockTransactionKey } from "./classCapacity";
import { hashTrainerAppointmentRequest } from "./trainerAppointmentEvidence";
import { assertTrainingActor, assertTrainingTenant, trainingInteger, trainingText, unusedPackageRefundAmount, type TrainingActor } from "./trainingPolicy";

function throwOnKeystonePrismaError<T>(result: T): T {
  if (result instanceof Error) throw result;
  return result;
}

export async function recordSettledTrainingPackage(prisma: any, input: any, actor: TrainingActor, now = new Date()) {
  prisma = guardKeystonePrismaResults(prisma);
  assertTrainingActor(actor);
  if (!actor.canManageAppointments) throw new Error("Training management permission required");
  const purchaseReference = trainingText(input.purchaseReference, "External settled payment reference", 200);
  const serviceName = trainingText(input.serviceName, "Service name", 200);
  const amount = trainingInteger(input.amount, "Paid amount in cents", 1, 100_000_000);
  const totalCredits = trainingInteger(input.totalCredits, "Credits", 1, 1000);
  const durationMinutes = trainingInteger(input.durationMinutes, "Duration", 15, 480);
  const expiresAt = new Date(input.expiresAt), purchasedAt = new Date(input.purchasedAt);
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt <= now || !Number.isFinite(purchasedAt.getTime()) || purchasedAt > now || expiresAt <= purchasedAt) throw new Error("Purchase/expiry dates are invalid");
  if (input.currencyCode !== "USD") throw new Error("Training package recording currently supports USD only");
  const terms = { serviceName, durationMinutes, totalCredits, amount, currencyCode: "USD", memberId: input.memberId, locationId: input.locationId, purchasedAt: purchasedAt.toISOString(), expiresAt: expiresAt.toISOString(), cancellationPolicy: "Cancel before the appointment starts to restore its original package credit; expired credits do not become current credits.", refundPolicy: "Unused unreserved units only; external refund must already be settled and separately referenced." };
  return prisma.$transaction(async (tx: any) => {
    await lockTransactionKey(tx, `training-purchase:${actor.organizationId}:${purchaseReference}`);
    const member = await tx.member.findUnique({ where: { id: input.memberId } });
    const location = await tx.location.findUnique({ where: { id: input.locationId } });
    assertTrainingTenant(member, actor, "Member"); assertTrainingTenant(location, actor, "Location");
    if (member.status !== "active" || !location.isActive) throw new Error("Active member and location required");
    const existing = await tx.trainingPackage.findFirst({ where: { organizationId: actor.organizationId, purchaseReference } });
    if (existing) {
      if (hashTrainerAppointmentRequest(existing.terms) !== hashTrainerAppointmentRequest(terms)) throw new Error("Payment reference already records a different package");
      return { id: existing.id, reused: true };
    }
    const pack = throwOnKeystonePrismaError(await tx.trainingPackage.create({ data: { organizationId: actor.organizationId, memberId: member.id, locationId: location.id, serviceName, durationMinutes, totalCredits, creditsRemaining: totalCredits, amount, currencyCode: "USD", purchaseReference, purchasedAt, expiresAt, recordedById: actor.userId, status: "active", terms } }));
    throwOnKeystonePrismaError(await tx.trainingCreditEntry.create({ data: { organizationId: actor.organizationId, trainingPackageId: pack.id, eventKey: `issued:${pack.id}`, kind: "issued", quantity: totalCredits, balanceAfter: totalCredits, actorId: actor.userId, reason: purchaseReference } }));
    throwOnKeystonePrismaError(await enqueueOperationalNotice(tx, { organizationId: actor.organizationId, memberId: member.id, key: `training-package:${pack.id}`, kind: "training", message: `${totalCredits} ${serviceName} credits were recorded from your settled purchase. Review the service, expiry and cancellation terms in Account → Training.` }));
    return { id: pack.id, reused: false };
  });
}

export async function recordTrainingPackageRefund(prisma: any, input: any, actor: TrainingActor) {
  prisma = guardKeystonePrismaResults(prisma);
  assertTrainingActor(actor);
  if (!actor.canManageAppointments) throw new Error("Training management permission required");
  const reference = trainingText(input.refundReference, "External settled refund reference", 200);
  return prisma.$transaction(async (tx: any) => {
    await lockTransactionKey(tx, `training-refund:${actor.organizationId}:${reference}`);
    await lockTransactionKey(tx, `training-package:${input.packageId}`);
    const pack = await tx.trainingPackage.findUnique({ where: { id: input.packageId } });
    assertTrainingTenant(pack, actor, "Training package");
    if (pack.status === "refunded") {
      if (pack.refundReference !== reference || pack.refundAmount !== input.amount) throw new Error("Package already has different refund evidence");
      return { id: pack.id, reused: true };
    }
    const otherRefund = await tx.trainingPackage.findFirst({ where: { organizationId: actor.organizationId, refundReference: reference } });
    if (otherRefund && otherRefund.id !== pack.id) throw new Error("External refund reference is already allocated to another package");
    const active = await tx.trainerAppointment.count({ where: { organizationId: actor.organizationId, trainingPackageId: pack.id, status: { in: ["scheduled", "confirmed", "checked_in"] } } });
    if (active) throw new Error("Cancel or complete reserved appointments before refunding the package");
    const amount = unusedPackageRefundAmount(pack);
    if (amount < 1 || input.amount !== amount) throw new Error(`Record the exact unused-credit refund: ${amount} cents`);
    throwOnKeystonePrismaError(await tx.trainingCreditEntry.create({ data: { organizationId: actor.organizationId, trainingPackageId: pack.id, eventKey: `refunded:${pack.id}`, kind: "refunded", quantity: -pack.creditsRemaining, balanceAfter: 0, actorId: actor.userId, reason: reference } }));
    throwOnKeystonePrismaError(await tx.trainingPackage.update({ where: { id: pack.id }, data: { status: "refunded", refundAmount: amount, refundReference: reference, refundedAt: new Date(), creditsRemaining: 0 } }));
    throwOnKeystonePrismaError(await enqueueOperationalNotice(tx, { organizationId: actor.organizationId, memberId: pack.memberId, key: `training-package-refund:${pack.id}`, kind: "training", message: `The studio recorded an external ${pack.currencyCode} ${(amount / 100).toFixed(2)} refund for unused ${pack.serviceName} credits. The remaining package credits are retired.` }));
    return { id: pack.id, amount, reused: false };
  });
}

export async function debitTrainingPackage(tx: any, pack: any, appointmentId: string, actor: TrainingActor) {
  tx = guardKeystonePrismaResults(tx);
  if (pack.creditsRemaining < 1) throw new Error("Package has no available credits");
  const balanceAfter = pack.creditsRemaining - 1;
  throwOnKeystonePrismaError(await tx.trainingPackage.update({ where: { id: pack.id }, data: { creditsRemaining: balanceAfter } }));
  throwOnKeystonePrismaError(await tx.trainingCreditEntry.create({ data: { organizationId: actor.organizationId, trainingPackageId: pack.id, appointmentId, eventKey: `reserved:${appointmentId}`, kind: "reserved", quantity: -1, balanceAfter, actorId: actor.userId } }));
}
export async function restoreTrainingPackage(tx: any, appointment: any, actor: TrainingActor) {
  tx = guardKeystonePrismaResults(tx);
  if (!appointment.trainingPackageId) return;
  await lockTransactionKey(tx, `training-package:${appointment.trainingPackageId}`);
  const pack = await tx.trainingPackage.findUnique({ where: { id: appointment.trainingPackageId } });
  assertTrainingTenant(pack, actor, "Training package");
  const debit = await tx.trainingCreditEntry.findFirst({ where: { organizationId: actor.organizationId, eventKey: `reserved:${appointment.id}`, trainingPackageId: pack.id } });
  if (!debit) throw new Error("Appointment credit provenance is missing; operator review required");
  const balanceAfter = pack.creditsRemaining + 1;
  if (pack.status !== "active" || balanceAfter > pack.totalCredits) throw new Error("Package balance cannot be restored automatically");
  const restoration = await tx.trainingCreditEntry.create({ data: { organizationId: actor.organizationId, trainingPackageId: pack.id, appointmentId: appointment.id, eventKey: `restored:${appointment.id}`, kind: "restored", quantity: 1, balanceAfter, actorId: actor.userId } });
  if (restoration instanceof Error) throw restoration;
  const updatedPackage = await tx.trainingPackage.update({ where: { id: pack.id }, data: { creditsRemaining: balanceAfter } });
  if (updatedPackage instanceof Error) throw updatedPackage;
}
