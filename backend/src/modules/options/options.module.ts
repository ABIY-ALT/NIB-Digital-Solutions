import { Module } from '@nestjs/common';
import { OptionsService } from './application/options.service.js';
import { OptionsController } from './presentation/options.controller.js';

/**
 * Record-picker API (GET /options/{source}). Sources are registered by the
 * modules that own the records, through the core OPTION_SOURCES registry.
 */
@Module({
  controllers: [OptionsController],
  providers: [OptionsService],
})
export class OptionsModule {}
