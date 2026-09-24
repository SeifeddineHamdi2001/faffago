import { Module } from '@nestjs/common';
import { ParcelCodeGenerator } from './parcel-code.generator';
import { ParcelEventService } from './parcel-event.service';
import { ParcelsController } from './parcels.controller';
import { ParcelsService } from './parcels.service';

/**
 * The parcel core (phase 3) and the seller's parcel routes (phase 4). The
 * scans, decisions and jobs that move parcels come with their own phases, all
 * through ParcelEventService.
 */
@Module({
  controllers: [ParcelsController],
  providers: [ParcelCodeGenerator, ParcelEventService, ParcelsService],
  exports: [ParcelEventService, ParcelsService],
})
export class ParcelsModule {}
