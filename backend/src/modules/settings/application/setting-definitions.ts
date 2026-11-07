import type { SettingDefinition, SettingValue } from '#core/application/ports/settings.port.js';
import type { FieldIssue } from '#core/domain/errors/app-error.js';

/** Settings the framework ships with. Features add their own with `settings.define()`. */
export const CORE_SETTINGS: readonly SettingDefinition[] = [
  // ── Company: printed on documents and e-mails ─────────────────────────────
  {
    key: 'company.name',
    group: 'company',
    type: 'string',
    label: 'Company name',
    default: 'NIB International Bank',
    required: true,
    max: 120,
    public: true,
  },
  {
    key: 'company.legalName',
    group: 'company',
    type: 'string',
    label: 'Legal name',
    description: 'Shown under the name on documents.',
    default: 'NIB International Bank S.C.',
    max: 160,
  },
  {
    key: 'company.logo',
    group: 'company',
    type: 'image',
    label: 'Logo',
    description: 'PNG or JPEG, up to 200 KB. Printed at the top of documents.',
    default: null,
    max: 280_000,
    public: true,
  },
  {
    key: 'company.address',
    group: 'company',
    type: 'text',
    label: 'Address',
    default: 'Ras Abebe Aregay Street, Addis Ababa, Ethiopia',
    max: 400,
  },
  { key: 'company.phone', group: 'company', type: 'string', label: 'Phone', default: '', max: 40 },
  { key: 'company.email', group: 'company', type: 'email', label: 'E-mail', default: '' },
  { key: 'company.website', group: 'company', type: 'url', label: 'Website', default: '' },
  {
    key: 'company.taxNumber',
    group: 'company',
    type: 'string',
    label: 'Tax identification number',
    default: '',
    max: 40,
  },

  // ── Formats: money and dates everywhere ───────────────────────────────────
  {
    key: 'format.currencyCode',
    group: 'format',
    type: 'string',
    label: 'Currency',
    description: 'ISO code shown next to amounts, e.g. ETB.',
    default: 'ETB',
    required: true,
    min: 3,
    max: 3,
    public: true,
  },
  {
    key: 'format.currencyPosition',
    group: 'format',
    type: 'select',
    label: 'Currency position',
    options: ['before', 'after'],
    default: 'before',
    public: true,
  },
  {
    key: 'format.decimalSeparator',
    group: 'format',
    type: 'select',
    label: 'Decimal separator',
    options: ['.', ','],
    default: '.',
    public: true,
  },
  {
    key: 'format.thousandSeparator',
    group: 'format',
    type: 'select',
    label: 'Thousand separator',
    options: ['comma', 'dot', 'space', 'none'],
    default: 'comma',
    public: true,
  },
  {
    key: 'format.decimals',
    group: 'format',
    type: 'number',
    label: 'Decimal places',
    default: 2,
    min: 0,
    max: 4,
    public: true,
  },
  {
    key: 'format.dateFormat',
    group: 'format',
    type: 'select',
    label: 'Date format',
    options: ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'],
    default: 'DD/MM/YYYY',
    public: true,
  },
  {
    key: 'format.timeZone',
    group: 'format',
    type: 'string',
    label: 'Time zone',
    description: 'IANA name, e.g. Africa/Addis_Ababa. Used for dates on documents and e-mails.',
    default: 'Africa/Addis_Ababa',
    required: true,
    max: 64,
    public: true,
  },

  // ── Mail ──────────────────────────────────────────────────────────────────
  {
    key: 'mail.fromName',
    group: 'mail',
    type: 'string',
    label: 'Sender name',
    description: 'Name recipients see. The sender address comes from the server configuration.',
    default: 'NIB Digital Solutions',
    required: true,
    max: 80,
  },
  {
    key: 'mail.replyTo',
    group: 'mail',
    type: 'email',
    label: 'Reply-to address',
    description: 'Where replies go. Leave empty to use the sender address.',
    default: '',
  },
  {
    key: 'mail.footer',
    group: 'mail',
    type: 'text',
    label: 'Footer',
    description: 'Closing lines of every e-mail (confidentiality notice, contact details).',
    default:
      'This message was sent by an automated system. If you did not expect it, contact the bank.',
    max: 600,
  },

  // ── Documents (PDF) ───────────────────────────────────────────────────────
  {
    key: 'documents.pageSize',
    group: 'documents',
    type: 'select',
    label: 'Page size',
    options: ['A4', 'LETTER'],
    default: 'A4',
  },
  {
    key: 'documents.accentColor',
    group: 'documents',
    type: 'color',
    label: 'Accent colour',
    description: 'Colour of headings and rules on documents.',
    default: '#8B4E20',
  },
  {
    key: 'documents.footer',
    group: 'documents',
    type: 'text',
    label: 'Footer',
    default:
      'This is a computer generated document and does not require a signature. Please retain it for your records.',
    max: 400,
  },
];

const KEY = /^[a-z][a-z0-9]*\.[a-zA-Z][a-zA-Z0-9]*$/;
// name@domain.tld; the domain dot is the first one after its first character, so no backtracking.
const EMAIL = /^[^\s@]+@[^\s@][^\s@.]*\.[^\s@]+$/;
const COLOR = /^#[0-9a-fA-F]{6}$/;
const IMAGE = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+=*$/;

export function assertDefinition(definition: SettingDefinition): void {
  if (!KEY.test(definition.key) || !definition.key.startsWith(`${definition.group}.`)) {
    throw new Error(
      `Invalid setting key "${definition.key}" (expected "${definition.group}.name")`,
    );
  }
  if (definition.type === 'select' && !definition.options?.length) {
    throw new Error(`Setting "${definition.key}" is a select without options`);
  }
  const issue = validateSetting(definition, definition.default);
  // Optional settings may default to empty; anything else must be a valid value.
  if (issue && !(isEmpty(definition.default) && !definition.required)) {
    throw new Error(`Default of setting "${definition.key}" is invalid: ${issue}`);
  }
}

const isEmpty = (value: SettingValue): boolean => value === null || value === '';

/** Returns what is wrong with `value` for this setting, or null when it is acceptable. */
export function validateSetting(definition: SettingDefinition, value: SettingValue): string | null {
  if (isEmpty(value)) return definition.required ? 'A value is required' : null;
  if (definition.type === 'boolean') {
    return typeof value === 'boolean' ? null : 'Must be true or false';
  }
  if (definition.type === 'number') return numberIssue(definition, value);
  return typeof value === 'string' ? textIssue(definition, value) : 'Must be text';
}

function numberIssue({ min, max }: SettingDefinition, value: SettingValue): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'Must be a number';
  if (min !== undefined && value < min) return `Must be at least ${min}`;
  if (max !== undefined && value > max) return `Must be at most ${max}`;
  return null;
}

function textIssue(definition: SettingDefinition, value: string): string | null {
  const { type, min, max } = definition;
  if (min !== undefined && value.length < min) return `Must be at least ${min} characters`;
  if (value.length > (max ?? (type === 'text' ? 2000 : 255))) return 'Too long';

  switch (type) {
    case 'select':
      return definition.options!.includes(value) ? null : 'Not one of the allowed values';
    case 'email':
      return EMAIL.test(value) ? null : 'Not a valid e-mail address';
    case 'url':
      return /^https?:\/\/\S+$/.test(value) ? null : 'Must start with http:// or https://';
    case 'color':
      return COLOR.test(value) ? null : 'Use a 6-digit hex colour, e.g. #8B4E20';
    case 'image':
      return IMAGE.test(value) ? null : 'Must be a PNG or JPEG image';
    default:
      return null;
  }
}

/** Empty text is stored as the empty value of the setting's type. */
export function normaliseSetting(definition: SettingDefinition, value: SettingValue): SettingValue {
  if (typeof value === 'string') {
    const trimmed = definition.type === 'image' ? value : value.trim();
    if (trimmed === '') return definition.type === 'image' ? null : '';
    return trimmed;
  }
  return value;
}

export function validateSettings(
  definitions: ReadonlyMap<string, SettingDefinition>,
  values: Record<string, SettingValue>,
): FieldIssue[] {
  const issues: FieldIssue[] = [];
  for (const [key, value] of Object.entries(values)) {
    const definition = definitions.get(key);
    if (!definition) {
      issues.push({ field: key, message: 'Unknown setting', code: 'UNKNOWN_SETTING' });
      continue;
    }
    const problem = validateSetting(definition, normaliseSetting(definition, value));
    if (problem) issues.push({ field: key, message: problem });
  }
  return issues;
}
