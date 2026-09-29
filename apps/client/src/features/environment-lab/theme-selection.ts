export function resolveTheme<T extends { id: string }>(
  themes: readonly T[],
  requestedId: string | null,
  saved: T,
): T {
  if (requestedId === null) {
    return saved;
  }

  const theme = themes.find((option) => option.id === requestedId);

  if (theme === undefined) {
    const known = themes.map((option) => option.id).join(", ");

    throw new Error(`Unknown board theme "${requestedId}" in the URL hash; known themes: ${known}`);
  }

  return theme;
}
