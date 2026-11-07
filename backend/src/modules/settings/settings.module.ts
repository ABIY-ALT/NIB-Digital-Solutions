import { Global, Module } from '@nestjs/common';
import { SETTINGS } from '#core/application/ports/settings.port.js';
import { SETTING_STORE, SettingsService } from './application/settings.service.js';
import { PrismaSettingStore } from './infrastructure/prisma-setting.store.js';
import { SettingsController } from './presentation/settings.controller.js';

/**
 * Runtime settings an administrator changes while the product runs (company
 * details, money and date formats, mail and document texts). Global so any
 * feature can inject SETTINGS to read values or define its own settings.
 */
@Global()
@Module({
  controllers: [SettingsController],
  providers: [
    { provide: SETTING_STORE, useClass: PrismaSettingStore },
    SettingsService,
    { provide: SETTINGS, useExisting: SettingsService },
  ],
  // SettingsService is exported for features that let their own administrators
  // change their own settings (under their own permission), e.g. the hero carousel.
  exports: [SETTINGS, SettingsService],
})
export class SettingsModule {}
