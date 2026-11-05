// Living Archive — Finder-style front end. No build step, no dependencies.
import { APPS, CATEGORIES, KIND_LABELS, fetchArenaChannel, isPlaceholder } from "./lib/sources.js";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s = "") => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const store = {
  get(k, d) { try { const v = localStorage.getItem("la:" + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("la:" + k, JSON.stringify(v)); } catch {} },
};

// ───────────────────────────────────────────── state
const state = {
  items: [],
  config: {},
  demo: false,
  view: store.get("view", "icon"),
  sort: "none",
  filter: "all",
  query: "",
  size: store.get("size", 76),
  selected: null,
  colCat: null,
  mess: new Map(), // id -> {x, y, z}
  history: ["all"],
  hIndex: 0,
};

const els = new Map();     // id -> icon element
const heads = new Map();   // group key -> header element
const content = $("#content");
const stage = $("#stage");
const pane = $("#pane");

// ───────────────────────────────────────────── data
async function loadJSON(url) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(r.status);
  return r.json();
}

async function boot() {
  state.config = await loadJSON("config.json").catch(() => ({}));
  const site = state.config.site || {};
  if (site.folderName) $("#folderTitle").textContent = site.folderName;
  if (site.title) document.title = site.title;
  state.sort = site.defaultSort || "none";
  if (!store.get("view", null) && site.defaultView) state.view = site.defaultView;

  let data = await loadJSON("data/archive.json").catch(() => ({ items: [] }));
  if (!data.items?.length) {
    data = await loadJSON("data/sample.json").catch(() => ({ items: [] }));
    state.demo = true;
  }
  state.items = data.items || [];
  state.items.forEach((it, i) => (it._i = i));

  for (const it of state.items) els.set(it.id, makeIcon(it));
  stage.append(...els.values());

  bindUI();
  applySize();
  setView(state.view, false);
  setTimeout(liveRefresh, 1200);
}

// ───────────────────────────────────────────── helpers
const appOf = (it) => APPS[it.app] || APPS.upload;
const ext = (it) => (it.filename.split(".").pop() || "").toLowerCase();

function kindLabel(it) {
  if (it.kind === "image") {
    const e = ext(it);
    const map = { jpg: "JPEG image", jpeg: "JPEG image", png: "PNG image", webp: "WebP image", gif: "GIF image", svg: "SVG image", avif: "AVIF image" };
    return map[e] || "Image";
  }
  return KIND_LABELS[it.kind] || "Document";
}

function fmtDate(iso, short = false) {
  if (!iso) return "--";
  const d = new Date(iso);
  if (isNaN(d)) return "--";
  const now = new Date();
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const sameDay = (a, b) => a.toDateString() === b.toDateString();
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (sameDay(d, now)) return `Today at ${time}`;
  if (sameDay(d, y)) return `Yesterday at ${time}`;
  const date = d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
  return short ? date : `${date} at ${time}`;
}

function dateBucket(iso) {
  if (!iso) return { key: "z-unknown", label: "Unknown Date", order: 9e15 };
  const d = new Date(iso);
  const now = new Date();
  const days = (now - d) / 864e5;
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (d >= startToday) return { key: "a-today", label: "Today", order: 0 };
  if (days < 7) return { key: "b-7", label: "Previous 7 Days", order: 1 };
  if (days < 30) return { key: "c-30", label: "Previous 30 Days", order: 2 };
  const label = d.toLocaleDateString([], { month: "long", year: d.getFullYear() === now.getFullYear() ? undefined : "numeric" });
  return { key: `d-${d.getFullYear()}-${String(d.getMonth()).padStart(2, "0")}`, label, order: 3 + (now - d) / 1e12 };
}

function domain(url) {
  try { return new URL(url, location.href).hostname.replace(/^www\./, ""); } catch { return ""; }
}

const ICONS = {
  globe: `<svg class="globe" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.6 3.8 5.6 3.8 9s-1.2 6.4-3.8 9c-2.6-2.6-3.8-5.6-3.8-9S9.4 5.6 12 3z"/></svg>`,
  link: `<svg viewBox="0 0 20 20"><path d="M8.6 11.4a3 3 0 0 0 4.3 0l2.8-2.8a3 3 0 0 0-4.3-4.3l-1.1 1.1"/><path d="M11.4 8.6a3 3 0 0 0-4.3 0l-2.8 2.8a3 3 0 0 0 4.3 4.3l1.1-1.1"/></svg>`,
  play: `<svg viewBox="0 0 20 20"><path d="M7 5.5v9l7-4.5z" fill="currentColor"/></svg>`,
  doc: `<svg viewBox="0 0 20 20"><path d="M6 3h6l3 3v11H6z"/></svg>`,
  folder: `<svg class="folder" viewBox="0 0 20 18"><path d="M1 3.4C1 2.6 1.6 2 2.4 2h4.9l1.8 1.8h8.5c.8 0 1.4.6 1.4 1.4v9.4c0 .8-.6 1.4-1.4 1.4H2.4c-.8 0-1.4-.6-1.4-1.4z"/></svg>`,
  chev: `<svg class="chev" viewBox="0 0 10 10"><path d="m3.5 2 3 3-3 3"/></svg>`,
};

function docIcon(it) {
  if (it.kind === "link" || it.kind === "video") {
    return `<div class="doc link">${it.kind === "video" ? `<svg class="globe" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M10 8.5v7l5.5-3.5z" fill="currentColor"/></svg>` : ICONS.globe}<div class="domain">${esc(domain(it.url) || "link")}</div></div>`;
  }
  if (it.kind === "pdf") return `<div class="doc pdf"><div class="doc-text">${esc(it.title)}</div><div class="doc-band">PDF</div></div>`;
  return `<div class="doc text"><div class="doc-text">${esc((it.text || it.title).slice(0, 400))}</div></div>`;
}

function media(it, { lazy = true, big = false } = {}) {
  const src = big ? it.image || it.thumb : it.thumb || it.image;
  if (!src) return docIcon(it);
  const badge = it.kind === "link" ? ICONS.link : it.kind === "video" ? ICONS.play : it.kind === "pdf" ? ICONS.doc : "";
  return `<span class="imgwrap"><img ${lazy ? 'loading="lazy"' : ""} decoding="async" src="${esc(src)}" alt="${esc(it.title)}" data-id="${esc(it.id)}" draggable="false">${badge && !big ? `<span class="badge">${badge}</span>` : ""}</span>`;
}

// Broken image → fall back to the document icon
document.addEventListener("error", (e) => {
  const img = e.target;
  if (img.tagName !== "IMG" || !img.dataset.id) return;
  const it = state.items.find((i) => i.id === img.dataset.id);
  const wrap = img.closest(".imgwrap");
  if (it && wrap) wrap.outerHTML = docIcon(it);
}, true);

function makeIcon(it) {
  const el = document.createElement("div");
  el.className = "item";
  el.dataset.id = it.id;
  el.innerHTML = `<div class="thumb">${media(it)}</div><div class="label"><span class="dot ${appOf(it).tag}"></span><span class="name">${esc(it.filename)}</span></div>`;
  return el;
}

// ───────────────────────────────────────────── filtering + sorting
function visible() {
  const q = state.query.trim().toLowerCase();
  const [type, val] = state.filter.split(":");
  return state.items.filter((it) => {
    if (type === "cat" && it.category !== val) return false;
    if (type === "app" && it.app !== val) return false;
    if (q && !`${it.title} ${it.filename} ${it.collection} ${it.description} ${it.text}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

const APP_ORDER = ["arena", "cosmos", "pinterest", "upload"];
const KIND_ORDER = ["image", "link", "video", "pdf", "text"];
const CAT_ORDER = ["images", "links", "sources"];
const byDate = (a, b) => String(b.added_at || "").localeCompare(String(a.added_at || ""));
const byName = (a, b) => a.filename.localeCompare(b.filename, undefined, { numeric: true, sensitivity: "base" });

/** Returns [{key, label, items}] — label null means "no header". */
function grouped(list, sort = state.sort) {
  const group = (keyFn, labelFn, order) => {
    const m = new Map();
    for (const it of list) {
      const k = keyFn(it);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(it);
    }
    return [...m.entries()]
      .sort((a, b) => order(a[0]) - order(b[0]))
      .map(([k, items]) => ({ key: `${sort}:${k}`, label: labelFn(k, items), items: items.sort(byName) }));
  };
  switch (sort) {
    case "name": return [{ key: "name", label: null, items: [...list].sort(byName) }];
    case "kind": return group((i) => i.kind, (k) => ({ image: "Images", link: "Web Links", video: "Videos", pdf: "PDF Documents", text: "Text Notes" }[k] || k), (k) => KIND_ORDER.indexOf(k));
    case "app": return group((i) => i.app, (k) => appOf({ app: k }).label, (k) => APP_ORDER.indexOf(k));
    case "category": return group((i) => i.category, (k) => CATEGORIES[k] || k, (k) => CAT_ORDER.indexOf(k));
    case "date": {
      const m = new Map();
      for (const it of [...list].sort(byDate)) {
        const b = dateBucket(it.added_at);
        if (!m.has(b.key)) m.set(b.key, { ...b, items: [] });
        m.get(b.key).items.push(it);
      }
      return [...m.values()].sort((a, b) => a.order - b.order).map((g) => ({ key: `date:${g.key}`, label: g.label, items: g.items }));
    }
    default: return [{ key: "none", label: null, items: [...list].sort((a, b) => a._i - b._i) }];
  }
}
const flat = (groups) => groups.flatMap((g) => g.items);

// ───────────────────────────────────────────── icon view (the pile)
function cell() {
  const size = state.size;
  return { size, w: size + 54, h: size + 50 };
}

function randn() { // gaussian-ish
  return (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
}

function scatter(ids, force = false) {
  const W = content.clientWidth, H = content.clientHeight;
  const { w, h } = cell();
  let z = 1;
  const order = [...ids].sort(() => Math.random() - 0.5);
  for (const id of order) {
    if (!force && state.mess.has(id)) continue;
    const x = W / 2 + randn() * W * 0.36 - w / 2;
    const y = H / 2 + randn() * H * 0.36 - h / 2;
    state.mess.set(id, {
      x: Math.max(6, Math.min(W - w - 6, x)),
      y: Math.max(6, Math.min(H - h - 6, y)),
      z: z++ + Math.floor(Math.random() * 3),
    });
  }
}

function layoutIcons({ animate = true, stagger = false } = {}) {
  if (state.view !== "icon") return;
  const list = visible();
  const show = new Set(list.map((i) => i.id));
  const { w, h } = cell();
  const W = content.clientWidth;
  stage.style.setProperty("--cell-w", `${w}px`);

  for (const [id, el] of els) {
    el.classList.toggle("hide", !show.has(id));
    el.classList.toggle("no-anim", !animate);
  }

  const used = new Set();
  let stageH;

  if (state.sort === "none") {
    scatter(list.map((i) => i.id));
    const H = content.clientHeight;
    list.forEach((it, n) => {
      const p = state.mess.get(it.id);
      // keep pile inside the window if it was resized
      p.x = Math.max(4, Math.min(W - w - 4, p.x));
      p.y = Math.max(4, Math.min(Math.max(H, 200) - h - 4, p.y));
      place(els.get(it.id), p.x, p.y, p.z, stagger ? Math.min(n * 5, 380) : 0);
    });
    stageH = content.clientHeight;
  } else {
    const pad = 22;
    const cols = Math.max(1, Math.floor((W - pad * 2) / w));
    const cw = (W - pad * 2) / cols;
    let y = 16, n = 0;
    for (const g of grouped(list)) {
      if (g.label) {
        const head = header(g.key);
        head.innerHTML = `${esc(g.label)}<span class="gcount">${g.items.length}</span>`;
        head.style.width = `${W - pad * 2}px`;
        head.classList.remove("out");
        head.style.transform = `translate(${pad}px, ${y}px)`;
        used.add(g.key);
        y += 36;
      }
      g.items.forEach((it, i) => {
        const x = pad + (i % cols) * cw + (cw - w) / 2;
        const yy = y + Math.floor(i / cols) * h;
        place(els.get(it.id), x, yy, 1, stagger ? Math.min(n++ * 7, 520) : 0);
      });
      y += Math.ceil(g.items.length / cols) * h + 14;
    }
    stageH = y + 10;
  }

  for (const [k, head] of heads) if (!used.has(k)) head.classList.add("out");
  stage.style.height = `${Math.max(stageH, content.clientHeight)}px`;
  $("#empty").hidden = list.length > 0;
  if (!animate) requestAnimationFrame(() => els.forEach((el) => el.classList.remove("no-anim")));
}

function place(el, x, y, z, delay) {
  el.style.transitionDelay = delay ? `${delay}ms` : "";
  el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  el.style.zIndex = z;
  el._x = x; el._y = y;
}

function header(key) {
  if (!heads.has(key)) {
    const h = document.createElement("div");
    h.className = "ghead out";
    stage.append(h);
    heads.set(key, h);
  }
  return heads.get(key);
}

// dragging in the pile
function bindDrag() {
  let drag = null;
  stage.addEventListener("pointerdown", (e) => {
    const el = e.target.closest(".item");
    if (!el || e.button !== 0) { if (!el) select(null); return; }
    select(el.dataset.id);
    if (state.sort !== "none") return;
    drag = { el, id: el.dataset.id, sx: e.clientX, sy: e.clientY, ox: el._x, oy: el._y, moved: false };
    el.setPointerCapture(e.pointerId);
  });
  stage.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    if (!drag.moved) {
      drag.moved = true;
      drag.el.classList.add("dragging");
      const top = Math.max(...[...state.mess.values()].map((p) => p.z)) + 1;
      state.mess.get(drag.id).z = top;
    }
    const x = drag.ox + dx, y = drag.oy + dy;
    drag.el.style.transitionDelay = "";
    drag.el.style.transform = `translate(${x}px, ${y}px)`;
    drag.el._x = x; drag.el._y = y;
  });
  const end = () => {
    if (!drag) return;
    if (drag.moved) {
      const p = state.mess.get(drag.id);
      p.x = drag.el._x; p.y = drag.el._y;
      drag.el.style.zIndex = p.z;
      drag.el.classList.remove("dragging");
    }
    drag = null;
  };
  stage.addEventListener("pointerup", end);
  stage.addEventListener("pointercancel", end);
  stage.addEventListener("dblclick", (e) => {
    const el = e.target.closest(".item");
    if (el) quickLook(el.dataset.id);
  });
}

// ───────────────────────────────────────────── list view
const LIST_COLS = [
  { key: "name", label: "Name", w: "40%" },
  { key: "date", label: "Date Added", w: "20%" },
  { key: "kind", label: "Kind", w: "14%" },
  { key: "app", label: "Application", w: "12%" },
  { key: "category", label: "Collection", w: "14%" },
];

function renderList() {
  const before = new Map($$("tr.row", pane).map((r) => [r.dataset.id, r.getBoundingClientRect().top]));
  const groups = grouped(visible());
  let rows = "";
  for (const g of groups) {
    if (g.label) rows += `<tr class="grow"><td colspan="5">${esc(g.label)}</td></tr>`;
    for (const it of g.items) {
      rows += `<tr class="row${it.id === state.selected ? " selected" : ""}" data-id="${esc(it.id)}">
        <td class="n"><div class="cell-name"><span class="mini">${media(it)}</span><span class="dot ${appOf(it).tag}" style="margin-top:0"></span>${esc(it.filename)}</div></td>
        <td>${esc(fmtDate(it.added_at))}</td>
        <td>${esc(kindLabel(it))}</td>
        <td>${esc(appOf(it).label)}</td>
        <td>${esc(it.collection || CATEGORIES[it.category])}</td></tr>`;
    }
  }
  pane.innerHTML = `<table class="list"><colgroup>${LIST_COLS.map((c) => `<col style="width:${c.w}">`).join("")}</colgroup>
    <thead><tr>${LIST_COLS.map((c) => `<th data-sort="${c.key}" class="${state.sort === c.key ? "sorted" : ""}">${c.label}</th>`).join("")}</tr></thead>
    <tbody>${rows}</tbody></table>`;
  $("#empty").hidden = visible().length > 0;

  // FLIP: slide rows from old position to new one
  if (before.size) {
    for (const r of $$("tr.row", pane)) {
      const old = before.get(r.dataset.id);
      if (old == null) continue;
      const d = old - r.getBoundingClientRect().top;
      if (!d) continue;
      r.style.transition = "none";
      r.style.transform = `translateY(${d}px)`;
      requestAnimationFrame(() => requestAnimationFrame(() => { r.style.transition = ""; r.style.transform = ""; }));
    }
  }
}

// ───────────────────────────────────────────── column view
function renderColumns() {
  const list = visible();
  const counts = Object.fromEntries(CAT_ORDER.map((c) => [c, list.filter((i) => i.category === c).length]));
  if (!state.colCat || !counts[state.colCat]) state.colCat = CAT_ORDER.find((c) => counts[c]) || "images";
  const inCat = flat(grouped(list.filter((i) => i.category === state.colCat)));
  if (!inCat.find((i) => i.id === state.selected)) state.selected = null;
  const sel = inCat.find((i) => i.id === state.selected);

  pane.innerHTML = `<div class="columns ${sel ? "focus-2" : "focus-1"}">
    <div class="col">${CAT_ORDER.map((c) => `<button class="col-row${c === state.colCat ? " active" : ""}" data-cat="${c}">${ICONS.folder}<span class="t">${CATEGORIES[c]}</span><span class="k">${counts[c]}</span>${ICONS.chev}</button>`).join("")}</div>
    <div class="col">${inCat.map((it) => `<button class="col-row${it.id === state.selected ? " active" : ""}" data-id="${esc(it.id)}"><span class="mini">${media(it)}</span><span class="t">${esc(it.filename)}</span></button>`).join("")}</div>
    <div class="col preview">${sel ? previewHTML(sel) : ""}</div>
  </div>`;
  $("#empty").hidden = list.length > 0;
  const s = $(".col-row.active[data-id]", pane);
  if (s) s.scrollIntoView({ block: "nearest" });
}

function infoHTML(it) {
  const link = it.url ? `<a href="${esc(it.url)}" target="_blank" rel="noopener">${esc(domain(it.url) || it.url)}</a>` : "--";
  return `<div class="info"><h4>Information</h4><dl>
    <dt>Kind</dt><dd>${esc(kindLabel(it))}</dd>
    <dt>Category</dt><dd>${esc(CATEGORIES[it.category] || it.category)}</dd>
    <dt>Application</dt><dd><span class="dot ${appOf(it).tag}" style="display:inline-block;margin:0 5px 0 0"></span>${esc(appOf(it).label)}</dd>
    <dt>From</dt><dd>${esc(it.collection || "--")}</dd>
    <dt>Added</dt><dd>${esc(fmtDate(it.added_at))}</dd>
    <dt>Source</dt><dd>${link}</dd>
  </dl>${it.description ? `<p>${esc(it.description)}</p>` : ""}</div>`;
}

function previewHTML(it) {
  return `<div class="pv-media">${media(it, { lazy: false, big: true })}</div>
    <div class="pv-title">${esc(it.title)}</div>
    <div class="pv-sub">${esc(kindLabel(it))}</div>
    ${infoHTML(it)}
    <div class="pv-actions"><button class="pill" data-ql="${esc(it.id)}">Quick Look</button>${it.permalink ? `<a class="pill" href="${esc(it.permalink)}" target="_blank" rel="noopener">Open in ${esc(appOf(it).label)}</a>` : ""}</div>`;
}

// ───────────────────────────────────────────── gallery view
function renderGallery() {
  const list = flat(grouped(visible()));
  if (!list.find((i) => i.id === state.selected)) state.selected = list[0]?.id || null;
  const it = list.find((i) => i.id === state.selected);
  pane.innerHTML = `<div class="gallery">
    <div class="g-stage">${it ? media(it, { lazy: false, big: true }) : ""}</div>
    <aside class="g-side">${it ? `<div class="pv-title">${esc(it.title)}</div><div class="pv-sub">${esc(kindLabel(it))}</div>${infoHTML(it)}<div class="pv-actions"><button class="pill" data-ql="${esc(it.id)}">Quick Look</button>${it.permalink ? `<a class="pill" href="${esc(it.permalink)}" target="_blank" rel="noopener">Open</a>` : ""}</div>` : ""}</aside>
    <div class="g-strip">${list.map((x) => `<button class="${x.id === state.selected ? "active" : ""}" data-id="${esc(x.id)}" title="${esc(x.filename)}">${media(x)}</button>`).join("")}</div>
  </div>`;
  $("#empty").hidden = list.length > 0;
  const a = $(".g-strip .active", pane);
  if (a) a.scrollIntoView({ inline: "center", block: "nearest" });
}

// ───────────────────────────────────────────── render dispatch
function render(opts = {}) {
  if (state.view === "icon") layoutIcons(opts);
  else if (state.view === "list") renderList();
  else if (state.view === "columns") renderColumns();
  else renderGallery();
  updateChrome();
}

function setView(view, animate = true) {
  state.view = view;
  store.set("view", view);
  $$("#viewSwitch button").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
  const icon = view === "icon";
  stage.hidden = !icon;
  pane.hidden = icon;
  $("#sizeSlider").classList.toggle("off", !icon);
  content.style.overflow = view === "columns" || view === "gallery" ? "hidden" : "";
  pane.style.height = view === "columns" || view === "gallery" ? "100%" : "";
  const target = icon ? stage : pane;
  if (animate) { target.classList.remove("view-enter"); void target.offsetWidth; target.classList.add("view-enter"); }
  render({ animate: false });
}

function setSort(sort) {
  const was = state.sort;
  state.sort = sort;
  if (sort === "none" && was === "none") scatter(visible().map((i) => i.id), true);
  if (sort === "none" && was !== "none") scatter(visible().map((i) => i.id), true);
  if (state.view === "icon") content.scrollTo({ top: 0, behavior: "smooth" });
  render({ animate: true, stagger: true });
}

function setFilter(filter, push = true) {
  state.filter = filter;
  if (push) {
    state.history = state.history.slice(0, state.hIndex + 1);
    state.history.push(filter);
    state.hIndex = state.history.length - 1;
  }
  $$(".side-item").forEach((b) => b.classList.toggle("active", b.dataset.filter === filter && !b.classList.contains("tag")));
  if (filter.startsWith("cat:")) state.colCat = filter.slice(4);
  render({ animate: true, stagger: false });
  document.querySelector(".window").classList.remove("sidebar-open");
}

function updateChrome() {
  const n = visible().length;
  $("#count").textContent = `${n} item${n === 1 ? "" : "s"}${state.demo ? " · sample data" : ""}`;
  const [t, v] = state.filter.split(":");
  const crumb = t === "cat" ? CATEGORIES[v] : t === "app" ? APPS[v]?.label : null;
  $("#pathbar").innerHTML = `<span>${ICONS.folder}${esc($("#folderTitle").textContent)}</span>${crumb ? `<span>${ICONS.folder}${esc(crumb)}</span>` : ""}`;
  $$("#groupMenu button").forEach((b) => b.classList.toggle("checked", b.dataset.sort === state.sort));
  $("#backBtn").disabled = state.hIndex <= 0;
  $("#fwdBtn").disabled = state.hIndex >= state.history.length - 1;
}

function applySize() {
  stage.style.setProperty("--size", `${state.size}px`);
  $("#sizeRange").value = state.size;
}

function select(id) {
  state.selected = id;
  for (const [k, el] of els) el.classList.toggle("selected", k === id);
  if (state.view !== "icon") render();
}

// ───────────────────────────────────────────── quick look
function quickLook(id) {
  const it = state.items.find((i) => i.id === id);
  if (!it) return;
  state.selected = id;
  $("#qlTitle").textContent = it.filename;
  const open = $("#qlOpen");
  const href = it.url || it.permalink;
  open.hidden = !href;
  if (href) { open.href = href; open.textContent = it.url ? `Open ${domain(it.url) || "link"}` : `Open in ${appOf(it).label}`; }
  const showText = it.kind === "text" && it.text;
  $("#qlBody").innerHTML = `<div class="ql-media">${showText ? `<div class="ql-text">${esc(it.text)}</div>` : media(it, { lazy: false, big: true })}</div><aside class="ql-info"><div class="pv-title" style="text-align:left;margin-top:0">${esc(it.title)}</div>${infoHTML(it)}</aside>`;
  $("#ql").hidden = false;
}
const closeQL = () => ($("#ql").hidden = true);

// ───────────────────────────────────────────── live Are.na refresh
async function liveRefresh(manual = false) {
  const cfg = state.config.arena || {};
  const channels = (cfg.channels || []).filter((c) => !isPlaceholder(c.slug));
  if (!channels.length || (!cfg.liveRefreshInBrowser && !manual)) {
    if (manual) toast(state.demo ? "Showing sample items — connect your accounts in config.json" : "Up to date");
    return;
  }
  const have = new Set(state.items.map((i) => i.id));
  const fresh = [];
  for (const ch of channels) {
    try {
      const { items } = await fetchArenaChannel(ch, { maxPages: 1, per: 40 });
      for (const it of items) if (!have.has(it.id)) { have.add(it.id); fresh.push(it); }
    } catch { /* offline or CORS — the scheduled sync will catch up */ }
  }
  if (!fresh.length) { if (manual) toast("Up to date"); return; }
  if (state.demo) { // first real data replaces the sample pile
    state.items = []; els.forEach((el) => el.remove()); els.clear(); state.mess.clear(); state.demo = false;
  }
  fresh.forEach((it) => { it._i = -1; state.items.unshift(it); });
  state.items.forEach((it, i) => (it._i = i));
  for (const it of fresh) {
    const el = makeIcon(it);
    el.classList.add("new");
    els.set(it.id, el);
    stage.append(el);
  }
  render({ animate: false });
  toast(`${fresh.length} new item${fresh.length === 1 ? "" : "s"} from Are.na`);
}

let toastTimer;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 2600);
}

// ───────────────────────────────────────────── UI wiring
function bindUI() {
  bindDrag();

  $("#viewSwitch").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (b && b.dataset.view !== state.view) setView(b.dataset.view);
  });

  const menus = [["#groupBtn", "#groupMenu"], ["#moreBtn", "#moreMenu"]];
  const closeMenus = () => menus.forEach(([b, m]) => { $(m).hidden = true; $(b).setAttribute("aria-expanded", "false"); });
  for (const [b, m] of menus) {
    $(b).addEventListener("click", (e) => {
      e.stopPropagation();
      const open = $(m).hidden;
      closeMenus();
      $(m).hidden = !open;
      $(b).setAttribute("aria-expanded", String(open));
    });
  }
  document.addEventListener("click", closeMenus);
  $("#groupMenu").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-sort]");
    if (b) setSort(b.dataset.sort);
  });
  $("#moreMenu").addEventListener("click", (e) => {
    const a = e.target.closest("button")?.dataset.action;
    if (a === "shuffle") shuffle();
    if (a === "refresh") liveRefresh(true);
    if (a === "about") toast(`${state.items.length} items · synced from Are.na, Cosmos & Pinterest`);
  });
  $("#tagBtn").addEventListener("click", shuffle);
  $("#shareBtn").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(location.href); toast("Link copied"); } catch { toast(location.href); }
  });

  $$(".side-item").forEach((b) => b.addEventListener("click", () => setFilter(b.dataset.filter)));
  $("#sidebarToggle").addEventListener("click", () => $(".window").classList.toggle("sidebar-open"));
  $("#backBtn").addEventListener("click", () => { if (state.hIndex > 0) setFilter(state.history[--state.hIndex], false); });
  $("#fwdBtn").addEventListener("click", () => { if (state.hIndex < state.history.length - 1) setFilter(state.history[++state.hIndex], false); });

  const search = $("#search"), input = $("#searchInput");
  $("#searchBtn").addEventListener("click", () => { search.classList.add("open"); input.focus(); });
  input.addEventListener("input", () => { state.query = input.value; render({ animate: true }); });
  input.addEventListener("blur", () => { if (!input.value) search.classList.remove("open"); });

  $("#sizeRange").addEventListener("input", (e) => {
    state.size = +e.target.value;
    store.set("size", state.size);
    applySize();
    layoutIcons({ animate: false });
  });

  pane.addEventListener("click", (e) => {
    const th = e.target.closest("th[data-sort]");
    if (th) return setSort(state.sort === th.dataset.sort ? "none" : th.dataset.sort);
    const ql = e.target.closest("[data-ql]");
    if (ql) return quickLook(ql.dataset.ql);
    const cat = e.target.closest("[data-cat]");
    if (cat) { state.colCat = cat.dataset.cat; state.selected = null; return render(); }
    const row = e.target.closest("[data-id]");
    if (row) select(row.dataset.id);
  });
  pane.addEventListener("dblclick", (e) => {
    const row = e.target.closest("tr.row, .col-row[data-id], .g-stage");
    if (row) quickLook(row.dataset.id || state.selected);
  });

  $("#qlClose").addEventListener("click", closeQL);
  $("#ql").addEventListener("click", (e) => { if (e.target.id === "ql") closeQL(); });

  document.addEventListener("keydown", (e) => {
    if (e.target.matches("input")) { if (e.key === "Escape") e.target.blur(); return; }
    if (e.key === "Escape") return closeQL();
    if (e.key === " " && state.selected) { e.preventDefault(); return $("#ql").hidden ? quickLook(state.selected) : closeQL(); }
    if (e.metaKey || e.ctrlKey) {
      const v = { 1: "icon", 2: "list", 3: "columns", 4: "gallery" }[e.key];
      if (v) { e.preventDefault(); setView(v); }
      return;
    }
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key) && state.view !== "icon") {
      const list = state.view === "columns" ? flat(grouped(visible().filter((i) => i.category === state.colCat))) : flat(grouped(visible()));
      const i = list.findIndex((x) => x.id === state.selected);
      const step = e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 1;
      const next = list[Math.max(0, Math.min(list.length - 1, i + step))];
      if (next) { e.preventDefault(); select(next.id); if (!$("#ql").hidden) quickLook(next.id); }
    }
  });

  let rt;
  new ResizeObserver(() => { clearTimeout(rt); rt = setTimeout(() => layoutIcons({ animate: true }), 80); }).observe(content);
}

function shuffle() {
  state.sort = "none";
  scatter(visible().map((i) => i.id), true);
  if (state.view !== "icon") setView("icon");
  render({ animate: true, stagger: true });
}

boot();
