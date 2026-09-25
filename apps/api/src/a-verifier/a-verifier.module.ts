import { Module } from '@nestjs/common';
import { ParcelsModule } from '../parcels/parcels.module';
import { AVerifierController, CallsController, DecisionsController } from './a-verifier.controller';
import { AVerifierQueriesService } from './a-verifier-queries.service';
import { CallsService } from './calls.service';
import { DecisionsService } from './decisions.service';
import { VerifyDeadlineJob } from './verify-deadline.job';

/**
 * À vérifier (phase 7): the seller's decisions, the 48-hour job, the lists
 * and Appels Faffa Go. Every status change goes through ParcelEventService.
 */
@Module({
  imports: [ParcelsModule],
  controllers: [AVerifierController, DecisionsController, CallsController],
  providers: [AVerifierQueriesService, CallsService, DecisionsService, VerifyDeadlineJob],
  exports: [CallsService],
})
export class AVerifierModule {}
