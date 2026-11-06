export function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function sameObject(actual: unknown, expected: unknown): boolean {
  if (actual === expected) return true;
  if (!object(actual) || !object(expected)) return false;
  const keys = Object.keys(expected);
  return (
    Object.keys(actual).length === keys.length &&
    keys.every((key) => sameObject(actual[key], expected[key]))
  );
}
