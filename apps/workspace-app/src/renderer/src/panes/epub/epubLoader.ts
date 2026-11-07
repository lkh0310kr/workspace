export function epubZipEntryUrl(bookId: string, name: string): string {
  const encoded = name
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
  return `workspace-epub://${bookId}/${encoded}`;
}

export interface EpubProtocolLoader {
  loadText: (name: string) => Promise<string | null>;
  loadBlob: (name: string) => Promise<Blob | null>;
  getSize: (name: string) => number;
}

export function protocolLoader(bookId: string, sizes: Record<string, number>): EpubProtocolLoader {
  const entries = new Set(Object.keys(sizes));
  const normalize = (name: string): string => name.replace(/\\/g, "/");
  // foliate probes optional files (encryption.xml, the iBooks/Kobo
  // display-options) on every book. `sizes` already lists the whole zip,
  // so answering from it keeps those probes off the network instead of
  // logging a 404 per miss.
  const has = (name: string): boolean => entries.has(normalize(name));

  return {
    loadText: async (name: string) => {
      if (!has(name)) return null;
      const response = await fetch(epubZipEntryUrl(bookId, name));
      return response.ok ? response.text() : null;
    },
    loadBlob: async (name: string) => {
      if (!has(name)) return null;
      const response = await fetch(epubZipEntryUrl(bookId, name));
      return response.ok ? response.blob() : null;
    },
    getSize: (name: string) => sizes[normalize(name)] ?? 0,
  };
}
