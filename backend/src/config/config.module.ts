import { Global, Inject, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { buildAppConfig, type AppConfig } from './app-config.js';
import { validateEnv } from './env.schema.js';

export const APP_CONFIG = Symbol('APP_CONFIG');

/** Injects the typed, validated AppConfig. */
export const InjectConfig = (): ParameterDecorator & PropertyDecorator => Inject(APP_CONFIG);

/**
 * Loads `.env`, validates it against the Zod schema and exposes a typed,
 * frozen AppConfig. An invalid environment aborts startup.
 */
@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['.env.local', '.env'],
      // Validate eagerly (fail fast) but keep the raw strings in process.env;
      // the typed AppConfig below is built from the validated result.
      validate: (raw) => {
        validateEnv(raw);
        return raw;
      },
    }),
  ],
  providers: [
    {
      provide: APP_CONFIG,
      useFactory: (): AppConfig => Object.freeze(buildAppConfig(validateEnv(process.env))),
    },
  ],
  exports: [APP_CONFIG],
})
export class AppConfigModule {}
