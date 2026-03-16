import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const DATA_PATH = join(process.cwd(), "data/config.json");
function readCfg(){try{if(!existsSync(DATA_PATH))return{};return JSON.parse(readFileSync(DATA_PATH,"utf8"))}catch{return{}}}
function writeCfg(data){mkdirSync(join(process.cwd(),"data"),{recursive:true});writeFileSync(DATA_PATH,JSON.stringify(data,null,2))}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [
      react(),
      {
        name: "config-api",
        configureServer(server) {
          server.middlewares.use("/api/config", (req, res, next) => {
            res.setHeader("Content-Type", "application/json");
            if (req.method === "GET") {
              res.end(JSON.stringify(readCfg()));
            } else if (req.method === "PATCH") {
              const chunks = [];
              req.on("data", c => chunks.push(c));
              req.on("end", () => {
                try {
                  const body = JSON.parse(Buffer.concat(chunks).toString());
                  writeCfg({ ...readCfg(), ...body });
                  res.end(JSON.stringify({ ok: true }));
                } catch { res.statusCode = 400; res.end(JSON.stringify({ error: "bad json" })); }
              });
            } else { next(); }
          });
        },
      },
    ],
    server: {
      proxy: {
        "/youtrack": {
          target: env.YOUTRACK_URL,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/youtrack/, ""),
          headers: {
            Authorization: `Bearer ${env.YOUTRACK_TOKEN}`,
          },
        },
      },
    },
  };
});
