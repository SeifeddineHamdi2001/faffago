import { Module } from '@nestjs/common';
import { ParcelsModule } from '../parcels/parcels.module';
import { ChangeRequestsController } from './change-requests.controller';
import { ChangeRequestsService } from './change-requests.service';

/** Demandes de modification, the team's side (D-57). */
@Module({
  imports: [ParcelsModule],
  controllers: [ChangeRequestsController],
  providers: [ChangeRequestsService],
  exports: [ChangeRequestsService],
})
export class DemandesModule {}
