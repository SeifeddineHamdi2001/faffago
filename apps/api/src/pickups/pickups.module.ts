import { Module } from '@nestjs/common';
import { PickupAddressesService } from './pickup-addresses.service';
import { PickupAddressesController, PickupsController } from './pickups.controller';
import { PickupsService } from './pickups.service';

/** Ramassages, seller side (Vendeur 4.5). Planning and scans come in phases 5 and 6. */
@Module({
  controllers: [PickupsController, PickupAddressesController],
  providers: [PickupsService, PickupAddressesService],
})
export class PickupsModule {}
