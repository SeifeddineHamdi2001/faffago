import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AVerifierModule } from './a-verifier/a-verifier.module';
import { AccountsModule } from './accounts/accounts.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { ColisModule } from './colis/colis.module';
import { ChatModule } from './chat/chat.module';
import { ClockModule } from './common/clock.module';
import { CourierModule } from './courier/courier.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { DemandesModule } from './demandes/demandes.module';
import { ExceptionsModule } from './exceptions/exceptions.module';
import { ReportsModule } from './reports/reports.module';
import { GeoModule } from './geo/geo.module';
import { LabelsModule } from './labels/labels.module';
import { MoneyModule } from './money/money.module';
import { NoticesModule } from './notices/notices.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { ParcelsModule } from './parcels/parcels.module';
import { PickupsModule } from './pickups/pickups.module';
import { PublicModule } from './public/public.module';
import { ScansModule } from './scans/scans.module';
import { SellersModule } from './sellers/sellers.module';
import { SettingsModule } from './settings/settings.module';
import { StorageModule } from './storage/storage.module';
import { TourneesModule } from './tournees/tournees.module';
import { ZonesModule } from './zones/zones.module';

/**
 * Domain modules are added one at a time, as each phase of docs/PROGRESS.md is
 * built: auth, users, sellers, couriers, zones, parcels, scans, pickups,
 * verification (À vérifier), caisse, payouts, returns, courier-pay, retenue, chat,
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
    NotificationsModule,
    AuthModule,
    // Before any module that brings in ParcelsModule (Accounts does, through
    // Tournées): routes register in module order, and /parcels/labels must
    // not be read as a parcel code.
    LabelsModule,
    AccountsModule,
    SellersModule,
    GeoModule,
    ZonesModule,
    ParcelsModule,
    PickupsModule,
    ScansModule,
    TourneesModule,
    ColisModule,
    DemandesModule,
    ExceptionsModule,
    ReportsModule,
    DashboardModule,
    CourierModule,
    AVerifierModule,
    MoneyModule,
    ChatModule,
    NoticesModule,
    PublicModule,
  ],
})
export class AppModule {}
