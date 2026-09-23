import { Inject, Injectable } from '@nestjs/common';
import { DEFAULT_SETTINGS, SettingKey } from '@faffago/shared';
import { CLOCK, type Clock } from '../common/clock';
import { PrismaService } from '../common/prisma/prisma.service';

/**
 * Reads Paramètres from the `settings` table, the runtime source of truth.
 * Only what the auth phase needs so far; the full settings module (Admin
 * 4.16) replaces this when the Paramètres screen is built.
 */
@Injectable()
export class SettingsService {
  /** The minimum app version is read on every courier request. */
  private static readonly CACHE_SECONDS = 60;
  private cached: { value: string; at: number } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async courierMinAppVersion(): Promise<string> {
    const now = this.clock.now().getTime();
    if (this.cached && now - this.cached.at < SettingsService.CACHE_SECONDS * 1000) {
      return this.cached.value;
    }
    const row = await this.prisma.setting.findUnique({
      where: { key: SettingKey.COURIER_MIN_APP_VERSION },
    });
    const value =
      typeof row?.value === 'string' ? row.value : DEFAULT_SETTINGS.courierMinAppVersion;
    this.cached = { value, at: now };
    return value;
  }

  clearCache(): void {
    this.cached = null;
  }
}
