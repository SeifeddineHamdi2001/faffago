import { Module } from '@nestjs/common';
import { ChatModule } from '../chat/chat.module';
import { MoneyModule } from '../money/money.module';
import { ParcelsModule } from '../parcels/parcels.module';
import { AddressMemoryService } from './address-memory.service';
import { CourierController, CourierSyncController } from './courier.controller';
import { CourierDayService } from './courier-day.service';
import { CourierPickupsService } from './courier-pickups.service';
import { CourierScansService } from './courier-scans.service';
import { CourierSyncService } from './courier-sync.service';

/** The courier app's routes (Coursier, phase 6). */
@Module({
  imports: [ParcelsModule, MoneyModule, ChatModule],
  controllers: [CourierSyncController, CourierController],
  providers: [
    AddressMemoryService,
    CourierDayService,
    CourierPickupsService,
    CourierScansService,
    CourierSyncService,
  ],
  exports: [AddressMemoryService],
})
export class CourierModule {}
