import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const PANGRAM = "https://text.external-api.pangram.com";

function pangramProxy(env) {
  const handler = async (req, res, next) => {
    if (req.url !== "/api/verify") return next();
    const send = (status, body) => {
      res.statusCode = status;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(body));
    };
    if (req.method !== "POST") return send(405, { error: "POST only" });
    const key = env.PANGRAM_API_KEY;
    if (!key) return send(503, { error: "PANGRAM_API_KEY is not set" });
    try {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      const text = String(JSON.parse(raw).text ?? "").trim().slice(0, 200);
      if (!text) return send(400, { error: "empty caption" });

      const created = await fetch(`${PANGRAM}/task`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": key },
        body: JSON.stringify({ text, model: env.PANGRAM_MODEL || "default", public_dashboard_link: false }),
        signal: AbortSignal.timeout(10000),
      });
      if (!created.ok) return send(502, { error: `Pangram responded ${created.status}` });
      const { task_id } = await created.json();

      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        const poll = await fetch(`${PANGRAM}/task/${task_id}`, { headers: { "x-api-key": key }, signal: AbortSignal.timeout(10000) });
        if (!poll.ok) return send(502, { error: `Pangram responded ${poll.status}` });
        const task = await poll.json();
        if (task.stage === "STAGE_FAILED") return send(502, { error: "Pangram task failed" });
        if (task.stage === "STAGE_SUCCESS") {
          const human = task.fraction_human ?? 1 - (task.fraction_ai ?? 0) - (task.fraction_ai_assisted ?? 0);
          return send(200, { human, headline: task.headline });
        }
      }
      send(504, { error: "Pangram timed out" });
    } catch (e) {
      send(502, { error: e.message });
    }
  };
  return {
    name: "pangram-proxy",
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), pangramProxy(loadEnv(mode, process.cwd(), "PANGRAM_"))],
  optimizeDeps: { exclude: ["@mediapipe/tasks-vision"] },
  server: { allowedHosts: true },
  preview: { allowedHosts: true },
}));
