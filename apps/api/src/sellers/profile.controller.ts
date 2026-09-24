import { Controller, Get } from '@nestjs/common';
import { Permission } from '@faffago/shared';
import { AllowImpersonation, CurrentPrincipal, RequirePermission } from '../auth/decorators';
import { sellerIdOf, type Principal } from '../auth/principal';
import { PrismaService } from '../common/prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';

/**
 * Profil (Vendeur 4.14): the shop and the contact person, the statut, and the
 * rates, read-only; changes go through Faffa Go. The rates are the same for
 * every seller (Vendeur rule 6). Pickup addresses have their own routes.
 */
@Controller('profile')
export class ProfileController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  @Get()
  @RequirePermission(Permission.ESPACE_VENDEUR)
  @AllowImpersonation()
  async get(@CurrentPrincipal() principal: Principal) {
    const seller = await this.prisma.seller.findUniqueOrThrow({
      where: { id: sellerIdOf(principal) },
      include: { user: { select: { email: true } } },
    });
    const { settings } = await this.settings.current();
    return {
      shopName: seller.shopName,
      productCategory: seller.productCategory,
      storeLink: seller.storeLink,
      contactFullName: seller.contactFullName,
      contactPhone: seller.contactPhone,
      email: seller.user.email,
      statut: seller.statut,
      accountState: seller.accountState,
      rates: {
        deliveryFeeMillimes: settings.deliveryFeeMillimes,
        returnFeeMillimes: settings.returnFeeMillimes,
        changeClientFeeMillimes: settings.changeClientFeeMillimes,
        pickupFeeMillimes: settings.pickupFeeMillimes,
        pickupFreeThreshold: settings.pickupFreeThreshold,
        retenueRateBps: settings.retenueRateBps,
      },
    };
  }
}
