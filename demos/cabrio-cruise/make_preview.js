// Renders preview.png, the static image link previews use.
//
// LinkedIn, Slack and every other unfurler fetch the HTML and download one
// image. None of them run WebGL, so the picture has to exist as a file.
//
//   npx playwright install chromium      # once
//   node make_preview.js                 # -> preview.png, 1200x627
//
// The shot is the cockpit view on the country road, because that is the frame
// the whole thing is built around. The caption is composited in a second page
// so it picks up the same typography as the game HUD.

const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const HERE = __dirname;
const OUT = path.join(HERE, "preview.png");
const PORT = 8751;

const WIDTH = 1200;
const HEIGHT = 627;

// Somewhere on the country loop, far enough into it to have trees on both sides.
const SPOT = 0.885;
const SPEED = 33;      // m/s, so the passenger already has her arms up

const MIME = { ".html": "text/html", ".js": "text/javascript" };

function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
      const file = path.join(HERE, rel);
      if (!file.startsWith(HERE) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream" });
      res.end(fs.readFileSync(file));
    });
    server.listen(PORT, "127.0.0.1", () => resolve(server));
  });
}

async function main() {
  const server = await serve();
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
           "--ignore-gpu-blocklist", "--disable-dev-shm-usage"]
  });

  console.log("rendering the cockpit view");
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => !!window.CC && !!window.CC.teleport, null, { timeout: 180000 });
  await page.click("#go");

  // The HUD belongs on screen while playing, not in a preview card.
  await page.addStyleTag({ content: ".hud { display: none !important; }" });
  await page.evaluate((s) => { CC.teleport(s.spot); CC.st.speed = s.speed; }, { spot: SPOT, speed: SPEED });

  // Software rendering runs at a couple of frames a second; give the car time
  // to roll far enough that the spawn point is behind it.
  await page.waitForTimeout(6000);
  const shot = "data:image/png;base64," + (await page.screenshot()).toString("base64");
  await page.close();

  console.log("compositing");
  const card = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
  await card.setContent(`
    <style>
      * { margin: 0; box-sizing: border-box; }
      body {
        width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden;
        position: relative; background: #0a0d14;
        font: 14px/1.4 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
        color: #eef3f8; -webkit-font-smoothing: antialiased;
      }
      img { width: ${WIDTH}px; height: ${HEIGHT}px; display: block; }
      .scrim {
        position: absolute; left: 0; right: 0; bottom: 0; height: 240px;
        background: linear-gradient(to top, rgba(4, 7, 12, 0.9), rgba(4, 7, 12, 0));
      }
      .tag {
        position: absolute; top: 24px; left: 28px;
        font-size: 12px; font-weight: 700;
        letter-spacing: 0.11em; text-transform: uppercase; color: #ffb08a;
        padding: 5px 13px 6px; border-radius: 999px;
        background: rgba(6, 10, 18, 0.66);
        border: 1px solid rgba(150, 180, 215, 0.28);
      }
      .caption { position: absolute; left: 32px; bottom: 28px; }
      .caption h1 {
        font-size: 34px; font-weight: 700; letter-spacing: -0.015em;
        text-shadow: 0 2px 14px rgba(0, 0, 0, 0.95);
      }
      .caption p {
        margin-top: 6px; font-size: 16px; color: #c2cddc;
        text-shadow: 0 2px 10px rgba(0, 0, 0, 0.95);
      }
    </style>
    <img src="${shot}">
    <div class="scrim"></div>
    <div class="tag">Cabrio Cruise</div>
    <div class="caption">
      <h1>Offenes Verdeck, Landstraße, Autobahn</h1>
      <p>Ein 3D-Fahrspiel im Browser — Auto, Landschaft und Ton entstehen beim Laden aus Code.</p>
    </div>
  `);
  await card.waitForTimeout(600);
  await card.screenshot({ path: OUT });
  await browser.close();
  server.close();

  const kb = fs.statSync(OUT).size / 1024;
  console.log(`${path.basename(OUT)}: ${WIDTH}x${HEIGHT}, ${kb.toFixed(0)} kB`);
}

main();
