/**
 * One use case = one class = one business operation (principle 6).
 * Use cases orchestrate domain entities through ports; they never touch HTTP,
 * Prisma or Redis directly.
 */
export interface UseCase<TInput, TOutput> {
  execute(input: TInput): Promise<TOutput>;
}
