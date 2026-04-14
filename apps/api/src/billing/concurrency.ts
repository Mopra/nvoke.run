const active = new Map<string, number>();

export function tryAcquire(userId: string, limit: number): boolean {
  const current = active.get(userId) ?? 0;
  if (current >= limit) return false;
  active.set(userId, current + 1);
  return true;
}

export function release(userId: string): void {
  const current = active.get(userId) ?? 0;
  if (current <= 1) active.delete(userId);
  else active.set(userId, current - 1);
}

export function currentInFlight(userId: string): number {
  return active.get(userId) ?? 0;
}

export function _resetForTests(): void {
  active.clear();
}
