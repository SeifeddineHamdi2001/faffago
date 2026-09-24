import { Module } from '@nestjs/common';
import { ProfileController } from './profile.controller';
import { SellerDocumentsService } from './seller-documents.service';
import { SellersController } from './sellers.controller';
import { SellersService } from './sellers.service';

@Module({
  controllers: [SellersController, ProfileController],
  providers: [SellersService, SellerDocumentsService],
})
export class SellersModule {}
