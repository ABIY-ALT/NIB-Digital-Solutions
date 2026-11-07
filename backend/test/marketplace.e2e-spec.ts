import {
  MAIL_TRANSPORT,
  type MailMessage,
  type MailTransport,
} from '#core/application/ports/mail.port.js';
import { unique, useApi, type ApiClient } from './support/api.js';

// NIB Digital Solutions: the managed taxonomy (industries, business needs) and
// lead ownership (assignment rules, the owner picker, the assignee notice).

const api = useApi();
const PASSWORD = 'Passw0rd!2026';

let admin: ApiClient;
let sales: ApiClient;
let productManager: ApiClient;
let user: ApiClient;

beforeAll(async () => {
  admin = await api.as('admin');
  sales = await api.as('sales.officer', PASSWORD);
  productManager = await api.as('product.manager', PASSWORD);
  user = await api.as('jdoe');
});

interface Entry {
  id: string;
  name: string;
  short: string;
  icon: string;
  keywords: string[];
}
interface Catalog {
  products: { slug: string; industries: string[] }[];
  categories: { code: string }[];
  industries: Entry[];
  needs: Entry[];
}

describe('marketplace taxonomy', () => {
  it('serves the managed industries and needs with the catalog, translated', async () => {
    const en = await api.call<Catalog>('GET', '/api/v1/marketplace/catalog');
    expect(en.status).toBe(200);
    expect(en.body.data.industries).toHaveLength(8);
    expect(en.body.data.needs).toHaveLength(7);
    expect(en.body.data.industries[0]).toMatchObject({
      id: 'education',
      name: 'Education',
      icon: 'GraduationCap',
    });
    expect(en.body.data.industries[0]!.keywords).toContain('school');

    const am = await api.call<Catalog>('GET', '/api/v1/marketplace/catalog?locale=am');
    expect(am.body.data.industries[0]!.name).toBe('ትምህርት');

    // Every published product points at industries the website can show.
    const known = new Set(en.body.data.industries.map((i) => i.id));
    for (const p of en.body.data.products)
      for (const i of p.industries) expect(known.has(i), `${p.slug}: ${i}`).toBe(true);

    expect((await api.call('GET', '/api/v1/marketplace/catalog?locale=English')).status).toBe(400);
  });

  it('accepts only industries and needs from the managed lists', async () => {
    const catalog = await api.call<Catalog>('GET', '/api/v1/marketplace/catalog');
    const draft = {
      slug: unique('e2e-product-').toLowerCase(),
      name: 'E2E product',
      summary: 'Created by the API tests.',
      categoryCode: catalog.body.data.categories[0]!.code,
      status: 'draft',
      availability: 'available',
    };

    const unknown = await admin.post('/api/v1/digital-products', {
      ...draft,
      industries: ['space-tourism'],
    });
    expect(unknown.status).toBe(400);
    expect(JSON.stringify(unknown.body)).toContain('space-tourism');

    // Reference-data codes are upper case; products store the lower-case form.
    const created = await admin.post<{ id: string; industries: string[]; needs: string[] }>(
      '/api/v1/digital-products',
      { ...draft, industries: ['EDUCATION'], needs: ['grow-sales'] },
    );
    expect(created.status).toBe(201);
    expect(created.body.data.industries).toEqual(['education']);
    expect(created.body.data.needs).toEqual(['grow-sales']);
    expect((await admin.delete(`/api/v1/digital-products/${created.body.data.id}`)).status).toBe(
      200,
    );
  });
});

describe('lead ownership', () => {
  interface Lead {
    id: string;
    version: number;
    reference: string;
    assignedTo: string | null;
  }
  interface Option {
    value: string;
    label: string;
    disabled: boolean;
  }

  async function submitDemoRequest(
    email = `${unique('lead-').toLowerCase()}@example.com`,
  ): Promise<Lead & { email: string }> {
    const catalog = await api.call<Catalog>('GET', '/api/v1/marketplace/catalog');
    const submitted = await api.call<{ reference: string }>(
      'POST',
      '/api/v1/marketplace/demo-requests',
      {
        body: {
          fullName: 'Abebe Kebede',
          organization: 'Addis Academy',
          jobTitle: 'Director',
          email,
          phone: '+251911000000',
          productSlug: catalog.body.data.products[0]!.slug,
          demoType: 'online',
          consent: true,
          source: 'homepage',
          meta: { honeypot: '', elapsedMs: 10_000 },
        },
      },
    );
    expect(submitted.status).toBe(201);
    const list = await admin.get<Lead[]>(
      `/api/v1/demo-requests?search=${submitted.body.data.reference}`,
    );
    return { ...list.body.data[0]!, email };
  }

  it('e-mails the customer a confirmation with the reference number', async () => {
    const transport = api.app.get<MailTransport>(MAIL_TRANSPORT);
    const send = vi.spyOn(transport, 'send');
    try {
      const lead = await submitDemoRequest();
      // Sent in the background, after the visitor already has the answer.
      await vi.waitFor(() =>
        expect(
          send.mock.calls.some(([m]: [MailMessage]) => m.subject.includes(lead.reference)),
        ).toBe(true),
      );
      const mail = send.mock.calls.find(([m]: [MailMessage]) =>
        m.subject.includes(lead.reference),
      )![0];
      expect(mail.to).toBe(lead.email);
      expect(mail.subject).toBe(`We received your demo request ${lead.reference}`);
      expect(mail.text).toContain('within one business day');
      expect(mail.text).toContain('never ask you for account numbers');
      expect(mail.html).toContain(lead.reference);
    } finally {
      send.mockRestore();
    }
  });

  it('offers the staff who may own a lead, to those who can read leads', async () => {
    const options = await admin.get<Option[]>(
      '/api/v1/options/lead-assignees.demo-requests?pageSize=100',
    );
    expect(options.status).toBe(200);
    const labels = options.body.data.map((o) => o.label);
    expect(labels.length).toBeGreaterThan(0);
    // The product manager may read demo requests but not update them: not an owner.
    const pm = await productManager.get<{ id: string }>('/api/v1/users/me');
    expect(options.body.data.some((o) => o.value === pm.body.data.id)).toBe(false);
    // …but may see who owns what.
    expect((await productManager.get('/api/v1/options/lead-assignees.demo-requests')).status).toBe(
      200,
    );
    // Not for people without access to leads, and only for the two lead lists.
    expect((await user.get('/api/v1/options/lead-assignees.demo-requests')).status).toBe(403);
    expect((await admin.get('/api/v1/options/lead-assignees.users')).status).toBe(404);
  });

  it('assigns leads to entitled staff only and tells the new owner', async () => {
    const lead = await submitDemoRequest();
    const salesId = (await sales.get<{ id: string }>('/api/v1/users/me')).body.data.id;
    const pmId = (await productManager.get<{ id: string }>('/api/v1/users/me')).body.data.id;

    for (const assignedTo of ['Hiwot', pmId]) {
      const refused = await admin.patch(`/api/v1/demo-requests/${lead.id}`, {
        version: lead.version,
        assignedTo,
      });
      expect(refused.status, String(assignedTo)).toBe(400);
    }

    const assigned = await admin.patch<Lead>(`/api/v1/demo-requests/${lead.id}`, {
      version: lead.version,
      assignedTo: salesId,
    });
    expect(assigned.status).toBe(200);
    expect(assigned.body.data.assignedTo).toBe(salesId);

    const mine = await sales.get<Lead[]>(
      `/api/v1/demo-requests?filter[assignedTo]=${salesId}&search=${lead.reference}`,
    );
    expect(mine.body.data.map((l) => l.id)).toEqual([lead.id]);

    const inbox = await sales.get<Array<{ title: string }>>(
      '/api/v1/notifications?folder=inbox&page=1&pageSize=20',
    );
    expect(inbox.body.data.some((n) => n.title.includes(lead.reference))).toBe(true);

    // The owner resolves to a name in the picker.
    const resolved = await admin.get<Option[]>(
      `/api/v1/options/lead-assignees.demo-requests?values=${salesId}`,
    );
    expect(resolved.body.data).toEqual([
      expect.objectContaining({ value: salesId, disabled: false }),
    ]);
  });

  it('reports leads by source, industry and owner over a chosen period', async () => {
    const salesId = (await sales.get<{ id: string }>('/api/v1/users/me')).body.data.id;
    const report = await productManager.get<{
      days: number;
      daily: unknown[];
      leadsBySource: { source: string; count: number }[];
      leadsByIndustry: { industry: string; count: number }[];
      openByOwner: { ownerId: string | null; count: number }[];
    }>('/api/v1/marketplace/admin/analytics?days=7');
    expect(report.status).toBe(200);
    expect(report.body.data.days).toBe(7);
    expect(report.body.data.daily).toHaveLength(7);
    expect(
      report.body.data.leadsBySource.find((r) => r.source === 'homepage')?.count,
    ).toBeGreaterThan(0);
    expect(report.body.data.leadsByIndustry.length).toBeGreaterThan(0);
    expect(report.body.data.openByOwner.find((r) => r.ownerId === salesId)?.count).toBeGreaterThan(
      0,
    );

    expect((await productManager.get('/api/v1/marketplace/admin/analytics?days=13')).status).toBe(
      400,
    );
    expect((await user.get('/api/v1/marketplace/admin/analytics')).status).toBe(403);
  });
});
