import { Module } from '@nestjs/common';
import { GeoModule } from '../geo/geo.module';
import { PublicSiteController } from './public-site.controller';
import { PublicSiteService } from './public-site.service';
import { PublicTrackingController } from './public-tracking.controller';
import { PublicTrackingThrottleService } from './public-tracking-throttle.service';
import { PublicTrackingService } from './public-tracking.service';

/** The public site's own endpoints (phase 9): tracking and Tarifs/Zones. */
@Module({
  imports: [GeoModule],
  controllers: [PublicTrackingController, PublicSiteController],
  providers: [PublicTrackingService, PublicTrackingThrottleService, PublicSiteService],
})
export class PublicModule {}
