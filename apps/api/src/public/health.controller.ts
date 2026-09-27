import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Public } from '../auth/decorators';
import { PrismaService } from '../common/prisma/prisma.service';

/**
 * For the uptime check and the deploy script (phase 11). Open to anyone, so it
 * says nothing about the platform: only whether the database answers.
 */
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Public()
  async check(): Promise<{ status: 'ok' }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException({ status: 'indisponible' });
    }
    return { status: 'ok' };
  }
}
