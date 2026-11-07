// node --test tools/generator  (run by `npm test` in the appcore root)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { controller, entity, prismaModel } from './backend-templates.mjs';
import { formDialog, page, schemas } from './frontend-templates.mjs';
import { names, parseFields, singularize } from './naming.mjs';

test('derives every naming form from a plural kebab name', () => {
  const n = names('loan-products');
  assert.equal(n.Pascal, 'LoanProduct');
  assert.equal(n.Plural, 'LoanProducts');
  assert.equal(n.camelPlural, 'loanProducts');
  assert.equal(n.table, 'loan_products');
  assert.equal(n.singularKebab, 'loan-product');
  assert.equal(singularize('branches'), 'branch');
  assert.equal(singularize('currencies'), 'currency');
  assert.throws(() => names('Loan Products'));
});

test('parses field specs and rejects reserved or unknown input', () => {
  const [code, active] = parseFields('code:string:required:unique,active:boolean');
  assert.deepEqual([code.required, code.unique, active.required], [true, true, true]);
  assert.throws(() => parseFields('version:int'), /base-entity/);
  assert.throws(() => parseFields('amount:money'), /Unknown type/);
  assert.throws(() => parseFields('a:string:secret'), /Unknown flag/);
});

test('renders consistent backend and frontend code', () => {
  const n = names('loan-products');
  const fields = parseFields('code:string:required:unique,rate:number:required,launchedOn:date,notes:text');
  const model = prismaModel(n, fields);
  assert.match(model, /model LoanProduct \{/);
  assert.match(model, /code\s+String @db\.VarChar\(160\) @unique/);
  assert.match(model, /launchedOn\s+DateTime\? @db\.Timestamptz\(3\) @map\("launched_on"\)/);
  assert.match(entity(n, fields), /export class LoanProduct extends BaseEntity/);
  const api = controller(n, fields);
  assert.match(api, /apiSchema\(\s*'LoanProduct'/);
  assert.match(api, /action: 'loan-products\.create'/);
  assert.match(schemas(n, fields), /toLoanProductInput/);
  assert.match(formDialog(n, fields, 'Wallet'), /TextareaField<Values> name="notes"/);
  const form = formDialog(n, fields, 'Wallet');
  assert.match(form, /<FormSurface\s+id="loan-products"/);
  assert.match(form, /<FormGrid columns=\{2\}>/);
  assert.match(form, /<FormActions>/);
  assert.doesNotMatch(form, /DialogContent/);
  const list = page(n, fields, 'Wallet');
  assert.match(list, /const editor = useEditor<LoanProduct>\(\);/);
  assert.match(list, /onOpenChange=\{editor\.onOpenChange\}/);
  assert.doesNotMatch(list, /setForm/);
});
