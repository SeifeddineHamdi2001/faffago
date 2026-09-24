import { Module } from '@nestjs/common';
import { SellerDocumentsService } from './seller-documents.service';
import { SellersController } from './sellers.controller';
import { SellersService } from './sellers.service';

@Module({
  controllers: [SellersController],
  providers: [SellersService, SellerDocumentsService],
})
export class SellersModule {}
