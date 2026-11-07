import { applyDecorators } from '@nestjs/common';
import { ApiHeader, ApiResponse, ApiSecurity } from '@nestjs/swagger';
import { isApiSchema, type ApiSchema } from '../openapi/api-schema.js';

const errorSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: false },
    error: {
      type: 'object',
      properties: {
        code: { type: 'string', example: 'VALIDATION_FAILED' },
        message: { type: 'string' },
        details: { type: 'object' },
      },
    },
    correlationId: { type: 'string' },
    timestamp: { type: 'string', format: 'date-time' },
    path: { type: 'string' },
  },
};

/**
 * Documents the standard success envelope around `data`. Pass a named
 * `apiSchema(...)` so the response type becomes part of the shared contract.
 */
export function ApiEnvelope(
  status: number,
  description: string,
  data?: Record<string, unknown> | ApiSchema,
  paginated = false,
): MethodDecorator {
  const schema = data ?? { type: 'object' };
  const dataSchema = isApiSchema(schema) ? schema.ref : schema;
  return applyDecorators(
    ApiResponse({
      status,
      description,
      schema: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          data: paginated ? { type: 'array', items: dataSchema } : dataSchema,
          message: { type: 'string', nullable: true },
          meta: paginated
            ? {
                type: 'object',
                properties: {
                  pagination: {
                    type: 'object',
                    required: [
                      'page',
                      'pageSize',
                      'totalItems',
                      'totalPages',
                      'hasNextPage',
                      'hasPreviousPage',
                    ],
                    properties: {
                      page: { type: 'integer' },
                      pageSize: { type: 'integer' },
                      totalItems: { type: 'integer' },
                      totalPages: { type: 'integer' },
                      hasNextPage: { type: 'boolean' },
                      hasPreviousPage: { type: 'boolean' },
                    },
                  },
                },
                required: ['pagination'],
              }
            : { type: 'object' },
          correlationId: { type: 'string' },
          timestamp: { type: 'string', format: 'date-time' },
        },
        required: [
          'success',
          'data',
          'message',
          'correlationId',
          'timestamp',
          ...(paginated ? ['meta'] : []),
        ],
      },
    }),
  );
}

/** Standard error responses every protected endpoint may return. */
export function ApiStandardErrors(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiResponse({ status: 400, description: 'Validation failed', schema: errorSchema }),
    ApiResponse({
      status: 401,
      description: 'Unauthenticated / service auth failed',
      schema: errorSchema,
    }),
    ApiResponse({ status: 403, description: 'Forbidden', schema: errorSchema }),
    ApiResponse({ status: 429, description: 'Rate limited', schema: errorSchema }),
    ApiResponse({ status: 500, description: 'Internal error', schema: errorSchema }),
  );
}

/** Marks an endpoint as requiring the end-user bearer token. */
export const ApiAuth = (): MethodDecorator & ClassDecorator =>
  applyDecorators(ApiSecurity('bearer'));

export const ApiIdempotencyKey = (): MethodDecorator =>
  applyDecorators(
    ApiHeader({
      name: 'Idempotency-Key',
      required: true,
      description:
        'Client-generated unique key (8–128 chars). Retries with the same key replay the first result.',
    }),
  );
