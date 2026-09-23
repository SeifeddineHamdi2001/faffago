import { Injectable } from '@nestjs/common';
import { Permission, can, type Role } from '@faffago/shared';
import { PrismaService } from '../common/prisma/prisma.service';

/** What Dépôt and Service client read about a seller (D-11). */
export interface SellerContactView {
  id: string;
  shopName: string;
  contactFullName: string;
  contactPhone: string;
}

/** The admin's view: adds the login email, the fiscal statut and the state. */
export interface SellerAdminView extends SellerContactView {
  userId: string;
  email: string | null;
  statut: string;
  accountState: string;
  createdAt: Date;
}

/**
 * Sellers, as far as phase 1 needs them: the list behind the Vendeurs screen,
 * for Régénérer le mot de passe and Voir comme le vendeur. Creating a seller
 * comes in phase 3, with the documents.
 */
@Injectable()
export class SellersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(role: Role): Promise<(SellerContactView | SellerAdminView)[]> {
    const sellers = await this.prisma.seller.findMany({
      orderBy: { shopName: 'asc' },
      include: { user: { select: { email: true } } },
    });
    // The seller's email is his login identifier: admin only (D-11).
    const withEmail = can(role, Permission.VENDEURS_EMAIL);
    return sellers.map((seller) => {
      const contact: SellerContactView = {
        id: seller.id,
        shopName: seller.shopName,
        contactFullName: seller.contactFullName,
        contactPhone: seller.contactPhone,
      };
      if (!withEmail) return contact;
      return {
        ...contact,
        userId: seller.userId,
        email: seller.user.email,
        statut: seller.statut,
        accountState: seller.accountState,
        createdAt: seller.createdAt,
      };
    });
  }
}
