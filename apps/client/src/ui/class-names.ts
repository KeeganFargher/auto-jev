export function classNames(...names: readonly (string | false)[]): string {
  return names.filter((name) => name !== false).join(" ");
}
