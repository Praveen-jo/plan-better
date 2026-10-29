import { useEffect, useState } from 'react';

/** Prototype-only: free photos from the Wikipedia search + pageimages API (CORS-enabled, no key). */
const cache = new Map<string, Promise<string | null>>();

export function wikiImage(query: string, size = 600): Promise<string | null> {
  const key = `${query}|${size}`;
  let p = cache.get(key);
  if (!p) {
    const url = `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrlimit=5&prop=pageimages&piprop=thumbnail&pithumbsize=${size}&format=json&origin=*`;
    p = fetch(url)
      .then((r) => r.json())
      .then((j) => {
        const pages: any[] = Object.values(j?.query?.pages ?? {});
        pages.sort((a, b) => (a.index ?? 99) - (b.index ?? 99));
        return pages.find((x) => x.thumbnail?.source && !/(map|locator|district|list of|flag|logo|emblem|seal)/i.test(x.title))?.thumbnail.source ?? null;
      })
      .catch(() => null);
    cache.set(key, p);
  }
  return p;
}

/** First query that yields a picture wins; null while loading or if none do. */
export function useWikiImage(queries: string[], size = 600): string | null {
  const joined = queries.join('||');
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setSrc(null);
    (async () => {
      for (const q of joined.split('||')) {
        if (!q) continue;
        const s = await wikiImage(q, size);
        if (s) {
          if (live) setSrc(s);
          return;
        }
      }
    })();
    return () => {
      live = false;
    };
  }, [joined, size]);
  return src;
}
