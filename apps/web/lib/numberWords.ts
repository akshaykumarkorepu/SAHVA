const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function below100(n: number): string {
  return n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ""}`;
}
function below1000(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  return [h ? `${ONES[h]} Hundred` : "", r ? below100(r) : ""].filter(Boolean).join(" ");
}

/** Whole number in words, Indian grouping: 12,34,567 → Twelve Lakh Thirty Four Thousand … */
export function inWords(n: number): string {
  n = Math.floor(Math.abs(n));
  if (n === 0) return "Zero";
  const parts: string[] = [];
  const crore = Math.floor(n / 1_00_00_000);
  if (crore) parts.push(`${inWords(crore)} Crore`);
  n %= 1_00_00_000;
  const lakh = Math.floor(n / 1_00_000);
  if (lakh) parts.push(`${below100(lakh)} Lakh`);
  n %= 1_00_000;
  const thousand = Math.floor(n / 1000);
  if (thousand) parts.push(`${below100(thousand)} Thousand`);
  n %= 1000;
  if (n) parts.push(below1000(n));
  return parts.join(" ");
}

/** "Rupees One Thousand Nine Hundred Ninety Nine and Fifty Paise Only" — as Indian invoices write totals. */
export function rupeesInWords(paise: number): string {
  const r = Math.floor(paise / 100);
  const p = Math.round(paise % 100);
  return `Rupees ${inWords(r)}${p ? ` and ${below100(p)} Paise` : ""} Only`;
}
