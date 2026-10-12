// The app is used worldwide (like utils/timezone.js), so a bare number on a
// budget/booking field is ambiguous once partners can be in any country.
// `currencyDisplay: 'code'` renders the ISO 4217 abbreviation ("USD 50,000")
// instead of a symbol - a $ alone doesn't say whether it's USD, CAD, AUD or
// SGD, but the code always does. Native Intl API, no extra dependency.
// Number grouping follows the UI language (section 54); the currency code
// and amount never change with it.
import { intlLocale } from '../i18n/format';

export const COMMON_CURRENCIES = [
  'USD', 'INR', 'AED', 'GBP', 'EUR', 'SGD', 'AUD', 'CAD',
  'SAR', 'QAR', 'KWD', 'JPY', 'CNY', 'ZAR', 'NGN', 'PHP'
];

export function formatCurrency(value, currencyCode) {
  if (value === undefined || value === null || value === '') return '-';
  const amount = Number(value);
  if (Number.isNaN(amount)) return String(value);
  const code = currencyCode || 'USD';
  try {
    return new Intl.NumberFormat(intlLocale(), {
      style: 'currency',
      currency: code,
      currencyDisplay: 'code',
      maximumFractionDigits: 0
    }).format(amount);
  } catch {
    return `${code} ${amount.toLocaleString()}`;
  }
}
