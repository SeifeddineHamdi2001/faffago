import { Module } from '@nestjs/common';
import { CourierAbsencesService } from './courier-absences.service';
import { ZoneCoverageService } from './zone-coverage.service';
import { CourierAbsencesController, ZonesController } from './zones.controller';
import { ZonesService } from './zones.service';

@Module({
  controllers: [ZonesController, CourierAbsencesController],
  providers: [ZonesService, CourierAbsencesService, ZoneCoverageService],
  exports: [ZoneCoverageService],
})
export class ZonesModule {}
