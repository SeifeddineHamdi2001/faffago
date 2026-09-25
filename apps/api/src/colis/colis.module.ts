import { Module } from '@nestjs/common';
import { CourierModule } from '../courier/courier.module';
import { DemandesModule } from '../demandes/demandes.module';
import { ParcelsModule } from '../parcels/parcels.module';
import { ColisController } from './colis.controller';
import { ColisService } from './colis.service';
import { ForcageService } from './forcage.service';

/** Colis, the team's side (Admin 4.3), and Forcer un statut (D-56). */
@Module({
  imports: [CourierModule, DemandesModule, ParcelsModule],
  controllers: [ColisController],
  providers: [ColisService, ForcageService],
})
export class ColisModule {}
