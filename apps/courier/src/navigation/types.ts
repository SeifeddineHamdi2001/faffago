import type { NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

export type RootStackParams = {
  Tabs: NavigatorScreenParams<TabParams> | undefined;
  /** Trouver le client (Coursier 4.3). */
  Stop: { code: string };
  /** Livré or Échec for one parcel (Coursier 4.4). */
  Deliver: { code: string; manual: boolean };
  /**
   * The camera; for the ramasseur, a step of his visit (Coursier 4.6, D-84):
   * the parcels of a pickup, a bon de versement's QR, or the returns.
   */
  Scanner: { pickupId?: string; step?: ScanStep };
  Pickup: { id: string };
  /** A visit only to hand over bons (D-84). */
  Visit: { sellerId: string };
  /** Mes gains, livreur only (Coursier 4.10). */
  Gains: undefined;
  RetourDepot: undefined;
  ChangePin: undefined;
  /** Notifications, both roles (Coursier 4.11). */
  Notifications: undefined;
  /** The livreur's chats (Coursier 4.8); the ramasseur has none (A-23). */
  ChatList: undefined;
  Chat: { code: string };
};

export type TabParams = {
  Journee: undefined;
  Tournee: undefined;
  Ramassages: undefined;
  Scan: undefined;
  Caisse: undefined;
  Menu: undefined;
};

/** The ramasseur's scan steps (Coursier 4.6): Colis › Bon de versement › Retours. */
export type ScanStep = 'COLIS' | 'BON' | 'RETOURS';

export type RootScreenProps<K extends keyof RootStackParams> = NativeStackScreenProps<
  RootStackParams,
  K
>;
