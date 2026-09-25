import type { NativeStackScreenProps } from '@react-navigation/native-stack';

export type RootStackParams = {
  Tabs: undefined;
  /** Trouver le client (Coursier 4.3). */
  Stop: { code: string };
  /** Livré or Échec for one parcel (Coursier 4.4). */
  Deliver: { code: string; manual: boolean };
  /** The camera; with a pickup for the ramasseur (Coursier 4.6). */
  Scanner: { pickupId?: string };
  Pickup: { id: string };
  RetourDepot: undefined;
  ChangePin: undefined;
};

export type TabParams = {
  Journee: undefined;
  Tournee: undefined;
  Ramassages: undefined;
  Scan: undefined;
  Caisse: undefined;
  Menu: undefined;
};

export type RootScreenProps<K extends keyof RootStackParams> = NativeStackScreenProps<
  RootStackParams,
  K
>;
