/** Seeded xorshift32. State is persisted as an unsigned 32-bit integer. */
export function seedToRngState(seed: string | number): number {
  const text = String(seed);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const normalized = hash >>> 0;
  return normalized === 0 ? 0x9e3779b9 : normalized;
}

export function nextRng(state: number): { state: number; value: number } {
  let next = state >>> 0;
  next ^= next << 13;
  next ^= next >>> 17;
  next ^= next << 5;
  next >>>= 0;
  return { state: next, value: next / 0x1_0000_0000 };
}

export function randomIndex(state: number, length: number): { state: number; index: number } {
  if (!Number.isInteger(length) || length <= 0) throw new Error("A random selection requires at least one candidate.");
  const next = nextRng(state);
  return { state: next.state, index: Math.floor(next.value * length) };
}

export function shuffleSeeded<T>(state: number, values: readonly T[]): { state: number; values: T[] } {
  const shuffled = [...values];
  let nextState = state;
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const selected = randomIndex(nextState, index + 1);
    nextState = selected.state;
    const value = shuffled[index] as T;
    shuffled[index] = shuffled[selected.index] as T;
    shuffled[selected.index] = value;
  }
  return { state: nextState, values: shuffled };
}
