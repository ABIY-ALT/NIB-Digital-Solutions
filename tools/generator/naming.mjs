/**
 * Naming helpers and field parsing for the AppCore feature generator.
 *   loan-products → { kebab: 'loan-products', singularKebab: 'loan-product',
 *                     Pascal: 'LoanProduct', Plural: 'LoanProducts', camel: 'loanProduct',
 *                     camelPlural: 'loanProducts', table: 'loan_products', title: 'Loan products' }
 */
const words = (s) => s.split('-').filter(Boolean);
const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1);

export function singularize(word) {
  if (/ies$/.test(word)) return word.replace(/ies$/, 'y');
  if (/(ses|xes|zes|ches|shes)$/.test(word)) return word.replace(/es$/, '');
  if (/s$/.test(word) && !/ss$/.test(word)) return word.slice(0, -1);
  return word;
}

export function names(input, label) {
  const kebab = input.trim().toLowerCase();
  if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(kebab)) {
    throw new Error(`Feature name must be kebab-case and plural, e.g. "loan-products" (got "${input}")`);
  }
  const parts = words(kebab);
  const singularParts = [...parts.slice(0, -1), singularize(parts.at(-1))];
  const Pascal = singularParts.map(cap).join('');
  const Plural = parts.map(cap).join('');
  const title = label ?? cap(parts.join(' '));
  return {
    kebab,
    singularKebab: singularParts.join('-'),
    Pascal,
    Plural,
    camel: Pascal.charAt(0).toLowerCase() + Pascal.slice(1),
    camelPlural: Plural.charAt(0).toLowerCase() + Plural.slice(1),
    table: parts.join('_'),
    title,
    singularTitle: cap(singularParts.join(' ')),
    lowerSingular: singularParts.join(' '),
  };
}

export const FIELD_TYPES = ['string', 'text', 'int', 'number', 'boolean', 'date'];
const RESERVED = new Set([
  'id', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy', 'version', 'deletedAt', 'deletedBy',
]);

/** "code:string:required:unique,name:string:required,active:boolean" → field specs. */
export function parseFields(spec) {
  const fields = (spec ?? 'code:string:required:unique,name:string:required,description:text')
    .split(',')
    .map((f) => f.trim())
    .filter(Boolean)
    .map((raw) => {
      const [name, type = 'string', ...flags] = raw.split(':').map((s) => s.trim());
      if (!/^[a-z][a-zA-Z0-9]{0,39}$/.test(name)) throw new Error(`Invalid field name "${name}" (camelCase)`);
      if (RESERVED.has(name)) throw new Error(`"${name}" is a base-entity column and is always present`);
      if (!FIELD_TYPES.includes(type)) {
        throw new Error(`Unknown type "${type}" for "${name}". Use: ${FIELD_TYPES.join(', ')}`);
      }
      const unknown = flags.filter((f) => !['required', 'unique'].includes(f));
      if (unknown.length) throw new Error(`Unknown flag(s) ${unknown.join(', ')} on "${name}"`);
      return {
        name,
        type,
        // Booleans always have a value (default false).
        required: type === 'boolean' || flags.includes('required'),
        unique: flags.includes('unique'),
        column: name.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`),
        label: cap(name.replace(/[A-Z]/g, (c) => ` ${c.toLowerCase()}`)),
      };
    });
  if (fields.length === 0) throw new Error('At least one field is required');
  const dupes = fields.filter((f, i) => fields.findIndex((g) => g.name === f.name) !== i);
  if (dupes.length) throw new Error(`Duplicate field(s): ${dupes.map((f) => f.name).join(', ')}`);
  return fields;
}

/** TypeScript type of a field in the domain (dates as Date) or DTO (dates as ISO strings). */
export function tsType(f, layer = 'domain') {
  const base = { string: 'string', text: 'string', int: 'number', number: 'number', boolean: 'boolean', date: layer === 'domain' ? 'Date' : 'string' }[f.type];
  return f.required ? base : `${base} | null`;
}
