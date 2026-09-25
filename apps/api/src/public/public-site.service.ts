import { Injectable } from '@nestjs/common';
import { publicSiteInfoFrom, type PublicSiteInfo } from '@faffago/shared';
import { GeoService } from '../geo/geo.service';
import { SettingsService } from '../settings/settings.service';

/**
 * What the public site reads from Paramètres and the géographie (Landing 3,
 * 2.6): the fees, the contact links, the délégations served, and the Meta
 * Pixel id. Never the admin's full settings payload (`GET /settings`).
 */
@Injectable()
export class PublicSiteService {
  constructor(
    private readonly settings: SettingsService,
    private readonly geo: GeoService,
  ) {}

  async info(): Promise<PublicSiteInfo> {
    const [{ settings, contactLinks }, tree] = await Promise.all([
      this.settings.current(),
      this.geo.tree(),
    ]);
    const zones = tree.gouvernorats.map((gouvernorat) => ({
      gouvernorat: {
        code: gouvernorat.code,
        nameFr: gouvernorat.nameFr,
        nameAr: gouvernorat.nameAr,
      },
      delegations: gouvernorat.delegations.map((delegation) => ({
        code: delegation.code,
        nameFr: delegation.nameFr,
        nameAr: delegation.nameAr,
      })),
    }));
    return publicSiteInfoFrom(settings, contactLinks, zones);
  }
}
