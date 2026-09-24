import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Prisma, type ParcelImport } from '@prisma/client';
import {
  CSV_TEMPLATE_COLUMNS,
  CsvRowVerdict,
  PARCEL_MESSAGES,
  ParcelErrorCode,
  evaluateCsvRow,
  localitesOfTree,
  type CsvColumn,
  type CsvImportRequest,
  type CsvRowProblem,
  type CreateParcelValues,
} from '@faffago/shared';
import { sellerIdOf, type Principal, type UserPrincipal } from '../auth/principal';
import { apiError } from '../common/errors';
import { PrismaService } from '../common/prisma/prisma.service';
import { GeoService } from '../geo/geo.service';
import { SettingsService } from '../settings/settings.service';
import { ParcelCodeGenerator } from './parcel-code.generator';
import { ParcelEventService } from './parcel-event.service';

/** A collision on 500 random codes out of 32^8 is already unlikely; three tries is plenty. */
const MAX_ATTEMPTS = 3;

const COLUMNS = new Set<string>(CSV_TEMPLATE_COLUMNS);

const compteSuspendu = () =>
  apiError(
    403,
    'COMPTE_SUSPENDU',
    'Votre compte est suspendu : vous ne pouvez pas créer de colis.',
  );
const importIntrouvable = () => apiError(404, 'IMPORT_INTROUVABLE', 'Import introuvable.');

export interface ParcelImportView {
  id: string;
  fileName: string;
  parcelCount: number;
  createdAt: Date;
  /** In file order: the line each parcel came from, and its code for the label. */
  parcels: { line: number; code: string; recipientName: string; codAmountMillimes: bigint }[];
}

/** A row the server could not import, and why (D-37). */
export interface RefusedRow {
  line: number;
  verdict: CsvRowVerdict;
  problems: CsvRowProblem[];
}

/**
 * Import CSV (Vendeur 4.3, D-37). Every row is evaluated again with the
 * shared rules the preview used; the rows are created together, with the
 * same frozen fees and CREATION event as Créer un colis, or not at all.
 */
@Injectable()
export class ParcelImportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly geo: GeoService,
    private readonly events: ParcelEventService,
    private readonly codes: ParcelCodeGenerator,
  ) {}

  async import(
    principal: UserPrincipal,
    request: CsvImportRequest,
  ): Promise<{ view: ParcelImportView; replayed: boolean }> {
    const sellerId = sellerIdOf(principal);

    // A retry of an import already done gets that import back (D-37).
    const earlier = await this.prisma.parcelImport.findUnique({ where: { id: request.importId } });
    if (earlier) return { view: await this.replay(earlier, sellerId), replayed: true };

    const seller = await this.prisma.seller.findUniqueOrThrow({ where: { id: sellerId } });
    if (seller.accountState === 'SUSPENDU') throw compteSuspendu();

    const lines = request.rows.map((row) => row.line);
    if (new Set(lines).size !== lines.length) {
      throw apiError(400, 'LIGNE_EN_DOUBLE', 'Une même ligne du fichier est envoyée deux fois.');
    }

    // Active localités only, like the preview: a closed one takes no new parcel (D-27).
    const localites = localitesOfTree(await this.geo.tree());
    const accepted: { line: number; values: CreateParcelValues }[] = [];
    const refused: RefusedRow[] = [];
    for (const row of request.rows) {
      const cells: Partial<Record<CsvColumn, string>> = {};
      for (const [column, value] of Object.entries(row.cells)) {
        if (COLUMNS.has(column)) cells[column as CsvColumn] = value.trim();
      }
      const evaluation = evaluateCsvRow({ line: row.line, cells }, localites, row.localiteId);
      if (evaluation.values) accepted.push({ line: row.line, values: evaluation.values });
      else
        refused.push({
          line: row.line,
          verdict: evaluation.verdict,
          problems: evaluation.problems,
        });
    }
    if (refused.length > 0) {
      throw apiError(
        422,
        'LIGNES_REFUSEES',
        `${refused.length} ligne${refused.length > 1 ? 's' : ''} refusée${refused.length > 1 ? 's' : ''} : aucun colis n’a été importé. Corrigez-les dans l’aperçu.`,
        { rows: refused },
      );
    }

    const fees = await this.settings.feesForNewParcel();
    const delegationOf = new Map(localites.map((l) => [l.id, l.delegation.id]));

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const codes = await this.freshCodes(accepted.length);
      try {
        await this.prisma.$transaction(async (tx) => {
          await tx.parcelImport.create({
            data: {
              id: request.importId,
              sellerId,
              createdByUserId: principal.userId,
              fileName: request.fileName,
              parcelCount: accepted.length,
            },
          });
          const parcels = accepted.map(({ line, values }, i) => ({
            id: randomUUID(),
            code: codes[i]!,
            sellerId,
            recipientName: values.recipientName,
            recipientPhone: values.recipientPhone,
            recipientPhone2: values.recipientPhone2 ?? null,
            delegationId: delegationOf.get(values.localiteId)!,
            localiteId: values.localiteId,
            address: values.address,
            landmark: values.landmark ?? null,
            productDescription: values.productDescription,
            pieceCount: values.pieceCount,
            isExchange: values.isExchange,
            openingAllowed: values.openingAllowed,
            courierNote: values.courierNote ?? null,
            codAmountMillimes: values.codAmountMillimes,
            deliveryFeeMillimes: fees.deliveryFeeMillimes,
            returnFeeMillimes: fees.returnFeeMillimes,
            changeClientFeeMillimes: fees.changeClientFeeMillimes,
            createdByUserId: principal.userId,
            importId: request.importId,
            importLine: line,
          }));
          await tx.parcel.createMany({ data: parcels });
          await this.events.recordCreations(tx, parcels, principal);
        });
        return { view: await this.viewOf(request.importId), replayed: false };
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) {
          throw error;
        }
        // The same import, sent twice at once: the other one won.
        const same = await this.prisma.parcelImport.findUnique({ where: { id: request.importId } });
        if (same) return { view: await this.replay(same, sellerId), replayed: true };
        // Otherwise a parcel code was taken in between: draw them again.
      }
    }
    throw apiError(
      503,
      'CODE_COLIS_INDISPONIBLE',
      'Impossible d’attribuer un code au colis pour le moment. Réessayez.',
    );
  }

  async get(principal: Principal, importId: string): Promise<ParcelImportView> {
    const found = await this.prisma.parcelImport.findUnique({ where: { id: importId } });
    if (!found || found.sellerId !== sellerIdOf(principal)) throw importIntrouvable();
    return this.viewOf(found.id);
  }

  // ── helpers ────────────────────────────────────────────────

  /** Another seller's import id is refused without showing his parcels. */
  private async replay(found: ParcelImport, sellerId: string): Promise<ParcelImportView> {
    if (found.sellerId !== sellerId) {
      throw apiError(
        409,
        ParcelErrorCode.REQUETE_DEJA_UTILISEE,
        PARCEL_MESSAGES.REQUETE_DEJA_UTILISEE,
      );
    }
    return this.viewOf(found.id);
  }

  /** Distinct codes that no parcel carries yet. */
  private async freshCodes(count: number): Promise<string[]> {
    const codes = new Set<string>();
    while (codes.size < count) {
      const wanted = count - codes.size;
      const drawn = Array.from({ length: wanted }, () => this.codes.next());
      const taken = new Set(
        (
          await this.prisma.parcel.findMany({
            where: { code: { in: drawn } },
            select: { code: true },
          })
        ).map((parcel) => parcel.code),
      );
      for (const code of drawn) if (!taken.has(code)) codes.add(code);
    }
    return [...codes];
  }

  private async viewOf(importId: string): Promise<ParcelImportView> {
    const found = await this.prisma.parcelImport.findUniqueOrThrow({
      where: { id: importId },
      include: { parcels: { orderBy: { importLine: 'asc' } } },
    });
    return {
      id: found.id,
      fileName: found.fileName,
      parcelCount: found.parcelCount,
      createdAt: found.createdAt,
      parcels: found.parcels.map((parcel) => ({
        line: parcel.importLine!,
        code: parcel.code,
        recipientName: parcel.recipientName,
        codAmountMillimes: parcel.codAmountMillimes,
      })),
    };
  }
}
