import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// We will also import the villains registry from js/services-data.js
import { VILLAINS, filterVillainsByLanguage, sortVillains, generatePact } from "../js/services-data.js";

test("VILLAINS registry contains exactly 25 occult characters", () => {
  assert.equal(VILLAINS.length, 25);
});

test("VILLAINS distribution matches the master table", () => {
  const telugu = VILLAINS.filter(v => v.language === "Telugu");
  const tamil = VILLAINS.filter(v => v.language === "Tamil");
  const hindi = VILLAINS.filter(v => v.language === "Hindi");
  const kannada = VILLAINS.filter(v => v.language === "Kannada");
  const english = VILLAINS.filter(v => v.language === "English");

  assert.equal(telugu.length, 7, "Telugu count should be 7");
  assert.equal(tamil.length, 4, "Tamil count should be 4");
  assert.equal(hindi.length, 5, "Hindi count should be 5");
  assert.equal(kannada.length, 3, "Kannada count should be 3");
  assert.equal(english.length, 6, "English count should be 6");
});

test("Each villain has required fearful profile metadata", () => {
  for (const v of VILLAINS) {
    assert.ok(v.id, "Missing id");
    assert.ok(v.name, `Missing name for ${v.id}`);
    assert.ok(v.actor, `Missing actor for ${v.id}`);
    assert.ok(v.movie, `Missing movie for ${v.id}`);
    assert.ok(v.language, `Missing language for ${v.id}`);
    assert.ok(typeof v.year === "number" && v.year > 1900, `Invalid year for ${v.id}`);
    assert.ok(v.practice, `Missing practice for ${v.id}`);
    assert.ok(v.role, `Missing role for ${v.id}`);
    assert.ok(v.quote, `Missing quote for ${v.id}`);
    assert.ok(v.service, `Missing service for ${v.id}`);
    assert.ok(v.offering, `Missing offering for ${v.id}`);
  }
});

test("Every villain has a verified local image asset", () => {
  for (const v of VILLAINS) {
    const imgPath = path.resolve(ROOT, "assets/villains", `${v.id}.jpg`);
    assert.ok(fs.existsSync(imgPath), `Image file missing: ${imgPath}`);
    const stat = fs.statSync(imgPath);
    assert.ok(stat.size > 8000, `Image file too small (${stat.size} bytes): ${v.id}.jpg`);

    // Verify image header (JPEG, WebP, or PNG)
    const buf = fs.readFileSync(imgPath);
    const isJpg = buf[0] === 0xff && buf[1] === 0xd8;
    const isWebp = buf.slice(0, 4).toString() === "RIFF" && buf.slice(8, 12).toString() === "WEBP";
    const isPng = buf[0] === 0x89 && buf[1] === 0x50;
    assert.ok(isJpg || isWebp || isPng, `Invalid image format for ${v.id}`);
  }
});

test("filterVillainsByLanguage filters correctly", () => {
  assert.equal(filterVillainsByLanguage(VILLAINS, "all").length, 25);
  assert.equal(filterVillainsByLanguage(VILLAINS, "Telugu").length, 7);
  assert.equal(filterVillainsByLanguage(VILLAINS, "Tamil").length, 4);
  assert.equal(filterVillainsByLanguage(VILLAINS, "Hindi").length, 5);
  assert.equal(filterVillainsByLanguage(VILLAINS, "Kannada").length, 3);
  assert.equal(filterVillainsByLanguage(VILLAINS, "English").length, 6);
});

test("sortVillains correctly orders chronologically", () => {
  const asc = sortVillains(VILLAINS, "chrono-asc");
  for (let i = 0; i < asc.length - 1; i++) {
    assert.ok(asc[i].year <= asc[i + 1].year, `Sort order broken at index ${i}`);
  }

  const desc = sortVillains(VILLAINS, "chrono-desc");
  for (let i = 0; i < desc.length - 1; i++) {
    assert.ok(desc[i].year >= desc[i + 1].year, `Sort order broken at index ${i}`);
  }
});

test("generatePact creates a complete ritual contract", () => {
  const pasupathi = VILLAINS.find(v => v.id === "pasupathi");
  const pact = generatePact(pasupathi, "Betrayer X", "Aghora Soul Binding");

  assert.ok(pact.pactId.startsWith("PACT-"));
  assert.equal(pact.target, "Betrayer X");
  assert.equal(pact.villainName, "Pasupathi");
  assert.equal(pact.service, "Aghora Soul Binding");
  assert.ok(pact.incantation.length > 10);
  assert.ok(pact.burnUrl.includes("pasupathi.jpg"));
});

test("HTTP server serves /services.html, /masters.html, /js/services-data.js and villain images", async () => {
  const { createServerInstance } = await import("../server.js");
  const http = await import("node:http");
  const server = createServerInstance({ https: false });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();

  try {
    // Check /services.html
    const resHtml = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/services.html`, (res) => {
        let body = "";
        res.on("data", (chunk) => { body += chunk; });
        res.on("end", () => resolve({ statusCode: res.statusCode, headers: res.headers, body }));
      }).on("error", reject);
    });
    assert.equal(resHtml.statusCode, 200);
    assert.match(resHtml.headers["content-type"], /text\/html/);
    assert.match(resHtml.body, /Services Directory/i);

    // Check /masters.html
    const resMasters = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/masters.html`, (res) => {
        let body = "";
        res.on("data", (chunk) => { body += chunk; });
        res.on("end", () => resolve({ statusCode: res.statusCode, headers: res.headers, body }));
      }).on("error", reject);
    });
    assert.equal(resMasters.statusCode, 200);
    assert.match(resMasters.headers["content-type"], /text\/html/);
    assert.match(resMasters.body, /OG Occult Masters/i);

    // Check /js/services-data.js
    const resJs = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/js/services-data.js`, (res) => {
        let body = "";
        res.on("data", (chunk) => { body += chunk; });
        res.on("end", () => resolve({ statusCode: res.statusCode, headers: res.headers, body }));
      }).on("error", reject);
    });
    assert.equal(resJs.statusCode, 200);
    assert.match(resJs.headers["content-type"], /javascript/);

    // Check /assets/villains/pasupathi.jpg
    const resImg = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/assets/villains/pasupathi.jpg`, (res) => {
        let size = 0;
        res.on("data", (chunk) => { size += chunk.length; });
        res.on("end", () => resolve({ statusCode: res.statusCode, headers: res.headers, size }));
      }).on("error", reject);
    });
    assert.equal(resImg.statusCode, 200);
    assert.equal(resImg.headers["content-type"], "image/jpeg");
    assert.ok(resImg.size > 10000);
  } finally {
    server.close();
  }
});
