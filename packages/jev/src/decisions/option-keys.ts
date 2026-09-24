export function optionKey(label: string, taken: ReadonlySet<string>): string {
  const base =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "option";

  let key = base;

  for (let suffix = 2; taken.has(key); suffix += 1) {
    key = `${base}_${suffix}`;
  }

  return key;
}
