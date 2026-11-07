import { BaseEntity, type EntityMetadata } from '#core/domain/base.entity.js';
import {
  BusinessRuleError,
  ValidationError,
  type FieldIssue,
} from '#core/domain/errors/app-error.js';
import { compareCodeUnits } from '#core/domain/strings.js';

export interface RoleProps {
  code: string;
  name: string;
  description: string | null;
  /** System roles ship with the framework: they cannot be deleted or renamed. */
  isSystem: boolean;
  permissionCodes: string[];
  /** Read model: how many users currently hold the role. */
  userCount: number;
}

const CODE = /^[A-Z][A-Z0-9_]{1,63}$/;
const PERMISSION = /^(\*|[a-z][a-z0-9-]*:(\*|[a-z][a-z0-9-]*)(:[a-z][a-z0-9-]*)?)$/;

/**
 * Role aggregate (RBAC). A role bundles permission codes; users get their
 * effective permissions through the roles they hold. Pure TypeScript.
 */
export class Role extends BaseEntity {
  private constructor(
    meta: EntityMetadata,
    private readonly props: RoleProps,
  ) {
    super(meta);
  }

  static create(
    input: { code: string; name: string; description?: string | null; permissionCodes: string[] },
    actorId: string | null,
  ): Role {
    const code = input.code.trim().toUpperCase();
    const issues: FieldIssue[] = [];
    if (!CODE.test(code)) {
      issues.push({ field: 'code', message: 'Use 2–64 uppercase letters, digits or underscores' });
    }
    if (input.name.trim().length < 2) issues.push({ field: 'name', message: 'Name is required' });
    issues.push(...Role.validatePermissions(input.permissionCodes));
    if (issues.length) throw new ValidationError(issues);

    const role = new Role(BaseEntity.newMetadata(actorId), {
      code,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      isSystem: false,
      permissionCodes: [...new Set(input.permissionCodes)].sort(compareCodeUnits),
      userCount: 0,
    });
    role.addEvent('role.created', { roleId: role.id, code });
    return role;
  }

  static reconstitute(meta: EntityMetadata, props: RoleProps): Role {
    return new Role(meta, props);
  }

  private static validatePermissions(codes: string[]): FieldIssue[] {
    const bad = codes.filter((c) => !PERMISSION.test(c));
    return bad.length
      ? [{ field: 'permissions', message: `Invalid permission codes: ${bad.join(', ')}` }]
      : [];
  }

  get code(): string {
    return this.props.code;
  }
  get name(): string {
    return this.props.name;
  }
  get description(): string | null {
    return this.props.description;
  }
  get isSystem(): boolean {
    return this.props.isSystem;
  }
  get permissionCodes(): readonly string[] {
    return this.props.permissionCodes;
  }
  get userCount(): number {
    return this.props.userCount;
  }

  update(
    changes: { name?: string; description?: string | null; permissionCodes?: string[] },
    actorId: string | null,
  ): void {
    if (changes.name !== undefined) {
      if (this.props.isSystem && changes.name.trim() !== this.props.name) {
        throw new BusinessRuleError('System roles cannot be renamed.', 'SYSTEM_ROLE_IMMUTABLE');
      }
      if (changes.name.trim().length < 2) {
        throw new ValidationError([{ field: 'name', message: 'Name is required' }]);
      }
      this.props.name = changes.name.trim();
    }
    if (changes.description !== undefined)
      this.props.description = changes.description?.trim() || null;
    if (changes.permissionCodes !== undefined) {
      if (this.props.isSystem && this.props.permissionCodes.includes('*')) {
        throw new BusinessRuleError(
          'The super-user role always keeps every permission.',
          'SUPER_ROLE_IMMUTABLE',
        );
      }
      const issues = Role.validatePermissions(changes.permissionCodes);
      if (issues.length) throw new ValidationError(issues);
      this.props.permissionCodes = [...new Set(changes.permissionCodes)].sort(compareCodeUnits);
    }
    this.touch(actorId);
  }

  override softDelete(actorId: string | null): void {
    if (this.props.isSystem) {
      throw new BusinessRuleError('System roles cannot be deleted.', 'SYSTEM_ROLE_IMMUTABLE');
    }
    if (this.props.userCount > 0) {
      throw new BusinessRuleError(
        'Remove this role from all users before deleting it.',
        'ROLE_IN_USE',
      );
    }
    super.softDelete(actorId);
  }

  toSnapshot(): Readonly<RoleProps> {
    return { ...this.props, permissionCodes: [...this.props.permissionCodes] };
  }
}
