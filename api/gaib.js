import chromium from "chrome-aws-lambda";
import puppeteer from "puppeteer-core";

const APP_URL = process.env.APP_URL || "https://pre-vault.gaib.ai";

export default async function handler(req, res) {
  // CORS básico p/ GAS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, *");
  if (req.method === "OPTIONS") return res.status(204).end();

  const pageNum  = String(req.query.page || "1");
  const pageSize = String(req.query.pageSize || "100");

  let browser;
  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width: 1200, height: 800 },
      executablePath: await chromium.executablePath,
      headless: chromium.headless,
    });

    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
    );

    // 1) Abre o domínio autorizado (gera Origin legítimo)
    await page.goto(APP_URL, { waitUntil: "domcontentloaded", timeout: 30000 });

    // 2) Faz o fetch DENTRO do navegador
    const result = await page.evaluate(async ({ pageNum, pageSize }) => {
      const url = `https://pre-vault-api.gaib.ai/points/leaderboard?page=${encodeURIComponent(pageNum)}&pageSize=${encodeURIComponent(pageSize)}`;
      const r = await fetch(url, {
        method: "GET",
        headers: { accept: "application/json, text/plain, */*" }
        // credentials: "include" // habilite se precisar de cookies de sessão
      });
      const text = await r.text();
      return { status: r.status, text };
    }, { pageNum, pageSize });

    await browser.close();

    res
      .status(result.status)
      .setHeader("Content-Type", "application/json; charset=utf-8")
      .setHeader("Cache-Control", "no-store")
      .send(result.text);
  } catch (err) {
    if (browser) try { await browser.close(); } catch {}
    res.status(500).json({ error: "proxy_failed", message: String(err?.message || err) });
  }
}
