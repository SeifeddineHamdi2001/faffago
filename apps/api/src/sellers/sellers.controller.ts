import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Res,
  StreamableFile,
  UploadedFile,
  UploadedFiles,
  UseFilters,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor, FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import {
  DOCUMENT_FILE_EXTENSIONS,
  Permission,
  SELLER_DOCUMENT_POLICY,
  SELLER_MESSAGES,
  SellerAccountState,
  SellerErrorCode,
  SellerDocumentType,
  addSellerDocumentSchema,
  changeSellerContactSchema,
  changeSellerStatutSchema,
  createSellerSchema,
  setSellerCinSchema,
  type SetSellerCinValues,
  updateSellerSchema,
  type AddSellerDocumentValues,
  type ChangeSellerContactValues,
  type ChangeSellerStatutValues,
  type CreateSellerValues,
  type DocumentMimeType,
  type UpdateSellerValues,
} from '@faffago/shared';
import { CurrentPrincipal, Meta, RequirePermission } from '../auth/decorators';
import type { Principal, UserPrincipal } from '../auth/principal';
import type { RequestMeta } from '../auth/sessions.service';
import { apiError } from '../common/errors';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { SellersService, type Upload } from './sellers.service';
import { UploadErrorsFilter } from './upload-errors.filter';

/** Files are held in memory, never on disk in clear, and capped at 10 MB (D-32). */
const UPLOAD_LIMITS = { fileSize: SELLER_DOCUMENT_POLICY.maxBytes, fields: 20, fieldSize: 1024 };

/** On Créer un vendeur, each file comes under its document type. */
const DOCUMENT_FIELDS = Object.values(SellerDocumentType).map((name) => ({ name, maxCount: 1 }));

/** What multer hands over for each file, held in memory. */
interface UploadedDocument {
  buffer: Buffer;
}

type DocumentFiles = Partial<Record<SellerDocumentType, UploadedDocument[]>>;

function uploadsOf(files: DocumentFiles | undefined): Upload[] {
  const uploads: Upload[] = [];
  for (const [type, list] of Object.entries(files ?? {})) {
    const file = list?.[0];
    if (file) uploads.push({ type: type as SellerDocumentType, bytes: file.buffer });
  }
  return uploads;
}

/**
 * Vendeurs (Admin 4.14, D-11). Reading is open to Dépôt and Service client,
 * narrowed by the service; everything else is the admin's. The documents are
 * never behind a URL that works without an admin session (D-32).
 */
@Controller('sellers')
export class SellersController {
  constructor(private readonly sellers: SellersService) {}

  @Get()
  @RequirePermission(Permission.VENDEURS_LECTURE)
  list(@CurrentPrincipal() principal: Principal) {
    return this.sellers.list(principal.role);
  }

  @Get(':id')
  @RequirePermission(Permission.VENDEURS_LECTURE)
  detail(@Param('id', ParseUUIDPipe) id: string, @CurrentPrincipal() principal: Principal) {
    return this.sellers.detail(principal.role, id);
  }

  /** Créer un vendeur: multipart, the fields beside one file per document type. */
  @Post()
  @RequirePermission(Permission.GERER_VENDEURS_COURSIERS)
  @UseFilters(UploadErrorsFilter)
  @UseInterceptors(FileFieldsInterceptor(DOCUMENT_FIELDS, { limits: UPLOAD_LIMITS }))
  create(
    @Body(new ZodValidationPipe(createSellerSchema)) body: CreateSellerValues,
    @UploadedFiles() files: DocumentFiles | undefined,
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
  ) {
    return this.sellers.create(principal as UserPrincipal, body, uploadsOf(files), meta);
  }

  @Patch(':id')
  @RequirePermission(Permission.GERER_VENDEURS_COURSIERS)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateSellerSchema)) body: UpdateSellerValues,
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
  ) {
    return this.sellers.update(principal as UserPrincipal, id, body, meta);
  }

  /** Changer le statut, with the new statut's document in the same request (D-33). */
  @Post(':id/statut')
  @RequirePermission(Permission.GERER_VENDEURS_COURSIERS)
  @HttpCode(200)
  @UseFilters(UploadErrorsFilter)
  @UseInterceptors(FileInterceptor('document', { limits: { ...UPLOAD_LIMITS, files: 1 } }))
  changeStatut(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(changeSellerStatutSchema)) body: ChangeSellerStatutValues,
    @UploadedFile() file: UploadedDocument | undefined,
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
  ) {
    return this.sellers.changeStatut(
      principal as UserPrincipal,
      id,
      body,
      file?.buffer ?? null,
      meta,
    );
  }

  /**
   * Changer de contact (D-42): the new person's CIN front and back in the same
   * request. Any other file is refused.
   */
  @Post(':id/contact')
  @RequirePermission(Permission.GERER_VENDEURS_COURSIERS)
  @HttpCode(200)
  @UseFilters(UploadErrorsFilter)
  @UseInterceptors(FileFieldsInterceptor(DOCUMENT_FIELDS, { limits: UPLOAD_LIMITS }))
  changeContact(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(changeSellerContactSchema)) body: ChangeSellerContactValues,
    @UploadedFiles() files: DocumentFiles | undefined,
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
  ) {
    return this.sellers.changeContact(principal as UserPrincipal, id, body, uploadsOf(files), meta);
  }

  @Post(':id/suspend')
  @RequirePermission(Permission.GERER_VENDEURS_COURSIERS)
  @HttpCode(200)
  suspend(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
  ) {
    return this.sellers.setAccountState(
      principal as UserPrincipal,
      id,
      SellerAccountState.SUSPENDU,
      meta,
    );
  }

  @Post(':id/reactivate')
  @RequirePermission(Permission.GERER_VENDEURS_COURSIERS)
  @HttpCode(200)
  reactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
  ) {
    return this.sellers.setAccountState(
      principal as UserPrincipal,
      id,
      SellerAccountState.ACTIF,
      meta,
    );
  }

  /** Numéro de CIN (D-89): admin only, like the documents; audited. */
  @Put(':id/cin')
  @RequirePermission(Permission.VENDEURS_DOCUMENTS)
  setCin(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(setSellerCinSchema)) body: SetSellerCinValues,
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
  ) {
    return this.sellers.setCinNumber(principal as UserPrincipal, id, body.cinNumber, meta);
  }

  /** A new version of a document; the old one is kept (D-32). */
  @Post(':id/documents')
  @RequirePermission(Permission.VENDEURS_DOCUMENTS)
  @UseFilters(UploadErrorsFilter)
  @UseInterceptors(FileInterceptor('document', { limits: { ...UPLOAD_LIMITS, files: 1 } }))
  addDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(addSellerDocumentSchema)) body: AddSellerDocumentValues,
    @UploadedFile() file: UploadedDocument | undefined,
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
  ) {
    if (!file) {
      throw apiError(400, SellerErrorCode.DOCUMENT_MANQUANT, SELLER_MESSAGES.fichierObligatoire);
    }
    return this.sellers.addDocument(principal as UserPrincipal, id, body.type, file.buffer, meta);
  }

  /**
   * The document itself, decrypted, for the admin only; every view audited.
   * `no-store` keeps it out of every cache, `nosniff` stops a browser from
   * reading it as anything but its declared type.
   */
  @Get(':id/documents/:documentId')
  @RequirePermission(Permission.VENDEURS_DOCUMENTS)
  async document(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const { bytes, document } = await this.sellers.readDocument(
      principal as UserPrincipal,
      id,
      documentId,
      meta,
    );
    const name = document.type.toLowerCase().replace(/_/g, '-');
    const extension = DOCUMENT_FILE_EXTENSIONS[document.mimeType as DocumentMimeType];
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(bytes, {
      type: document.mimeType,
      disposition: `inline; filename="${name}.${extension}"`,
      length: bytes.length,
    });
  }
}
