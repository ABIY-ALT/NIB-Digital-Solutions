import { describe, expect, it } from 'vitest';
import { DemoRequest, type DemoRequestInput } from './demo-request.entity.js';

const valid: DemoRequestInput = {
  reference: 'DEMO-261103-ABCDE',
  fullName: '  Abel   Tadesse ',
  organization: 'Bright Future Academy',
  jobTitle: 'Director',
  email: 'ABEL@Example.com ',
  phone: '+251 911 234 567',
  productSlug: 'school-management-system',
  demoType: 'online',
  preferredTime: '10:30',
  requirements: 'Three campuses <script>alert(1)</script>',
  source: 'homepage',
  status: 'new',
};

describe('DemoRequest', () => {
  it('normalises and sanitises customer input', () => {
    const r = DemoRequest.create(valid, null);
    expect(r.fullName).toBe('Abel Tadesse');
    expect(r.email).toBe('abel@example.com');
    expect(r.phone).toBe('+251911234567');
    expect(r.requirements).not.toMatch(/[<>]/);
    expect(r.notes).toEqual([]);
  });

  it('rejects invalid contact details, demo types and statuses', () => {
    expect(() => DemoRequest.create({ ...valid, email: 'nope' }, null)).toThrow();
    expect(() => DemoRequest.create({ ...valid, phone: '12' }, null)).toThrow();
    expect(() => DemoRequest.create({ ...valid, demoType: 'telepathy' }, null)).toThrow();
    expect(() => DemoRequest.create({ ...valid, status: 'lost' }, null)).toThrow();
    expect(() => DemoRequest.create({ ...valid, preferredTime: '25:00' }, null)).toThrow();
  });

  it('moves through the pipeline and keeps an append-only note log', () => {
    const r = DemoRequest.create(valid, null);
    r.update({ status: 'contacted', assignedTo: 'sales.officer' }, 'u1');
    const note = r.addNote('sales.officer', 'Called the customer.', 'u1');
    expect(r.status).toBe('contacted');
    expect(r.notes).toEqual([note]);
    expect(() => r.addNote('sales.officer', '   ', 'u1')).toThrow();
  });
});
