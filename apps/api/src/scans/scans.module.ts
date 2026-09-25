import { Module } from '@nestjs/common';
import { MoneyModule } from '../money/money.module';
import { ParcelsModule } from '../parcels/parcels.module';
import { ZonesModule } from '../zones/zones.module';
import { DepotScansService } from './depot-scans.service';
import { ScansController } from './scans.controller';

@Module({
  imports: [ParcelsModule, ZonesModule, MoneyModule],
  controllers: [ScansController],
  providers: [DepotScansService],
})
export class ScansModule {}
