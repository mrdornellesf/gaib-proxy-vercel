import express from "express";
import { chromium } from "playwright";

const APP_URL = process.env.APP_URL || "https://pre-vault.gaib.ai";
const PORT = process.env.PORT || 3000;

const app = express();

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

app.get("/gaib", async (req, res) => {
  const pageNum = String(req.query.page || "1");
  const pageSize = String(req.query.pageSize || "100");

  let context;
  try {
    const br = await getBrowser();
    context = await br.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
    });
    const page = await context.newPage();

    // 1) Abre o domínio autorizado (gera Origin correto)
    await page.goto(APP_URL, { waitUntil: "domcontentloaded", timeout: 30000 });

    // 2) Fetch de dentro do navegador
    const result = await page.evaluate(async ({ pageNum, pageSize }) => {
      const url = `https://pre-vault-api.gaib.ai/points/leaderboard?page=${encodeURIComponent(pageNum)}&pageSize=${encodeURIComponent(pageSize)}`;
      const r = await fetch(url, { method: "GET", headers: { accept: "application/json, text/plain, */*" } });
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

// healthcheck
app.get("/", (_, res) => res.type("text").send("ok"));
app.listen(PORT, () => console.log(`GAIB proxy listening on :${PORT}`));
