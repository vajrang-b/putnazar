import { createServer as createHttpServer } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { createServer as createNetServer } from "node:net";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import os from "node:os";

export const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)));
export const DEFAULT_HOST = "0.0.0.0";
export const DEFAULT_PORT = 4173;

export const MIME_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".mp3", "audio/mpeg"],
  [".ogg", "audio/ogg"],
]);

export const PUBLIC_FILES = new Set([
  "/index.html",
  "/services.html",
  "/masters.html",
  "/rituals.html",
  "/compliance.html",
  "/contact.html",
  "/css/styles.css",
  "/css/services.css",
  "/css/nav-menu.css",
  "/js/main.js",
  "/js/nav-menu.js",
  "/js/services.js",
  "/js/services-data.js",
  "/js/gaze.js",
  "/js/burn-renderer.js",
  "/js/sound-engine.js",
  "/js/thermodynamic-engine.js",
  "/assets/portrait-demo.jpg",
  "/assets/burnt-desk.jpg",
  "/assets/Amazing Paper burning sound.mp3",
  "/assets/paper-burn.mp3",
  "/assets/paper-burn.ogg",
  "/assets/paperburn.ogg",
]);

export function getLocalIpAddresses() {
  const interfaces = os.networkInterfaces();
  const primaryIps = [];
  const virtualIps = [];

  for (const [name, list] of Object.entries(interfaces)) {
    if (!list) continue;
    const isVirtual = /^(docker|br-|veth|virbr|vmnet)/i.test(name);
    for (const iface of list) {
      if (iface.family === "IPv4" && !iface.internal) {
        if (isVirtual) {
          virtualIps.push(iface.address);
        } else {
          primaryIps.push(iface.address);
        }
      }
    }
  }

  return [...primaryIps, ...virtualIps];
}

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    https: false,
    port: Number(process.env.PORT || DEFAULT_PORT),
    host: process.env.HOST || DEFAULT_HOST,
    cert: process.env.SSL_CERT || null,
    key: process.env.SSL_KEY || null,
    regenCert: false,
    help: false,
  };

  if (
    process.env.HTTPS === "true" ||
    process.env.HTTPS === "1" ||
    process.env.SSL === "true" ||
    process.env.SSL === "1"
  ) {
    options.https = true;
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--https" || arg === "--ssl") {
      options.https = true;
    } else if (arg === "--regen-cert" || arg === "--new-cert") {
      options.regenCert = true;
      options.https = true;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--port" || arg === "-p") {
      options.port = Number(argv[i + 1]);
      i += 1;
    } else if (arg.startsWith("--port=")) {
      options.port = Number(arg.slice(7));
    } else if (arg === "--host") {
      options.host = argv[i + 1];
      i += 1;
    } else if (arg.startsWith("--host=")) {
      options.host = arg.slice(7);
    } else if (arg === "--cert") {
      options.cert = argv[i + 1];
      options.https = true;
      i += 1;
    } else if (arg.startsWith("--cert=")) {
      options.cert = arg.slice(7);
      options.https = true;
    } else if (arg === "--key") {
      options.key = argv[i + 1];
      options.https = true;
      i += 1;
    } else if (arg.startsWith("--key=")) {
      options.key = arg.slice(6);
      options.https = true;
    }
  }

  return options;
}

function resolveOpenssl() {
  if (process.env.OPENSSL_BIN) return process.env.OPENSSL_BIN;
  if (process.platform === "win32") {
    const candidates = [
      "C:\\Program Files\\Git\\usr\\bin\\openssl.exe",
      "C:\\Program Files (x86)\\Git\\usr\\bin\\openssl.exe",
      `${process.env.LOCALAPPDATA || ""}\\Programs\\Git\\usr\\bin\\openssl.exe`,
    ];
    for (const bin of candidates) {
      if (existsSync(bin)) return bin;
    }
  }
  return "openssl";
}

export function ensureCertificate({
  certDir = resolve(ROOT, ".https"),
  certPath = resolve(ROOT, ".https", "localhost.crt"),
  keyPath = resolve(ROOT, ".https", "localhost.key"),
  ips = getLocalIpAddresses(),
  forceRegen = false,
} = {}) {
  mkdirSync(certDir, { recursive: true });

  const exists = existsSync(certPath) && existsSync(keyPath);
  if (exists && !forceRegen) {
    try {
      const cert = readFileSync(certPath, "utf-8");
      const key = readFileSync(keyPath, "utf-8");
      return { cert, key, certPath, keyPath, generated: false };
    } catch {
      // Fall through to regeneration if reading fails
    }
  }

  const sanList = [
    "DNS:localhost",
    "IP:127.0.0.1",
    ...ips.map((ip) => `IP:${ip}`),
  ];
  const subjectAltName = sanList.join(",");

  execFileSync(
    resolveOpenssl(),
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-sha256",
      "-days",
      "365",
      "-subj",
      "/CN=localhost",
      "-keyout",
      keyPath,
      "-out",
      certPath,
      "-addext",
      `subjectAltName=${subjectAltName}`,
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );

  const cert = readFileSync(certPath, "utf-8");
  const key = readFileSync(keyPath, "utf-8");
  return { cert, key, certPath, keyPath, generated: true };
}

export function createRequestHandler({ root = ROOT } = {}) {
  return async (request, response) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { Allow: "GET, HEAD" });
      response.end("Method not allowed");
      return;
    }

    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    } catch {
      response.writeHead(400);
      response.end("Bad request");
      return;
    }

    if (pathname === "/favicon.ico") {
      response.writeHead(204);
      response.end();
      return;
    }

    let requestedPath = pathname === "/" ? "/index.html" : pathname;
    // Strip trailing slash if present (except root)
    if (requestedPath.length > 1 && requestedPath.endsWith("/")) {
      requestedPath = requestedPath.slice(0, -1);
    }

    // Clean URL resolution: if path has no extension and `<path>.html` exists, resolve to `.html`
    if (!extname(requestedPath)) {
      if (PUBLIC_FILES.has(requestedPath + ".html") || existsSync(resolve(root, `.${requestedPath}.html`))) {
        requestedPath = requestedPath + ".html";
      }
    }

    const isAllowed = PUBLIC_FILES.has(requestedPath) ||
      (/^\/[a-zA-Z0-9_\-.]+\.html$/.test(requestedPath) && existsSync(resolve(root, `.${requestedPath}`))) ||
      (/^\/(?:js|assets|css)\/[a-zA-Z0-9_\-./\s]+\.(?:js|css|svg|png|jpg|jpeg|webp|mp3|ogg)$/.test(requestedPath) &&
       existsSync(resolve(root, `.${requestedPath}`)));

    if (!isAllowed) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    const filename = resolve(root, `.${requestedPath}`);
    if (filename !== root && !filename.startsWith(`${root}${sep}`)) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    try {
      const fileStats = await stat(filename);
      if (!fileStats.isFile()) throw new Error("Not a file");
      const totalSize = fileStats.size;
      const fileExt = extname(filename).toLowerCase();
      const contentType = fileExt === ".html"
        ? "text/html; charset=utf-8"
        : (MIME_TYPES.get(fileExt) || "application/octet-stream");
      const rangeHeader = request.headers.range;

      if (rangeHeader && rangeHeader.startsWith("bytes=")) {
        const parts = rangeHeader.slice(6).split("-");
        let start = parts[0] ? parseInt(parts[0], 10) : NaN;
        let end = parts[1] ? parseInt(parts[1], 10) : NaN;

        if (Number.isNaN(start)) {
          start = totalSize - end;
          end = totalSize - 1;
        } else if (Number.isNaN(end)) {
          end = totalSize - 1;
        }

        if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= totalSize || start < 0) {
          response.writeHead(416, {
            "Content-Range": `bytes */${totalSize}`,
            "Content-Type": "text/plain; charset=utf-8",
          });
          response.end("Requested range not satisfiable");
          return;
        }

        if (end >= totalSize) {
          end = totalSize - 1;
        }

        const body = await readFile(filename);
        const chunk = body.subarray(start, end + 1);

        response.writeHead(206, {
          "Content-Range": `bytes ${start}-${end}/${totalSize}`,
          "Accept-Ranges": "bytes",
          "Content-Length": chunk.length,
          "Content-Type": contentType,
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        });
        response.end(request.method === "HEAD" ? undefined : chunk);
        return;
      }

      const body = await readFile(filename);
      response.writeHead(200, {
        "Content-Type": contentType,
        "Content-Length": body.length,
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      response.end(request.method === "HEAD" ? undefined : body);
    } catch {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
    }
  };
}

export function createServerInstance({
  https = false,
  cert = null,
  key = null,
  root = ROOT,
} = {}) {
  const handler = createRequestHandler({ root });

  if (https) {
    if (!cert || !key) {
      throw new Error("HTTPS server requires both cert and key");
    }
    const httpServer = createHttpServer(handler);
    const httpsServer = createHttpsServer({ cert, key }, handler);

    httpServer.on("clientError", (err, socket) => {
      if (err.code === "ECONNRESET" || !socket.writable) return;
      socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
    });

    httpsServer.on("clientError", (err, socket) => {
      if (err.code === "ECONNRESET" || !socket.writable) return;
      socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
    });

    const sockets = new Set();
    const netServer = createNetServer((socket) => {
      sockets.add(socket);
      socket.once("close", () => sockets.delete(socket));

      const onError = () => socket.destroy();
      socket.on("error", onError);
      socket.once("data", (chunk) => {
        socket.removeListener("error", onError);
        socket.pause();
        socket.unshift(chunk);
        // TLS handshake record starts with byte 22 (0x16)
        if (chunk[0] === 22) {
          httpsServer.emit("connection", socket);
        } else {
          httpServer.emit("connection", socket);
        }
        process.nextTick(() => {
          if (!socket.destroyed) {
            socket.resume();
          }
        });
      });
    });

    netServer.closeAllConnections = () => {
      for (const socket of sockets) {
        socket.destroy();
      }
    };

    netServer.closeIdleConnections = () => {
      httpServer.closeIdleConnections?.();
      httpsServer.closeIdleConnections?.();
    };

    const originalClose = netServer.close.bind(netServer);
    netServer.close = (callback) => {
      netServer.closeAllConnections();
      httpServer.close();
      httpsServer.close();
      return originalClose(callback);
    };

    return netServer;
  }

  return createHttpServer(handler);
}

export function printHelp() {
  console.log(`
Gaze Burn Static Server

Usage:
  node server.js [options]
  npm run serve:https
  npm start

Options:
  --https            Serve over HTTPS (generates/reuses self-signed cert in .https/)
  -p, --port <num>   Port to listen on (default: 4173, or PORT env)
  --host <addr>      Host address to bind to (default: 0.0.0.0, or HOST env)
  --cert <path>      Path to existing TLS certificate file (or SSL_CERT env)
  --key <path>       Path to existing TLS private key file (or SSL_KEY env)
  --regen-cert       Force regeneration of self-signed TLS certificates
  -h, --help         Show this help message
`);
}

export function startServer(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);

  if (options.help) {
    printHelp();
    return null;
  }

  let cert = null;
  let key = null;

  if (options.https) {
    if (options.cert && options.key) {
      cert = readFileSync(options.cert, "utf-8");
      key = readFileSync(options.key, "utf-8");
    } else {
      const ips = getLocalIpAddresses();
      const certInfo = ensureCertificate({
        ips,
        forceRegen: options.regenCert,
      });
      cert = certInfo.cert;
      key = certInfo.key;
      if (certInfo.generated) {
        console.log(`\n🔒 Generated new self-signed TLS certificate with SAN for local IPs:`);
        console.log(`   ${certInfo.certPath}`);
      }
    }
  }

  const server = createServerInstance({
    https: options.https,
    cert,
    key,
  });

  server.listen(options.port, options.host, () => {
    const ipAddresses = getLocalIpAddresses();
    const primaryIp = ipAddresses[0] || "127.0.0.1";

    if (options.https) {
      console.log(`\n  🔥 Gaze Burn is listening over HTTP & HTTPS on all network interfaces:`);
      console.log(`  • Local HTTP:    http://localhost:${options.port}`);
      console.log(`                   http://127.0.0.1:${options.port}`);
      console.log(`  • Local HTTPS:   https://localhost:${options.port}`);
      console.log(`                   https://127.0.0.1:${options.port}`);
      if (ipAddresses.length > 0) {
        console.log(`  • Network HTTPS: https://${primaryIp}:${options.port}  (open on other local devices)`);
        if (ipAddresses.length > 1) {
          for (const ip of ipAddresses.slice(1)) {
            console.log(`                   https://${ip}:${options.port}`);
          }
        }
      }
    } else {
      console.log(`\n  🔥 Gaze Burn is listening over HTTP on all network interfaces:`);
      console.log(`  • Local:   http://localhost:${options.port}`);
      console.log(`             http://127.0.0.1:${options.port}`);
      if (ipAddresses.length > 0) {
        console.log(`  • Network: http://${primaryIp}:${options.port}  (open on other local devices)`);
        if (ipAddresses.length > 1) {
          for (const ip of ipAddresses.slice(1)) {
            console.log(`             http://${ip}:${options.port}`);
          }
        }
      }
    }

    if (options.https) {
      console.log(`
  📱 Testing on local devices (phones / tablets / other computers):
     1. Connect the other device to the same Wi-Fi / network.
     2. Open: https://${primaryIp}:${options.port}
     3. Accept the self-signed certificate warning:
        • Chrome/Edge: click "Advanced" -> "Proceed to ${primaryIp} (unsafe)"
          (If Chrome shows NET::ERR_CERT_INVALID with no proceed link, type "thisisunsafe" on the keyboard)
        • Safari (iOS / Mac): tap "Show Details" -> "visit this website" -> "Visit Website"
        • Firefox: click "Advanced" -> "Accept the Risk and Continue"
     4. Tap "Start burning" to run with full camera access!
`);
    } else {
      console.log(`
  💡 To test webcam access on other local devices over your Wi-Fi, run with HTTPS:
     node server.js --https
`);
    }
    console.log(`  Press Ctrl+C to stop.`);
  });

  return server;
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isDirectRun) {
  startServer();
}
