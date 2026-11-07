import { VersioningType, type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import type { AppConfig } from '#config/app-config.js';
import { DefaultErrorMessages, ErrorCode } from '#core/domain/errors/error-codes.js';
import { trimWhere } from '#core/domain/strings.js';
import { SignatureHeaders } from '#core/infrastructure/crypto/request-signature.js';
import {
  CORRELATION_HEADER,
  resolveCorrelationId,
} from '#core/presentation/middleware/correlation-id.middleware.js';
import { apiSchemaComponents } from '#core/presentation/openapi/api-schema.js';

/** Routes served without the global API prefix (probes for load balancers and orchestrators). */
export const UNPREFIXED_ROUTES = ['health/live', 'health/ready'];

/**
 * HTTP hardening and conventions shared by main.ts and e2e tests.
 */
export function setupApp(app: NestExpressApplication, config: AppConfig): void {
  app.set('trust proxy', config.app.trustProxy);
  app.disable('x-powered-by');
  app.useBodyParser('json', { limit: config.app.bodyLimit });
  app.useBodyParser('urlencoded', { limit: config.app.bodyLimit, extended: false });

  // Security headers. The API serves JSON only, so the CSP is maximally strict,
  // except for the Swagger UI page which needs its own scripts and styles.
  const apiHelmet = helmet({
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
    // Browsers never load anything from the backend (only the BFF calls it).
    crossOriginResourcePolicy: { policy: 'same-origin' },
    hsts: config.app.isProduction
      ? { maxAge: 31_536_000, includeSubDomains: true, preload: true }
      : false,
  });
  const docsHelmet = helmet({ contentSecurityPolicy: false });
  const docsPrefix = `/${config.docs.path}`;
  app.use((req: Request, res: Response, next: NextFunction) =>
    req.path.startsWith(docsPrefix) ? docsHelmet(req, res, next) : apiHelmet(req, res, next),
  );
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  // Paths outside the API, its probes and its docs have no route. Nest's
  // not-found handler covers only the global prefix, so Express would answer
  // them with its HTML "Cannot GET /x" page, which names the framework that
  // dropping X-Powered-By hides. Answer with the standard error envelope.
  const routed = [
    `/${trimWhere(config.app.apiPrefix, (c) => c === '/')}`,
    ...UNPREFIXED_ROUTES.map((route) => `/${route}`),
  ];
  app.use((req: Request, res: Response, next: NextFunction) => {
    const path = req.path;
    if (
      routed.some((prefix) => path === prefix || path.startsWith(`${prefix}/`)) ||
      (config.docs.enabled && path.startsWith(docsPrefix))
    ) {
      next();
      return;
    }
    const correlationId = resolveCorrelationId(req);
    res.setHeader(CORRELATION_HEADER, correlationId);
    res.status(404).json({
      success: false,
      error: { code: ErrorCode.ROUTE_NOT_FOUND, message: DefaultErrorMessages.ROUTE_NOT_FOUND },
      correlationId,
      timestamp: new Date().toISOString(),
      path,
    });
  });

  // CORS: only the registered BFF origins (browsers never call the backend directly).
  const allowed = new Set(config.security.corsOrigins);
  app.enableCors({
    origin: (origin, cb) => cb(null, !origin || allowed.has(origin)),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: [
      'content-type',
      'authorization',
      'idempotency-key',
      'x-appcore-encrypted',
      'x-appcore-client-ua',
      ...Object.values(SignatureHeaders),
    ],
    exposedHeaders: [
      'x-correlation-id',
      'x-appcore-encrypted',
      'retry-after',
      'idempotent-replayed',
    ],
    credentials: false,
    maxAge: 600,
  });

  app.setGlobalPrefix(config.app.apiPrefix, { exclude: UNPREFIXED_ROUTES });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: config.app.defaultVersion });
  app.enableShutdownHooks();
}

/**
 * The OpenAPI document = the shared API contract. Controllers + Zod schemas
 * produce it; named DTO schemas (apiSchema) and the error-code catalogue are
 * added as components so the frontend can generate its types from it.
 */
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('AppCore API')
      .setDescription(
        [
          'AppCore backend API for NIB digital products.',
          '',
          'All `/api` endpoints are called by the BFF and require the service signature headers',
          '(`X-AppCore-Client-Id`, `X-AppCore-Timestamp`, `X-AppCore-Nonce`, `X-AppCore-Signature`).',
          'Protected endpoints additionally require `Authorization: Bearer <access token>`.',
          'Responses use the standard envelope `{ success, data, message, meta, correlationId, timestamp }`;',
          'errors use `{ success: false, error: { code, message, details }, correlationId }`.',
          'A `202 Accepted` response means the change was submitted for maker–checker approval.',
        ].join('\n'),
      )
      .setVersion('1.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'bearer')
      .build(),
  );
  document.components = {
    ...document.components,
    schemas: {
      ...document.components?.schemas,
      ...apiSchemaComponents(),
      ErrorCode: { type: 'string', enum: Object.values(ErrorCode) },
    },
  };
  return document;
}

/** Serves the interactive documentation and the raw contract (`/docs/openapi.json`). */
export function setupSwagger(app: INestApplication, config: AppConfig): void {
  if (!config.docs.enabled) return;
  SwaggerModule.setup(config.docs.path, app, buildOpenApiDocument(app), {
    jsonDocumentUrl: `${config.docs.path}/openapi.json`,
    swaggerOptions: { persistAuthorization: false, displayRequestDuration: true },
  });
}
