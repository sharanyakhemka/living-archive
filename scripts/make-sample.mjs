// Generates data/sample.json — placeholder items shown until your real
// accounts are connected. Safe to delete once data/archive.json has items.
import { writeFile } from "node:fs/promises";

let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const grays = ["#2b2b2b", "#4a4a4a", "#6d6d6d", "#8f8f8f", "#b3b3b3", "#d1d1d1", "#e7e7e7"];
const tints = ["#c9b9a6", "#a9b8c4", "#c4a9a9", "#b7c4a9", "#d8cfc0", "#9aa3ad"];

function art(w, h) {
  const bg = pick(["#f4f3f0", "#eceae6", "#e3e3e3", "#d9d6d0", "#f7f7f7"]);
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${bg}"/>`;
  const n = 1 + Math.floor(rnd() * 3);
  for (let i = 0; i < n; i++) {
    const c = rnd() < 0.7 ? pick(grays) : pick(tints);
    const x = w * (0.15 + rnd() * 0.5), y = h * (0.15 + rnd() * 0.5);
    const a = w * (0.15 + rnd() * 0.35), b = h * (0.15 + rnd() * 0.4);
    const t = Math.floor(rnd() * 4);
    if (t === 0) s += `<rect x="${x}" y="${y}" width="${a}" height="${b}" rx="${rnd() * 14}" fill="${c}"/>`;
    else if (t === 1) s += `<ellipse cx="${x + a / 2}" cy="${y + b / 2}" rx="${a / 2}" ry="${b / 2.4}" fill="${c}"/>`;
    else if (t === 2) s += `<path d="M${x} ${y + b} Q${x + a / 2} ${y - b * 0.4} ${x + a} ${y + b}Z" fill="${c}"/>`;
    else s += `<rect x="${x}" y="${y}" width="${a * 0.35}" height="${b * 1.3}" rx="${a * 0.12}" fill="${c}"/><rect x="${x + a * 0.08}" y="${y - b * 0.12}" width="${a * 0.19}" height="${b * 0.16}" fill="${pick(grays)}"/>`;
  }
  s += `</svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(s);
}

const day = 864e5;
const now = Date.now();
const when = () => {
  const r = rnd();
  const back = r < 0.15 ? rnd() * 0.3 * day : r < 0.4 ? (1 + rnd() * 6) * day : r < 0.65 ? (8 + rnd() * 20) * day : (35 + rnd() * 160) * day;
  return new Date(now - back).toISOString();
};

const images = ["tylenol", "balm_dot_com", "hairtie", "trident_white", "fiskers_scissors", "bobby_pin", "teabag_loose", "receipt_atm", "canon_powershot", "keys3", "kindle", "guess_wallet", "thumbdrive_tomato", "bracelet", "victorias_secret_perfume", "tiffany_silver_earrings", "winekey", "aquaphor", "waterbottle", "tampons", "lipstick_knife", "half_eaten_pretzel", "pile_of_rocks", "red_lipstick", "sunglasses_with_case", "tissue", "sharpie", "brown_napkin", "teanie_beanie", "touchland", "diorlipoil_cherry", "supergoop_sunscreen"];
const apps = ["arena", "cosmos", "pinterest", "upload"];
const exts = ["jpeg", "webp", "png", "jpeg"];
const items = [];

images.forEach((name, i) => {
  const w = pick([300, 320, 260, 240, 340]), h = pick([300, 360, 240, 420, 280]);
  const app = apps[i % 4];
  const src = art(w, h);
  items.push({
    id: `sample-img-${i}`, app, kind: "image", category: "images",
    title: name.replace(/_/g, " "), filename: `${name}.${pick(exts)}`,
    image: src, thumb: src, url: null, permalink: null, text: "",
    description: "Placeholder — your real images appear here once your accounts are connected.",
    collection: { arena: "what's in my bag", cosmos: "objects", pinterest: "still life", upload: "uploads" }[app],
    added_at: when(), created_at: null,
  });
});

const links = [
  ["The Carrier Bag Theory of Fiction", "https://en.wikipedia.org/wiki/The_Carrier_Bag_Theory_of_Fiction"],
  ["Are.na — a platform for connecting ideas", "https://www.are.na/about"],
  ["Cosmos", "https://www.cosmos.so"],
  ["What's in my bag — archive essay", "https://example.com/whats-in-my-bag"],
  ["Material culture reading list", "https://example.com/material-culture"],
  ["Studio visit video", "https://example.com/studio-visit"],
  ["Object-oriented ontology primer", "https://example.com/ooo"],
];
links.forEach(([title, url], i) => items.push({
  id: `sample-link-${i}`, app: pick(["arena", "cosmos", "upload"]), kind: i === 5 ? "video" : "link", category: "links",
  title, filename: `${title.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 30)}.webloc`,
  image: null, thumb: null, url, permalink: url, text: "", description: "", collection: "references", added_at: when(), created_at: null,
}));

const sources = [
  ["le_guin_carrier_bag", "text", "Le Guin, U. K. (1986). The Carrier Bag Theory of Fiction. — “A leaf a gourd a shell a net a bag a sling a sack a bottle a pot a box a container. A holder. A recipient.”"],
  ["thesis_proposal_draft", "pdf", ""],
  ["field_notes_oct", "text", "Field notes, October: everything I carried on the subway for a week. Receipts accumulate faster than anything else. The bag is a diary nobody writes on purpose."],
  ["bibliography", "text", "Appadurai, A. (1986). The Social Life of Things.\nBrown, B. (2001). Thing Theory.\nBennett, J. (2010). Vibrant Matter."],
  ["interview_transcript_01", "pdf", ""],
  ["quote_perec", "text", "Perec, G. (1974). Species of Spaces — on the infra-ordinary: question your tea spoons."],
];
sources.forEach(([name, kind, text], i) => items.push({
  id: `sample-src-${i}`, app: pick(["arena", "upload"]), kind, category: "sources",
  title: name.replace(/_/g, " "), filename: `${name}.${kind === "pdf" ? "pdf" : "txt"}`,
  image: null, thumb: null, url: null, permalink: null, text, description: "", collection: "thesis", added_at: when(), created_at: null,
}));

// shuffle so the pile is mixed
items.sort(() => rnd() - 0.5);
await writeFile(new URL("../data/sample.json", import.meta.url), JSON.stringify({ generated_at: new Date().toISOString(), sample: true, items }, null, 1));
console.log(`sample.json: ${items.length} items`);
