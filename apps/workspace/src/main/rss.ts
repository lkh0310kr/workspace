import Parser from "rss-parser";

// RSS/Atom feed fetch+parse for the RSS Reader pane. rss-parser (not a
// hand-rolled XML parser) — handles RSS 2.0 + Atom + the namespace/
// encoding/malformed-feed quirks real-world feeds have, which a
// DOMParser-based approach would otherwise reinvent piecemeal.

export interface FeedItem {
  title: string;
  link: string;
  pubDate: string | null;
  contentSnippet: string | null;
}

export interface FeedResult {
  title: string;
  items: FeedItem[];
}

const parser = new Parser();

export async function fetchFeed(url: string): Promise<FeedResult> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("invalid feed URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("feed URL must be http or https");
  }

  let feed: Awaited<ReturnType<typeof parser.parseURL>>;
  try {
    feed = await parser.parseURL(url);
  } catch {
    // Why: don't leak rss-parser's raw error (can include internal
    // stack/URL details) to the renderer — a clean, generic message is
    // all the UI needs to show.
    throw new Error("failed to fetch or parse feed");
  }

  return {
    title: feed.title ?? url,
    items: (feed.items ?? []).map((item) => ({
      title: item.title ?? "(untitled)",
      link: item.link ?? "",
      pubDate: item.pubDate ?? null,
      contentSnippet: item.contentSnippet ?? null,
    })),
  };
}
