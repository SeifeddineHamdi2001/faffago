import { Module } from '@nestjs/common';
import { MoneyModule } from '../money/money.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

/** Rapports (Admin 4.13, D-89). */
@Module({
  imports: [MoneyModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
