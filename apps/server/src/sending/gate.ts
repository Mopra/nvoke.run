// The country gate (docs/sending/plan.md).

export function recipientCountry(o: { location: string | null; domain: string }): string | null {
  void o;
  throw new Error('not implemented');
}

export function isBlockedCountry(country: string | null): boolean {
  void country;
  throw new Error('not implemented');
}

export function timezoneFor(country: string | null, location?: string | null): string {
  void country; void location;
  throw new Error('not implemented');
}
