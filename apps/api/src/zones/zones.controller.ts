import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import {
  Permission,
  courierAbsenceSchema,
  createZoneSchema,
  updateZoneSchema,
  zoneAssignmentsSchema,
  type CourierAbsenceValues,
  type CreateZoneValues,
  type UpdateZoneValues,
  type ZoneAssignmentsValues,
} from '@faffago/shared';
import { CurrentPrincipal, Meta, RequirePermission } from '../auth/decorators';
import type { Principal, UserPrincipal } from '../auth/principal';
import type { RequestMeta } from '../auth/sessions.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CourierAbsencesService } from './courier-absences.service';
import { ZonesService } from './zones.service';

/** Paramètres › Zones (Admin 4.5, 4.16, D-51): the admin's alone. */
@Controller('zones')
export class ZonesController {
  constructor(private readonly zones: ZonesService) {}

  @Get()
  @RequirePermission(Permission.PARAMETRES)
  list() {
    return this.zones.list();
  }

  @Post()
  @RequirePermission(Permission.PARAMETRES)
  create(
    @Body(new ZodValidationPipe(createZoneSchema)) body: CreateZoneValues,
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
  ) {
    return this.zones.create(principal as UserPrincipal, body, meta);
  }

  /** Rename, deactivate or reactivate. */
  @Patch(':id')
  @RequirePermission(Permission.PARAMETRES)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateZoneSchema)) body: UpdateZoneValues,
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
  ) {
    return this.zones.update(principal as UserPrincipal, id, body, meta);
  }

  /** The livreur and the ramasseur, titular and backup, replaced together. */
  @Put(':id/assignments')
  @RequirePermission(Permission.PARAMETRES)
  setAssignments(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(zoneAssignmentsSchema)) body: ZoneAssignmentsValues,
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
  ) {
    return this.zones.setAssignments(principal as UserPrincipal, id, body, meta);
  }
}

/**
 * Marking a courier absent for a day (D-52): Admin and Dépôt, who plan the
 * pickups and tours. Every back office role reads the absences on the
 * Coursiers screen.
 */
@Controller('couriers/:id/absences')
export class CourierAbsencesController {
  constructor(private readonly absences: CourierAbsencesService) {}

  @Get()
  @RequirePermission(Permission.COURSIERS_LECTURE)
  list(@Param('id', ParseUUIDPipe) id: string) {
    return this.absences.list(id);
  }

  @Post()
  @RequirePermission(Permission.PLANIFIER_RAMASSAGES_TOURNEES)
  mark(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(courierAbsenceSchema)) body: CourierAbsenceValues,
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
  ) {
    return this.absences.mark(principal as UserPrincipal, id, body, meta);
  }

  @Delete(':date')
  @RequirePermission(Permission.PLANIFIER_RAMASSAGES_TOURNEES)
  @HttpCode(204)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('date') date: string,
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.absences.remove(principal as UserPrincipal, id, date, meta);
  }
}
