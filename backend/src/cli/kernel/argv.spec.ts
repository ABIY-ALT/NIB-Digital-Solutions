import { closest, findCommandName, parseCommandLine } from './argv.js';
import { GLOBAL_OPTIONS, type OptionSpec } from './command.js';
import { UsageError } from './errors.js';

const options: OptionSpec[] = [
  { name: 'search', type: 'string', description: '' },
  { name: 'page', type: 'number', default: 1, description: '' },
  { name: 'dry-run', type: 'boolean', description: '' },
  { name: 'role', type: 'list', description: '' },
  { name: 'status', type: 'string', choices: ['ACTIVE', 'DISABLED'], description: '' },
  { name: 'yes', alias: 'y', type: 'boolean', description: '' },
];
const parse = (argv: string[], args = [{ name: 'username', description: '' }]) =>
  parseCommandLine(argv, { command: 'users:demo', args, options });

describe('parseCommandLine', () => {
  it('reads values, flags, defaults and positionals in any order', () => {
    const { args, options: o } = parse(['--search', 'abebe', 'jdoe', '--dry-run', '-y']);
    expect(args.username).toBe('jdoe');
    expect(o.string('search')).toBe('abebe');
    expect(o.flag('dry-run')).toBe(true);
    expect(o.flag('yes')).toBe(true);
    expect(o.number('page')).toBe(1);
  });

  it('accepts --name=value, --no-flag and negative numbers', () => {
    const { options: o } = parse(['jdoe', '--page=3', '--no-dry-run']);
    expect(o.number('page')).toBe(3);
    expect(o.flag('dry-run')).toBe(false);
    expect(parse(['jdoe', '--page', '-2']).options.number('page')).toBe(-2);
  });

  it('collects repeated and comma-separated lists', () => {
    const { options: o } = parse(['jdoe', '--role', 'ADMIN,USER', '--role', 'AUDITOR']);
    expect(o.list('role')).toEqual(['ADMIN', 'USER', 'AUDITOR']);
    expect(parse(['jdoe']).options.list('role')).toEqual([]);
  });

  it('treats everything after -- as positional', () => {
    expect(parse(['--', '--weird-name']).args.username).toBe('--weird-name');
  });

  it('rejects unknown options with a suggestion', () => {
    expect(() => parse(['jdoe', '--serach', 'x'])).toThrow(/Unknown option --serach.*--search/);
    expect(() => parse(['jdoe', '-z'])).toThrow(UsageError);
  });

  it('rejects wrong values, missing values and wrong argument counts', () => {
    expect(() => parse(['jdoe', '--page', 'two'])).toThrow(/expects a number/);
    expect(() => parse(['jdoe', '--status', 'GONE'])).toThrow(/must be one of: ACTIVE, DISABLED/);
    expect(() => parse(['jdoe', '--search'])).toThrow(/needs a value/);
    expect(() => parse(['jdoe', '--search', '--dry-run'])).toThrow(/needs a value/);
    expect(() => parse([])).toThrow(/Missing argument <username>/);
    expect(() => parse(['a', 'b'])).toThrow(/Too many arguments/);
    expect(() => parse(['a'], [])).toThrow(/Unexpected argument "a"/);
  });

  it('enforces required options', () => {
    const required: OptionSpec[] = [
      { name: 'email', type: 'string', required: true, description: '' },
    ];
    expect(() => parseCommandLine([], { options: required })).toThrow(
      /Missing required option --email/,
    );
  });

  it('reports the names — never the values — of provided options', () => {
    expect(parse(['jdoe', '--search', 'secret-ish', '-y']).options.provided()).toEqual([
      'search',
      'yes',
    ]);
  });

  it('refuses to read an option the command did not declare', () => {
    expect(() => parse(['jdoe']).options.string('nope')).toThrow(/not declared/);
    expect(() => parse(['jdoe']).options.flag('search')).toThrow(/is a string/);
  });
});

describe('findCommandName', () => {
  it('skips global options and their values', () => {
    expect(
      findCommandName(['--json', '--reason', 'CHG-1', 'users:list', '-y'], GLOBAL_OPTIONS),
    ).toEqual({ name: 'users:list', rest: ['--json', '--reason', 'CHG-1', '-y'] });
    expect(findCommandName(['--version'], GLOBAL_OPTIONS).name).toBeUndefined();
  });
});

describe('closest', () => {
  it('suggests names within two edits only', () => {
    expect(closest('users:lst', ['users:list', 'roles:list'])).toBe('users:list');
    expect(closest('deploy', ['users:list'])).toBeUndefined();
  });
});
