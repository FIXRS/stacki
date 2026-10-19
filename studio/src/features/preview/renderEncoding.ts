import { gzipSync } from 'node:zlib';

// WebSocket HTML is otherwise sent uncompressed. Keep ordinary small replies
// simple; repetitive page markup benefits greatly from one gzip payload.
export function encodeRenderedHTML(html: string): { html: string } | { htmlGzip: string } {
  if (html.length < 16_000) {
    return { html };
  }
  const compressed = gzipSync(html, { level: 1 }).toString('base64');
  return compressed.length < html.length * 0.9 ? { htmlGzip: compressed } : { html };
}
