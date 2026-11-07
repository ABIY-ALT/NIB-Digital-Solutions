-- NIB Digital Solutions: industries and business needs become managed reference
-- data (Administration › Reference data) instead of lists compiled into the code.
-- Additive and idempotent: lists or items that already exist are left untouched.
-- Item codes are upper case (reference data rule); products keep storing the
-- lower-case form (e.g. "education"), which the marketplace matches case-insensitively.

INSERT INTO "reference_data_types" ("id", "updated_at", "created_by", "code", "name", "description", "is_system", "attributes")
VALUES (gen_random_uuid(), CURRENT_TIMESTAMP, 'system', 'marketplace-industries', 'Marketplace industries',
        'Industries the NIB Digital Solutions website is organised by (home page, catalog filter, Industries page, assistant).', true, '[{"key":"shortName","label":"Short name (cards, badges)","type":"text","required":false},{"key":"icon","label":"Icon (Lucide name, e.g. GraduationCap)","type":"text","required":false},{"key":"keywords","label":"Search keywords (comma-separated)","type":"text","required":false}]'::jsonb)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "reference_data_items" ("id", "updated_at", "created_by", "type_id", "code", "label", "labels", "description", "sort_order", "attributes")
SELECT gen_random_uuid(), CURRENT_TIMESTAMP, 'system', t."id", v."code", v."label", v."labels"::jsonb, v."description", v."sort_order", v."attributes"::jsonb
FROM "reference_data_types" t
CROSS JOIN (VALUES
  ('EDUCATION', 'Education', '{"am":"ትምህርት"}', 'Schools, colleges and training centres running admissions, fees and academics digitally.', 10, '{"shortName":"Education","icon":"GraduationCap","keywords":"school, education, college, university, academy, student, teacher, parents, kindergarten, training"}'),
  ('CONSTRUCTION-REAL-ESTATE', 'Construction & Real Estate', '{"am":"ግንባታ እና ሪል እስቴት"}', 'Developers, property managers and contractors managing buildings, tenants and tenders.', 20, '{"shortName":"Real Estate","icon":"Building2","keywords":"building, property, real estate, apartment, condominium, tenant, landlord, construction, contractor, rent, facility, mall"}'),
  ('FINANCIAL-SERVICES', 'Financial Services', '{"am":"የፋይናንስ አገልግሎቶች"}', 'Microfinance institutions, cooperatives and lenders digitizing credit and member services.', 30, '{"shortName":"Financial","icon":"Landmark","keywords":"bank, banking, microfinance, mfi, lender, lending, loan, credit, saccos, cooperative, finance, financial"}'),
  ('RETAIL-ECOMMERCE', 'Retail & E-commerce', '{"am":"ችርቻሮ እና ኢ-ኮሜርስ"}', 'Shops, supermarkets, brands and online sellers accepting payments and selling online.', 40, '{"shortName":"Retail","icon":"ShoppingBag","keywords":"retail, shop, store, supermarket, ecommerce, e-commerce, online store, merchant, seller, brand, bnpl, marketplace"}'),
  ('HEALTHCARE', 'Healthcare', '{"am":"ጤና አጠባበቅ"}', 'Hospitals, clinics and specialist practices managing appointments and patient flow.', 50, '{"shortName":"Healthcare","icon":"Stethoscope","keywords":"hospital, clinic, doctor, health, healthcare, patient, medical, dental, pharmacy"}'),
  ('TRANSPORTATION', 'Transportation', '{"am":"ትራንስፖርት"}', 'Bus operators, terminals and associations selling tickets and managing trips online.', 60, '{"shortName":"Transport","icon":"Bus","keywords":"bus, transport, transportation, travel, terminal, route, trip, passenger, operator, fleet"}'),
  ('EVENTS-ENTERTAINMENT', 'Events & Entertainment', '{"am":"ዝግጅቶች እና መዝናኛ"}', 'Organizers, venues and brands selling tickets and running interactive campaigns.', 70, '{"shortName":"Events","icon":"PartyPopper","keywords":"event, concert, festival, venue, ticket, entertainment, campaign, promotion, lottery, sports, conference"}'),
  ('SME-BUSINESS', 'SMEs & Business Operations', '{"am":"አነስተኛና መካከለኛ ንግዶች"}', 'Small and growing businesses digitizing sales, payments, financing and operations.', 80, '{"shortName":"SMEs","icon":"Briefcase","keywords":"sme, small business, business, enterprise, company, startup, trader, wholesaler, distributor, msme"}')
) AS v("code", "label", "labels", "description", "sort_order", "attributes")
WHERE t."code" = 'marketplace-industries'
ON CONFLICT ("type_id", "code") DO NOTHING;

INSERT INTO "reference_data_types" ("id", "updated_at", "created_by", "code", "name", "description", "is_system", "attributes")
VALUES (gen_random_uuid(), CURRENT_TIMESTAMP, 'system', 'marketplace-needs', 'Marketplace business needs',
        'Business needs visitors can explore solutions by (home page, Solutions page, assistant).', true, '[{"key":"icon","label":"Icon (Lucide name, e.g. GraduationCap)","type":"text","required":false},{"key":"keywords","label":"Search keywords (comma-separated)","type":"text","required":false}]'::jsonb)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "reference_data_items" ("id", "updated_at", "created_by", "type_id", "code", "label", "labels", "description", "sort_order", "attributes")
SELECT gen_random_uuid(), CURRENT_TIMESTAMP, 'system', t."id", v."code", v."label", v."labels"::jsonb, v."description", v."sort_order", v."attributes"::jsonb
FROM "reference_data_types" t
CROSS JOIN (VALUES
  ('AUTOMATE-OPERATIONS', 'Automate manual operations', '{"am":"የእጅ ሥራዎችን በራስ-ሰር ማከናወን"}', 'Replace paper registers, spreadsheets and manual follow-ups with automated workflows.', 10, '{"icon":"Workflow","keywords":"automate, automation, manual, paper, spreadsheet, excel"}'),
  ('DIGITIZE-CUSTOMER-SERVICES', 'Digitize customer services', '{"am":"የደንበኞች አገልግሎትን ዲጂታል ማድረግ"}', 'Give customers self-service portals, mobile apps and instant digital receipts.', 20, '{"icon":"Smartphone","keywords":"customer service, self-service, portal, mobile app, digital service, online booking"}'),
  ('MANAGE-PROCESSES', 'Manage business processes', '{"am":"የንግድ ሂደቶችን ማስተዳደር"}', 'Track approvals, tasks and records end to end with full visibility and audit trails.', 30, '{"icon":"ListChecks","keywords":"process, workflow, approval, records, management, tracking"}'),
  ('GROW-SALES', 'Improve sales and revenue', '{"am":"ሽያጭንና ገቢን ማሳደግ"}', 'Reach new customers online, sell more with flexible payment options and campaigns.', 40, '{"icon":"TrendingUp","keywords":"sales, revenue, grow, customers, marketing, sell, engagement"}'),
  ('PAYMENTS-COLLECTIONS', 'Manage payments and collections', '{"am":"ክፍያዎችንና የገቢ አሰባሰብን ማስተዳደር"}', 'Collect fees, rent and sales digitally with automatic reconciliation into your NIB account.', 50, '{"icon":"Wallet","keywords":"payment, collection, fees, rent, reconciliation, settlement, qr"}'),
  ('DIGITAL-LENDING', 'Digitize lending and financing', '{"am":"ብድርና ፋይናንስን ዲጂታል ማድረግ"}', 'Originate, appraise, disburse and collect loans through digital channels.', 60, '{"icon":"HandCoins","keywords":"loan, lending, digital lending, digital loan, credit, financing, bnpl, installment, microloan"}'),
  ('OPERATIONAL-EFFICIENCY', 'Improve operational efficiency', '{"am":"የሥራ ቅልጥፍናን ማሻሻል"}', 'Cut turnaround times and errors with real-time dashboards and reporting.', 70, '{"icon":"Gauge","keywords":"efficiency, reporting, dashboard, analytics, insight, real-time, cost"}')
) AS v("code", "label", "labels", "description", "sort_order", "attributes")
WHERE t."code" = 'marketplace-needs'
ON CONFLICT ("type_id", "code") DO NOTHING;
