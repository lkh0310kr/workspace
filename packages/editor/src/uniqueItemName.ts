/** Return the first case-insensitively unused sibling name. */
export function nextEditorItemName(existingNames: Iterable<string>, base: string, extension: string): string {
  const names = new Set([...existingNames].map((name) => name.toLowerCase()));
  const first = `${base}${extension}`;
  if (!names.has(first.toLowerCase())) return first;
  let index = 1;
  while (names.has(`${base} ${index}${extension}`.toLowerCase())) index++;
  return `${base} ${index}${extension}`;
}
