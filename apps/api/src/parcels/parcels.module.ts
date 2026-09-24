import { Module } from '@nestjs/common';
import { GeoModule } from '../geo/geo.module';
import { ParcelImportsController } from './parcel-imports.controller';
import { ParcelImportsService } from './parcel-imports.service';
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
  imports: [GeoModule],
  // The imports route first: its fixed segment must not be read as a parcel code.
  controllers: [ParcelImportsController, ParcelsController],
  providers: [ParcelCodeGenerator, ParcelEventService, ParcelsService, ParcelImportsService],
  exports: [ParcelEventService, ParcelsService],
})
export class ParcelsModule {}
