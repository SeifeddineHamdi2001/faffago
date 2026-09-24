import { Module } from '@nestjs/common';
import { ColisController } from './colis.controller';
import { ColisService } from './colis.service';

/** Colis, the team's side (Admin 4.3). */
@Module({
  controllers: [ColisController],
  providers: [ColisService],
})
export class ColisModule {}
