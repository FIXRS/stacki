// Match empty fences first, as the Astro parser does. Keep a leading BOM out
// of the edit range so opening or editing code never changes the encoding.
export function frontmatterRange(source: string) {
  const start = source.startsWith('\uFEFF') ? 1 : 0;
  const match = /^---\r?\n(?:---|([\s\S]*?)\r?\n---)(?=\r?\n|$)/.exec(source.slice(start));
  return match ? { start, end: start + match[0].length, value: match[1] ?? '' } : undefined;
}
