/**
 * The shared API contract, generated from the backend's OpenAPI document
 * (contracts/openapi.json). Feature types alias these instead of re-declaring
 * backend shapes, so a backend change the UI does not follow fails the
 * typecheck (and `npm run api:check` in CI).
 *
 *   export type Role = ApiSchemas['Role'];
 *   api.get<ApiData<'GET /roles/{id}'>>(`/roles/${id}`)
 */
export type {
  ApiBody,
  ApiData,
  ApiErrorCode,
  ApiOperation,
  ApiOperations,
  ApiQuery,
  ApiSchemas,
} from './contract.gen';
export { API_ERROR_CODES, CONTRACT_HASH } from './contract.gen';
