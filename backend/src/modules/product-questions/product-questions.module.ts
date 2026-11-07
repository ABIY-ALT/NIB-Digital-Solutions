import { Module } from '@nestjs/common';
import { DigitalProductsModule } from '../digital-products/digital-products.module.js';
import { ProductDevelopersModule } from '../product-developers/product-developers.module.js';
import { OutboxService } from './application/outbox.service.js';
import { ProductQuestionApprovalHandlers } from './application/product-question-approval.handlers.js';
import {
  DeleteProductQuestionUseCase,
  GetProductQuestionUseCase,
  ListProductQuestionsUseCase,
  UpdateProductQuestionUseCase,
} from './application/product-question.use-cases.js';
import { QuestionWorkflow } from './application/question-workflow.js';
import { TelegramBotService } from './application/telegram-bot.service.js';
import { PRODUCT_QUESTION_REPOSITORY } from './domain/product-question.repository.js';
import { PrismaProductQuestionRepository } from './infrastructure/prisma-product-question.repository.js';
import { BOT_STATE_STORE, OUTBOX_STORE, TELEGRAM_BOT_API } from './application/messaging.ports.js';
import { KvBotStateStore } from './infrastructure/kv-bot-state.store.js';
import { PrismaOutboxStore } from './infrastructure/prisma-outbox.store.js';
import { TelegramApiClient } from './infrastructure/telegram-api.client.js';
import {
  ProductQuestionsController,
  PublicQuestionsController,
  TelegramUpdatesController,
} from './presentation/product-questions.controller.js';

/**
 * "Ask the developer": customer questions about a product, routed to the
 * product's assigned developer on Telegram (or by e-mail), answered from
 * Telegram or the staff portal and delivered to the customer by e-mail, with
 * follow-ups on the same reference. Deliveries go through a retrying outbox.
 */
@Module({
  imports: [DigitalProductsModule, ProductDevelopersModule],
  controllers: [ProductQuestionsController, PublicQuestionsController, TelegramUpdatesController],
  providers: [
    { provide: PRODUCT_QUESTION_REPOSITORY, useClass: PrismaProductQuestionRepository },
    ListProductQuestionsUseCase,
    GetProductQuestionUseCase,
    UpdateProductQuestionUseCase,
    DeleteProductQuestionUseCase,
    ProductQuestionApprovalHandlers,
    { provide: TELEGRAM_BOT_API, useClass: TelegramApiClient },
    { provide: OUTBOX_STORE, useClass: PrismaOutboxStore },
    { provide: BOT_STATE_STORE, useClass: KvBotStateStore },
    OutboxService,
    QuestionWorkflow,
    TelegramBotService,
  ],
})
export class ProductQuestionsModule {}
