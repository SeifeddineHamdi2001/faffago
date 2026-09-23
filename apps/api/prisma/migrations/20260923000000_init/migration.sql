-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'DEPOT', 'SERVICE_CLIENT', 'VENDEUR', 'LIVREUR', 'RAMASSEUR');

-- CreateEnum
CREATE TYPE "Langue" AS ENUM ('FR', 'AR');

-- CreateEnum
CREATE TYPE "SellerStatut" AS ENUM ('PATENTE', 'AUTO_ENTREPRENEUR', 'CIN_UNIQUEMENT');

-- CreateEnum
CREATE TYPE "SellerAccountState" AS ENUM ('ACTIF', 'SUSPENDU');

-- CreateEnum
CREATE TYPE "CourierAccountState" AS ENUM ('ACTIF', 'INACTIF');

-- CreateEnum
CREATE TYPE "PayPlan" AS ENUM ('JOURNALIER', 'HEBDOMADAIRE', 'MENSUEL');

-- CreateEnum
CREATE TYPE "ZoneAssignmentKind" AS ENUM ('TITULAIRE', 'BACKUP');

-- CreateEnum
CREATE TYPE "ParcelStatus" AS ENUM ('CREE', 'RAMASSE', 'AU_DEPOT', 'EN_LIVRAISON', 'LIVRE', 'A_VERIFIER', 'RELANCE', 'RETOUR_AU_DEPOT', 'RETOUR_EN_ROUTE', 'RETOUR_RECU', 'ANNULE');

-- CreateEnum
CREATE TYPE "ParcelLocation" AS ENUM ('CHEZ_LE_VENDEUR', 'AVEC_LE_RAMASSEUR', 'AU_DEPOT', 'AVEC_LE_LIVREUR', 'CHEZ_LE_CLIENT', 'RENDU_AU_VENDEUR');

-- CreateEnum
CREATE TYPE "ParcelCashStatus" AS ENUM ('CHEZ_LE_COURSIER', 'AU_DEPOT', 'PAYE');

-- CreateEnum
CREATE TYPE "FailureReason" AS ENUM ('NE_REPOND_PAS', 'INJOIGNABLE', 'ADRESSE_INCORRECTE', 'REPORTE_PAR_LE_CLIENT', 'REFUSE');

-- CreateEnum
CREATE TYPE "ParcelEventType" AS ENUM ('CREATION', 'MODIFICATION_VENDEUR', 'ANNULATION', 'RAMASSAGE', 'ENTREE_DEPOT', 'SORTIE_COURSIER', 'AFFECTATION_LIVREUR', 'LIVRAISON', 'ECHEC_LIVRAISON', 'RETOUR_DE_TOURNEE', 'DECISION_RELANCER', 'DECISION_RETOURNER', 'DECISION_CHANGER_CLIENT', 'RETOUR_AUTO_48H', 'RETOUR_AUTO_3E_TENTATIVE', 'PREPARATION_RETOUR', 'DEPART_RETOUR', 'RETOUR_RECU', 'ENCAISSEMENT_DEPOT', 'PAIEMENT_VENDEUR', 'ARTICLE_ECHANGE_RECUPERE', 'FORCAGE_STATUT', 'ANNULATION_SCAN');

-- CreateEnum
CREATE TYPE "ScanAction" AS ENUM ('RAMASSAGE', 'ENTREE_DEPOT', 'SORTIE_COURSIER', 'LIVRE', 'ECHEC', 'RETOUR_DE_TOURNEE', 'PREPARATION_RETOURS', 'RETOUR_RECU', 'BON_VERSEMENT_REMIS', 'ARCHIVAGE_BON');

-- CreateEnum
CREATE TYPE "ScanSource" AS ENUM ('APP_COURSIER', 'WEB_CAMERA', 'WEB_DOUCHETTE', 'SAISIE_MANUELLE');

-- CreateEnum
CREATE TYPE "PickupStatus" AS ENUM ('DEMANDE', 'PLANIFIE', 'EFFECTUE', 'ANNULE');

-- CreateEnum
CREATE TYPE "BonStatus" AS ENUM ('PREPARE', 'EN_ROUTE', 'REMIS', 'ARCHIVE', 'ANNULE');

-- CreateEnum
CREATE TYPE "ChargeType" AS ENUM ('LIVRAISON', 'RETOUR', 'CHANGEMENT_CLIENT', 'RAMASSAGE');

-- CreateEnum
CREATE TYPE "ChargeStatus" AS ENUM ('EN_ATTENTE', 'DEDUITE', 'ANNULEE');

-- CreateEnum
CREATE TYPE "CaisseSessionStatus" AS ENUM ('OUVERTE', 'COMPTEE', 'CLOTUREE');

-- CreateEnum
CREATE TYPE "DebtStatus" AS ENUM ('EN_COURS', 'DEDUITE', 'ANNULEE');

-- CreateEnum
CREATE TYPE "PayslipStatus" AS ENUM ('A_PAYER', 'PAYEE');

-- CreateEnum
CREATE TYPE "SellerDocumentType" AS ENUM ('CIN_RECTO', 'CIN_VERSO', 'PATENTE', 'CARTE_AUTO_ENTREPRENEUR');

-- CreateEnum
CREATE TYPE "ChangeRequestStatus" AS ENUM ('EN_ATTENTE', 'APPLIQUEE', 'REFUSEE');

-- CreateEnum
CREATE TYPE "ChatParticipantKind" AS ENUM ('VENDEUR', 'COURSIER', 'FAFFA_GO');

-- CreateEnum
CREATE TYPE "ChatThreadState" AS ENUM ('OUVERT', 'VERROUILLE', 'CLOS');

-- CreateEnum
CREATE TYPE "BonRetourItemType" AS ENUM ('COLIS', 'ARTICLE_RECUPERE');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('COLIS_A_VERIFIER', 'COLIS_24H_RESTANTES', 'COLIS_RETOUR_AUTO_48H', 'COLIS_EN_RETOUR', 'BON_VERSEMENT_EN_ROUTE', 'BON_RETOUR_EN_ROUTE', 'RAMASSAGE_PLANIFIE', 'RAMASSAGE_EFFECTUE', 'NOUVEAU_MESSAGE', 'COMPTE_SUSPENDU', 'COMPTE_REACTIVE', 'NOUVELLE_DEMANDE_RAMASSAGE', 'DEMANDE_MODIFICATION', 'ECART_CAISSE', 'BON_NON_REMIS', 'COURSIER_A_PAYER', 'NOUVEAUX_COLIS_ASSIGNES', 'COLIS_RELANCE_AUJOURDHUI', 'RAPPEL_FIN_DE_JOURNEE');

-- CreateEnum
CREATE TYPE "DocumentCounterKind" AS ENUM ('BON_VERSEMENT', 'BON_RETOUR', 'FICHE_PAIE', 'CERTIFICAT_RETENUE');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "role" "Role" NOT NULL,
    "email" TEXT,
    "username" TEXT,
    "phone" VARCHAR(8) NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "passwordUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "acceptsWork" BOOLEAN NOT NULL DEFAULT true,
    "langue" "Langue" NOT NULL DEFAULT 'FR',
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "deviceId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sellers" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "shopName" TEXT NOT NULL,
    "productCategory" TEXT NOT NULL,
    "storeLink" TEXT,
    "contactFullName" TEXT NOT NULL,
    "contactPhone" VARCHAR(8) NOT NULL,
    "statut" "SellerStatut" NOT NULL,
    "accountState" "SellerAccountState" NOT NULL DEFAULT 'ACTIF',
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sellers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seller_documents" (
    "id" UUID NOT NULL,
    "sellerId" UUID NOT NULL,
    "type" "SellerDocumentType" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedByUserId" UUID NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seller_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pickup_addresses" (
    "id" UUID NOT NULL,
    "sellerId" UUID NOT NULL,
    "label" TEXT,
    "delegationId" UUID NOT NULL,
    "address" TEXT NOT NULL,
    "landmark" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "pickup_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "couriers" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "cin" TEXT NOT NULL,
    "vehicle" TEXT,
    "payPlan" "PayPlan",
    "accountState" "CourierAccountState" NOT NULL DEFAULT 'ACTIF',
    "pinHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "couriers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courier_absences" (
    "id" UUID NOT NULL,
    "courierId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "reason" TEXT,
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "courier_absences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gouvernorats" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "nameFr" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "gouvernorats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delegations" (
    "id" UUID NOT NULL,
    "gouvernoratId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "nameFr" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "zoneId" UUID,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "delegations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zones" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zone_assignments" (
    "id" UUID NOT NULL,
    "zoneId" UUID NOT NULL,
    "courierId" UUID NOT NULL,
    "role" "Role" NOT NULL,
    "kind" "ZoneAssignmentKind" NOT NULL,

    CONSTRAINT "zone_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedByUserId" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "document_counters" (
    "kind" "DocumentCounterKind" NOT NULL,
    "dateKey" TEXT NOT NULL,
    "lastValue" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "document_counters_pkey" PRIMARY KEY ("kind","dateKey")
);

-- CreateTable
CREATE TABLE "parcels" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "sellerId" UUID NOT NULL,
    "recipientName" TEXT NOT NULL,
    "recipientPhone" VARCHAR(8) NOT NULL,
    "recipientPhone2" VARCHAR(8),
    "delegationId" UUID NOT NULL,
    "address" TEXT NOT NULL,
    "landmark" TEXT,
    "productDescription" TEXT NOT NULL,
    "pieceCount" INTEGER NOT NULL DEFAULT 1,
    "isExchange" BOOLEAN NOT NULL DEFAULT false,
    "openingAllowed" BOOLEAN NOT NULL DEFAULT false,
    "courierNote" TEXT,
    "codAmountMillimes" BIGINT NOT NULL,
    "deliveryFeeMillimes" BIGINT NOT NULL,
    "returnFeeMillimes" BIGINT NOT NULL,
    "changeClientFeeMillimes" BIGINT NOT NULL,
    "courierRateMillimes" BIGINT,
    "status" "ParcelStatus" NOT NULL DEFAULT 'CREE',
    "location" "ParcelLocation" NOT NULL DEFAULT 'CHEZ_LE_VENDEUR',
    "cashStatus" "ParcelCashStatus",
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastFailureReason" "FailureReason",
    "lastFailureNote" TEXT,
    "verifyDeadlineAt" TIMESTAMP(3),
    "relaunchDate" DATE,
    "relaunchSlot" TEXT,
    "changeClientCount" INTEGER NOT NULL DEFAULT 0,
    "meetingPoint" TEXT,
    "plannedLivreurId" UUID,
    "currentLivreurId" UUID,
    "exchangeItemCollected" BOOLEAN NOT NULL DEFAULT false,
    "exchangeItemStatus" "ParcelStatus",
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pickedUpAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parcels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parcel_client_changes" (
    "id" UUID NOT NULL,
    "parcelId" UUID NOT NULL,
    "previousName" TEXT NOT NULL,
    "previousPhone" VARCHAR(8) NOT NULL,
    "previousDelegationId" UUID NOT NULL,
    "previousAddress" TEXT NOT NULL,
    "previousCodMillimes" BIGINT NOT NULL,
    "newCodMillimes" BIGINT NOT NULL,
    "feeMillimes" BIGINT NOT NULL,
    "chargeId" UUID,
    "decidedByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parcel_client_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parcel_events" (
    "id" UUID NOT NULL,
    "parcelId" UUID NOT NULL,
    "type" "ParcelEventType" NOT NULL,
    "previousStatus" "ParcelStatus",
    "newStatus" "ParcelStatus",
    "previousLocation" "ParcelLocation",
    "newLocation" "ParcelLocation",
    "actorUserId" UUID,
    "actorRole" "Role",
    "source" "ScanSource",
    "scanId" UUID,
    "reasonCode" "FailureReason",
    "reasonText" TEXT,
    "gpsLat" DECIMAL(9,6),
    "gpsLng" DECIMAL(9,6),
    "gpsAccuracyM" INTEGER,
    "deviceId" TEXT,
    "appVersion" TEXT,
    "deviceTime" TIMESTAMP(3),
    "serverTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "parcel_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scans" (
    "id" UUID NOT NULL,
    "clientScanId" UUID NOT NULL,
    "action" "ScanAction" NOT NULL,
    "rawCode" TEXT NOT NULL,
    "parcelId" UUID,
    "bonVersementId" UUID,
    "bonRetourId" UUID,
    "pickupId" UUID,
    "actorUserId" UUID NOT NULL,
    "source" "ScanSource" NOT NULL,
    "manualEntry" BOOLEAN NOT NULL DEFAULT false,
    "accepted" BOOLEAN NOT NULL,
    "refusalReason" TEXT,
    "failureReason" "FailureReason",
    "collectedMillimes" BIGINT,
    "gpsLat" DECIMAL(9,6),
    "gpsLng" DECIMAL(9,6),
    "gpsAccuracyM" INTEGER,
    "deviceId" TEXT,
    "appVersion" TEXT,
    "deviceTime" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "businessDate" DATE NOT NULL,
    "clockSkewFlagged" BOOLEAN NOT NULL DEFAULT false,
    "clockSkewMs" INTEGER,
    "cancelledAt" TIMESTAMP(3),
    "cancelledByUserId" UUID,
    "cancelReason" TEXT,

    CONSTRAINT "scans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pickups" (
    "id" UUID NOT NULL,
    "sellerId" UUID NOT NULL,
    "pickupAddressId" UUID NOT NULL,
    "status" "PickupStatus" NOT NULL DEFAULT 'DEMANDE',
    "declaredCount" INTEGER,
    "requestedSlot" TEXT,
    "note" TEXT,
    "plannedDate" DATE,
    "plannedSlot" TEXT,
    "ramasseurId" UUID,
    "completedAt" TIMESTAMP(3),
    "scannedCount" INTEGER NOT NULL DEFAULT 0,
    "feeChargeId" UUID,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pickups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pickup_parcels" (
    "pickupId" UUID NOT NULL,
    "parcelId" UUID NOT NULL,
    "expected" BOOLEAN NOT NULL DEFAULT true,
    "scannedAt" TIMESTAMP(3),
    "scanId" UUID,

    CONSTRAINT "pickup_parcels_pkey" PRIMARY KEY ("pickupId","parcelId")
);

-- CreateTable
CREATE TABLE "seller_charges" (
    "id" UUID NOT NULL,
    "sellerId" UUID NOT NULL,
    "type" "ChargeType" NOT NULL,
    "amountMillimes" BIGINT NOT NULL,
    "status" "ChargeStatus" NOT NULL DEFAULT 'EN_ATTENTE',
    "parcelId" UUID,
    "pickupId" UUID,
    "bonVersementId" UUID,
    "note" TEXT,
    "createdByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seller_charges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bons_versement" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "sellerId" UUID NOT NULL,
    "status" "BonStatus" NOT NULL DEFAULT 'PREPARE',
    "totalCodMillimes" BIGINT NOT NULL,
    "totalFeesMillimes" BIGINT NOT NULL,
    "baseAfterFeesMillimes" BIGINT NOT NULL,
    "sellerStatutSnapshot" "SellerStatut" NOT NULL,
    "retenueRateBps" INTEGER NOT NULL DEFAULT 0,
    "retenueMillimes" BIGINT NOT NULL DEFAULT 0,
    "netMillimes" BIGINT NOT NULL,
    "qrToken" TEXT NOT NULL,
    "preparedByUserId" UUID NOT NULL,
    "preparedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ramasseurId" UUID,
    "pickupId" UUID,
    "enRouteAt" TIMESTAMP(3),
    "remisAt" TIMESTAMP(3),
    "remisScanId" UUID,
    "archivedAt" TIMESTAMP(3),
    "archivedByUserId" UUID,
    "cancelledAt" TIMESTAMP(3),
    "cancelledByUserId" UUID,
    "cancelReason" TEXT,
    "pdfStorageKey" TEXT,

    CONSTRAINT "bons_versement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bon_versement_parcels" (
    "bonVersementId" UUID NOT NULL,
    "parcelId" UUID NOT NULL,
    "codMillimes" BIGINT NOT NULL,

    CONSTRAINT "bon_versement_parcels_pkey" PRIMARY KEY ("bonVersementId","parcelId")
);

-- CreateTable
CREATE TABLE "retenue_certificates" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "bonVersementId" UUID NOT NULL,
    "sellerId" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "baseMillimes" BIGINT NOT NULL,
    "rateBps" INTEGER NOT NULL,
    "amountMillimes" BIGINT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pdfStorageKey" TEXT,

    CONSTRAINT "retenue_certificates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bons_retour" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "sellerId" UUID NOT NULL,
    "status" "BonStatus" NOT NULL DEFAULT 'PREPARE',
    "parcelCount" INTEGER NOT NULL DEFAULT 0,
    "qrToken" TEXT NOT NULL,
    "preparedByUserId" UUID NOT NULL,
    "preparedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ramasseurId" UUID,
    "pickupId" UUID,
    "enRouteAt" TIMESTAMP(3),
    "remisAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "archivedByUserId" UUID,
    "cancelledAt" TIMESTAMP(3),
    "cancelledByUserId" UUID,
    "cancelReason" TEXT,
    "pdfStorageKey" TEXT,

    CONSTRAINT "bons_retour_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bon_retour_parcels" (
    "bonRetourId" UUID NOT NULL,
    "parcelId" UUID NOT NULL,
    "itemType" "BonRetourItemType" NOT NULL DEFAULT 'COLIS',
    "receivedAt" TIMESTAMP(3),
    "scanId" UUID,

    CONSTRAINT "bon_retour_parcels_pkey" PRIMARY KEY ("bonRetourId","parcelId","itemType")
);

-- CreateTable
CREATE TABLE "caisse_sessions" (
    "id" UUID NOT NULL,
    "courierId" UUID NOT NULL,
    "businessDate" DATE NOT NULL,
    "status" "CaisseSessionStatus" NOT NULL DEFAULT 'OUVERTE',
    "expectedDeliveryMillimes" BIGINT NOT NULL DEFAULT 0,
    "expectedBonCashMillimes" BIGINT NOT NULL DEFAULT 0,
    "expectedTotalMillimes" BIGINT NOT NULL DEFAULT 0,
    "countedMillimes" BIGINT,
    "ecartMillimes" BIGINT,
    "ecartFlagged" BOOLEAN NOT NULL DEFAULT false,
    "ecartNote" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "countedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "closedByUserId" UUID,

    CONSTRAINT "caisse_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "caisse_session_parcels" (
    "caisseSessionId" UUID NOT NULL,
    "parcelId" UUID NOT NULL,
    "codMillimes" BIGINT NOT NULL,

    CONSTRAINT "caisse_session_parcels_pkey" PRIMARY KEY ("caisseSessionId","parcelId")
);

-- CreateTable
CREATE TABLE "caisse_session_bons" (
    "caisseSessionId" UUID NOT NULL,
    "bonVersementId" UUID NOT NULL,
    "takenOutMillimes" BIGINT NOT NULL,
    "remisMillimes" BIGINT NOT NULL DEFAULT 0,
    "returnedMillimes" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "caisse_session_bons_pkey" PRIMARY KEY ("caisseSessionId","bonVersementId")
);

-- CreateTable
CREATE TABLE "courier_debts" (
    "id" UUID NOT NULL,
    "courierId" UUID NOT NULL,
    "caisseSessionId" UUID,
    "amountMillimes" BIGINT NOT NULL,
    "remainingMillimes" BIGINT NOT NULL,
    "status" "DebtStatus" NOT NULL DEFAULT 'EN_COURS',
    "cancelledByUserId" UUID,
    "cancelReason" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "courier_debts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payslips" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "courierId" UUID NOT NULL,
    "payPlan" "PayPlan" NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "parcelCount" INTEGER NOT NULL,
    "ratePerParcelMillimes" BIGINT NOT NULL,
    "grossMillimes" BIGINT NOT NULL,
    "deductionsMillimes" BIGINT NOT NULL DEFAULT 0,
    "netMillimes" BIGINT NOT NULL,
    "status" "PayslipStatus" NOT NULL DEFAULT 'A_PAYER',
    "paidAt" TIMESTAMP(3),
    "paidByUserId" UUID,
    "preparedByUserId" UUID NOT NULL,
    "preparedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pdfStorageKey" TEXT,

    CONSTRAINT "payslips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payslip_parcels" (
    "payslipId" UUID NOT NULL,
    "parcelId" UUID NOT NULL,
    "rateMillimes" BIGINT NOT NULL,

    CONSTRAINT "payslip_parcels_pkey" PRIMARY KEY ("payslipId","parcelId")
);

-- CreateTable
CREATE TABLE "payslip_deductions" (
    "payslipId" UUID NOT NULL,
    "debtId" UUID NOT NULL,
    "amountMillimes" BIGINT NOT NULL,

    CONSTRAINT "payslip_deductions_pkey" PRIMARY KEY ("payslipId","debtId")
);

-- CreateTable
CREATE TABLE "chat_threads" (
    "id" UUID NOT NULL,
    "parcelId" UUID NOT NULL,
    "sellerId" UUID NOT NULL,
    "courierId" UUID,
    "state" "ChatThreadState" NOT NULL DEFAULT 'OUVERT',
    "lastMessageAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" UUID NOT NULL,
    "threadId" UUID NOT NULL,
    "senderUserId" UUID NOT NULL,
    "senderKind" "ChatParticipantKind" NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_reads" (
    "threadId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "lastReadAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_reads_pkey" PRIMARY KEY ("threadId","userId")
);

-- CreateTable
CREATE TABLE "faffago_calls" (
    "id" UUID NOT NULL,
    "parcelId" UUID NOT NULL,
    "staffUserId" UUID NOT NULL,
    "calledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answered" BOOLEAN NOT NULL,
    "note" TEXT,

    CONSTRAINT "faffago_calls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "params" JSONB NOT NULL,
    "parcelId" UUID,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "address_memory" (
    "id" UUID NOT NULL,
    "customerPhone" VARCHAR(8) NOT NULL,
    "note" TEXT NOT NULL,
    "meetingPoint" TEXT,
    "delegationId" UUID,
    "lastCourierUserId" UUID NOT NULL,
    "deliveryCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "address_memory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seller_change_requests" (
    "id" UUID NOT NULL,
    "parcelId" UUID NOT NULL,
    "sellerId" UUID NOT NULL,
    "requestedFields" JSONB NOT NULL,
    "sellerNote" TEXT,
    "status" "ChangeRequestStatus" NOT NULL DEFAULT 'EN_ATTENTE',
    "handledByUserId" UUID,
    "handledAt" TIMESTAMP(3),
    "staffNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seller_change_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
    "actorUserId" UUID,
    "actorRole" "Role",
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "users_role_isActive_idx" ON "users"("role", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_role_key" ON "users"("phone", "role");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "sellers_userId_key" ON "sellers"("userId");

-- CreateIndex
CREATE INDEX "sellers_accountState_idx" ON "sellers"("accountState");

-- CreateIndex
CREATE UNIQUE INDEX "seller_documents_storageKey_key" ON "seller_documents"("storageKey");

-- CreateIndex
CREATE INDEX "seller_documents_sellerId_idx" ON "seller_documents"("sellerId");

-- CreateIndex
CREATE INDEX "pickup_addresses_sellerId_idx" ON "pickup_addresses"("sellerId");

-- CreateIndex
CREATE UNIQUE INDEX "couriers_userId_key" ON "couriers"("userId");

-- CreateIndex
CREATE INDEX "couriers_accountState_idx" ON "couriers"("accountState");

-- CreateIndex
CREATE UNIQUE INDEX "courier_absences_courierId_date_key" ON "courier_absences"("courierId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "gouvernorats_code_key" ON "gouvernorats"("code");

-- CreateIndex
CREATE UNIQUE INDEX "delegations_code_key" ON "delegations"("code");

-- CreateIndex
CREATE INDEX "delegations_zoneId_idx" ON "delegations"("zoneId");

-- CreateIndex
CREATE UNIQUE INDEX "delegations_gouvernoratId_nameFr_key" ON "delegations"("gouvernoratId", "nameFr");

-- CreateIndex
CREATE UNIQUE INDEX "zones_name_key" ON "zones"("name");

-- CreateIndex
CREATE INDEX "zone_assignments_courierId_idx" ON "zone_assignments"("courierId");

-- CreateIndex
CREATE UNIQUE INDEX "zone_assignments_zoneId_role_kind_key" ON "zone_assignments"("zoneId", "role", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "parcels_code_key" ON "parcels"("code");

-- CreateIndex
CREATE INDEX "parcels_sellerId_status_idx" ON "parcels"("sellerId", "status");

-- CreateIndex
CREATE INDEX "parcels_status_location_idx" ON "parcels"("status", "location");

-- CreateIndex
CREATE INDEX "parcels_currentLivreurId_status_idx" ON "parcels"("currentLivreurId", "status");

-- CreateIndex
CREATE INDEX "parcels_delegationId_status_idx" ON "parcels"("delegationId", "status");

-- CreateIndex
CREATE INDEX "parcels_cashStatus_sellerId_idx" ON "parcels"("cashStatus", "sellerId");

-- CreateIndex
CREATE INDEX "parcels_verifyDeadlineAt_idx" ON "parcels"("verifyDeadlineAt");

-- CreateIndex
CREATE INDEX "parcels_recipientPhone_idx" ON "parcels"("recipientPhone");

-- CreateIndex
CREATE INDEX "parcels_createdAt_idx" ON "parcels"("createdAt");

-- CreateIndex
CREATE INDEX "parcel_client_changes_parcelId_idx" ON "parcel_client_changes"("parcelId");

-- CreateIndex
CREATE INDEX "parcel_events_parcelId_serverTime_idx" ON "parcel_events"("parcelId", "serverTime");

-- CreateIndex
CREATE INDEX "parcel_events_type_serverTime_idx" ON "parcel_events"("type", "serverTime");

-- CreateIndex
CREATE UNIQUE INDEX "scans_clientScanId_key" ON "scans"("clientScanId");

-- CreateIndex
CREATE INDEX "scans_parcelId_action_idx" ON "scans"("parcelId", "action");

-- CreateIndex
CREATE INDEX "scans_actorUserId_businessDate_idx" ON "scans"("actorUserId", "businessDate");

-- CreateIndex
CREATE INDEX "scans_manualEntry_receivedAt_idx" ON "scans"("manualEntry", "receivedAt");

-- CreateIndex
CREATE INDEX "scans_clockSkewFlagged_receivedAt_idx" ON "scans"("clockSkewFlagged", "receivedAt");

-- CreateIndex
CREATE INDEX "pickups_sellerId_status_idx" ON "pickups"("sellerId", "status");

-- CreateIndex
CREATE INDEX "pickups_ramasseurId_plannedDate_idx" ON "pickups"("ramasseurId", "plannedDate");

-- CreateIndex
CREATE INDEX "pickups_status_plannedDate_idx" ON "pickups"("status", "plannedDate");

-- CreateIndex
CREATE INDEX "pickup_parcels_parcelId_idx" ON "pickup_parcels"("parcelId");

-- CreateIndex
CREATE INDEX "seller_charges_sellerId_status_createdAt_idx" ON "seller_charges"("sellerId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "seller_charges_parcelId_idx" ON "seller_charges"("parcelId");

-- CreateIndex
CREATE INDEX "seller_charges_bonVersementId_idx" ON "seller_charges"("bonVersementId");

-- CreateIndex
CREATE UNIQUE INDEX "bons_versement_number_key" ON "bons_versement"("number");

-- CreateIndex
CREATE UNIQUE INDEX "bons_versement_qrToken_key" ON "bons_versement"("qrToken");

-- CreateIndex
CREATE INDEX "bons_versement_sellerId_status_idx" ON "bons_versement"("sellerId", "status");

-- CreateIndex
CREATE INDEX "bons_versement_status_preparedAt_idx" ON "bons_versement"("status", "preparedAt");

-- CreateIndex
CREATE UNIQUE INDEX "bon_versement_parcels_parcelId_key" ON "bon_versement_parcels"("parcelId");

-- CreateIndex
CREATE UNIQUE INDEX "retenue_certificates_number_key" ON "retenue_certificates"("number");

-- CreateIndex
CREATE UNIQUE INDEX "retenue_certificates_bonVersementId_key" ON "retenue_certificates"("bonVersementId");

-- CreateIndex
CREATE INDEX "retenue_certificates_sellerId_year_idx" ON "retenue_certificates"("sellerId", "year");

-- CreateIndex
CREATE UNIQUE INDEX "bons_retour_number_key" ON "bons_retour"("number");

-- CreateIndex
CREATE UNIQUE INDEX "bons_retour_qrToken_key" ON "bons_retour"("qrToken");

-- CreateIndex
CREATE INDEX "bons_retour_sellerId_status_idx" ON "bons_retour"("sellerId", "status");

-- CreateIndex
CREATE INDEX "bon_retour_parcels_parcelId_idx" ON "bon_retour_parcels"("parcelId");

-- CreateIndex
CREATE INDEX "caisse_sessions_businessDate_status_idx" ON "caisse_sessions"("businessDate", "status");

-- CreateIndex
CREATE UNIQUE INDEX "caisse_sessions_courierId_businessDate_key" ON "caisse_sessions"("courierId", "businessDate");

-- CreateIndex
CREATE UNIQUE INDEX "caisse_session_parcels_parcelId_key" ON "caisse_session_parcels"("parcelId");

-- CreateIndex
CREATE INDEX "courier_debts_courierId_status_createdAt_idx" ON "courier_debts"("courierId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "payslips_number_key" ON "payslips"("number");

-- CreateIndex
CREATE INDEX "payslips_courierId_status_idx" ON "payslips"("courierId", "status");

-- CreateIndex
CREATE INDEX "payslips_periodEnd_status_idx" ON "payslips"("periodEnd", "status");

-- CreateIndex
CREATE UNIQUE INDEX "payslip_parcels_parcelId_key" ON "payslip_parcels"("parcelId");

-- CreateIndex
CREATE UNIQUE INDEX "chat_threads_parcelId_key" ON "chat_threads"("parcelId");

-- CreateIndex
CREATE INDEX "chat_threads_sellerId_lastMessageAt_idx" ON "chat_threads"("sellerId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "chat_threads_courierId_lastMessageAt_idx" ON "chat_threads"("courierId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "chat_messages_threadId_createdAt_idx" ON "chat_messages"("threadId", "createdAt");

-- CreateIndex
CREATE INDEX "faffago_calls_parcelId_calledAt_idx" ON "faffago_calls"("parcelId", "calledAt");

-- CreateIndex
CREATE INDEX "notifications_userId_readAt_createdAt_idx" ON "notifications"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "address_memory_customerPhone_key" ON "address_memory"("customerPhone");

-- CreateIndex
CREATE INDEX "seller_change_requests_status_createdAt_idx" ON "seller_change_requests"("status", "createdAt");

-- CreateIndex
CREATE INDEX "seller_change_requests_parcelId_idx" ON "seller_change_requests"("parcelId");

-- CreateIndex
CREATE INDEX "audit_log_entityType_entityId_createdAt_idx" ON "audit_log"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_log_actorUserId_createdAt_idx" ON "audit_log"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_log_action_createdAt_idx" ON "audit_log"("action", "createdAt");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sellers" ADD CONSTRAINT "sellers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seller_documents" ADD CONSTRAINT "seller_documents_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "sellers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pickup_addresses" ADD CONSTRAINT "pickup_addresses_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "sellers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pickup_addresses" ADD CONSTRAINT "pickup_addresses_delegationId_fkey" FOREIGN KEY ("delegationId") REFERENCES "delegations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "couriers" ADD CONSTRAINT "couriers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courier_absences" ADD CONSTRAINT "courier_absences_courierId_fkey" FOREIGN KEY ("courierId") REFERENCES "couriers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delegations" ADD CONSTRAINT "delegations_gouvernoratId_fkey" FOREIGN KEY ("gouvernoratId") REFERENCES "gouvernorats"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delegations" ADD CONSTRAINT "delegations_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zone_assignments" ADD CONSTRAINT "zone_assignments_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zone_assignments" ADD CONSTRAINT "zone_assignments_courierId_fkey" FOREIGN KEY ("courierId") REFERENCES "couriers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcels" ADD CONSTRAINT "parcels_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "sellers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcels" ADD CONSTRAINT "parcels_delegationId_fkey" FOREIGN KEY ("delegationId") REFERENCES "delegations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcels" ADD CONSTRAINT "parcels_plannedLivreurId_fkey" FOREIGN KEY ("plannedLivreurId") REFERENCES "couriers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcels" ADD CONSTRAINT "parcels_currentLivreurId_fkey" FOREIGN KEY ("currentLivreurId") REFERENCES "couriers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcel_client_changes" ADD CONSTRAINT "parcel_client_changes_parcelId_fkey" FOREIGN KEY ("parcelId") REFERENCES "parcels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcel_events" ADD CONSTRAINT "parcel_events_parcelId_fkey" FOREIGN KEY ("parcelId") REFERENCES "parcels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scans" ADD CONSTRAINT "scans_parcelId_fkey" FOREIGN KEY ("parcelId") REFERENCES "parcels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scans" ADD CONSTRAINT "scans_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pickups" ADD CONSTRAINT "pickups_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "sellers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pickups" ADD CONSTRAINT "pickups_pickupAddressId_fkey" FOREIGN KEY ("pickupAddressId") REFERENCES "pickup_addresses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pickups" ADD CONSTRAINT "pickups_ramasseurId_fkey" FOREIGN KEY ("ramasseurId") REFERENCES "couriers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pickup_parcels" ADD CONSTRAINT "pickup_parcels_pickupId_fkey" FOREIGN KEY ("pickupId") REFERENCES "pickups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pickup_parcels" ADD CONSTRAINT "pickup_parcels_parcelId_fkey" FOREIGN KEY ("parcelId") REFERENCES "parcels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seller_charges" ADD CONSTRAINT "seller_charges_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "sellers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seller_charges" ADD CONSTRAINT "seller_charges_parcelId_fkey" FOREIGN KEY ("parcelId") REFERENCES "parcels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seller_charges" ADD CONSTRAINT "seller_charges_bonVersementId_fkey" FOREIGN KEY ("bonVersementId") REFERENCES "bons_versement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bons_versement" ADD CONSTRAINT "bons_versement_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "sellers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bons_versement" ADD CONSTRAINT "bons_versement_ramasseurId_fkey" FOREIGN KEY ("ramasseurId") REFERENCES "couriers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bons_versement" ADD CONSTRAINT "bons_versement_pickupId_fkey" FOREIGN KEY ("pickupId") REFERENCES "pickups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bon_versement_parcels" ADD CONSTRAINT "bon_versement_parcels_bonVersementId_fkey" FOREIGN KEY ("bonVersementId") REFERENCES "bons_versement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bon_versement_parcels" ADD CONSTRAINT "bon_versement_parcels_parcelId_fkey" FOREIGN KEY ("parcelId") REFERENCES "parcels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retenue_certificates" ADD CONSTRAINT "retenue_certificates_bonVersementId_fkey" FOREIGN KEY ("bonVersementId") REFERENCES "bons_versement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retenue_certificates" ADD CONSTRAINT "retenue_certificates_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "sellers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bons_retour" ADD CONSTRAINT "bons_retour_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "sellers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bons_retour" ADD CONSTRAINT "bons_retour_ramasseurId_fkey" FOREIGN KEY ("ramasseurId") REFERENCES "couriers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bons_retour" ADD CONSTRAINT "bons_retour_pickupId_fkey" FOREIGN KEY ("pickupId") REFERENCES "pickups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bon_retour_parcels" ADD CONSTRAINT "bon_retour_parcels_bonRetourId_fkey" FOREIGN KEY ("bonRetourId") REFERENCES "bons_retour"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bon_retour_parcels" ADD CONSTRAINT "bon_retour_parcels_parcelId_fkey" FOREIGN KEY ("parcelId") REFERENCES "parcels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caisse_sessions" ADD CONSTRAINT "caisse_sessions_courierId_fkey" FOREIGN KEY ("courierId") REFERENCES "couriers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caisse_session_parcels" ADD CONSTRAINT "caisse_session_parcels_caisseSessionId_fkey" FOREIGN KEY ("caisseSessionId") REFERENCES "caisse_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caisse_session_parcels" ADD CONSTRAINT "caisse_session_parcels_parcelId_fkey" FOREIGN KEY ("parcelId") REFERENCES "parcels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caisse_session_bons" ADD CONSTRAINT "caisse_session_bons_caisseSessionId_fkey" FOREIGN KEY ("caisseSessionId") REFERENCES "caisse_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caisse_session_bons" ADD CONSTRAINT "caisse_session_bons_bonVersementId_fkey" FOREIGN KEY ("bonVersementId") REFERENCES "bons_versement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courier_debts" ADD CONSTRAINT "courier_debts_courierId_fkey" FOREIGN KEY ("courierId") REFERENCES "couriers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courier_debts" ADD CONSTRAINT "courier_debts_caisseSessionId_fkey" FOREIGN KEY ("caisseSessionId") REFERENCES "caisse_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_courierId_fkey" FOREIGN KEY ("courierId") REFERENCES "couriers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslip_parcels" ADD CONSTRAINT "payslip_parcels_payslipId_fkey" FOREIGN KEY ("payslipId") REFERENCES "payslips"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslip_parcels" ADD CONSTRAINT "payslip_parcels_parcelId_fkey" FOREIGN KEY ("parcelId") REFERENCES "parcels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslip_deductions" ADD CONSTRAINT "payslip_deductions_payslipId_fkey" FOREIGN KEY ("payslipId") REFERENCES "payslips"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslip_deductions" ADD CONSTRAINT "payslip_deductions_debtId_fkey" FOREIGN KEY ("debtId") REFERENCES "courier_debts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_threads" ADD CONSTRAINT "chat_threads_parcelId_fkey" FOREIGN KEY ("parcelId") REFERENCES "parcels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_threads" ADD CONSTRAINT "chat_threads_courierId_fkey" FOREIGN KEY ("courierId") REFERENCES "couriers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "chat_threads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_reads" ADD CONSTRAINT "chat_reads_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "chat_threads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_reads" ADD CONSTRAINT "chat_reads_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faffago_calls" ADD CONSTRAINT "faffago_calls_parcelId_fkey" FOREIGN KEY ("parcelId") REFERENCES "parcels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seller_change_requests" ADD CONSTRAINT "seller_change_requests_parcelId_fkey" FOREIGN KEY ("parcelId") REFERENCES "parcels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seller_change_requests" ADD CONSTRAINT "seller_change_requests_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "sellers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ═════════════════════════════════════════════════════════════
-- Hand-written part of the first migration.
--
-- Everything above is generated from schema.prisma. Everything below
-- expresses rules Prisma cannot: the foreign keys of the actor columns (D-3),
-- the append-only guarantee on parcel_events and audit_log, the login
-- identifier rule (A-20), and a few integrity checks on money.
-- ═════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- Actor columns: "who did this" (D-3)
--
-- These are plain UUID columns in schema.prisma so that User does not carry
-- twenty-five back-relations. They are still real foreign keys: ON DELETE
-- RESTRICT, because a user is never deleted (Admin 4.15 keeps old accounts so
-- their history stays readable).
-- ─────────────────────────────────────────────────────────────

ALTER TABLE "sellers" ADD CONSTRAINT "sellers_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "seller_documents" ADD CONSTRAINT "seller_documents_uploadedByUserId_fkey"
  FOREIGN KEY ("uploadedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "courier_absences" ADD CONSTRAINT "courier_absences_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "settings" ADD CONSTRAINT "settings_updatedByUserId_fkey"
  FOREIGN KEY ("updatedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "parcels" ADD CONSTRAINT "parcels_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "parcel_client_changes" ADD CONSTRAINT "parcel_client_changes_decidedByUserId_fkey"
  FOREIGN KEY ("decidedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "parcel_events" ADD CONSTRAINT "parcel_events_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "scans" ADD CONSTRAINT "scans_cancelledByUserId_fkey"
  FOREIGN KEY ("cancelledByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "seller_charges" ADD CONSTRAINT "seller_charges_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bons_versement" ADD CONSTRAINT "bons_versement_preparedByUserId_fkey"
  FOREIGN KEY ("preparedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bons_versement" ADD CONSTRAINT "bons_versement_archivedByUserId_fkey"
  FOREIGN KEY ("archivedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bons_versement" ADD CONSTRAINT "bons_versement_cancelledByUserId_fkey"
  FOREIGN KEY ("cancelledByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bons_retour" ADD CONSTRAINT "bons_retour_preparedByUserId_fkey"
  FOREIGN KEY ("preparedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bons_retour" ADD CONSTRAINT "bons_retour_archivedByUserId_fkey"
  FOREIGN KEY ("archivedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bons_retour" ADD CONSTRAINT "bons_retour_cancelledByUserId_fkey"
  FOREIGN KEY ("cancelledByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "caisse_sessions" ADD CONSTRAINT "caisse_sessions_closedByUserId_fkey"
  FOREIGN KEY ("closedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "courier_debts" ADD CONSTRAINT "courier_debts_cancelledByUserId_fkey"
  FOREIGN KEY ("cancelledByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_preparedByUserId_fkey"
  FOREIGN KEY ("preparedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_paidByUserId_fkey"
  FOREIGN KEY ("paidByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "faffago_calls" ADD CONSTRAINT "faffago_calls_staffUserId_fkey"
  FOREIGN KEY ("staffUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "address_memory" ADD CONSTRAINT "address_memory_lastCourierUserId_fkey"
  FOREIGN KEY ("lastCourierUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "seller_change_requests" ADD CONSTRAINT "seller_change_requests_handledByUserId_fkey"
  FOREIGN KEY ("handledByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- audit_log."actorUserId" deliberately has no foreign key: the audit trail must
-- survive every other table and must never be blocked by a reference check.

-- Only the actor columns that are actually queried get an index.
CREATE INDEX "parcel_events_actorUserId_serverTime_idx"
  ON "parcel_events" ("actorUserId", "serverTime");

-- ─────────────────────────────────────────────────────────────
-- Login identifiers (A-20)
--
-- Sellers log in with an email, staff with a username, couriers with their
-- phone plus the role they pick. Enforced here so no code path can create an
-- account that nobody can log in to.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE "users" ADD CONSTRAINT "users_login_identifier_matches_role" CHECK (
  CASE "role"
    WHEN 'VENDEUR' THEN "email" IS NOT NULL AND "username" IS NULL
    WHEN 'ADMIN' THEN "username" IS NOT NULL AND "email" IS NULL
    WHEN 'DEPOT' THEN "username" IS NOT NULL AND "email" IS NULL
    WHEN 'SERVICE_CLIENT' THEN "username" IS NOT NULL AND "email" IS NULL
    WHEN 'LIVREUR' THEN "email" IS NULL AND "username" IS NULL
    WHEN 'RAMASSEUR' THEN "email" IS NULL AND "username" IS NULL
  END
);

-- Emails and usernames are compared without case, so two accounts cannot
-- differ only by capitalisation.
CREATE UNIQUE INDEX "users_email_lower_key" ON "users" (lower("email")) WHERE "email" IS NOT NULL;
CREATE UNIQUE INDEX "users_username_lower_key" ON "users" (lower("username")) WHERE "username" IS NOT NULL;

-- Stored lowercase, not merely compared lowercase (Q13), so that what the admin
-- reads back in the back office is exactly what the seller types to log in.
ALTER TABLE "users" ADD CONSTRAINT "users_email_is_lowercase"
  CHECK ("email" IS NULL OR "email" = lower("email"));
ALTER TABLE "users" ADD CONSTRAINT "users_username_is_lowercase"
  CHECK ("username" IS NULL OR "username" = lower("username"));

-- Usernames: lowercase a-z 0-9 . _ - and at least 4 characters (Q13).
ALTER TABLE "users" ADD CONSTRAINT "users_username_format"
  CHECK ("username" IS NULL OR "username" ~ '^[a-z0-9._-]{4,}$');

-- An email only has to be plausible here; the admin types it by hand and no
-- mail is ever sent to it, so it is a login identifier and nothing more.
ALTER TABLE "users" ADD CONSTRAINT "users_email_format"
  CHECK ("email" IS NULL OR "email" ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$');

-- A seller's contact phone is also the number a courier calls, so it is always
-- present; 8 digits, Tunisian format (Vendeur 4.2).
ALTER TABLE "users" ADD CONSTRAINT "users_phone_format" CHECK ("phone" ~ '^[2-59][0-9]{7}$');
ALTER TABLE "sellers" ADD CONSTRAINT "sellers_contact_phone_format" CHECK ("contactPhone" ~ '^[2-59][0-9]{7}$');
ALTER TABLE "parcels" ADD CONSTRAINT "parcels_recipient_phone_format" CHECK ("recipientPhone" ~ '^[2-59][0-9]{7}$');
ALTER TABLE "parcels" ADD CONSTRAINT "parcels_recipient_phone2_format"
  CHECK ("recipientPhone2" IS NULL OR "recipientPhone2" ~ '^[2-59][0-9]{7}$');

-- ─────────────────────────────────────────────────────────────
-- Money: no negative amount can be stored where none makes sense
--
-- The rounding and the arithmetic live in packages/shared; these are the last
-- line of defence against a bug writing a nonsense amount.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE "parcels" ADD CONSTRAINT "parcels_money_non_negative" CHECK (
  "codAmountMillimes" >= 0
  AND "deliveryFeeMillimes" >= 0
  AND "returnFeeMillimes" >= 0
  AND "changeClientFeeMillimes" >= 0
  AND ("courierRateMillimes" IS NULL OR "courierRateMillimes" >= 0)
);
ALTER TABLE "parcels" ADD CONSTRAINT "parcels_counters_non_negative"
  CHECK ("attemptCount" >= 0 AND "changeClientCount" >= 0 AND "pieceCount" >= 1);
ALTER TABLE "seller_charges" ADD CONSTRAINT "seller_charges_amount_non_negative"
  CHECK ("amountMillimes" >= 0);

-- A bon de versement is never negative (A-2).
ALTER TABLE "bons_versement" ADD CONSTRAINT "bons_versement_net_positive" CHECK (
  "totalCodMillimes" >= 0
  AND "totalFeesMillimes" >= 0
  AND "retenueMillimes" >= 0
  AND "retenueRateBps" >= 0
  AND "netMillimes" > 0
  AND "baseAfterFeesMillimes" = "totalCodMillimes" - "totalFeesMillimes"
  AND "netMillimes" = "baseAfterFeesMillimes" - "retenueMillimes"
);

-- A pay slip never pays a negative amount; the rest of the debt carries over.
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_net_non_negative" CHECK (
  "grossMillimes" >= 0
  AND "deductionsMillimes" >= 0
  AND "netMillimes" >= 0
  AND "netMillimes" = "grossMillimes" - "deductionsMillimes"
);
ALTER TABLE "courier_debts" ADD CONSTRAINT "courier_debts_amounts_sane" CHECK (
  "amountMillimes" >= 0
  AND "remainingMillimes" >= 0
  AND "remainingMillimes" <= "amountMillimes"
);
ALTER TABLE "payslip_deductions" ADD CONSTRAINT "payslip_deductions_amount_positive"
  CHECK ("amountMillimes" > 0);

-- Écart is compté − attendu, so it may be negative; the totals may not.
ALTER TABLE "caisse_sessions" ADD CONSTRAINT "caisse_sessions_amounts_sane" CHECK (
  "expectedDeliveryMillimes" >= 0
  AND "expectedBonCashMillimes" >= 0
  AND "expectedTotalMillimes" >= 0
  AND ("countedMillimes" IS NULL OR "countedMillimes" >= 0)
);

-- The retenue applies only to sellers with statut CIN uniquement (Vendeur 2.4).
ALTER TABLE "bons_versement" ADD CONSTRAINT "bons_versement_retenue_only_cin" CHECK (
  "sellerStatutSnapshot" = 'CIN_UNIQUEMENT' OR ("retenueMillimes" = 0 AND "retenueRateBps" = 0)
);

-- A parcel has a cash status only once it is delivered (Vendeur 5).
ALTER TABLE "parcels" ADD CONSTRAINT "parcels_cash_status_requires_delivery"
  CHECK ("cashStatus" IS NULL OR "status" = 'LIVRE');

-- ─────────────────────────────────────────────────────────────
-- Append-only tables
--
-- parcel_events and audit_log record what happened. Nothing may rewrite them,
-- including a bug, a migration or an admin with a psql prompt (CLAUDE.md).
--
-- Two layers, on purpose:
--   1. this trigger, which holds for every role including the schema owner;
--   2. the grants below, which additionally remove the privilege from the
--      application role so the attempt never reaches the trigger.
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION faffago_block_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    'La table % est en ajout seul : % interdit (parcel_events et audit_log ne sont jamais modifiés)',
    TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER "parcel_events_append_only"
  BEFORE UPDATE OR DELETE ON "parcel_events"
  FOR EACH ROW EXECUTE FUNCTION faffago_block_mutation();

CREATE TRIGGER "parcel_events_no_truncate"
  BEFORE TRUNCATE ON "parcel_events"
  FOR EACH STATEMENT EXECUTE FUNCTION faffago_block_mutation();

CREATE TRIGGER "audit_log_append_only"
  BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION faffago_block_mutation();

CREATE TRIGGER "audit_log_no_truncate"
  BEFORE TRUNCATE ON "audit_log"
  FOR EACH STATEMENT EXECUTE FUNCTION faffago_block_mutation();

-- ─────────────────────────────────────────────────────────────
-- Privileges for the application role
--
-- Two roles (see .env.example):
--   faffago_owner  owns the schema and runs migrations.
--   faffago_app    is what the running API connects as.
--
-- Create them once per server before the first deploy:
--
--   CREATE ROLE faffago_owner LOGIN PASSWORD '...';
--   CREATE ROLE faffago_app   LOGIN PASSWORD '...';
--   CREATE DATABASE faffago OWNER faffago_owner;
--
-- On a development machine that has only one role, this block does nothing and
-- the triggers above still guarantee the append-only rule.
-- ─────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'faffago_app') THEN
    RAISE NOTICE 'Rôle faffago_app absent : privilèges non appliqués (développement local).';
    RETURN;
  END IF;

  EXECUTE 'GRANT USAGE ON SCHEMA public TO faffago_app';
  EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO faffago_app';
  EXECUTE 'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO faffago_app';

  -- The whole point: the application may append to these two tables and
  -- nothing else.
  EXECUTE 'REVOKE UPDATE, DELETE, TRUNCATE ON TABLE parcel_events FROM faffago_app';
  EXECUTE 'REVOKE UPDATE, DELETE, TRUNCATE ON TABLE audit_log FROM faffago_app';

  -- Tables created by later migrations inherit the same defaults.
  EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public
             GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO faffago_app';
  EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public
             GRANT USAGE, SELECT ON SEQUENCES TO faffago_app';
END
$$;
