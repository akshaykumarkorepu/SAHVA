/**
 * Turn what a receptionist types into E.164, or null if it is not a usable
 * Indian mobile number. People type "98765 43210", "098765-43210" or
 * "+91 98765 43210"; the database wants "+919876543210".
 */
export function toIndianE164(input: string): string | null {
  const digits = input.replace(/[^\d+]/g, "");
  let local: string;
  if (digits.startsWith("+91")) local = digits.slice(3);
  else if (digits.startsWith("91") && digits.length === 12) local = digits.slice(2);
  else if (digits.startsWith("0") && digits.length === 11) local = digits.slice(1);
  else local = digits;
  // Indian mobiles are 10 digits starting 6–9.
  return /^[6-9]\d{9}$/.test(local) ? `+91${local}` : null;
}
