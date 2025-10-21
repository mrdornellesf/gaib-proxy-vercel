// server.js
import express from "express";
import { chromium } from "playwright";

const PORT = process.env.PORT || 3000;
// Use a própria API como origem (evita DNS de app.*)
const APP_URL = process.env.APP_URL || "https://pre-vault-api.gaib.ai/";

// --- cria o app Express ---
const app = express();

// opcional: root/health
app.get("/", (_req, res) => res.type("text").send("ok"));

// mantém um browser compartilhado
let browser;
async function getBrowser() {
  if (!browser) {
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
    });
  }
  return browser;
}

// endpoint do proxy
app.get("/gaib", async (req, res) => {
  const pageNum  = String(req.query.page || "1");
  const pageSize = String(req.query.pageSize || "100");

  let context;
  try {
    const br = await getBrowser();
    context = await br.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
    });
    const page = await context.newPage();

    // 1) abre a PRÓPRIA API (só para fixar o Origin correto)
    await page.goto(APP_URL, { waitUntil: "domcontentloaded", timeout: 30000 });

    // 2) faz fetch relative path => same-origin (Origin: pre-vault-api.gaib.ai)
    const result = await page.evaluate(async ({ pageNum, pageSize }) => {
      const path = `/points/leaderboard?page=${encodeURIComponent(pageNum)}&pageSize=${encodeURIComponent(pageSize)}`;
      const r = await fetch(path, {
        method: "GET",
        headers: { accept: "application/json, text/plain, */*" },
        credentials: "include"
      });
      const text = await r.text();
      return { status: r.status, text };
    }, { pageNum, pageSize });

    await context.close();

    res
      .status(result.status)
      .set("content-type", "application/json; charset=utf-8")
      .set("cache-control", "no-store")
      .set("access-control-allow-origin", "*")
      .send(result.text);
  } catch (e) {
    if (context) try { await context.close(); } catch {}
    console.error(e);
    res.status(500).json({ error: "proxy_failed", message: String(e?.message || e) });
  }
});

// inicia servidor
app.listen(PORT, () => {
  console.log(`GAIB proxy listening on :${PORT}`);
});
