const projectRoot = `${import.meta.dir}/..`;
const outputDirectory = `${projectRoot}/dist-bun`;
const port = 1421;
const appUrl = `http://127.0.0.1:${port}`;
const shouldOpen = !Bun.argv.includes("--no-open");

function openApp() {
  if (!shouldOpen) return;
  const child = Bun.spawn(["cmd.exe", "/d", "/c", "start", "", appUrl], {
    cwd: projectRoot,
    stdin: "ignore",
    stdout: "ignore",
    stderr: "ignore",
  });
  child.unref();
}

async function useRunningInstance(): Promise<boolean> {
  try {
    const response = await fetch(appUrl, { signal: AbortSignal.timeout(800) });
    const html = await response.text();
    if (response.ok && html.includes("课织")) {
      console.log(`课织已经在运行：${appUrl}`);
      openApp();
      return true;
    }
  } catch {
    // No compatible instance is listening on the preferred port.
  }
  return false;
}

if (await useRunningInstance()) process.exit(0);

console.log("正在准备课织…");
const build = await Bun.build({
  entrypoints: [`${projectRoot}/src/main.tsx`],
  outdir: outputDirectory,
  target: "browser",
  sourcemap: "external",
  minify: true,
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
});

if (!build.success) {
  console.error("课织构建失败：");
  for (const log of build.logs) console.error(log);
  process.exit(1);
}

const indexHtml = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#f7f8fc" />
    <meta name="description" content="课织：开放、流畅、隐私优先的大学课表" />
    <title>课织 · 大学课表</title>
    <link rel="stylesheet" href="/main.css" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/main.js"></script>
  </body>
</html>`;

await Bun.write(`${outputDirectory}/index.html`, indexHtml);

const assets = new Set(["main.js", "main.css", "main.js.map"]);
const server = Bun.serve({
  hostname: "127.0.0.1",
  port,
  development: false,
  fetch(request) {
    const url = new URL(request.url);
    const requested = decodeURIComponent(url.pathname.slice(1));

    if (url.pathname === "/favicon.ico") return new Response(null, { status: 204 });
    if (assets.has(requested)) {
      return new Response(Bun.file(`${outputDirectory}/${requested}`), {
        headers: { "Cache-Control": "no-store" },
      });
    }

    return new Response(Bun.file(`${outputDirectory}/index.html`), {
      headers: { "Cache-Control": "no-store" },
    });
  },
});

console.log(`课织已启动：${server.url}`);
console.log("关闭此窗口即可停止课织。\n");
openApp();
