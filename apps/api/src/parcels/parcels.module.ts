import { Module } from '@nestjs/common';
import { ParcelCodeGenerator } from './parcel-code.generator';
import { ParcelEventService } from './parcel-event.service';
import { ParcelsService } from './parcels.service';

/**
 * The parcel core (phase 3). No controller yet: `POST /parcels` comes with its
 * screen in phase 4, and the scans, decisions and jobs that move parcels come
 * with their own phases, all through ParcelEventService (D-22).
 */
@Module({
  providers: [ParcelCodeGenerator, ParcelEventService, ParcelsService],
  exports: [ParcelEventService, ParcelsService],
})
export class ParcelsModule {}
