-- AlterTable
ALTER TABLE "ClassBooking" ADD COLUMN     "eligibilityReviewReason" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "ClassInstance" ADD COLUMN     "changeHistory" JSONB DEFAULT '[]',
ADD COLUMN     "endsAt" TIMESTAMP(3),
ADD COLUMN     "location" TEXT,
ADD COLUMN     "occurrenceKey" TEXT,
ADD COLUMN     "resource" TEXT;

-- AlterTable
ALTER TABLE "ClassSchedule" ADD COLUMN     "location" TEXT,
ADD COLUMN     "resource" TEXT;

-- AlterTable
ALTER TABLE "Membership" ADD COLUMN     "agreementHistory" JSONB DEFAULT '[]',
ADD COLUMN     "agreementSnapshot" JSONB DEFAULT '{}',
ADD COLUMN     "billingEventAt" TIMESTAMP(3),
ADD COLUMN     "creditPeriodEnd" TIMESTAMP(3),
ADD COLUMN     "creditPeriodStart" TIMESTAMP(3),
ADD COLUMN     "recoveryHistory" JSONB DEFAULT '[]';

-- AlterTable
ALTER TABLE "MembershipTier" ADD COLUMN     "annualPriceMinor" INTEGER,
ADD COLUMN     "monthlyPriceMinor" INTEGER;

-- AlterTable
ALTER TABLE "TrainerAppointment" ADD COLUMN     "replacesAppointment" TEXT,
ADD COLUMN     "resourceEndsAt" TIMESTAMP(3),
ADD COLUMN     "resourceStartsAt" TIMESTAMP(3),
ADD COLUMN     "trainingPackage" TEXT;

-- CreateTable
CREATE TABLE "RetailItem" (
    "id" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "sku" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL DEFAULT '',
    "unitAmount" INTEGER NOT NULL,
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "stockOnHand" INTEGER DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetailItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetailSale" (
    "id" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL DEFAULT '',
    "requestHash" TEXT NOT NULL DEFAULT '',
    "lines" JSONB DEFAULT '[]',
    "totalAmount" INTEGER NOT NULL,
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "tender" TEXT NOT NULL DEFAULT '',
    "paymentReference" TEXT NOT NULL DEFAULT '',
    "soldAt" TIMESTAMP(3) NOT NULL,
    "recordedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetailSale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetailReturn" (
    "id" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "sale" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL DEFAULT '',
    "requestHash" TEXT NOT NULL DEFAULT '',
    "lines" JSONB DEFAULT '[]',
    "refundAmount" INTEGER NOT NULL,
    "refundReference" TEXT NOT NULL DEFAULT '',
    "tender" TEXT NOT NULL DEFAULT '',
    "reason" TEXT NOT NULL DEFAULT '',
    "returnedAt" TIMESTAMP(3) NOT NULL,
    "recordedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetailReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetailStockEntry" (
    "id" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "item" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL DEFAULT '',
    "requestHash" TEXT NOT NULL DEFAULT '',
    "quantity" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "recordedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetailStockEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetailClose" (
    "id" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL DEFAULT '',
    "requestHash" TEXT NOT NULL DEFAULT '',
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "openingAmount" INTEGER,
    "expectedAmount" INTEGER NOT NULL,
    "countedAmount" INTEGER NOT NULL,
    "varianceAmount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "evidence" JSONB DEFAULT '{}',
    "recordedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetailClose_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberImportRecord" (
    "id" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "key" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT '',
    "externalId" TEXT NOT NULL DEFAULT '',
    "payloadHash" TEXT NOT NULL DEFAULT '',
    "status" TEXT DEFAULT 'processing',
    "member" TEXT,
    "lastError" TEXT NOT NULL DEFAULT '',
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemberImportRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingPackage" (
    "id" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "member" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "serviceName" TEXT NOT NULL DEFAULT '',
    "durationMinutes" INTEGER NOT NULL,
    "totalCredits" INTEGER NOT NULL,
    "creditsRemaining" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "purchaseReference" TEXT NOT NULL DEFAULT '',
    "purchasedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "recordedBy" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "refundAmount" INTEGER DEFAULT 0,
    "refundReference" TEXT NOT NULL DEFAULT '',
    "refundedAt" TIMESTAMP(3),
    "terms" JSONB DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainingPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingCreditEntry" (
    "id" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "trainingPackage" TEXT NOT NULL,
    "appointment" TEXT,
    "eventKey" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "actor" TEXT,
    "reason" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainingCreditEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoachingAssignment" (
    "id" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "member" TEXT NOT NULL,
    "instructor" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "instructions" TEXT NOT NULL DEFAULT '',
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT DEFAULT 'assigned',
    "memberEvidence" TEXT NOT NULL DEFAULT '',
    "submittedAt" TIMESTAMP(3),
    "review" TEXT NOT NULL DEFAULT '',
    "reviewedAt" TIMESTAMP(3),
    "workoutLog" TEXT,
    "requestKey" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoachingAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingLead" (
    "id" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT '',
    "owner" TEXT,
    "status" TEXT DEFAULT 'new',
    "trialAt" TIMESTAMP(3),
    "nextActionAt" TIMESTAMP(3),
    "member" TEXT,
    "history" JSONB DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainingLead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipCreditGrant" (
    "id" TEXT NOT NULL,
    "organization" TEXT,
    "key" TEXT NOT NULL DEFAULT '',
    "membership" TEXT,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "allowance" INTEGER NOT NULL,
    "remaining" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MembershipCreditGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipCreditEntry" (
    "id" TEXT NOT NULL,
    "organization" TEXT,
    "key" TEXT NOT NULL DEFAULT '',
    "grant" TEXT,
    "booking" TEXT,
    "delta" INTEGER NOT NULL,
    "kind" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MembershipCreditEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationalNotice" (
    "id" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "member" TEXT,
    "key" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL DEFAULT '',
    "message" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER DEFAULT 0,
    "lastError" TEXT NOT NULL DEFAULT '',
    "resolvedAt" TIMESTAMP(3),
    "history" JSONB DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperationalNotice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParticipationPolicy" (
    "id" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT '',
    "documentReference" TEXT NOT NULL DEFAULT '',
    "enforceWaiver" BOOLEAN NOT NULL DEFAULT true,
    "adultOnly" BOOLEAN NOT NULL DEFAULT true,
    "healthPurpose" TEXT NOT NULL DEFAULT '',
    "retentionDays" INTEGER DEFAULT 365,
    "publishedBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParticipationPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParticipationEvidence" (
    "id" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "member" TEXT,
    "policy" TEXT,
    "key" TEXT NOT NULL DEFAULT '',
    "requestHash" TEXT NOT NULL DEFAULT '',
    "documentReference" TEXT NOT NULL DEFAULT '',
    "verifiedBy" TEXT NOT NULL DEFAULT '',
    "acceptedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revocationReason" TEXT NOT NULL DEFAULT '',
    "healthConsent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParticipationEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationsCase" (
    "id" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "member" TEXT,
    "key" TEXT NOT NULL DEFAULT '',
    "requestHash" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL DEFAULT '',
    "reference" TEXT NOT NULL DEFAULT '',
    "locationId" TEXT NOT NULL DEFAULT '',
    "summary" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'open',
    "assignedTo" TEXT NOT NULL DEFAULT '',
    "history" JSONB DEFAULT '[]',
    "openedBy" TEXT NOT NULL DEFAULT '',
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperationsCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationCredential" (
    "id" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "digest" TEXT NOT NULL DEFAULT '',
    "scopes" JSONB DEFAULT '[]',
    "partner" TEXT NOT NULL DEFAULT '',
    "revokedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationCredential_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RetailItem_organization_idx" ON "RetailItem"("organization");

-- CreateIndex
CREATE INDEX "RetailItem_location_idx" ON "RetailItem"("location");

-- CreateIndex
CREATE UNIQUE INDEX "RetailItem_organization_location_sku_key" ON "RetailItem"("organization", "location", "sku");

-- CreateIndex
CREATE INDEX "RetailSale_organization_idx" ON "RetailSale"("organization");

-- CreateIndex
CREATE INDEX "RetailSale_location_idx" ON "RetailSale"("location");

-- CreateIndex
CREATE INDEX "RetailSale_recordedBy_idx" ON "RetailSale"("recordedBy");

-- CreateIndex
CREATE UNIQUE INDEX "RetailSale_organization_requestKey_key" ON "RetailSale"("organization", "requestKey");

-- CreateIndex
CREATE INDEX "RetailReturn_organization_idx" ON "RetailReturn"("organization");

-- CreateIndex
CREATE INDEX "RetailReturn_location_idx" ON "RetailReturn"("location");

-- CreateIndex
CREATE INDEX "RetailReturn_sale_idx" ON "RetailReturn"("sale");

-- CreateIndex
CREATE INDEX "RetailReturn_recordedBy_idx" ON "RetailReturn"("recordedBy");

-- CreateIndex
CREATE UNIQUE INDEX "RetailReturn_organization_requestKey_key" ON "RetailReturn"("organization", "requestKey");

-- CreateIndex
CREATE INDEX "RetailStockEntry_organization_idx" ON "RetailStockEntry"("organization");

-- CreateIndex
CREATE INDEX "RetailStockEntry_location_idx" ON "RetailStockEntry"("location");

-- CreateIndex
CREATE INDEX "RetailStockEntry_item_idx" ON "RetailStockEntry"("item");

-- CreateIndex
CREATE INDEX "RetailStockEntry_recordedBy_idx" ON "RetailStockEntry"("recordedBy");

-- CreateIndex
CREATE UNIQUE INDEX "RetailStockEntry_organization_eventKey_key" ON "RetailStockEntry"("organization", "eventKey");

-- CreateIndex
CREATE INDEX "RetailClose_organization_idx" ON "RetailClose"("organization");

-- CreateIndex
CREATE INDEX "RetailClose_location_idx" ON "RetailClose"("location");

-- CreateIndex
CREATE INDEX "RetailClose_recordedBy_idx" ON "RetailClose"("recordedBy");

-- CreateIndex
CREATE UNIQUE INDEX "RetailClose_organization_requestKey_key" ON "RetailClose"("organization", "requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "MemberImportRecord_key_key" ON "MemberImportRecord"("key");

-- CreateIndex
CREATE INDEX "MemberImportRecord_organization_idx" ON "MemberImportRecord"("organization");

-- CreateIndex
CREATE INDEX "MemberImportRecord_member_idx" ON "MemberImportRecord"("member");

-- CreateIndex
CREATE INDEX "TrainingPackage_organization_idx" ON "TrainingPackage"("organization");

-- CreateIndex
CREATE INDEX "TrainingPackage_member_idx" ON "TrainingPackage"("member");

-- CreateIndex
CREATE INDEX "TrainingPackage_location_idx" ON "TrainingPackage"("location");

-- CreateIndex
CREATE INDEX "TrainingPackage_recordedBy_idx" ON "TrainingPackage"("recordedBy");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingPackage_organization_purchaseReference_key" ON "TrainingPackage"("organization", "purchaseReference");

-- CreateIndex
CREATE INDEX "TrainingCreditEntry_organization_idx" ON "TrainingCreditEntry"("organization");

-- CreateIndex
CREATE INDEX "TrainingCreditEntry_trainingPackage_idx" ON "TrainingCreditEntry"("trainingPackage");

-- CreateIndex
CREATE INDEX "TrainingCreditEntry_appointment_idx" ON "TrainingCreditEntry"("appointment");

-- CreateIndex
CREATE INDEX "TrainingCreditEntry_actor_idx" ON "TrainingCreditEntry"("actor");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingCreditEntry_organization_eventKey_key" ON "TrainingCreditEntry"("organization", "eventKey");

-- CreateIndex
CREATE INDEX "CoachingAssignment_organization_idx" ON "CoachingAssignment"("organization");

-- CreateIndex
CREATE INDEX "CoachingAssignment_member_idx" ON "CoachingAssignment"("member");

-- CreateIndex
CREATE INDEX "CoachingAssignment_instructor_idx" ON "CoachingAssignment"("instructor");

-- CreateIndex
CREATE INDEX "CoachingAssignment_workoutLog_idx" ON "CoachingAssignment"("workoutLog");

-- CreateIndex
CREATE UNIQUE INDEX "CoachingAssignment_organization_requestKey_key" ON "CoachingAssignment"("organization", "requestKey");

-- CreateIndex
CREATE INDEX "TrainingLead_organization_idx" ON "TrainingLead"("organization");

-- CreateIndex
CREATE INDEX "TrainingLead_owner_idx" ON "TrainingLead"("owner");

-- CreateIndex
CREATE INDEX "TrainingLead_member_idx" ON "TrainingLead"("member");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingLead_organization_email_key" ON "TrainingLead"("organization", "email");

-- CreateIndex
CREATE UNIQUE INDEX "MembershipCreditGrant_key_key" ON "MembershipCreditGrant"("key");

-- CreateIndex
CREATE INDEX "MembershipCreditGrant_organization_idx" ON "MembershipCreditGrant"("organization");

-- CreateIndex
CREATE INDEX "MembershipCreditGrant_membership_idx" ON "MembershipCreditGrant"("membership");

-- CreateIndex
CREATE UNIQUE INDEX "MembershipCreditEntry_key_key" ON "MembershipCreditEntry"("key");

-- CreateIndex
CREATE INDEX "MembershipCreditEntry_organization_idx" ON "MembershipCreditEntry"("organization");

-- CreateIndex
CREATE INDEX "MembershipCreditEntry_grant_idx" ON "MembershipCreditEntry"("grant");

-- CreateIndex
CREATE INDEX "MembershipCreditEntry_booking_idx" ON "MembershipCreditEntry"("booking");

-- CreateIndex
CREATE UNIQUE INDEX "OperationalNotice_key_key" ON "OperationalNotice"("key");

-- CreateIndex
CREATE INDEX "OperationalNotice_organization_idx" ON "OperationalNotice"("organization");

-- CreateIndex
CREATE INDEX "OperationalNotice_member_idx" ON "OperationalNotice"("member");

-- CreateIndex
CREATE INDEX "ParticipationPolicy_organization_idx" ON "ParticipationPolicy"("organization");

-- CreateIndex
CREATE UNIQUE INDEX "ParticipationEvidence_key_key" ON "ParticipationEvidence"("key");

-- CreateIndex
CREATE INDEX "ParticipationEvidence_organization_idx" ON "ParticipationEvidence"("organization");

-- CreateIndex
CREATE INDEX "ParticipationEvidence_member_idx" ON "ParticipationEvidence"("member");

-- CreateIndex
CREATE INDEX "ParticipationEvidence_policy_idx" ON "ParticipationEvidence"("policy");

-- CreateIndex
CREATE UNIQUE INDEX "OperationsCase_key_key" ON "OperationsCase"("key");

-- CreateIndex
CREATE INDEX "OperationsCase_organization_idx" ON "OperationsCase"("organization");

-- CreateIndex
CREATE INDEX "OperationsCase_member_idx" ON "OperationsCase"("member");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationCredential_digest_key" ON "IntegrationCredential"("digest");

-- CreateIndex
CREATE INDEX "IntegrationCredential_organization_idx" ON "IntegrationCredential"("organization");

-- CreateIndex
CREATE UNIQUE INDEX "ClassInstance_occurrenceKey_key" ON "ClassInstance"("occurrenceKey");

-- CreateIndex
CREATE INDEX "ClassInstance_location_idx" ON "ClassInstance"("location");

-- CreateIndex
CREATE INDEX "ClassInstance_resource_idx" ON "ClassInstance"("resource");

-- CreateIndex
CREATE INDEX "ClassSchedule_location_idx" ON "ClassSchedule"("location");

-- CreateIndex
CREATE INDEX "ClassSchedule_resource_idx" ON "ClassSchedule"("resource");

-- CreateIndex
CREATE INDEX "TrainerAppointment_trainingPackage_idx" ON "TrainerAppointment"("trainingPackage");

-- CreateIndex
CREATE INDEX "TrainerAppointment_replacesAppointment_idx" ON "TrainerAppointment"("replacesAppointment");

-- AddForeignKey
ALTER TABLE "RetailItem" ADD CONSTRAINT "RetailItem_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailItem" ADD CONSTRAINT "RetailItem_location_fkey" FOREIGN KEY ("location") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailSale" ADD CONSTRAINT "RetailSale_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailSale" ADD CONSTRAINT "RetailSale_location_fkey" FOREIGN KEY ("location") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailSale" ADD CONSTRAINT "RetailSale_recordedBy_fkey" FOREIGN KEY ("recordedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailReturn" ADD CONSTRAINT "RetailReturn_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailReturn" ADD CONSTRAINT "RetailReturn_location_fkey" FOREIGN KEY ("location") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailReturn" ADD CONSTRAINT "RetailReturn_sale_fkey" FOREIGN KEY ("sale") REFERENCES "RetailSale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailReturn" ADD CONSTRAINT "RetailReturn_recordedBy_fkey" FOREIGN KEY ("recordedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailStockEntry" ADD CONSTRAINT "RetailStockEntry_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailStockEntry" ADD CONSTRAINT "RetailStockEntry_location_fkey" FOREIGN KEY ("location") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailStockEntry" ADD CONSTRAINT "RetailStockEntry_item_fkey" FOREIGN KEY ("item") REFERENCES "RetailItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailStockEntry" ADD CONSTRAINT "RetailStockEntry_recordedBy_fkey" FOREIGN KEY ("recordedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailClose" ADD CONSTRAINT "RetailClose_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailClose" ADD CONSTRAINT "RetailClose_location_fkey" FOREIGN KEY ("location") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailClose" ADD CONSTRAINT "RetailClose_recordedBy_fkey" FOREIGN KEY ("recordedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberImportRecord" ADD CONSTRAINT "MemberImportRecord_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberImportRecord" ADD CONSTRAINT "MemberImportRecord_member_fkey" FOREIGN KEY ("member") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingPackage" ADD CONSTRAINT "TrainingPackage_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingPackage" ADD CONSTRAINT "TrainingPackage_member_fkey" FOREIGN KEY ("member") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingPackage" ADD CONSTRAINT "TrainingPackage_location_fkey" FOREIGN KEY ("location") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingPackage" ADD CONSTRAINT "TrainingPackage_recordedBy_fkey" FOREIGN KEY ("recordedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingCreditEntry" ADD CONSTRAINT "TrainingCreditEntry_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingCreditEntry" ADD CONSTRAINT "TrainingCreditEntry_trainingPackage_fkey" FOREIGN KEY ("trainingPackage") REFERENCES "TrainingPackage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingCreditEntry" ADD CONSTRAINT "TrainingCreditEntry_appointment_fkey" FOREIGN KEY ("appointment") REFERENCES "TrainerAppointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingCreditEntry" ADD CONSTRAINT "TrainingCreditEntry_actor_fkey" FOREIGN KEY ("actor") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachingAssignment" ADD CONSTRAINT "CoachingAssignment_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachingAssignment" ADD CONSTRAINT "CoachingAssignment_member_fkey" FOREIGN KEY ("member") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachingAssignment" ADD CONSTRAINT "CoachingAssignment_instructor_fkey" FOREIGN KEY ("instructor") REFERENCES "Instructor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachingAssignment" ADD CONSTRAINT "CoachingAssignment_workoutLog_fkey" FOREIGN KEY ("workoutLog") REFERENCES "WorkoutLog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingLead" ADD CONSTRAINT "TrainingLead_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingLead" ADD CONSTRAINT "TrainingLead_owner_fkey" FOREIGN KEY ("owner") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingLead" ADD CONSTRAINT "TrainingLead_member_fkey" FOREIGN KEY ("member") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipCreditGrant" ADD CONSTRAINT "MembershipCreditGrant_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipCreditGrant" ADD CONSTRAINT "MembershipCreditGrant_membership_fkey" FOREIGN KEY ("membership") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipCreditEntry" ADD CONSTRAINT "MembershipCreditEntry_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipCreditEntry" ADD CONSTRAINT "MembershipCreditEntry_grant_fkey" FOREIGN KEY ("grant") REFERENCES "MembershipCreditGrant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipCreditEntry" ADD CONSTRAINT "MembershipCreditEntry_booking_fkey" FOREIGN KEY ("booking") REFERENCES "ClassBooking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalNotice" ADD CONSTRAINT "OperationalNotice_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalNotice" ADD CONSTRAINT "OperationalNotice_member_fkey" FOREIGN KEY ("member") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParticipationPolicy" ADD CONSTRAINT "ParticipationPolicy_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParticipationEvidence" ADD CONSTRAINT "ParticipationEvidence_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParticipationEvidence" ADD CONSTRAINT "ParticipationEvidence_member_fkey" FOREIGN KEY ("member") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParticipationEvidence" ADD CONSTRAINT "ParticipationEvidence_policy_fkey" FOREIGN KEY ("policy") REFERENCES "ParticipationPolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationsCase" ADD CONSTRAINT "OperationsCase_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationsCase" ADD CONSTRAINT "OperationsCase_member_fkey" FOREIGN KEY ("member") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationCredential" ADD CONSTRAINT "IntegrationCredential_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSchedule" ADD CONSTRAINT "ClassSchedule_location_fkey" FOREIGN KEY ("location") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSchedule" ADD CONSTRAINT "ClassSchedule_resource_fkey" FOREIGN KEY ("resource") REFERENCES "GymResource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassInstance" ADD CONSTRAINT "ClassInstance_location_fkey" FOREIGN KEY ("location") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassInstance" ADD CONSTRAINT "ClassInstance_resource_fkey" FOREIGN KEY ("resource") REFERENCES "GymResource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainerAppointment" ADD CONSTRAINT "TrainerAppointment_trainingPackage_fkey" FOREIGN KEY ("trainingPackage") REFERENCES "TrainingPackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainerAppointment" ADD CONSTRAINT "TrainerAppointment_replacesAppointment_fkey" FOREIGN KEY ("replacesAppointment") REFERENCES "TrainerAppointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
