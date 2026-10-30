import type { CurrencyFormatId } from '@/lib/format';

export interface CurrencyInfo {
  code: string;
  symbol: string;
  name: string;
  /** ISO 3166 region used for the flag emoji. */
  region: string;
}

// [code, symbol, name, region]
const RAW: [string, string, string, string][] = [
  ['ZAR', 'R', 'South African Rand', 'ZA'],
  ['AED', 'AED', 'United Arab Emirates Dirham', 'AE'],
  ['USD', '$', 'United States Dollar', 'US'],
  ['EUR', '€', 'Euro', 'EU'],
  ['GBP', '£', 'British Pound Sterling', 'GB'],
  ['JPY', '¥', 'Japanese Yen', 'JP'],
  ['CAD', '$', 'Canadian Dollar', 'CA'],
  ['AUD', '$', 'Australian Dollar', 'AU'],
  ['UYU', '$U', 'Uruguayan Peso', 'UY'],
  ['NZD', '$', 'New Zealand Dollar', 'NZ'],
  ['CHF', 'CHF', 'Swiss Franc', 'CH'],
  ['CNY', 'CNY', 'Chinese Yuan', 'CN'],
  ['INR', '₹', 'Indian Rupee', 'IN'],
  ['SGD', 'S$', 'Singapore Dollar', 'SG'],
  ['HKD', 'HK$', 'Hong Kong Dollar', 'HK'],
  ['SEK', 'kr', 'Swedish Krona', 'SE'],
  ['NOK', 'kr', 'Norwegian Krone', 'NO'],
  ['DKK', 'kr', 'Danish Krone', 'DK'],
  ['PLN', 'zł', 'Polish Złoty', 'PL'],
  ['CZK', 'Kč', 'Czech Koruna', 'CZ'],
  ['HUF', 'Ft', 'Hungarian Forint', 'HU'],
  ['TRY', '₺', 'Turkish Lira', 'TR'],
  ['RUB', '₽', 'Russian Ruble', 'RU'],
  ['BRL', 'R$', 'Brazilian Real', 'BR'],
  ['MXN', '$', 'Mexican Peso', 'MX'],
  ['ARS', '$', 'Argentine Peso', 'AR'],
  ['CLP', '$', 'Chilean Peso', 'CL'],
  ['COP', '$', 'Colombian Peso', 'CO'],
  ['PEN', 'S/', 'Peruvian Sol', 'PE'],
  ['KRW', '₩', 'South Korean Won', 'KR'],
  ['TWD', 'NT$', 'New Taiwan Dollar', 'TW'],
  ['THB', '฿', 'Thai Baht', 'TH'],
  ['MYR', 'RM', 'Malaysian Ringgit', 'MY'],
  ['IDR', 'Rp', 'Indonesian Rupiah', 'ID'],
  ['PHP', '₱', 'Philippine Peso', 'PH'],
  ['VND', '₫', 'Vietnamese Đồng', 'VN'],
  ['PKR', '₨', 'Pakistani Rupee', 'PK'],
  ['BDT', '৳', 'Bangladeshi Taka', 'BD'],
  ['LKR', 'Rs', 'Sri Lankan Rupee', 'LK'],
  ['NPR', 'Rs', 'Nepalese Rupee', 'NP'],
  ['SAR', 'SAR', 'Saudi Riyal', 'SA'],
  ['QAR', 'QAR', 'Qatari Riyal', 'QA'],
  ['KWD', 'KWD', 'Kuwaiti Dinar', 'KW'],
  ['BHD', 'BHD', 'Bahraini Dinar', 'BH'],
  ['OMR', 'OMR', 'Omani Rial', 'OM'],
  ['ILS', '₪', 'Israeli New Shekel', 'IL'],
  ['EGP', 'E£', 'Egyptian Pound', 'EG'],
  ['MAD', 'MAD', 'Moroccan Dirham', 'MA'],
  ['NGN', '₦', 'Nigerian Naira', 'NG'],
  ['KES', 'KSh', 'Kenyan Shilling', 'KE'],
  ['GHS', '₵', 'Ghanaian Cedi', 'GH'],
  ['BWP', 'P', 'Botswana Pula', 'BW'],
  ['NAD', 'N$', 'Namibian Dollar', 'NA'],
  ['MUR', 'Rs', 'Mauritian Rupee', 'MU'],
  ['RON', 'lei', 'Romanian Leu', 'RO'],
  ['BGN', 'лв', 'Bulgarian Lev', 'BG'],
  ['ISK', 'kr', 'Icelandic Króna', 'IS'],
  ['UAH', '₴', 'Ukrainian Hryvnia', 'UA'],
];

export const CURRENCIES: CurrencyInfo[] = RAW.map(([code, symbol, name, region]) => ({
  code,
  symbol,
  name,
  region,
}));

const BY_CODE = new Map(CURRENCIES.map((c) => [c.code, c]));

export const CURRENCY_CODE_RE = /^[A-Z]{3}$/;

export function isSupportedCurrency(code: unknown): code is string {
  return typeof code === 'string' && BY_CODE.has(code);
}

export function currencyInfo(code: string): CurrencyInfo {
  return BY_CODE.get(code) ?? { code, symbol: code, name: code, region: '' };
}

export function currencySymbol(code: string): string {
  return currencyInfo(code).symbol;
}

export function flagEmoji(region: string): string {
  if (!/^[A-Z]{2}$/.test(region)) return '🏳️';
  return String.fromCodePoint(...[...region].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}

const REGION_TO_CURRENCY = new Map(
  CURRENCIES.filter((c) => c.region !== 'EU').map((c) => [c.region, c.code])
);
const EURO_REGIONS = new Set([
  'AT', 'BE', 'CY', 'DE', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PT', 'SI', 'SK',
]);

/** Best-guess home currency from the device locale, e.g. "en-ZA" -> ZAR. Falls back to USD. */
export function guessHomeCurrency(): string {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale ?? '';
    const region = locale.split(/[-_]/).find((part) => /^[A-Z]{2}$/.test(part));
    if (!region) return 'USD';
    if (EURO_REGIONS.has(region)) return 'EUR';
    return REGION_TO_CURRENCY.get(region) ?? 'USD';
  } catch {
    return 'USD';
  }
}

const SPACE_COMMA = new Set(['ZAR', 'EUR', 'SEK', 'NOK', 'CZK', 'PLN', 'HUF', 'RUB', 'UAH', 'BGN', 'RON', 'CHF', 'NAD', 'BWP']);
const DOT_COMMA = new Set(['BRL', 'ARS', 'CLP', 'COP', 'IDR', 'VND', 'TRY', 'ISK', 'DKK', 'UYU', 'PEN']);

/** Conventional number format for a currency ("R 1 234,56", "$1,234.56", "R$ 1.234,56"). */
export function defaultFormatFor(code: string): CurrencyFormatId {
  if (SPACE_COMMA.has(code)) return 'space_comma.before_space';
  if (DOT_COMMA.has(code)) return 'dot_comma.before_space';
  return 'comma_dot.before';
}
