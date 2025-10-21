app.get("/gaib", async (req, res) => {
    const pageNum  = String(req.query.page || "1");
    const pageSize = String(req.query.pageSize || "100");
  
    // endpoint completo da API
    const API_URL = `https://pre-vault-api.gaib.ai/points/leaderboard?page=${encodeURIComponent(pageNum)}&pageSize=${encodeURIComponent(pageSize)}`;
  
    let context;
    try {
      const br = await getBrowser();
      context = await br.newContext({
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
      });
      const page = await context.newPage();
  
      // Intercepta chamadas p/ API e injeta headers de “domínio autorizado”
      const API_HOST = "pre-vault-api.gaib.ai";
      const SPOOF_ORIGIN  = "https://gaib.ai";  // se 403, tente "https://vault.gaib.ai"
      const SPOOF_REFERER = "https://gaib.ai/";
  
      await page.route("**/*", async (route, request) => {
        const url = new URL(request.url());
        if (url.hostname === API_HOST) {
          const headers = {
            ...request.headers(),
            "origin": SPOOF_ORIGIN,
            "referer": SPOOF_REFERER,
            "sec-fetch-site": "same-origin",
            "sec-fetch-mode": "cors",
            "sec-fetch-dest": "empty",
            "accept": "application/json, text/plain, */*",
            "accept-language": "en-US,en;q=0.9"
          };
          await route.continue({ headers });
        } else {
          await route.continue();
        }
      });
  
      // 1) Abre um domínio “real” para estabelecer origem de navegador
      await page.goto("https://gaib.ai/", { waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => {});
  
      // 2) Tenta o fetch pelo navegador
      const result = await page.evaluate(async (url) => {
        const r = await fetch(url, {
          method: "GET",
          headers: { accept: "application/json, text/plain, */*" },
          credentials: "include",
          cache: "no-store",
          mode: "cors",
          referrerPolicy: "no-referrer-when-downgrade"
        });
        const text = await r.text();
        return { status: r.status, text };
      }, API_URL);
  
      await context.close();
  
      // Se a API respondeu algo (mesmo 403), retornamos
      if (result && typeof result.status === "number") {
        return res
          .status(result.status)
          .set("content-type", "application/json; charset=utf-8")
          .set("cache-control", "no-store")
          .set("access-control-allow-origin", "*")
          .send(result.text);
      }
  
      // Fallback se por algum motivo result vier vazio (raro)
      throw new Error("browser_fetch_empty");
    } catch (e) {
      if (context) try { await context.close(); } catch {}
  
      // 3) FALLBACK: fetch no Node (server-to-server) com os mesmos headers
      try {
        const r = await fetch(`https://pre-vault-api.gaib.ai/points/leaderboard?page=${encodeURIComponent(pageNum)}&pageSize=${encodeURIComponent(pageSize)}`, {
          method: "GET",
          headers: {
            "accept": "application/json, text/plain, */*",
            "origin": "https://gaib.ai",
            "referer": "https://gaib.ai/",
            "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
          }
        });
        const text = await r.text();
        return res
          .status(r.status)
          .set("content-type", "application/json; charset=utf-8")
          .set("cache-control", "no-store")
          .set("access-control-allow-origin", "*")
          .send(text);
      } catch (e2) {
        console.error("browser fetch error:", e?.message);
        console.error("node fallback error:", e2?.message);
        return res.status(500).json({ error: "proxy_failed", message: String(e2?.message || e2) });
      }
    }
  });
  