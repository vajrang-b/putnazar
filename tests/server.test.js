import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import https from "node:https";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  parseArgs,
  getLocalIpAddresses,
  ensureCertificate,
  createServerInstance,
  createRequestHandler,
  ROOT,
} from "../server.js";

const hasOpenSSL = !spawnSync("openssl", ["version"]).error;

test("all site pages load the Clarity analytics tag in the document head", () => {
  const pages = ["index.html", "services.html", "masters.html", "rituals.html", "compliance.html", "contact.html"];
  for (const page of pages) {
    const html = readFileSync(join(ROOT, page), "utf8");
    const head = html.match(/<head>([\s\S]*?)<\/head>/i)?.[1];
    assert.ok(head, `${page} is missing a head element`);
    assert.match(head, /https:\/\/www\.clarity\.ms\/tag\/"\+i/);
    assert.match(head, /"z6tcfm2o54"/);
  }
});

test("parseArgs parses flags and environment variables", () => {
  const defaultOpts = parseArgs([]);
  assert.equal(defaultOpts.https, false);
  assert.equal(defaultOpts.port, 4173);
  assert.equal(defaultOpts.host, "0.0.0.0");

  const httpsOpts = parseArgs(["--https", "-p", "8443"]);
  assert.equal(httpsOpts.https, true);
  assert.equal(httpsOpts.port, 8443);

  const customCertOpts = parseArgs(["--cert=/tmp/cert.pem", "--key=/tmp/key.pem"]);
  assert.equal(customCertOpts.https, true);
  assert.equal(customCertOpts.cert, "/tmp/cert.pem");
  assert.equal(customCertOpts.key, "/tmp/key.pem");

  const regenOpts = parseArgs(["--regen-cert"]);
  assert.equal(regenOpts.https, true);
  assert.equal(regenOpts.regenCert, true);

  const helpOpts = parseArgs(["--help"]);
  assert.equal(helpOpts.help, true);
});

test("getLocalIpAddresses detects non-internal IPv4 interfaces", () => {
  const ips = getLocalIpAddresses();
  assert.ok(Array.isArray(ips));
  for (const ip of ips) {
    assert.match(ip, /^\d+\.\d+\.\d+\.\d+$/);
    assert.notEqual(ip, "127.0.0.1");
  }
});

test("ensureCertificate creates a valid self-signed certificate with SAN", { skip: !hasOpenSSL ? "OpenSSL not installed" : false }, () => {
  const tempDir = mkdtempSync(join(tmpdir(), "gaze-test-cert-"));
  try {
    const certPath = join(tempDir, "cert.crt");
    const keyPath = join(tempDir, "key.key");
    const result = ensureCertificate({
      certDir: tempDir,
      certPath,
      keyPath,
      ips: ["192.168.1.99"],
      forceRegen: true,
    });

    assert.equal(result.generated, true);
    assert.ok(result.cert.includes("BEGIN CERTIFICATE"));
    assert.ok(result.key.includes("BEGIN PRIVATE KEY"));

    // Second call without forceRegen reuses the files
    const cached = ensureCertificate({
      certDir: tempDir,
      certPath,
      keyPath,
      ips: ["192.168.1.99"],
      forceRegen: false,
    });
    assert.equal(cached.generated, false);
    assert.equal(cached.cert, result.cert);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("HTTP server serves public assets and handles unknown routes", async () => {
  const server = createServerInstance({ https: false });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();

  try {
    // GET / (index.html)
    const indexRes = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/`, (res) => {
        let body = "";
        res.on("data", (chunk) => { body += chunk; });
        res.on("end", () => resolve({ statusCode: res.statusCode, headers: res.headers, body }));
      }).on("error", reject);
    });
    assert.equal(indexRes.statusCode, 200);
    assert.match(indexRes.headers["content-type"], /text\/html/);
    assert.match(indexRes.body, /<title>putnazar/i);
    assert.match(indexRes.body, /id="menu-toggle"/i);
    assert.match(indexRes.body, /href="contact\.html"[^>]*data-page="contact"/i);

    // GET /services.html
    const servicesRes = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/services.html`, (res) => {
        let body = "";
        res.on("data", (chunk) => { body += chunk; });
        res.on("end", () => resolve({ statusCode: res.statusCode, headers: res.headers, body }));
      }).on("error", reject);
    });
    assert.equal(servicesRes.statusCode, 200);
    assert.match(servicesRes.headers["content-type"], /text\/html/);
    assert.match(servicesRes.body, /Services Directory/i);
    assert.match(servicesRes.body, /Put Nazar/i);
    assert.match(servicesRes.body, /Illegal/i);

    // GET /services (clean URL without .html)
    const cleanServicesRes = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/services`, (res) => {
        let body = "";
        res.on("data", (chunk) => { body += chunk; });
        res.on("end", () => resolve({ statusCode: res.statusCode, headers: res.headers, body }));
      }).on("error", reject);
    });
    assert.equal(cleanServicesRes.statusCode, 200);
    assert.match(cleanServicesRes.headers["content-type"], /text\/html/);
    assert.match(cleanServicesRes.body, /Services Directory/i);

    // GET /services/ (with trailing slash)
    const slashServicesRes = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/services/`, (res) => {
        let body = "";
        res.on("data", (chunk) => { body += chunk; });
        res.on("end", () => resolve({ statusCode: res.statusCode, headers: res.headers, body }));
      }).on("error", reject);
    });
    assert.equal(slashServicesRes.statusCode, 200);
    assert.match(slashServicesRes.headers["content-type"], /text\/html/);

    // GET /rituals.html
    const ritualsRes = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/rituals.html`, (res) => {
        let body = "";
        res.on("data", (chunk) => { body += chunk; });
        res.on("end", () => resolve({ statusCode: res.statusCode, headers: res.headers, body }));
      }).on("error", reject);
    });
    assert.equal(ritualsRes.statusCode, 200);
    assert.match(ritualsRes.headers["content-type"], /text\/html/);
    assert.match(ritualsRes.body, /Rituals &amp; Remedies|Rituals & Remedies/i);

    // GET /compliance.html
    const complianceRes = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/compliance.html`, (res) => {
        let body = "";
        res.on("data", (chunk) => { body += chunk; });
        res.on("end", () => resolve({ statusCode: res.statusCode, headers: res.headers, body }));
      }).on("error", reject);
    });
    assert.equal(complianceRes.statusCode, 200);
    assert.match(complianceRes.headers["content-type"], /text\/html/);
    assert.match(complianceRes.body, /Legal &amp; Privacy Compliance|Legal & Privacy Compliance/i);

    // GET /contact.html
    const contactRes = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/contact.html`, (res) => {
        let body = "";
        res.on("data", (chunk) => { body += chunk; });
        res.on("end", () => resolve({ statusCode: res.statusCode, headers: res.headers, body }));
      }).on("error", reject);
    });
    assert.equal(contactRes.statusCode, 200);
    assert.match(contactRes.headers["content-type"], /text\/html/);
    assert.match(contactRes.body, /<title>Contact Us \| PUTNAZAR<\/title>/i);
    assert.match(contactRes.body, /<iframe[\s\S]*?docs\.google\.com\/forms\/d\/e\/1FAIpQLScsnpKeTs0v5lCefEX4B2eLip0OpnqutTs9yqHkrjwqnpXRcA\/viewform/);
    assert.match(contactRes.body, /Send us a message using the form below/i);

    // GET /css/nav-menu.css
    const navCssRes = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/css/nav-menu.css`, (res) => {
        let body = "";
        res.on("data", (chunk) => { body += chunk; });
        res.on("end", () => resolve({ statusCode: res.statusCode, headers: res.headers, body }));
      }).on("error", reject);
    });
    assert.equal(navCssRes.statusCode, 200);
    assert.match(navCssRes.headers["content-type"], /text\/css/);

    // GET /js/nav-menu.js
    const navJsRes = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/js/nav-menu.js`, (res) => {
        let body = "";
        res.on("data", (chunk) => { body += chunk; });
        res.on("end", () => resolve({ statusCode: res.statusCode, headers: res.headers, body }));
      }).on("error", reject);
    });
    assert.equal(navJsRes.statusCode, 200);
    assert.match(navJsRes.headers["content-type"], /text\/javascript/);

    // GET /css/services.css
    const servicesCssRes = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/css/services.css`, (res) => {
        let body = "";
        res.on("data", (chunk) => { body += chunk; });
        res.on("end", () => resolve({ statusCode: res.statusCode, headers: res.headers, body }));
      }).on("error", reject);
    });
    assert.equal(servicesCssRes.statusCode, 200);
    assert.match(servicesCssRes.headers["content-type"], /text\/css/);

    // GET /js/services.js
    const servicesJsRes = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/js/services.js`, (res) => {
        let body = "";
        res.on("data", (chunk) => { body += chunk; });
        res.on("end", () => resolve({ statusCode: res.statusCode, headers: res.headers, body }));
      }).on("error", reject);
    });
    assert.equal(servicesJsRes.statusCode, 200);
    assert.match(servicesJsRes.headers["content-type"], /text\/javascript/);

    // GET /js/main.js
    const jsRes = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/js/main.js`, (res) => {
        let body = "";
        res.on("data", (chunk) => { body += chunk; });
        res.on("end", () => resolve({ statusCode: res.statusCode, headers: res.headers, body }));
      }).on("error", reject);
    });
    assert.equal(jsRes.statusCode, 200);
    assert.match(jsRes.headers["content-type"], /text\/javascript/);

    // GET /assets/paper-burn.mp3
    const mp3Res = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/assets/paper-burn.mp3`, (res) => {
        res.on("data", () => {});
        res.on("end", () => resolve({ statusCode: res.statusCode, headers: res.headers }));
      }).on("error", reject);
    });
    assert.equal(mp3Res.statusCode, 200);
    assert.equal(mp3Res.headers["content-type"], "audio/mpeg");

    // GET /assets/paper-burn.ogg
    const oggRes = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/assets/paper-burn.ogg`, (res) => {
        res.on("data", () => {});
        res.on("end", () => resolve({ statusCode: res.statusCode, headers: res.headers }));
      }).on("error", reject);
    });
    assert.equal(oggRes.statusCode, 200);
    assert.equal(oggRes.headers["content-type"], "audio/ogg");

    // GET /assets/paperburn.ogg
    const paperburnOggRes = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/assets/paperburn.ogg`, (res) => {
        res.on("data", () => {});
        res.on("end", () => resolve({ statusCode: res.statusCode, headers: res.headers }));
      }).on("error", reject);
    });
    assert.equal(paperburnOggRes.statusCode, 200);
    assert.equal(paperburnOggRes.headers["content-type"], "audio/ogg");

    // GET /js/thermodynamic-engine.js
    const thermoJsRes = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/js/thermodynamic-engine.js`, (res) => {
        res.on("data", () => {});
        res.on("end", () => resolve({ statusCode: res.statusCode, headers: res.headers }));
      }).on("error", reject);
    });
    assert.equal(thermoJsRes.statusCode, 200);
    assert.ok(thermoJsRes.headers["content-type"].includes("javascript"));

    // GET /assets/portrait-demo.jpg
    const portraitRes = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/assets/portrait-demo.jpg`, (res) => {
        res.on("data", () => {});
        res.on("end", () => resolve({ statusCode: res.statusCode, headers: res.headers }));
      }).on("error", reject);
    });
    assert.equal(portraitRes.statusCode, 200);
    assert.equal(portraitRes.headers["content-type"], "image/jpeg");

    // GET /assets/burnt-desk.jpg
    const deskRes = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/assets/burnt-desk.jpg`, (res) => {
        res.on("data", () => {});
        res.on("end", () => resolve({ statusCode: res.statusCode, headers: res.headers }));
      }).on("error", reject);
    });
    assert.equal(deskRes.statusCode, 200);
    assert.equal(deskRes.headers["content-type"], "image/jpeg");

    // GET /assets/paper-burn.mp3 with Range: bytes=0-1023 (HTTP 206 Partial Content)
    const rangeRes = await new Promise((resolve, reject) => {
      const req = http.request(`http://127.0.0.1:${port}/assets/paper-burn.mp3`, {
        headers: { Range: "bytes=0-1023" },
      }, (res) => {
        let size = 0;
        res.on("data", (chunk) => { size += chunk.length; });
        res.on("end", () => resolve({ statusCode: res.statusCode, headers: res.headers, size }));
      });
      req.on("error", reject);
      req.end();
    });
    assert.equal(rangeRes.statusCode, 206);
    assert.equal(rangeRes.headers["content-type"], "audio/mpeg");
    assert.equal(rangeRes.headers["accept-ranges"], "bytes");
    assert.match(rangeRes.headers["content-range"], /^bytes 0-1023\/\d+$/);
    assert.equal(rangeRes.size, 1024);

    // GET with invalid range -> 416 Range Not Satisfiable
    const invalidRangeRes = await new Promise((resolve, reject) => {
      const req = http.request(`http://127.0.0.1:${port}/assets/paper-burn.mp3`, {
        headers: { Range: "bytes=9999999-9999999" },
      }, (res) => {
        res.resume();
        res.on("end", () => resolve({ statusCode: res.statusCode, headers: res.headers }));
      });
      req.on("error", reject);
      req.end();
    });
    assert.equal(invalidRangeRes.statusCode, 416);

    // GET unknown path -> 404
    const notFoundRes = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/non-existent-file.txt`, (res) => {
        res.resume();
        res.on("end", () => resolve({ statusCode: res.statusCode }));
      }).on("error", reject);
    });
    assert.equal(notFoundRes.statusCode, 404);

    // POST / -> 405 Method Not Allowed
    const postRes = await new Promise((resolve, reject) => {
      const req = http.request(`http://127.0.0.1:${port}/`, { method: "POST" }, (res) => {
        res.resume();
        res.on("end", () => resolve({ statusCode: res.statusCode }));
      });
      req.on("error", reject);
      req.end();
    });
    assert.equal(postRes.statusCode, 405);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("HTTPS server serves requests over TLS with self-signed certificate", { skip: !hasOpenSSL ? "OpenSSL not installed" : false }, async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "gaze-test-https-"));
  try {
    const certPath = join(tempDir, "cert.crt");
    const keyPath = join(tempDir, "key.key");
    const certInfo = ensureCertificate({
      certDir: tempDir,
      certPath,
      keyPath,
      ips: ["127.0.0.1"],
      forceRegen: true,
    });

    const server = createServerInstance({
      https: true,
      cert: certInfo.cert,
      key: certInfo.key,
    });

    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();

    try {
      const res = await new Promise((resolve, reject) => {
        https.get(`https://127.0.0.1:${port}/index.html`, { rejectUnauthorized: false }, (r) => {
          let body = "";
          r.on("data", (chunk) => { body += chunk; });
          r.on("end", () => resolve({ statusCode: r.statusCode, body }));
        }).on("error", reject);
      });

      assert.equal(res.statusCode, 200);
      assert.match(res.body, /putnazar/i);

      // Plain HTTP also works seamlessly on the same port (dual-mode)
      const httpRes = await new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${port}/index.html`, (r) => {
          let body = "";
          r.on("data", (chunk) => { body += chunk; });
          r.on("end", () => resolve({ statusCode: r.statusCode, body }));
        }).on("error", reject);
      });

      assert.equal(httpRes.statusCode, 200);
      assert.match(httpRes.body, /putnazar/i);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
