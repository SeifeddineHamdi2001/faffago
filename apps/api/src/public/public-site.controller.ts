import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/decorators';
import { PublicSiteService } from './public-site.service';

/** Tarifs, Zones couvertes and contact links (Landing 3, 2.6, 2.8). */
@Controller('public/site-info')
export class PublicSiteController {
  constructor(private readonly site: PublicSiteService) {}

  @Get()
  @Public()
  info() {
    return this.site.info();
  }
}
