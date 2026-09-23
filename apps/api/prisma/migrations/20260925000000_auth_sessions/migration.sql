-- Phase 1, auth: sessions, their lifetimes, and "Voir comme le vendeur".
--
-- A refresh_tokens row is a session: one per logged-in device. Every access
-- token carries its id, so revoking the row (Régénérer le mot de passe,
-- deactivation, logout) signs that device out at its very next request.

-- CreateEnum
CREATE TYPE "AuthClient" AS ENUM ('WEB', 'COURIER_APP');

-- AlterTable. No session was ever issued before this migration (there was no
-- login endpoint), so the default only exists to make the ALTER safe and is
-- dropped straight away: every new session states its client.
ALTER TABLE "refresh_tokens" ADD COLUMN     "client" "AuthClient" NOT NULL DEFAULT 'WEB',
ADD COLUMN     "ip" TEXT,
ADD COLUMN     "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "previousTokenHash" TEXT,
ADD COLUMN     "revokedReason" TEXT,
ADD COLUMN     "userAgent" TEXT;

ALTER TABLE "refresh_tokens" ALTER COLUMN "client" DROP DEFAULT;

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_previousTokenHash_key" ON "refresh_tokens"("previousTokenHash");

-- CreateTable: D-5. One row per use of "Voir comme le vendeur", so that its end
-- is written to audit_log even when the admin never presses the exit button.
CREATE TABLE "impersonation_sessions" (
    "id" UUID NOT NULL,
    "adminUserId" UUID NOT NULL,
    "adminSessionId" UUID NOT NULL,
    "sellerId" UUID NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "endReason" TEXT,

    CONSTRAINT "impersonation_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "impersonation_sessions_adminUserId_startedAt_idx" ON "impersonation_sessions"("adminUserId", "startedAt");

-- CreateIndex
CREATE INDEX "impersonation_sessions_endedAt_expiresAt_idx" ON "impersonation_sessions"("endedAt", "expiresAt");

-- AddForeignKey
ALTER TABLE "impersonation_sessions" ADD CONSTRAINT "impersonation_sessions_adminSessionId_fkey" FOREIGN KEY ("adminSessionId") REFERENCES "refresh_tokens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "impersonation_sessions" ADD CONSTRAINT "impersonation_sessions_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "sellers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Actor column without a Prisma relation (D-3): its key is declared here.
ALTER TABLE "impersonation_sessions" ADD CONSTRAINT "impersonation_sessions_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 30 minutes at most, and an end never before the start.
ALTER TABLE "impersonation_sessions" ADD CONSTRAINT "impersonation_sessions_duration"
  CHECK ("expiresAt" > "startedAt" AND "expiresAt" <= "startedAt" + interval '30 minutes');
ALTER TABLE "impersonation_sessions" ADD CONSTRAINT "impersonation_sessions_end_is_complete"
  CHECK (("endedAt" IS NULL) = ("endReason" IS NULL));

-- Q8: two staff members never share a phone number. The unique index on
-- (phone, role) only covers one role at a time, and staff span three.
CREATE UNIQUE INDEX "users_staff_phone_key" ON "users" ("phone")
  WHERE "role" IN ('ADMIN', 'DEPOT', 'SERVICE_CLIENT');
