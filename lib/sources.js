// Shared helpers used by both the browser (live Are.na refresh) and the
// GitHub Action build script. Plain ES module, no dependencies.

export const APPS = {
  arena: { label: "Are.na", tag: "gray" },
  cosmos: { label: "Cosmos", tag: "purple" },
  pinterest: { label: "Pinterest", tag: "red" },
  upload: { label: "Uploads", tag: "blue" },
};

export const CATEGORIES = {
  images: "Images",
  links: "Links",
  sources: "Sources",
};

export const KIND_LABELS = {
  image: "JPEG image",
  link: "Web link",
  video: "Video",
  pdf: "PDF document",
  text: "Text note",
};

const KIND_EXT = { image: "jpeg", link: "webloc", video: "mov", pdf: "pdf", text: "txt" };

export function isPlaceholder(value) {
  return !value || /your-/.test(String(value));
}

export function slugify(text, max = 34) {
  const s = String(text || "untitled")
    .toLowerCase()
    .replace(/https?:\/\//, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, max)
    .replace(/_+$/, "");
  return s || "untitled";
}

export function makeFilename(title, kind, ext) {
  const m = String(title || "").match(/^(.*)\.(jpe?g|png|webp|gif|avif|svg|pdf|txt|mov|mp4)$/i);
  if (m) return `${slugify(m[1])}.${m[2].toLowerCase()}`;
  return `${slugify(title)}.${ext || KIND_EXT[kind] || "file"}`;
}

/** Default category for a kind, overridable per channel/board in config.json */
export function categoryFor(kind, override) {
  if (override && override !== "auto") return override;
  if (kind === "image") return "images";
  if (kind === "link" || kind === "video") return "links";
  return "sources"; // pdf, text, quotes, attachments
}

function first(...vals) {
  for (const v of vals) if (v !== undefined && v !== null && v !== "") return v;
  return undefined;
}

// ---------------------------------------------------------------- Are.na

/** Normalise one Are.na block. Handles both the v2 and v3 API shapes. */
export function normalizeArenaBlock(b, channel = {}) {
  const cls = String(first(b.class, b.type, b.base_class, "")).toLowerCase();
  if (cls === "channel") return null; // nested channels are skipped

  const img = b.image || {};
  const imageUrl = first(
    img.display?.url, img.large?.url, img.original?.url,
    img.large?.src, img.medium?.src, img.src, img.url
  );
  const thumbUrl = first(img.thumb?.url, img.square?.url, img.small?.src, img.thumb?.src, imageUrl);
  const sourceUrl = first(b.source?.url, b.source_url);
  const attachment = b.attachment || {};

  let kind = "text";
  if (cls.includes("image")) kind = "image";
  else if (cls.includes("link")) kind = "link";
  else if (cls.includes("media") || cls.includes("embed")) kind = "video";
  else if (cls.includes("attachment")) kind = "pdf"; // attachments (pdf, docs, etc.) count as sources
  else if (cls.includes("text")) kind = "text";

  const text = first(b.content?.plain, typeof b.content === "string" ? b.content : undefined) ?? "";
  const title = first(b.title, b.generated_title, sourceUrl, text && text.slice(0, 60), "untitled");
  const description = first(b.description?.plain, typeof b.description === "string" ? b.description : undefined) ?? "";

  return {
    id: `arena-${b.id}`,
    app: "arena",
    kind,
    category: categoryFor(kind, channel.category),
    title: String(title).trim(),
    filename: makeFilename(title, kind, kind === "pdf" ? attachment.extension : undefined),
    image: imageUrl || null,
    thumb: thumbUrl || null,
    url: sourceUrl || first(attachment.url) || null,
    permalink: `https://www.are.na/block/${b.id}`,
    text: kind === "text" ? String(text).slice(0, 1200) : "",
    description: String(description).slice(0, 600),
    collection: channel.title || channel.slug || "",
    added_at: first(b.connected_at, b.connection?.connected_at, b.created_at) || null,
    created_at: first(b.created_at) || null,
  };
}

async function getJSON(url, headers = {}) {
  const res = await fetch(url, { headers: { Accept: "application/json", ...headers } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

/**
 * Fetch every block in a public Are.na channel.
 * Tries the current v3 API first, falls back to the classic v2 API.
 */
export async function fetchArenaChannel(channel, { token, maxPages = 20, per = 100 } = {}) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const slug = channel.slug;
  const items = [];
  let meta = { slug };

  const attempts = [
    { base: `https://api.are.na/v3/channels/${slug}/contents`, pick: (j) => first(j.data, j.contents, j.items, Array.isArray(j) ? j : undefined) },
    { base: `https://api.are.na/v2/channels/${slug}/contents`, pick: (j) => j.contents },
  ];

  let lastErr;
  for (const a of attempts) {
    try {
      items.length = 0;
      for (let page = 1; page <= maxPages; page++) {
        const json = await getJSON(`${a.base}?page=${page}&per=${per}&sort=position&direction=desc`, headers);
        const list = a.pick(json) || [];
        for (const b of list) {
          const n = normalizeArenaBlock(b, { ...channel, title: channel.title || slug });
          if (n) items.push(n);
        }
        if (list.length < per) break;
      }
      return { meta, items };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}
