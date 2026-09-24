import { Module } from '@nestjs/common';
import { ParcelsModule } from '../parcels/parcels.module';
import { ZonesModule } from '../zones/zones.module';
import { TourneesController } from './tournees.controller';
import { TourneesService } from './tournees.service';

@Module({
  imports: [ParcelsModule, ZonesModule],
  controllers: [TourneesController],
  providers: [TourneesService],
  exports: [TourneesService],
})
export class TourneesModule {}
