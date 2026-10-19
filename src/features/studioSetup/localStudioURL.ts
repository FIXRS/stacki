export function localStudioURL(previewURL: string | undefined): string | undefined {
  if (!previewURL) {
    return undefined;
  }
  try {
    const url = new URL(previewURL);
    if (url.protocol !== 'http:') {
      return undefined;
    }
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
      return undefined;
    }
    if (url.username || url.password) {
      return undefined;
    }
    return new URL('/studio', url.origin).href;
  } catch {
    return undefined;
  }
}
