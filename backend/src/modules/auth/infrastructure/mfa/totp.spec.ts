import { base32Decode, base32Encode, totpAt, verifyTotp } from './totp.js';

describe('TOTP (RFC 6238)', () => {
  // RFC 6238 Appendix B test secret "12345678901234567890" (SHA1), 8 digits truncated to 6.
  const secret = base32Encode(Buffer.from('12345678901234567890'));

  it('round-trips base32', () => {
    expect(base32Decode(secret).toString()).toBe('12345678901234567890');
  });

  it('matches RFC 6238 vectors (last 6 digits)', () => {
    expect(totpAt(secret, Math.floor(59 / 30))).toBe('287082');
    expect(totpAt(secret, Math.floor(1111111109 / 30))).toBe('081804');
    expect(totpAt(secret, Math.floor(2000000000 / 30))).toBe('279037');
  });

  it('verifies within the window and rejects others', () => {
    const now = 1111111109 * 1000;
    expect(verifyTotp(secret, '081804', 1, now)).toBe(Math.floor(1111111109 / 30));
    expect(verifyTotp(secret, '000000', 1, now)).toBeNull();
    expect(verifyTotp(secret, 'abc', 1, now)).toBeNull();
  });
});
