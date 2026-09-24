import { Module } from '@nestjs/common';
import { DemandesModule } from '../demandes/demandes.module';
import { ColisController } from './colis.controller';
import { ColisService } from './colis.service';

/** Colis, the team's side (Admin 4.3). */
@Module({
  imports: [DemandesModule],
  controllers: [ColisController],
  providers: [ColisService],
})
export class ColisModule {}
