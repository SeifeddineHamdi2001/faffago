import { Module } from '@nestjs/common';
import { ZonesModule } from '../zones/zones.module';
import { PickupAddressesService } from './pickup-addresses.service';
import { PickupAddressesController, PickupsController } from './pickups.controller';
import { PickupsService } from './pickups.service';
import { RamassagesController } from './ramassages.controller';
import { RamassagesService } from './ramassages.service';

/**
 * Ramassages: the seller's requests (Vendeur 4.5) and the team's planning
 * (Admin 4.4, D-58). The ramasseur's scans come with his app (phase 6).
 */
@Module({
  imports: [ZonesModule],
  controllers: [PickupsController, PickupAddressesController, RamassagesController],
  providers: [PickupsService, PickupAddressesService, RamassagesService],
})
export class PickupsModule {}
