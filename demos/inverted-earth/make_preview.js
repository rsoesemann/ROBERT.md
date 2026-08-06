// Renders preview.png, the static image link previews use.
//
// LinkedIn, Slack and every other unfurler fetch the HTML and download one
// image. None of them run the WebGL globe, so the picture has to exist as a
// file. It is a before/after pair because a feed gets scrolled, not read.
//
//   npx playwright install chromium      # once
//   node make_preview.js                 # -> preview.png, 1200x627
//
// Composition happens in the browser rather than in an image library: the two
// halves are screenshots pasted into a second page as data URIs, so the caption
// picks up the same typography as the globe itself.

const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const HERE = __dirname;
const OUT = path.join(HERE, "preview.png");
const PORT = 8749;

// Half the final frame each, rendered at 2x and downscaled when composited.
const HALF_W = 600;
const HEIGHT = 627;

// Far enough out that the exaggerated relief still clears the frame edges.
const CAMERA = [1.50, 1.08, 3.43];

const MIME = { ".html": "text/html", ".webp": "image/webp", ".js": "text/javascript" };

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

async function shootGlobe(browser, morph) {
  const page = await browser.newPage({
    viewport: { width: HALF_W, height: HEIGHT },
    deviceScaleFactor: 2
  });
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelector("#loading")?.classList.contains("done"),
                             null, { timeout: 180000 });

  // Stop the spin before hiding the panel — Playwright will not click a
  // control it cannot see.
  await page.uncheck("#spin");
  await page.addStyleTag({ content: "#panel, #hint { display: none !important; }" });

  // camera, controls and shared are top-level const bindings in a classic
  // script, so they sit in the page's global lexical scope and are reachable
  // here by name. Setting them beats faking mouse drags: the two halves must
  // share one viewpoint or the comparison falls apart.
  await page.evaluate(([cam, m]) => {
    camera.position.set(cam[0], cam[1], cam[2]);
    controls.update();
    const slider = document.getElementById("morph");
    slider.value = m;
    slider.dispatchEvent(new Event("input"));
  }, [CAMERA, morph]);

  await page.waitForFunction((m) => document.getElementById("vMorph").textContent === m + "%",
                             morph, { timeout: 30000 });
  await page.waitForTimeout(1500);

  const shot = (await page.screenshot()).toString("base64");
  await page.close();
  return "data:image/png;base64," + shot;
}

async function main() {
  const server = await serve();
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
           "--ignore-gpu-blocklist", "--disable-dev-shm-usage"]
  });

  console.log("rendering the real Earth");
  const real = await shootGlobe(browser, 0);
  console.log("rendering the inverted Earth");
  const inverted = await shootGlobe(browser, 100);

  console.log("compositing");
  const page = await browser.newPage({ viewport: { width: HALF_W * 2, height: HEIGHT } });
  await page.setContent(`
    <style>
      * { margin: 0; box-sizing: border-box; }
      body {
        width: ${HALF_W * 2}px; height: ${HEIGHT}px;
        display: flex; overflow: hidden;
        background: #05070d; position: relative;
        font: 14px/1.4 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
        color: #e8edf4; -webkit-font-smoothing: antialiased;
      }
      img { width: ${HALF_W}px; height: ${HEIGHT}px; display: block; }
      .seam {
        position: absolute; left: 50%; top: 0; bottom: 0; width: 1px;
        background: rgba(150, 180, 215, 0.22);
      }
      .tag {
        position: absolute; top: 22px;
        font-size: 12px; font-weight: 700;
        letter-spacing: 0.11em; text-transform: uppercase;
        padding: 5px 13px 6px; border-radius: 999px;
        background: rgba(6, 10, 18, 0.72);
        border: 1px solid rgba(150, 180, 215, 0.28);
      }
      .tag.left  { left: 26px; color: #9fe4ff; }
      .tag.right { right: 26px; color: #c8ffdf; }
      .caption { position: absolute; left: 30px; bottom: 26px; }
      .caption h1 {
        font-size: 31px; font-weight: 700; letter-spacing: -0.015em;
        text-shadow: 0 2px 14px rgba(0, 0, 0, 0.95);
      }
      .caption p {
        margin-top: 5px; font-size: 15px; color: #b7c4d8;
        text-shadow: 0 2px 10px rgba(0, 0, 0, 0.95);
      }
      /* Keeps the caption legible wherever the globe happens to be bright. */
      .scrim {
        position: absolute; left: 0; right: 0; bottom: 0; height: 190px;
        background: linear-gradient(to top, rgba(3, 5, 10, 0.85), rgba(3, 5, 10, 0));
      }
    </style>
    <img src="${real}"><img src="${inverted}">
    <div class="scrim"></div>
    <div class="seam"></div>
    <div class="tag left">Real Earth</div>
    <div class="tag right">Inverted</div>
    <div class="caption">
      <h1>The Mariana Trench as the world's highest mountain</h1>
      <p>Ocean depths become peaks, continents become seas, islands become craters.</p>
    </div>
  `);
  await page.waitForTimeout(600);
  await page.screenshot({ path: OUT });
  await browser.close();
  server.close();

  const kb = fs.statSync(OUT).size / 1024;
  console.log(`${path.basename(OUT)}: ${HALF_W * 2}x${HEIGHT}, ${kb.toFixed(0)} kB`);
}

main();
