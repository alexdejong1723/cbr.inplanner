/**
 * Eenvoudige in-memory limiter (per proces). Voor productie met meerdere
 * instanties: vervangen door een gedeelde store (Redis/DB).
 */
const g = globalThis as unknown as { __rl?: Map<string, number[]> };
const hits: Map<string, number[]> = (g.__rl ??= new Map<string, number[]>());

function recent(key: string, windowMs: number): number[] {
  const list = (hits.get(key) ?? []).filter((t) => Date.now() - t < windowMs);
  hits.set(key, list);
  return list;
}

export const isLimited = (key: string, max: number, windowMs: number) => recent(key, windowMs).length >= max;
export const recordHit = (key: string, windowMs: number) => hits.set(key, [...recent(key, windowMs), Date.now()]);

/** Telt een poging en zegt of die nog mag. */
export function allow(key: string, max: number, windowMs: number): boolean {
  if (isLimited(key, max, windowMs)) return false;
  recordHit(key, windowMs);
  return true;
}
