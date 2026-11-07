import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { pageOptions } from '#core/application/option-paging.js';
import {
  OPTION_SOURCES,
  option,
  type OptionItem,
  type OptionSource,
  type OptionSourceRegistry,
  type OptionsRequest,
} from '#core/application/ports/option-source.port.js';
import type { Page } from '#core/domain/pagination.js';
import { ReferenceDataUseCases } from './reference-data.use-cases.js';

/**
 * "refdata.<list>" picker source (value = item code), e.g. "refdata.branches".
 * Served from the cached lookup in the caller's locale; open to any signed-in
 * user like the lookup API. Search offers effective items only, while
 * resolving a saved value also finds inactive ones (shown as disabled).
 */
@Injectable()
export class ReferenceDataOptionSource implements OptionSource, OnModuleInit {
  readonly key = 'refdata';
  readonly permissions = [] as const;
  readonly requiresVariant = true;

  constructor(
    @Inject(OPTION_SOURCES) private readonly registry: OptionSourceRegistry,
    private readonly refdata: ReferenceDataUseCases,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async find(
    _principal: unknown,
    request: OptionsRequest,
    type?: string,
  ): Promise<Page<OptionItem>> {
    const items = await this.refdata.lookup(type!, {
      locale: request.locale,
      parentCode: request.parent,
      includeInactive: !!request.values,
    });
    return pageOptions(
      items.map((i) =>
        option(i.code, i.label, {
          hint: i.code,
          description: i.description,
          disabled: !i.active,
        }),
      ),
      request,
    );
  }
}
