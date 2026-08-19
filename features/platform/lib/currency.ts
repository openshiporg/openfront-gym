const ISO_CURRENCY = /^[A-Z]{3}$/;

export function normalizeCurrencyCode(value: unknown, fallback = "USD") {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  return ISO_CURRENCY.test(normalized) ? normalized : fallback;
}

export function currencyFractionDigits(currencyCode: string) {
  const currency = normalizeCurrencyCode(currencyCode);
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
  }).resolvedOptions().maximumFractionDigits ?? 2;
}

export function formatMajorUnits(
  amountMajor: number,
  currencyCode = "USD",
  locale = "en-US",
) {
  const currency = normalizeCurrencyCode(currencyCode);
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).format(Number.isFinite(amountMajor) ? amountMajor : 0);
}

export function formatMinorUnits(
  amountMinor: number,
  currencyCode = "USD",
  locale = "en-US",
) {
  const currency = normalizeCurrencyCode(currencyCode);
  const fractionDigits = currencyFractionDigits(currency);
  const divisor = 10 ** fractionDigits;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).format((Number.isFinite(amountMinor) ? amountMinor : 0) / divisor);
}

export function parseMajorUnitsToMinor(value: string, currencyCode = "USD") {
  const currency = normalizeCurrencyCode(currencyCode);
  const fractionDigits = currencyFractionDigits(currency);
  const normalized = value.trim();
  const pattern = fractionDigits
    ? new RegExp(`^(\\d{1,9})(?:\\.(\\d{1,${fractionDigits}}))?$`)
    : /^(\d{1,9})$/;
  const match = normalized.match(pattern);
  if (!match) {
    throw new Error(
      fractionDigits
        ? `Enter a positive amount with no more than ${fractionDigits} decimal places.`
        : "Enter a positive whole-number amount.",
    );
  }

  const major = Number(match[1]);
  const fractional = (match[2] ?? "").padEnd(fractionDigits, "0");
  const amountMinor = major * 10 ** fractionDigits + Number(fractional || 0);
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    throw new Error("Refund amount must be greater than zero.");
  }
  return amountMinor;
}
