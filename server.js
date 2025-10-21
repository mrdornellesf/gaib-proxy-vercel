// server.js
import express from "express";
import { chromium } from "playwright";

const PORT = process.env.PORT || 3000;
const API_HOST = "pre-vault-api.gaib.ai";

const app = express();

app.get("/", (_req, res) => res.type("text").send("ok"));

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
  const pageNum  = String(req.query.page || "1");
  const pageSize = String(req.query.pageSize || "100");

  let context;
  try {
    const br = await getBrowser();
    context = await br.newContext({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
    });
    const page = await context.newPage();

    const SPOOF_ORIGIN  = "https://gaib.ai";
    const SPOOF_REFERER = "https://gaib.ai/";

    await page.route("**/*", async (route, request) => {
      const url = new URL(request.url());
      if (url.hostname === API_HOST) {
        const headers = {
          ...request.headers(),
          origin: SPOOF_ORIGIN,
          referer: SPOOF_REFERER,
          "sec-fetch-site": "same-origin",
          "sec-fetch-mode": "cors",
          "sec-fetch-dest": "empty",
          accept: "application/json, text/plain, */*",
          "accept-language": "en-US,en;q=0.9",
        };
        await route.continue({ headers });
      } else {
        await route.continue();
      }
    });

    const apiUrl = `https://pre-vault-api.gaib.ai/points/leaderboard?page=${encodeURIComponent(pageNum)}&pageSize=${encodeURIComponent(pageSize)}`;
    const result = await page.evaluate(async (url) => {
      const r = await fetch(url, {
        method: "GET",
        headers: { accept: "application/json, text/plain, */*" },
        credentials: "include",
      });
      const text = await r.text();
      return { status: r.status, text };
    }, apiUrl);

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

app.listen(PORT, () => {
  console.log(`GAIB proxy listening on :${PORT}`);
});
