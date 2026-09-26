import { Module } from '@nestjs/common';
import { MoneyModule } from '../money/money.module';
import { TourneesModule } from '../tournees/tournees.module';
import { NoticesJob } from './notices.job';

/** The scheduled notifications (phase 10A). */
@Module({
  imports: [MoneyModule, TourneesModule],
  providers: [NoticesJob],
  exports: [NoticesJob],
})
export class NoticesModule {}
