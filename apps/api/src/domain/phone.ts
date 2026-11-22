export function normalizeSriLankanMobileNumber(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.startsWith('94')) return digits.slice(2);
  if (digits.startsWith('0')) return digits.slice(1);
  return digits;
}

export function phoneNumbersMatch(storedPhone: string, providedPhone: string): boolean {
  return (
    normalizeSriLankanMobileNumber(storedPhone) === normalizeSriLankanMobileNumber(providedPhone)
  );
}
