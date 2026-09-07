// Deliberately not implemented. Every business has exactly one base
// currency (businesses.currency), and every amount in the schema — visit
// spending, rewards, revenue events, everything — is recorded directly in
// that currency. Nothing in this app today needs to convert between
// currencies: there's no scenario where two different currencies'
// amounts get compared or summed within a single business.
//
// If that changes (e.g. multi-currency pricing, a business operating
// across regions), this is the one file that should grow a real
// implementation — swap `notImplemented` below for a call to whatever
// exchange-rate provider gets connected, and every caller stays the
// same. Do not hand-roll conversion logic elsewhere in the app, and do
// not hard-code exchange rates — a wrong rate silently misstates real
// money, which is worse than clearly not converting at all.
export async function convert(amount, fromCurrency, toCurrency) {
  if (fromCurrency === toCurrency) return amount;
  throw new Error(
    `Currency conversion (${fromCurrency} -> ${toCurrency}) is not implemented — no exchange-rate provider is connected. ` +
    `See src/lib/exchangeRates.js.`
  );
}
