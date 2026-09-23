import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './common/prisma/prisma.module';

/**
 * Domain modules are added one at a time, as each phase of docs/PROGRESS.md is
 * built: auth, users, sellers, couriers, zones, parcels, scans, pickups,
 * verification, caisse, payouts, returns, courier-pay, retenue, chat,
 * notifications, reports, audit, settings, public.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['../../.env'] }),
    PrismaModule,
  ],
})
export class AppModule {}
