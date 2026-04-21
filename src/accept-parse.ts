export interface AcceptEntry {
  mediaType: string;
  q: number;
}

function parseQ(raw: string | undefined): number {
  if (!raw) return 1;
  const value = Number(raw);
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

export function parseAcceptHeader(value: string | null): AcceptEntry[] {
  if (!value) return [];

  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part): AcceptEntry => {
      const [rawType, ...rawParams] = part.split(";").map((x) => x.trim());
      const qParam = rawParams.find((x) => x.startsWith("q="));
      const q = parseQ(qParam?.slice(2));
      return { mediaType: rawType.toLowerCase(), q };
    });
}

export function qualityForMediaType(
  entries: AcceptEntry[],
  mediaType: string,
): number {
  const target = mediaType.toLowerCase();
  let best = -1;

  for (const entry of entries) {
    if (entry.mediaType === target) {
      best = Math.max(best, entry.q);
      continue;
    }

    if (entry.mediaType === "*/*") {
      best = Math.max(best, entry.q);
      continue;
    }

    const [targetType, targetSub] = target.split("/");
    const [entryType, entrySub] = entry.mediaType.split("/");
    if (entryType === targetType && entrySub === "*") {
      best = Math.max(best, entry.q);
      continue;
    }

    if (entryType === "*" && entrySub === targetSub) {
      best = Math.max(best, entry.q);
      continue;
    }
  }

  return best < 0 ? 0 : best;
}

function explicitIndex(entries: AcceptEntry[], mediaType: string): number {
  const target = mediaType.toLowerCase();
  const idx = entries.findIndex((entry) => entry.mediaType === target);
  return idx < 0 ? Infinity : idx;
}

export function prefersMarkdownOverHtml(accept: string | null): boolean {
  const entries = parseAcceptHeader(accept);
  const mdQ = qualityForMediaType(entries, "text/markdown");
  const htmlQ = qualityForMediaType(entries, "text/html");
  if (mdQ > htmlQ) return true;
  if (mdQ < htmlQ) return false;

  const mdIdx = explicitIndex(entries, "text/markdown");
  if (mdIdx === Infinity) return false;
  const htmlIdx = explicitIndex(entries, "text/html");
  return mdIdx < htmlIdx;
}
