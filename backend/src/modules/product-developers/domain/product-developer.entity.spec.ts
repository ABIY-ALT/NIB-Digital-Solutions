import { describe, expect, it } from 'vitest';
import { ProductDeveloper } from './product-developer.entity.js';

const valid = { name: 'Hana Tesfaye', email: 'Hana@NIB.example' };

describe('ProductDeveloper', () => {
  it('creates an active developer without a Telegram link', () => {
    const d = ProductDeveloper.create(valid, 'admin');
    expect(d.email).toBe('hana@nib.example');
    expect(d.active).toBe(true);
    expect(d.telegramChatId).toBeNull();
    expect(d.reachableOnTelegram).toBe(false);
  });

  it('requires a name and a valid e-mail', () => {
    expect(() => ProductDeveloper.create({ ...valid, name: '  ' }, null)).toThrow();
    expect(() => ProductDeveloper.create({ ...valid, email: 'not-an-email' }, null)).toThrow();
  });

  it('links Telegram only through the one-time code flow, and clears the code', () => {
    const d = ProductDeveloper.create(valid, 'admin');
    d.issueLinkCode('hash', new Date(Date.now() + 60_000), 'admin');
    expect(d.telegramLinkCodeHash).toBe('hash');
    d.linkTelegram('123456789', 'hana_t');
    expect(d.telegramChatId).toBe('123456789');
    expect(d.telegramLinkCodeHash).toBeNull();
    expect(d.reachableOnTelegram).toBe(true);
  });

  it('stores the Telegram username staff enter without "@" and validates it', () => {
    expect(
      ProductDeveloper.create({ ...valid, telegramUsername: '@hana_t' }, null).telegramUsername,
    ).toBe('hana_t');
    expect(
      ProductDeveloper.create({ ...valid, telegramUsername: 'https://t.me/hana_t' }, null)
        .telegramUsername,
    ).toBe('hana_t');
    expect(ProductDeveloper.create({ ...valid, telegramUsername: '' }, null).telegramUsername).toBe(
      null,
    );
    expect(() => ProductDeveloper.create({ ...valid, telegramUsername: 'ab' }, null)).toThrow();
    expect(() =>
      ProductDeveloper.create({ ...valid, telegramUsername: 'has space' }, null),
    ).toThrow();
  });

  it('keeps the staff-entered username when the chat is disconnected (they can sign in again)', () => {
    const d = ProductDeveloper.create({ ...valid, telegramUsername: 'hana_t' }, 'admin');
    d.linkTelegram('123456789', 'hana_t');
    d.unlinkTelegram('admin');
    expect(d.telegramChatId).toBeNull();
    expect(d.telegramUsername).toBe('hana_t');
  });

  it('staff edits never change the Telegram link', () => {
    const d = ProductDeveloper.create(valid, 'admin');
    d.linkTelegram('123456789', null);
    d.update({ name: 'Hana T.' }, 'admin');
    expect(d.telegramChatId).toBe('123456789');
    d.update({ active: false }, 'admin');
    expect(d.reachableOnTelegram).toBe(false);
  });
});
