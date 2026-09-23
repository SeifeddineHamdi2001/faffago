import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  FAILURE_REASON_LABELS_FR,
  FailureReason,
  SETTING_KEYS,
  parseSettingValue,
  readPlatformSettings,
  settingValuesOf,
  type ContactLinks,
  type Millimes,
  type PlatformSettings,
  type SettingJsonValue,
  type SettingKey,
} from '@faffago/shared';
import { AuditAction, AuditService } from '../audit/audit.service';
import type { UserPrincipal } from '../auth/principal';
import type { RequestMeta } from '../auth/sessions.service';
import { CLOCK, type Clock } from '../common/clock';
import { apiError } from '../common/errors';
import { PrismaService } from '../common/prisma/prisma.service';

export interface PlatformSnapshot {
  settings: PlatformSettings;
  contactLinks: ContactLinks;
}

/** The three fees frozen on a parcel when it is created (CLAUDE.md, Money). */
export interface ParcelFees {
  deliveryFeeMillimes: Millimes;
  returnFeeMillimes: Millimes;
  changeClientFeeMillimes: Millimes;
}

export interface SettingUpdateResult {
  key: SettingKey;
  value: SettingJsonValue;
  /** False when the value was already the one sent: nothing written, nothing audited. */
  changed: boolean;
}

const parametreInconnu = () => apiError(404, 'PARAMETRE_INCONNU', 'Ce paramètre n’existe pas.');

/**
 * Paramètres (Admin 4.16, D-20), read from the `settings` table: the runtime
 * source of truth. Only the admin changes them; each change is written with
 * its audit entry in one transaction, and applies to parcels created after
 * it, because every fee is frozen on the parcel at creation.
 */
@Injectable()
export class SettingsService {
  /** Read on every courier request and every parcel creation. */
  private static readonly CACHE_SECONDS = 60;
  private cached: { value: PlatformSnapshot; at: number } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * Inside a transaction, pass its client: a read on another connection would
   * wait behind the transaction's own locks.
   */
  async current(
    db: Pick<Prisma.TransactionClient, 'setting'> = this.prisma,
  ): Promise<PlatformSnapshot> {
    const now = this.clock.now().getTime();
    if (this.cached && now - this.cached.at < SettingsService.CACHE_SECONDS * 1000) {
      return this.cached.value;
    }
    const rows = await db.setting.findMany();
    const value = readPlatformSettings(Object.fromEntries(rows.map((row) => [row.key, row.value])));
    this.cached = { value, at: now };
    return value;
  }

  /** Every setting in its stored form, money as digit strings, plus the read-only reasons. */
  async list(): Promise<{
    values: Record<SettingKey, SettingJsonValue>;
    failureReasons: Array<{ code: FailureReason; label: string }>;
  }> {
    const { settings, contactLinks } = await this.current();
    return {
      values: settingValuesOf(settings, contactLinks),
      failureReasons: Object.values(FailureReason).map((code) => ({
        code,
        label: FAILURE_REASON_LABELS_FR[code],
      })),
    };
  }

  /** What parcel creation freezes on the parcel (phase 3). */
  async feesForNewParcel(): Promise<ParcelFees> {
    const { settings } = await this.current();
    return {
      deliveryFeeMillimes: settings.deliveryFeeMillimes,
      returnFeeMillimes: settings.returnFeeMillimes,
      changeClientFeeMillimes: settings.changeClientFeeMillimes,
    };
  }

  async courierMinAppVersion(): Promise<string> {
    return (await this.current()).settings.courierMinAppVersion;
  }

  async update(
    actor: UserPrincipal,
    key: string,
    value: unknown,
    meta: RequestMeta,
  ): Promise<SettingUpdateResult> {
    if (!(SETTING_KEYS as readonly string[]).includes(key)) throw parametreInconnu();
    const settingKey = key as SettingKey;

    const parsed = parseSettingValue(settingKey, value);
    if (!parsed.ok) throw apiError(400, 'VALEUR_INVALIDE', parsed.message);
    const next = parsed.value;

    const result = await this.prisma.$transaction(async (tx) => {
      const row = await tx.setting.findUnique({ where: { key: settingKey } });
      const rows = await tx.setting.findMany();
      const { settings, contactLinks } = readPlatformSettings(
        Object.fromEntries(rows.map((r) => [r.key, r.value])),
      );
      const previous = settingValuesOf(settings, contactLinks)[settingKey];
      if (JSON.stringify(previous) === JSON.stringify(next)) {
        return { key: settingKey, value: next, changed: false };
      }

      await tx.setting.upsert({
        where: { key: settingKey },
        update: { value: next as Prisma.InputJsonValue, updatedByUserId: actor.userId },
        create: {
          key: settingKey,
          value: next as Prisma.InputJsonValue,
          updatedByUserId: actor.userId,
        },
      });
      await this.audit.record(tx, {
        actor: { userId: actor.userId, role: actor.role },
        action: AuditAction.MODIFICATION_PARAMETRE,
        entityType: 'setting',
        entityId: settingKey,
        // What was actually stored, even in an older form (a number from the
        // first seed), so the journal shows the row as it was.
        before: { value: (row?.value ?? previous) as Prisma.InputJsonValue },
        after: { value: next as Prisma.InputJsonValue },
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      return { key: settingKey, value: next, changed: true };
    });

    this.clearCache();
    return result;
  }

  clearCache(): void {
    this.cached = null;
  }
}
