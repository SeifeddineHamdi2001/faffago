import { Module } from '@nestjs/common';
import { TourneesModule } from '../tournees/tournees.module';
import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';

@Module({
  imports: [TourneesModule],
  controllers: [AccountsController],
  providers: [AccountsService],
})
export class AccountsModule {}
