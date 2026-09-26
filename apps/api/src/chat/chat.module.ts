import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ChatThreadsService } from './chat-threads.service';

/**
 * The parcel chat (phase 10A). It depends on nothing but the database and the
 * notifications, so the parcel event service can open a thread without a cycle.
 */
@Module({
  controllers: [ChatController],
  providers: [ChatService, ChatThreadsService],
  exports: [ChatService, ChatThreadsService],
})
export class ChatModule {}
