#!/usr/bin/env node
// Pulls everything from Are.na, Pinterest, Cosmos, the uploads/ folder and
// data/manual.json into one file: data/archive.json.
// Runs in the GitHub Action on a schedule; you can also run it locally:
//   node scripts/build-archive.mjs
// Node 18+ (uses built-in fetch). No npm install needed.

import { readFile, writeFile, readdir, stat, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  fetchArenaChannel, categoryFor, makeFilename, isPlaceholder, slugify,
} from "../lib/sources.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "data", "archive.json");
const UA = "Mozilla/5.0 (compatible; LivingArchiveBot/1.0; +https://github.com)";

const log = (...a) => console.log("•", ...a);
const warn = (...a) => console.warn("⚠", ...a);

async function readJSON(file, fallback) {
  try { return JSON.parse(await readFile(file, "utf8")); } catch { return fallback; }
}

// ------------------------------------------------------------------ Pinterest
// Public board RSS: https://www.pinterest.com/<user>/<board>.rss
function pinterestRssUrl(boardUrl) {
  const u = new URL(boardUrl);
  const parts = u.pathname.split("/").filter(Boolean);
  if (parts.length === 1) return `https://www.pinterest.com/${parts[0]}/feed.rss`;
  return `https://www.pinterest.com/${parts[0]}/${parts[1]}.rss`;
}

const decode = (s = "") => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'").replace(/&amp;/g, "&").trim();
const tag = (xml, name) => decode((xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`)) || [])[1]);

async function fetchPinterestBoard(board) {
  const rss = pinterestRssUrl(board.url);
  const res = await fetch(rss, { headers: { "User-Agent": UA, Accept: "application/rss+xml,text/xml" } });
  if (!res.ok) throw new Error(`${res.status} for ${rss}`);
  const xml = await res.text();
  const boardTitle = tag(xml, "title") || "Pinterest";
  const items = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const it = m[1];
    const link = tag(it, "link");
    const desc = tag(it, "description");
    let img = (desc.match(/<img[^>]+src="([^"]+)"/) || [])[1];
    if (!img) continue;
    const big = img.replace(/\/\d+x\//, "/736x/");
    const title = tag(it, "title") || desc.replace(/<[^>]+>/g, "").trim() || "pin";
    const pinId = (link.match(/pin\/(\d+)/) || [])[1] || slugify(link, 60);
    const date = tag(it, "pubDate");
    items.push({
      id: `pinterest-${pinId}`,
      app: "pinterest",
      kind: "image",
      category: categoryFor("image", board.category),
      title,
      filename: makeFilename(title, "image"),
      image: big,
      thumb: img,
      url: link,
      permalink: link,
      text: "",
      description: desc.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 400),
      collection: boardTitle,
      added_at: date ? new Date(date).toISOString() : null,
      created_at: null,
    });
  }
  return items;
}

// --------------------------------------------------------------------- Cosmos
// Cosmos has no official public API. If you add a SCRAPECREATORS_API_KEY
// secret, clusters are pulled through ScrapeCreators' (unofficial, paid) API.
// Without it, save images into uploads/cosmos/ instead (see README).
function pickArray(json) {
  if (Array.isArray(json)) return json;
  for (const k of ["posts", "items", "data", "results", "elements"]) {
    if (Array.isArray(json?.[k])) return json[k];
    if (Array.isArray(json?.data?.[k])) return json.data[k];
  }
  return [];
}

async function fetchCosmosCluster(cluster, key) {
  const items = [];
  let cursor = null;
  for (let page = 0; page < 10; page++) {
    const q = new URLSearchParams({ url: cluster.url });
    if (cursor) q.set("cursor", cursor);
    const res = await fetch(`https://api.scrapecreators.com/v1/cosmos/cluster/posts?${q}`, {
      headers: { "x-api-key": key },
    });
    if (!res.ok) throw new Error(`${res.status} for Cosmos ${cluster.url}`);
    const json = await res.json();
    for (const p of pickArray(json)) {
      const media = Array.isArray(p.media) ? p.media[0] : p.media;
      const image = p.image_url || p.media_url || p.image || media?.url || media?.image_url || p.thumbnail_url || p.cover_image_url;
      if (!image) continue;
      const title = p.caption || p.title || p.description || p.source_url || "cosmos element";
      items.push({
        id: `cosmos-${p.id ?? slugify(image, 60)}`,
        app: "cosmos",
        kind: "image",
        category: categoryFor("image", cluster.category),
        title: String(title).slice(0, 120),
        filename: makeFilename(title, "image"),
        image, thumb: image,
        url: p.source_url || p.link || p.url || cluster.url,
        permalink: p.url || cluster.url,
        text: "", description: String(p.description || "").slice(0, 400),
        collection: json.name || cluster.url.split("/").pop(),
        added_at: p.created_at || p.saved_at || null,
        created_at: p.created_at || null,
      });
    }
    cursor = json.next_cursor || json.cursor || json.pagination?.next_cursor;
    if (!cursor) break;
  }
  return items;
}

// -------------------------------------------------------------------- uploads
// Anything you drop into uploads/ becomes an item.
//   uploads/arena|cosmos|pinterest/...  -> tagged with that app
//   .../images|links|sources/...        -> forced into that category
const IMG = /\.(jpe?g|png|gif|webp|avif|svg)$/i;
const DOC = /\.(pdf|docx?|txt|md|epub)$/i;

function gitAddedDate(file) {
  try {
    const out = execFileSync("git", ["log", "--diff-filter=A", "--follow", "--format=%aI", "--", file], { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] }).toString().trim().split("\n").pop();
    return out || null;
  } catch { return null; }
}

async function walk(dir) {
  let out = [];
  for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const p = path.join(dir, e.name);
    if (e.name.startsWith(".")) continue;
    if (e.isDirectory()) out = out.concat(await walk(p));
    else out.push(p);
  }
  return out;
}

async function scanUploads() {
  const dir = path.join(ROOT, "uploads");
  const items = [];
  for (const file of await walk(dir)) {
    const rel = path.relative(ROOT, file).split(path.sep).join("/");
    const name = path.basename(file);
    if (!IMG.test(name) && !DOC.test(name)) continue;
    if (/^readme\./i.test(name)) continue;
    const segs = rel.toLowerCase().split("/");
    const app = ["arena", "cosmos", "pinterest"].find((a) => segs.includes(a)) || "upload";
    const forced = ["images", "links", "sources"].find((c) => segs.includes(c));
    const kind = IMG.test(name) ? "image" : name.toLowerCase().endsWith(".pdf") ? "pdf" : "text";
    const st = await stat(file);
    const added = gitAddedDate(rel) || st.mtime.toISOString();
    const url = encodeURI(rel);
    items.push({
      id: `upload-${slugify(rel, 80)}`,
      app, kind,
      category: categoryFor(kind, forced),
      title: name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "),
      filename: name,
      image: kind === "image" ? url : null,
      thumb: kind === "image" ? url : null,
      url, permalink: url,
      text: "", description: "",
      collection: path.dirname(rel).replace(/^uploads\/?/, "") || "uploads",
      added_at: added, created_at: added,
      size: st.size,
    });
  }
  return items;
}

// --------------------------------------------------------------------- manual
// data/manual.json lets you add links / citations / anything by hand.
async function manualItems() {
  const list = await readJSON(path.join(ROOT, "data", "manual.json"), []);
  return list.filter((m) => m && m.title && !m._example).map((m, i) => {
    const kind = m.kind || (m.image ? "image" : m.url ? "link" : "text");
    return {
      id: m.id || `manual-${slugify(m.title, 60)}-${i}`,
      app: m.app || "upload",
      kind,
      category: categoryFor(kind, m.category),
      title: m.title,
      filename: m.filename || makeFilename(m.title, kind),
      image: m.image || null, thumb: m.thumb || m.image || null,
      url: m.url || null, permalink: m.url || null,
      text: m.text || m.citation || "",
      description: m.description || "",
      collection: m.collection || "manual",
      added_at: m.added_at || m.date || null,
      created_at: m.date || null,
    };
  });
}

// ----------------------------------------------------------------------- main
async function main() {
  const config = await readJSON(path.join(ROOT, "config.json"), {});
  const previous = await readJSON(OUT, { items: [] });
  const keepPrevious = (app) => (previous.items || []).filter((i) => i.app === app);

  const status = {};
  const all = [];

  // Are.na
  const channels = (config.arena?.channels || []).filter((c) => !isPlaceholder(c.slug));
  if (channels.length) {
    const got = [];
    let failed = false;
    for (const ch of channels) {
      try {
        const { items } = await fetchArenaChannel(ch, { token: process.env.ARENA_TOKEN });
        log(`Are.na ${ch.slug}: ${items.length} blocks`);
        got.push(...items);
      } catch (e) { failed = true; warn(`Are.na ${ch.slug}: ${e.message}`); }
    }
    all.push(...(failed && !got.length ? keepPrevious("arena") : got));
    status.arena = failed ? "partial" : "ok";
  }

  // Pinterest
  const boards = (config.pinterest?.boards || []).filter((b) => !isPlaceholder(b.url));
  if (boards.length) {
    const got = [];
    let failed = false;
    for (const b of boards) {
      try {
        const items = await fetchPinterestBoard(b);
        log(`Pinterest ${b.url}: ${items.length} pins`);
        got.push(...items);
      } catch (e) { failed = true; warn(`Pinterest ${b.url}: ${e.message}`); }
    }
    // RSS only returns the latest ~25 pins, so we merge with what we had before.
    const merged = new Map(keepPrevious("pinterest").map((i) => [i.id, i]));
    for (const i of got) merged.set(i.id, i);
    all.push(...merged.values());
    status.pinterest = failed ? "partial" : "ok";
  }

  // Cosmos
  const clusters = (config.cosmos?.clusters || []).filter((c) => !isPlaceholder(c.url));
  const key = process.env.SCRAPECREATORS_API_KEY;
  if (clusters.length && key) {
    const got = [];
    let failed = false;
    for (const c of clusters) {
      try {
        const items = await fetchCosmosCluster(c, key);
        log(`Cosmos ${c.url}: ${items.length} elements`);
        got.push(...items);
      } catch (e) { failed = true; warn(`Cosmos ${c.url}: ${e.message}`); }
    }
    const merged = new Map(keepPrevious("cosmos").filter((i) => !i.id.startsWith("upload-")).map((i) => [i.id, i]));
    for (const i of got) merged.set(i.id, i);
    all.push(...merged.values());
    status.cosmos = failed ? "partial" : "ok";
  } else if (clusters.length) {
    log("Cosmos: no SCRAPECREATORS_API_KEY set — using uploads/cosmos/ only");
  }

  // uploads + manual
  const uploads = await scanUploads();
  log(`uploads/: ${uploads.length} files`);
  all.push(...uploads, ...(await manualItems()));

  // de-dupe, newest first
  const byId = new Map();
  for (const it of all) if (!byId.has(it.id)) byId.set(it.id, it);
  const items = [...byId.values()].sort((a, b) => String(b.added_at || "").localeCompare(String(a.added_at || "")));

  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify({ generated_at: new Date().toISOString(), status, items }, null, 2));
  log(`wrote ${items.length} items → data/archive.json`);
}

main().catch((e) => { console.error(e); process.exit(1); });
