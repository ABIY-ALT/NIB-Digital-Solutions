import { describe, expect, it } from 'vitest';
import { ProductInquiry, type ProductInquiryInput } from './product-inquiry.entity.js';

const valid: ProductInquiryInput = {
  reference: 'INQ-261103-ABCDE',
  customerName: 'Hana Kebede',
  email: 'hana@example.com',
  inquiryType: 'pricing',
  message: 'Could you share indicative pricing for 1,200 students?',
  contactMethod: 'email',
  status: 'new',
};

describe('ProductInquiry', () => {
  it('creates a valid inquiry with optional fields empty', () => {
    const q = ProductInquiry.create(valid, null);
    expect(q.phone).toBeNull();
    expect(q.productSlug).toBeNull();
    expect(q.company).toBeNull();
  });

  it('requires a meaningful message and known vocabularies', () => {
    expect(() => ProductInquiry.create({ ...valid, message: 'Hi' }, null)).toThrow();
    expect(() => ProductInquiry.create({ ...valid, inquiryType: 'gossip' }, null)).toThrow();
    expect(() => ProductInquiry.create({ ...valid, contactMethod: 'pigeon' }, null)).toThrow();
    expect(() => ProductInquiry.create({ ...valid, phone: '12' }, null)).toThrow();
  });

  it('records responses and notes', () => {
    const q = ProductInquiry.create(valid, null);
    const at = new Date();
    q.update({ respondedAt: at, status: 'contacted' }, 'u1');
    q.addNote('sales.officer', 'Sent the pricing deck.', 'u1');
    expect(q.respondedAt).toBe(at);
    expect(q.notes).toHaveLength(1);
  });
});
