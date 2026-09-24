import { Module } from '@nestjs/common';
import { ParcelsModule } from '../parcels/parcels.module';
import { ZonesModule } from '../zones/zones.module';
import { DepotScansService } from './depot-scans.service';
import { ScansController } from './scans.controller';

@Module({
  imports: [ParcelsModule, ZonesModule],
  controllers: [ScansController],
  providers: [DepotScansService],
})
export class ScansModule {}
