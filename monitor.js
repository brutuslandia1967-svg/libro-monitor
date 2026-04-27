// monitor.js
// Monitor de disponibilidad para:
//   "Valoración Inmobiliaria" — Manuel G. Alcázar Molina
//   Editorial Montecorvo, S.A. (2003) | ISBN 9788471114273
//
// Polea Iberlibro, Uniliber y Todocoleccion. Cuando aparece un listado
// nuevo respecto a la última ejecución, envía un email vía SMTP.

import * as cheerio from "cheerio";
import fs from "fs/promises";
import path from "path";
import nodemailer from "nodemailer";
import "dotenv/config";

// ───────────────────────────────────────────────
// CONFIG
// ───────────────────────────────────────────────
const ISBN = "9788471114273";
const TITLE_QUERY = "alcazar valoracion inmobiliaria montecorvo";
const STATE_FILE = path.resolve("./seen-listings.json");

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const SMTP = {
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || "587", 10),
  user: process.env.SMTP_USER,
  pass: process.env.SMTP_PASS,
  to: process.env.NOTIFY_TO,
  from: process.env.NOTIFY_FROM || process.env.SMTP_USER,
};

// ───────────────────────────────────────────────
// FUENTES
// Cada parser devuelve { title, price, seller, link } por listado.
// Los selectores son heurísticos — si una web cambia su HTML, ajusta
// los selectores de su `parse()` correspondiente.
// ───────────────────────────────────────────────
const SOURCES = [
  {
    name: "Iberlibro",
    url: `https://www.iberlibro.com/servlet/SearchResults?isbn=${ISBN}&sts=t`,
    base: "https://www.iberlibro.com",
    parse: ($) => {
      const items = [];
      $(
        'li[data-cy="listing-item"], .result-data, .cf.result-data, div.result-item'
      ).each((_, el) => {
        const $el = $(el);
        const title = $el
          .find('[data-cy="listing-title"], .title, h2 a')
          .first()
          .text()
          .trim();
        const price = $el
          .find('[data-cy="listing-price"], .item-price, .price')
          .first()
          .text()
          .trim();
        const seller = $el
          .find('[data-cy="listing-seller"], .bookseller-name')
          .first()
          .text()
          .trim();
        const link = $el.find("a").first().attr("href") || "";
        if (title || price) items.push({ title, price, seller, link });
      });
      return items;
    },
  },
  {
    name: "Uniliber",
    url: `https://www.uniliber.com/Buscar?Termino=${encodeURIComponent(ISBN)}`,
    base: "https://www.uniliber.com",
    parse: ($) => {
      const items = [];
      $(".libro, article.producto, .producto, .item-libro").each((_, el) => {
        const $el = $(el);
        const title = $el.find("h2, h3, .titulo").first().text().trim();
        const price = $el.find(".precio, .price").first().text().trim();
        const seller = $el.find(".librero, .vendedor").first().text().trim();
        const link = $el.find("a").first().attr("href") || "";
        if (title || price) items.push({ title, price, seller, link });
      });
      return items;
    },
  },
  {
    name: "Todocoleccion",
    url: `https://www.todocoleccion.net/buscador?bu=${encodeURIComponent(
      TITLE_QUERY
    )}`,
    base: "https://www.todocoleccion.net",
    parse: ($) => {
      const items = [];
      $("article, .lista-item, .lote-tarjeta, .item-resultado").each((_, el) => {
        const $el = $(el);
        const title = $el.find("h2, h3, .titulo").first().text().trim();
        const price = $el.find(".precio, .price, .euros").first().text().trim();
        const link = $el.find("a").first().attr("href") || "";
        if (title || price) items.push({ title, price, seller: "", link });
      });
      return items;
    },
  },
];

// ───────────────────────────────────────────────
// UTILIDADES
// ───────────────────────────────────────────────
async function loadState() {
  try {
    return JSON.parse(await fs.readFile(STATE_FILE, "utf-8"));
  } catch {
    return null; // null = primera ejecución (se establece baseline en silencio)
  }
}

async function saveState(state) {
  await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
}

const keyOf = (it) => [it.link, it.title, it.price].join("||");

const absUrl = (base, href) => {
  if (!href) return "";
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
};

async function fetchSource(src) {
  const res = await fetch(src.url, {
    headers: {
      "User-Agent": UA,
      "Accept-Language": "es-ES,es;q=0.9,en;q=0.7",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);
  const items = src.parse($).map((it) => ({
    ...it,
    link: absUrl(src.base, it.link),
  }));
  return items;
}

async function sendEmail(subject, html) {
  if (!SMTP.host || !SMTP.user || !SMTP.to) {
    console.warn("⚠️  SMTP no configurado en .env — omito email.");
    console.log("\n────── EMAIL QUE SE HABRÍA ENVIADO ──────\n");
    console.log(`Asunto: ${subject}`);
    console.log(html.replace(/<[^>]+>/g, ""));
    return;
  }
  const t = nodemailer.createTransport({
    host: SMTP.host,
    port: SMTP.port,
    secure: SMTP.port === 465,
    auth: { user: SMTP.user, pass: SMTP.pass },
  });
  await t.sendMail({ from: SMTP.from, to: SMTP.to, subject, html });
  console.log(`✉️  Email enviado a ${SMTP.to}`);
}

function renderEmail(findings, ts) {
  let h = `<h2>📚 Nuevo ejemplar detectado</h2>`;
  h += `<p><small>${ts}</small></p>`;
  h += `<p><strong>Alcázar Molina, M. (2003).</strong> <em>Valoración Inmobiliaria</em>. `;
  h += `Madrid: Editorial Montecorvo, S.A. ISBN ${ISBN}</p>`;
  for (const f of findings) {
    h += `<h3>${f.source} — ${f.items.length} listado(s) nuevo(s)</h3><ul>`;
    for (const it of f.items) {
      h += `<li style="margin-bottom:10px">`;
      if (it.title) h += `<strong>${it.title}</strong><br>`;
      if (it.price) h += `💰 ${it.price}<br>`;
      if (it.seller) h += `🏪 ${it.seller}<br>`;
      if (it.link) h += `<a href="${it.link}">→ Ver listado</a>`;
      h += `</li>`;
    }
    h += `</ul>`;
  }
  return h;
}

// ───────────────────────────────────────────────
// MAIN
// ───────────────────────────────────────────────
async function main() {
  const ts = new Date().toISOString();
  console.log(`\n🔍 [${ts}] Verificando disponibilidad…\n`);

  const previous = await loadState();
  const isFirstRun = previous === null;
  const state = previous || {};
  const findings = [];

  for (const src of SOURCES) {
    try {
      console.log(`  → ${src.name}`);
      const items = await fetchSource(src);
      const seen = new Set(state[src.name] || []);
      const fresh = items.filter((it) => !seen.has(keyOf(it)));
      console.log(`     ${items.length} resultados | ${fresh.length} nuevos`);

      if (!isFirstRun && fresh.length > 0) {
        findings.push({ source: src.name, items: fresh });
      }
      state[src.name] = items.map(keyOf);

      await new Promise((r) => setTimeout(r, 2500)); // pausa cortés
    } catch (err) {
      console.error(`     ❌ ${src.name} falló: ${err.message}`);
    }
  }

  await saveState(state);

  if (isFirstRun) {
    console.log(
      "\n✅ Baseline establecido. La próxima ejecución reportará novedades."
    );
    return;
  }

  if (findings.length === 0) {
    console.log("\n✅ Sin novedades.");
    return;
  }

  await sendEmail(
    `📚 Nuevo ejemplar: Valoración Inmobiliaria (Alcázar/Montecorvo)`,
    renderEmail(findings, ts)
  );
}

main().catch((err) => {
  console.error("Error fatal:", err);
  process.exit(1);
});
