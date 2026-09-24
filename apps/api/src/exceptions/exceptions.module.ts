import { Module } from '@nestjs/common';
import { DemandesModule } from '../demandes/demandes.module';
import { ExceptionsController } from './exceptions.controller';
import { ExceptionsService } from './exceptions.service';

/** Exceptions, first rows (Admin 4.7, D-50). */
@Module({
  imports: [DemandesModule],
  controllers: [ExceptionsController],
  providers: [ExceptionsService],
})
export class ExceptionsModule {}
