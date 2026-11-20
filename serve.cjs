const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");

const root = path.join(__dirname, "public");
const port = Number(process.env.PORT || 4173);
const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".ico": "image/x-icon"
};

function inside(rootDirectory, candidate) {
  const relative = path.relative(rootDirectory, candidate);
  return relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative);
}

async function main() {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw Error("PORT 必须是 1 至 65535 的整数");
  }
  const realRoot = await fs.realpath(root);
  const server = http.createServer(async (req, res) => {
    if (!["GET", "HEAD"].includes(req.method)) {
      res.writeHead(405, { Allow: "GET, HEAD" }).end();
      return;
    }
    try {
      const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
      if (/[\\:\x00-\x1f]/.test(pathname)) throw Error("Invalid path");
      const file = path.resolve(realRoot, "." + (pathname === "/" ? "/index.html" : pathname));
      if (!inside(realRoot, file)) throw Error("Outside public");
      const realFile = await fs.realpath(file);
      if (!inside(realRoot, realFile) || !(await fs.stat(realFile)).isFile()) throw Error("Missing file");
      const body = await fs.readFile(realFile);
      res.writeHead(200, {
        "Content-Type": mime[path.extname(realFile).toLowerCase()] || "application/octet-stream",
        "Content-Length": body.length,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff"
      }).end(req.method === "HEAD" ? undefined : body);
    } catch {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("未找到文件");
    }
  });
  server.on("error", error => {
    console.error(error.message);
    process.exitCode = 1;
  });
  server.listen(port, "127.0.0.1", () => console.log(`小小品鉴家  http://localhost:${port}/`));
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
