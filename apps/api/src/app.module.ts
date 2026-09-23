import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AccountsModule } from './accounts/accounts.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { ClockModule } from './common/clock.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { SellersModule } from './sellers/sellers.module';
import { SettingsModule } from './settings/settings.module';

/**
 * Domain modules are added one at a time, as each phase of docs/PROGRESS.md is
 * built: auth, users, sellers, couriers, zones, parcels, scans, pickups,
 * verification, caisse, payouts, returns, courier-pay, retenue, chat,
 * notifications, reports, audit, settings, public.
 *
 * AuthModule registers the three global guards: every route of every module
 * is authenticated and permission-checked unless it says otherwise.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['../../.env'] }),
    ScheduleModule.forRoot(),
    ClockModule,
    PrismaModule,
    AuditModule,
    SettingsModule,
    AuthModule,
    AccountsModule,
    SellersModule,
  ],
})
export class AppModule {}
