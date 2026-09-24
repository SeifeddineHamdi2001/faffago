import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AccountsModule } from './accounts/accounts.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { ClockModule } from './common/clock.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { GeoModule } from './geo/geo.module';
import { LabelsModule } from './labels/labels.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { ParcelsModule } from './parcels/parcels.module';
import { PickupsModule } from './pickups/pickups.module';
import { SellersModule } from './sellers/sellers.module';
import { SettingsModule } from './settings/settings.module';
import { StorageModule } from './storage/storage.module';
import { ZonesModule } from './zones/zones.module';

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
    StorageModule,
    SettingsModule,
    AuthModule,
    AccountsModule,
    SellersModule,
    GeoModule,
    ZonesModule,
    // Before ParcelsModule: /parcels/labels must not be read as a parcel code.
    LabelsModule,
    ParcelsModule,
    PickupsModule,
    DashboardModule,
  ],
})
export class AppModule {}
