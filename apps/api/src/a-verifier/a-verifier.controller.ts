import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import {
  Permission,
  changerClientSchema,
  changerDateSchema,
  logCallSchema,
  relancerSchema,
  type ChangerClientValues,
  type ChangerDateValues,
  type LogCallValues,
  type RelancerValues,
} from '@faffago/shared';
import { AllowImpersonation, CurrentPrincipal, RequirePermission } from '../auth/decorators';
import type { Principal, UserPrincipal } from '../auth/principal';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AVerifierQueriesService } from './a-verifier-queries.service';
import { CallsService } from './calls.service';
import { DecisionsService } from './decisions.service';

/**
 * À vérifier lists (Vendeur 4.9, Admin 4.6). The seller's own under
 * `/a-verifier`, open to Voir comme le vendeur (read-only, D-5); every
 * seller's under `/a-verifier/suivi`, for Admin and Service client.
 */
@Controller('a-verifier')
export class AVerifierController {
  constructor(private readonly queries: AVerifierQueriesService) {}

  @Get()
  @RequirePermission(Permission.ESPACE_VENDEUR)
  @AllowImpersonation()
  list(@CurrentPrincipal() principal: Principal) {
    return this.queries.sellerList(principal);
  }

  /** The count for the menu badge, and the parcels under 24 hours for the banner. */
  @Get('resume')
  @RequirePermission(Permission.ESPACE_VENDEUR)
  @AllowImpersonation()
  summary(@CurrentPrincipal() principal: Principal) {
    return this.queries.sellerSummary(principal);
  }

  @Get('suivi')
  @RequirePermission(Permission.SUIVI_A_VERIFIER)
  followUp() {
    return this.queries.followUp();
  }
}

/** The seller's decisions (Vendeur 4.9): his alone (D-4), never under impersonation (D-5). */
@Controller('parcels')
export class DecisionsController {
  constructor(private readonly decisions: DecisionsService) {}

  @Post(':code/relancer')
  @RequirePermission(Permission.ESPACE_VENDEUR)
  @HttpCode(200)
  relancer(
    @Param('code') code: string,
    @Body(new ZodValidationPipe(relancerSchema)) body: RelancerValues,
    @CurrentPrincipal() principal: Principal,
  ) {
    return this.decisions.relancer(principal as UserPrincipal, code, body);
  }

  @Post(':code/changer-date')
  @RequirePermission(Permission.ESPACE_VENDEUR)
  @HttpCode(200)
  changerDate(
    @Param('code') code: string,
    @Body(new ZodValidationPipe(changerDateSchema)) body: ChangerDateValues,
    @CurrentPrincipal() principal: Principal,
  ) {
    return this.decisions.changerDate(principal as UserPrincipal, code, body);
  }

  @Post(':code/retourner')
  @RequirePermission(Permission.ESPACE_VENDEUR)
  @HttpCode(200)
  retourner(@Param('code') code: string, @CurrentPrincipal() principal: Principal) {
    return this.decisions.retourner(principal as UserPrincipal, code);
  }

  @Post(':code/changer-client')
  @RequirePermission(Permission.ESPACE_VENDEUR)
  @HttpCode(200)
  changerClient(
    @Param('code') code: string,
    @Body(new ZodValidationPipe(changerClientSchema)) body: ChangerClientValues,
    @CurrentPrincipal() principal: Principal,
  ) {
    return this.decisions.changerClient(principal as UserPrincipal, code, body);
  }
}

/** Appels Faffa Go (Admin 4.6, D-11): Service client and Admin log calls from Colis. */
@Controller('colis')
export class CallsController {
  constructor(private readonly calls: CallsService) {}

  @Post(':code/appels')
  @RequirePermission(Permission.SUIVI_A_VERIFIER)
  log(
    @Param('code') code: string,
    @Body(new ZodValidationPipe(logCallSchema)) body: LogCallValues,
    @CurrentPrincipal() principal: Principal,
  ) {
    return this.calls.log(principal as UserPrincipal, code, body);
  }
}
