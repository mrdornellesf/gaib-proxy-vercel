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
  
      // 1) Abre a PRÓPRIA API como origem (evita DNS do app.*)
      // Se a raiz 404, não tem problema — queremos apenas o origin correto.
      await page.goto(process.env.APP_URL || "https://pre-vault-api.gaib.ai/", {
        waitUntil: "domcontentloaded",
        timeout: 30000
      });
  
      // 2) Faz o fetch relative path => same-origin (Origin: pre-vault-api.gaib.ai)
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
  