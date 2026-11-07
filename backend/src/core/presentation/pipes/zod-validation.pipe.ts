import { applyDecorators, Injectable, type PipeTransform } from '@nestjs/common';
import { ApiBody } from '@nestjs/swagger';
import { z, type ZodType } from 'zod';
import { ValidationError } from '#core/domain/errors/app-error.js';

/**
 * Validates and transforms input with a Zod schema. Every endpoint validates its
 * inputs BEFORE any processing (body, params and query).
 *
 *   @Post() create(@Body(zod(CreateUserSchema)) body: CreateUserInput) {}
 */
@Injectable()
export class ZodValidationPipe<T extends ZodType> implements PipeTransform<unknown, z.output<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.output<T> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new ValidationError(
        result.error.issues.map((i) => ({
          field: i.path.join('.') || '(root)',
          message: i.message,
          code: i.code,
        })),
      );
    }
    return result.data;
  }
}

export const zod = <T extends ZodType>(schema: T): ZodValidationPipe<T> =>
  new ZodValidationPipe(schema);

/** Converts a Zod schema to an OpenAPI 3.0 schema object for Swagger. */
export function toOpenApiSchema(
  schema: ZodType,
  io: 'input' | 'output' = 'input',
): Record<string, unknown> {
  const json = z.toJSONSchema(schema, {
    target: 'openapi-3.0',
    io,
    unrepresentable: 'any',
  });
  const { $schema: _ignored, ...rest } = json as Record<string, unknown>;
  return rest;
}

/** Documents a request body from its Zod schema (single source of truth). */
export const ApiZodBody = (schema: ZodType, description?: string): MethodDecorator =>
  applyDecorators(ApiBody({ description, schema: toOpenApiSchema(schema) }));
