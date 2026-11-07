import { AppError, ConflictError } from '#core/domain/errors/app-error.js';
import { ErrorCode } from '#core/domain/errors/error-codes.js';

interface PrismaKnownError {
  code: string;
  meta?: Record<string, unknown>;
  message: string;
}

function isPrismaKnownError(error: unknown): error is PrismaKnownError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    /^P\d{4}$/.test((error as { code: string }).code)
  );
}

/**
 * Translates Prisma errors into AppErrors so no ORM detail leaks past the
 * infrastructure layer. Unknown errors are returned unchanged (→ INTERNAL_ERROR).
 */
export function translatePrismaError(error: unknown): unknown {
  if (error instanceof AppError || !isPrismaKnownError(error)) return error;

  switch (error.code) {
    case 'P2002': {
      const target = error.meta?.['target'];
      const fields = Array.isArray(target) ? target.map(String) : undefined;
      return new ConflictError('A record with the same unique value already exists.', {
        ...(fields ? { fields } : {}),
      });
    }
    case 'P2025':
      return new AppError(ErrorCode.NOT_FOUND, { cause: error });
    case 'P2034':
      return new AppError(ErrorCode.CONCURRENCY_CONFLICT, { cause: error });
    case 'P2003':
      return new ConflictError(
        'The operation references a record that does not exist or is still in use.',
      );
    default:
      return error;
  }
}
