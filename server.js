#!/usr/bin/env node
// Phone Bridge — Local Server (Dual HTTP/HTTPS)
// Serves the sender page, handles SSE signaling, and saves images

const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");

// ─── Config ──────────────────────────────────────────────────────────
const PORT_HTTPS = parseInt(process.env.PORT || "8083", 10);
const PORT_HTTP = 8084; // Local HTTP port for Logseq plugin
const CERT_DIR = path.join(__dirname, ".ssl");

// Graph path: passed as CLI arg or auto-detected
const GRAPH_PATH = process.argv[2] || null;

// ─── SSL ─────────────────────────────────────────────────────────────
let sslOptions;
try {
    sslOptions = {
        key: fs.readFileSync(path.join(CERT_DIR, "key.pem")),
        cert: fs.readFileSync(path.join(CERT_DIR, "cert.pem")),
    };
} catch (e) {
    console.error("SSL certs not found in .ssl/. Run:");
    console.error(
        '  openssl req -x509 -newkey rsa:2048 -keyout .ssl/key.pem -out .ssl/cert.pem -days 365 -nodes -subj "/CN=phone-bridge"'
    );
    process.exit(1);
}

// ─── Load sender HTML ────────────────────────────────────────────────
const senderHtml = fs.readFileSync(
    path.join(__dirname, "sender", "index.html"),
    "utf-8"
);

// ─── Signaling (SSE) ────────────────────────────────────────────────
const clients = new Map(); // sessionId -> { receiver: res, sender: res }

function sendSSE(res, data) {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
}

// ─── Request Handler ────────────────────────────────────────────────
const requestHandler = (req, res) => {
    // CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
    }

    // Determine protocol for URL construction
    const protocol = req.connection.encrypted ? "https" : "http";
    const url = new URL(req.url, `${protocol}://${req.headers.host}`);

    // ── GET /events — Subscribe to signaling ──
    if (url.pathname === "/events") {
        const sessionId = url.searchParams.get("id");
        const role = url.searchParams.get("role"); // 'receiver' or 'sender'

        if (!sessionId || !role) {
            res.writeHead(400);
            res.end("Missing id or role");
            return;
        }

        res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        });

        if (!clients.has(sessionId)) clients.set(sessionId, {});
        const session = clients.get(sessionId);
        session[role] = res;

        console.log(`[Signaling] ${role} connected to session ${sessionId} (${protocol})`);

        // Notify peer if connected
        const peerRole = role === "receiver" ? "sender" : "receiver";
        if (session[peerRole]) {
            sendSSE(session[peerRole], { type: "peer-joined" });
            sendSSE(res, { type: "peer-joined" });
        }

        req.on("close", () => {
            console.log(`[Signaling] ${role} disconnected from ${sessionId}`);
            if (session[role] === res) delete session[role];
            if (Object.keys(session).length === 0) clients.delete(sessionId);
        });
        return;
    }

    // ── POST /signal — Send message to peer ──
    if (req.method === "POST" && url.pathname === "/signal") {
        const sessionId = url.searchParams.get("id");
        const role = url.searchParams.get("role");

        let body = [];
        req.on("data", (chunk) => body.push(chunk));
        req.on("end", () => {
            try {
                const message = JSON.parse(Buffer.concat(body).toString());
                const session = clients.get(sessionId);

                if (session) {
                    // Relay to opposite role
                    const targetRole = role === "receiver" ? "sender" : "receiver";
                    const targetRes = session[targetRole];
                    if (targetRes) {
                        sendSSE(targetRes, message);
                        res.writeHead(200);
                        res.end("ok");
                    } else {
                        // console.log(`[Signaling] Peer not found for ${sessionId}`);
                        res.writeHead(404);
                        res.end("peer not found");
                    }
                } else {
                    res.writeHead(404);
                    res.end("session not found");
                }
            } catch (e) {
                console.error("[Signaling] Error relaying message:", e);
                res.writeHead(500);
                res.end(e.message);
            }
        });
        return;
    }

    // ── POST /save-image — save image to graph assets ──
    if (req.method === "POST" && url.pathname === "/save-image") {
        if (!GRAPH_PATH) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "No graph path configured. Pass it as CLI argument." }));
            return;
        }

        let body = [];
        req.on("data", (chunk) => body.push(chunk));
        req.on("end", () => {
            try {
                const raw = Buffer.concat(body);
                const json = JSON.parse(raw.toString());

                const filename = json.filename.replace(/[^a-zA-Z0-9._-]/g, "_");

                // Dynamic graph path support
                const targetGraphPath = json.graphPath || GRAPH_PATH;

                const safeName = `phone-bridge_${Date.now()}_${filename}`;
                const dirPath = path.join(targetGraphPath, "assets");
                const filePath = path.join(dirPath, safeName);

                // Create directory
                if (!fs.existsSync(dirPath)) {
                    fs.mkdirSync(dirPath, { recursive: true });
                }

                // Decode base64 data and save
                const imageBuffer = Buffer.from(json.data, "base64");
                fs.writeFileSync(filePath, imageBuffer);

                console.log(`[Phone Bridge] Saved: ${filePath} (${imageBuffer.length} bytes)`);

                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ savedName: safeName }));
            } catch (err) {
                console.error("[Phone Bridge] Save error:", err);
                res.writeHead(500, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: err.message }));
            }
        });
        return;
    }

    // ── GET anything — serve sender HTML ──
    res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-cache",
    });
    res.end(senderHtml);
};

// ─── Start Servers ──────────────────────────────────────────────────

// HTTPS Server (for Phone)
https.createServer(sslOptions, requestHandler).listen(PORT_HTTPS, "0.0.0.0", () => {
    console.log(`\n  📱 Phone Bridge Server`);
    console.log(`  ─────────────────────────────`);
    console.log(`  HTTPS (Phone):   https://0.0.0.0:${PORT_HTTPS}`);

    const nets = require("os").networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === "IPv4" && !net.internal) {
                console.log(`  Network:         https://${net.address}:${PORT_HTTPS}`);
            }
        }
    }
});

// HTTP Server (for Logseq Plugin on Localhost)
http.createServer(requestHandler).listen(PORT_HTTP, "127.0.0.1", () => {
    console.log(`  HTTP (Plugin):   http://127.0.0.1:${PORT_HTTP}`);
    if (GRAPH_PATH) {
        console.log(`  Graph:           ${GRAPH_PATH}`);
    } else {
        console.log(`  ⚠ No graph path — image saving disabled`);
    }
    console.log();
});
