// SC2 Voice Studio: tiny static server. Run: bun server.ts  ->  http://localhost:5177
const dir = import.meta.dir;
const files: Record<string, string> = {
  "/": "index.html",
  "/app.js": "app.js",
  "/fx.js": "fx.js",
  "/phrases.js": "phrases.js",
  "/worker.js": "worker.js",
  "/kokoro.web.js": "node_modules/kokoro-js/dist/kokoro.web.js",
};
const port = Number(process.env.PORT ?? 5177);
Bun.serve({
  port,
  fetch(req) {
    const path = files[new URL(req.url).pathname];
    if (!path) return new Response("Not found", { status: 404 });
    return new Response(Bun.file(`${dir}/${path}`));
  },
});
console.log(`SC2 Voice Studio → http://localhost:${port}`);
