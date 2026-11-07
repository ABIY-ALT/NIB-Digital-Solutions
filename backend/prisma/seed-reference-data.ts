/**
 * Reference data shipped with AppCore (seeded idempotently by prisma/seed.ts).
 * Products add their own lists through the Reference data screen or here.
 */
export interface SeedAttribute {
  key: string;
  label: string;
  type: 'text' | 'number' | 'boolean' | 'date' | 'select';
  required: boolean;
  options?: string[];
}

export interface SeedItem {
  code: string;
  label: string;
  am?: string;
  parent?: string;
  active?: boolean;
  attributes?: Record<string, string | number | boolean>;
}

export interface SeedList {
  code: string;
  name: string;
  description: string;
  isSystem: boolean;
  parentTypeCode?: string;
  attributes: SeedAttribute[];
  items: SeedItem[];
}

export const REFERENCE_DATA: SeedList[] = [
  {
    code: 'currencies',
    name: 'Currencies',
    description: 'ISO 4217 currencies the bank trades or quotes.',
    isSystem: true,
    attributes: [
      { key: 'symbol', label: 'Symbol', type: 'text', required: true },
      { key: 'decimals', label: 'Minor units', type: 'number', required: true },
      { key: 'numericCode', label: 'ISO numeric code', type: 'text', required: false },
    ],
    items: [
      {
        code: 'ETB',
        label: 'Ethiopian Birr',
        am: 'የኢትዮጵያ ብር',
        attributes: { symbol: 'Br', decimals: 2, numericCode: '230' },
      },
      {
        code: 'USD',
        label: 'US Dollar',
        am: 'የአሜሪካ ዶላር',
        attributes: { symbol: '$', decimals: 2, numericCode: '840' },
      },
      {
        code: 'EUR',
        label: 'Euro',
        am: 'ዩሮ',
        attributes: { symbol: '€', decimals: 2, numericCode: '978' },
      },
      {
        code: 'GBP',
        label: 'Pound Sterling',
        am: 'የእንግሊዝ ፓውንድ',
        attributes: { symbol: '£', decimals: 2, numericCode: '826' },
      },
      {
        code: 'CNY',
        label: 'Chinese Yuan',
        am: 'የቻይና ዩዋን',
        attributes: { symbol: '¥', decimals: 2, numericCode: '156' },
      },
      {
        code: 'AED',
        label: 'UAE Dirham',
        am: 'የዩኤኢ ድርሃም',
        attributes: { symbol: 'د.إ', decimals: 2, numericCode: '784' },
      },
      {
        code: 'SAR',
        label: 'Saudi Riyal',
        am: 'የሳውዲ ሪያል',
        attributes: { symbol: '﷼', decimals: 2, numericCode: '682' },
      },
      {
        code: 'KES',
        label: 'Kenyan Shilling',
        am: 'የኬንያ ሽልንግ',
        attributes: { symbol: 'KSh', decimals: 2, numericCode: '404' },
      },
      {
        code: 'JPY',
        label: 'Japanese Yen',
        am: 'የጃፓን የን',
        attributes: { symbol: '¥', decimals: 0, numericCode: '392' },
      },
      {
        code: 'CHF',
        label: 'Swiss Franc',
        am: 'የስዊዝ ፍራንክ',
        attributes: { symbol: 'Fr', decimals: 2, numericCode: '756' },
      },
    ],
  },
  {
    code: 'countries',
    name: 'Countries',
    description: 'ISO 3166 countries (nationality, residence, correspondent banks).',
    isSystem: true,
    attributes: [
      { key: 'isoAlpha3', label: 'ISO alpha-3', type: 'text', required: true },
      { key: 'dialCode', label: 'Dialling code', type: 'text', required: false },
    ],
    items: [
      {
        code: 'ET',
        label: 'Ethiopia',
        am: 'ኢትዮጵያ',
        attributes: { isoAlpha3: 'ETH', dialCode: '+251' },
      },
      { code: 'KE', label: 'Kenya', am: 'ኬንያ', attributes: { isoAlpha3: 'KEN', dialCode: '+254' } },
      {
        code: 'DJ',
        label: 'Djibouti',
        am: 'ጅቡቲ',
        attributes: { isoAlpha3: 'DJI', dialCode: '+253' },
      },
      {
        code: 'SO',
        label: 'Somalia',
        am: 'ሶማሊያ',
        attributes: { isoAlpha3: 'SOM', dialCode: '+252' },
      },
      { code: 'SD', label: 'Sudan', am: 'ሱዳን', attributes: { isoAlpha3: 'SDN', dialCode: '+249' } },
      {
        code: 'SS',
        label: 'South Sudan',
        am: 'ደቡብ ሱዳን',
        attributes: { isoAlpha3: 'SSD', dialCode: '+211' },
      },
      {
        code: 'ER',
        label: 'Eritrea',
        am: 'ኤርትራ',
        attributes: { isoAlpha3: 'ERI', dialCode: '+291' },
      },
      {
        code: 'AE',
        label: 'United Arab Emirates',
        am: 'የተባበሩት አረብ ኤምሬቶች',
        attributes: { isoAlpha3: 'ARE', dialCode: '+971' },
      },
      {
        code: 'SA',
        label: 'Saudi Arabia',
        am: 'ሳውዲ አረቢያ',
        attributes: { isoAlpha3: 'SAU', dialCode: '+966' },
      },
      { code: 'CN', label: 'China', am: 'ቻይና', attributes: { isoAlpha3: 'CHN', dialCode: '+86' } },
      {
        code: 'GB',
        label: 'United Kingdom',
        am: 'ዩናይትድ ኪንግደም',
        attributes: { isoAlpha3: 'GBR', dialCode: '+44' },
      },
      {
        code: 'US',
        label: 'United States',
        am: 'አሜሪካ',
        attributes: { isoAlpha3: 'USA', dialCode: '+1' },
      },
    ],
  },
  {
    code: 'regions',
    name: 'Regions',
    description: 'Regional states and city administrations of Ethiopia.',
    isSystem: true,
    attributes: [
      {
        key: 'kind',
        label: 'Kind',
        type: 'select',
        required: true,
        options: ['REGION', 'CITY_ADMINISTRATION'],
      },
    ],
    items: [
      {
        code: 'AA',
        label: 'Addis Ababa',
        am: 'አዲስ አበባ',
        attributes: { kind: 'CITY_ADMINISTRATION' },
      },
      { code: 'DD', label: 'Dire Dawa', am: 'ድሬዳዋ', attributes: { kind: 'CITY_ADMINISTRATION' } },
      { code: 'OR', label: 'Oromia', am: 'ኦሮሚያ', attributes: { kind: 'REGION' } },
      { code: 'AM', label: 'Amhara', am: 'አማራ', attributes: { kind: 'REGION' } },
      { code: 'TI', label: 'Tigray', am: 'ትግራይ', attributes: { kind: 'REGION' } },
      { code: 'SI', label: 'Sidama', am: 'ሲዳማ', attributes: { kind: 'REGION' } },
      { code: 'SO', label: 'Somali', am: 'ሶማሌ', attributes: { kind: 'REGION' } },
      { code: 'AF', label: 'Afar', am: 'አፋር', attributes: { kind: 'REGION' } },
      { code: 'BG', label: 'Benishangul-Gumuz', am: 'ቤኒሻንጉል ጉሙዝ', attributes: { kind: 'REGION' } },
      { code: 'GA', label: 'Gambela', am: 'ጋምቤላ', attributes: { kind: 'REGION' } },
      { code: 'HA', label: 'Harari', am: 'ሐረሪ', attributes: { kind: 'REGION' } },
      {
        code: 'SW',
        label: 'South West Ethiopia',
        am: 'ደቡብ ምዕራብ ኢትዮጵያ',
        attributes: { kind: 'REGION' },
      },
      { code: 'CE', label: 'Central Ethiopia', am: 'ማዕከላዊ ኢትዮጵያ', attributes: { kind: 'REGION' } },
      { code: 'SE', label: 'South Ethiopia', am: 'ደቡብ ኢትዮጵያ', attributes: { kind: 'REGION' } },
    ],
  },
  {
    code: 'branches',
    name: 'Branches',
    description: 'Bank branches and offices (the branch scope of users and customers).',
    isSystem: true,
    parentTypeCode: 'regions',
    attributes: [
      { key: 'city', label: 'City', type: 'text', required: true },
      {
        key: 'kind',
        label: 'Kind',
        type: 'select',
        required: true,
        options: ['HEAD_OFFICE', 'BRANCH', 'SUB_BRANCH'],
      },
      { key: 'phone', label: 'Phone', type: 'text', required: false },
    ],
    items: [
      {
        code: 'HQ',
        label: 'Head Office',
        am: 'ዋና መሥሪያ ቤት',
        parent: 'AA',
        attributes: { city: 'Addis Ababa', kind: 'HEAD_OFFICE', phone: '+251115503288' },
      },
      {
        code: 'ADD01',
        label: 'Bole Branch',
        am: 'ቦሌ ቅርንጫፍ',
        parent: 'AA',
        attributes: { city: 'Addis Ababa', kind: 'BRANCH', phone: '+251116612001' },
      },
      {
        code: 'ADD02',
        label: 'Piassa Branch',
        am: 'ፒያሳ ቅርንጫፍ',
        parent: 'AA',
        attributes: { city: 'Addis Ababa', kind: 'BRANCH', phone: '+251111112002' },
      },
      {
        code: 'BHD01',
        label: 'Bahir Dar Branch',
        am: 'ባሕር ዳር ቅርንጫፍ',
        parent: 'AM',
        attributes: { city: 'Bahir Dar', kind: 'BRANCH' },
      },
      {
        code: 'HAW01',
        label: 'Hawassa Branch',
        am: 'ሀዋሳ ቅርንጫፍ',
        parent: 'SI',
        attributes: { city: 'Hawassa', kind: 'BRANCH' },
      },
      {
        code: 'MEK01',
        label: 'Mekelle Branch',
        am: 'መቀሌ ቅርንጫፍ',
        parent: 'TI',
        attributes: { city: 'Mekelle', kind: 'BRANCH' },
      },
      {
        code: 'DIR01',
        label: 'Dire Dawa Branch',
        am: 'ድሬዳዋ ቅርንጫፍ',
        parent: 'DD',
        attributes: { city: 'Dire Dawa', kind: 'BRANCH' },
      },
      {
        code: 'ADM01',
        label: 'Adama Branch',
        am: 'አዳማ ቅርንጫፍ',
        parent: 'OR',
        attributes: { city: 'Adama', kind: 'BRANCH' },
      },
      {
        code: 'GON01',
        label: 'Gondar Sub-branch',
        am: 'ጎንደር ንዑስ ቅርንጫፍ',
        parent: 'AM',
        active: false,
        attributes: { city: 'Gondar', kind: 'SUB_BRANCH' },
      },
    ],
  },
  {
    code: 'id-document-types',
    name: 'ID document types',
    description: 'Identity documents accepted for KYC.',
    isSystem: false,
    attributes: [
      { key: 'issuer', label: 'Issuer', type: 'text', required: false },
      { key: 'expires', label: 'Has an expiry date', type: 'boolean', required: false },
    ],
    items: [
      {
        code: 'NATIONAL_ID',
        label: 'Fayda National ID',
        am: 'ፋይዳ ብሔራዊ መታወቂያ',
        attributes: { issuer: 'National ID Program', expires: true },
      },
      {
        code: 'PASSPORT',
        label: 'Passport',
        am: 'ፓስፖርት',
        attributes: { issuer: 'Immigration and Citizenship Service', expires: true },
      },
      {
        code: 'KEBELE_ID',
        label: 'Kebele ID',
        am: 'የቀበሌ መታወቂያ',
        attributes: { issuer: 'Kebele administration', expires: true },
      },
      {
        code: 'DRIVING_LICENSE',
        label: 'Driving licence',
        am: 'መንጃ ፈቃድ',
        attributes: { issuer: 'Transport authority', expires: true },
      },
      {
        code: 'RESIDENCE_PERMIT',
        label: 'Residence permit',
        am: 'የመኖሪያ ፈቃድ',
        attributes: { issuer: 'Immigration and Citizenship Service', expires: true },
      },
    ],
  },
  {
    code: 'account-types',
    name: 'Account types',
    description: 'Deposit products offered to customers.',
    isSystem: false,
    attributes: [
      {
        key: 'category',
        label: 'Category',
        type: 'select',
        required: true,
        options: ['SAVINGS', 'CURRENT', 'DEPOSIT'],
      },
      { key: 'interestFree', label: 'Interest-free (IFB)', type: 'boolean', required: false },
      { key: 'minBalance', label: 'Minimum balance (ETB)', type: 'number', required: false },
    ],
    items: [
      {
        code: 'SAV',
        label: 'Regular Savings',
        am: 'መደበኛ ቁጠባ',
        attributes: { category: 'SAVINGS', interestFree: false, minBalance: 50 },
      },
      {
        code: 'CUR',
        label: 'Current Account',
        am: 'ተንቀሳቃሽ ሂሳብ',
        attributes: { category: 'CURRENT', interestFree: false, minBalance: 500 },
      },
      {
        code: 'FTD',
        label: 'Fixed Time Deposit',
        am: 'የጊዜ ገደብ ተቀማጭ',
        attributes: { category: 'DEPOSIT', interestFree: false, minBalance: 10000 },
      },
      {
        code: 'WAD',
        label: 'Wadiah Savings (IFB)',
        am: 'ወዲዓህ ቁጠባ (ከወለድ ነፃ)',
        attributes: { category: 'SAVINGS', interestFree: true, minBalance: 50 },
      },
      {
        code: 'YTH',
        label: 'Youth Savings',
        am: 'የወጣቶች ቁጠባ',
        attributes: { category: 'SAVINGS', interestFree: false, minBalance: 25 },
      },
    ],
  },
];
