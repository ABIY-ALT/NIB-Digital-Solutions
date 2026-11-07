import type { Page } from '#core/domain/pagination.js';
import type { Principal } from '../security/principal.js';

/**
 * Record pickers. Any module can expose its records to the shared picker UI by
 * registering an OptionSource at startup:
 *
 *   onModuleInit() { this.options.register(new RoleOptionSource(this.roles)); }
 *
 * GET /options/{source} then serves searchable, paginated options for it, and
 * resolves already-selected values back to labels (?values=a,b). A source key
 * may take a variant after a dot ("refdata.branches" → source "refdata",
 * variant "branches") so one source can serve many lists.
 */
export interface OptionItem {
  /** What gets stored (a code or an id). */
  value: string;
  label: string;
  /** Secondary line under the label. */
  description: string | null;
  /** Short trailing text (e.g. the code next to a name). */
  hint: string | null;
  /** Optional group heading. */
  group: string | null;
  /** Shown but not selectable (e.g. an inactive item that is still assigned). */
  disabled: boolean;
}

export interface OptionsRequest {
  page: number;
  pageSize: number;
  search?: string;
  /** Resolve these values (labels for current selections); search/paging are ignored. */
  values?: string[];
  /** Parent filter for hierarchical lists (e.g. branches of a region). */
  parent?: string;
  locale?: string;
}

export interface OptionSource {
  /** Registry key, e.g. "roles", "users", "refdata". */
  readonly key: string;
  /**
   * The caller needs AT LEAST ONE of these permissions (any scope). Empty =
   * any signed-in user. Row-level scoping belongs in `find`.
   */
  readonly permissions: readonly string[];
  /** True when the source expects a variant ("refdata.branches"). */
  readonly requiresVariant?: boolean;
  find(principal: Principal, request: OptionsRequest, variant?: string): Promise<Page<OptionItem>>;
}

export interface OptionSourceRegistry {
  register(source: OptionSource): void;
  get(key: string): OptionSource | undefined;
  list(): OptionSource[];
}

export const OPTION_SOURCES = Symbol('OptionSourceRegistry');

/** Fills the optional OptionItem fields. */
export const option = (
  value: string,
  label: string,
  extra: Partial<Omit<OptionItem, 'value' | 'label'>> = {},
): OptionItem => ({
  value,
  label,
  description: extra.description ?? null,
  hint: extra.hint ?? null,
  group: extra.group ?? null,
  disabled: extra.disabled ?? false,
});
