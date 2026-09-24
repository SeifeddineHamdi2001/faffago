import { Controller, Get } from '@nestjs/common';
import { Permission } from '@faffago/shared';
import { RequirePermission } from '../auth/decorators';
import { ExceptionsService } from './exceptions.service';

/** Exceptions (Admin 4.7, D-11, D-50): every staff role reads the queue. */
@Controller('exceptions')
export class ExceptionsController {
  constructor(private readonly exceptions: ExceptionsService) {}

  @Get()
  @RequirePermission(Permission.EXCEPTIONS_LECTURE)
  queue() {
    return this.exceptions.queue();
  }
}
