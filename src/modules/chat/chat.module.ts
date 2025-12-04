// src/modules/chat/chat.module.ts
import { Module } from '@nestjs/common';
import {
  ChatController,
  DeepSeekController,
  GPTController,
  VertexAITTSController,
} from './chat.controller';
import { ChatService } from './chat.service';

@Module({
  controllers: [
    ChatController,
    DeepSeekController,
    GPTController,
    VertexAITTSController,
  ],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}
