import { Inject, Injectable } from '@nestjs/common';
import {
  OPTION_SOURCES,
  type OptionItem,
  type OptionSourceRegistry,
  type OptionsRequest,
} from '#core/application/ports/option-source.port.js';
import type { Principal } from '#core/application/security/principal.js';
import { ForbiddenError, NotFoundError } from '#core/domain/errors/app-error.js';
import type { Page } from '#core/domain/pagination.js';
import { AuthorizationService } from '#modules/authorization/application/authorization.service.js';

/**
 * Serves record-picker options from the registered sources: resolves
 * "key.variant", enforces the source's permissions (denials are audited), and
 * delegates. Sources apply their own row-level scoping.
 */
@Injectable()
export class OptionsService {
  constructor(
    @Inject(OPTION_SOURCES) private readonly sources: OptionSourceRegistry,
    private readonly authz: AuthorizationService,
  ) {}

  async find(
    principal: Principal,
    sourceKey: string,
    request: OptionsRequest,
  ): Promise<Page<OptionItem>> {
    const dot = sourceKey.indexOf('.');
    const key = dot < 0 ? sourceKey : sourceKey.slice(0, dot);
    const variant = dot < 0 ? undefined : sourceKey.slice(dot + 1);
    const source = this.sources.get(key);
    if (!source || (source.requiresVariant && !variant) || (!source.requiresVariant && variant)) {
      throw new NotFoundError('OptionSource', sourceKey);
    }
    if (
      source.permissions.length > 0 &&
      !source.permissions.some((p) => this.authz.hasPermission(principal, p))
    ) {
      this.authz.recordDenial(principal, source.permissions.join('|'), {
        type: 'OptionSource',
        id: sourceKey,
      });
      throw new ForbiddenError();
    }
    return source.find(principal, request, variant);
  }

  /** Sources the caller may use (for discovery / docs). */
  available(principal: Principal): Array<{ key: string; requiresVariant: boolean }> {
    return this.sources
      .list()
      .filter(
        (s) =>
          s.permissions.length === 0 ||
          s.permissions.some((p) => this.authz.hasPermission(principal, p)),
      )
      .map((s) => ({ key: s.key, requiresVariant: !!s.requiresVariant }));
  }
}
