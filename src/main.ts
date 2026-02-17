import "@logseq/libs";

// ─── Configuration ──────────────────────────────────────────────────
const DEFAULT_SERVER_PORT = 8083;
const LOCAL_HTTP_PORT = 8084; // HTTP for plugin -> server (avoids SSL issues)

// ─── Types ──────────────────────────────────────────────────────────
interface ImageTransferPayload {
  filename: string;
  type: string;
  data: ArrayBuffer;
}

// ─── Helpers ────────────────────────────────────────────────────────

function generateSessionId(): string {
  return "pb-" + Math.random().toString(36).substring(2, 10);
}

function getServerPort(): number {
  return Number(logseq.settings?.serverPort) || DEFAULT_SERVER_PORT;
}

function getSenderUrl(): string {
  // Public URL for Phone -> Server (HTTPS)
  const custom = logseq.settings?.senderAppUrl as string;
  if (custom && custom.trim()) return custom.trim();
  return `https://100.105.93.44:${getServerPort()}`;
}

function getLocalServerUrl(): string {
  // Local URL for Plugin -> Server (HTTP)
  return `http://127.0.0.1:${LOCAL_HTTP_PORT}`;
}

// ─── Save Image ─────────────────────────────────────────────────────

async function saveImageToAssets(
  payload: ImageTransferPayload,
  graphPath?: string
): Promise<string> {
  // Convert ArrayBuffer to base64
  const bytes = new Uint8Array(payload.data);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64Data = btoa(binary);

  // POST to our local HTTP server (port 8084)
  const serverUrl = getLocalServerUrl();
  const response = await fetch(`${serverUrl}/save-image`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: payload.filename,
      type: payload.type,
      data: base64Data,
      graphPath: graphPath
    }),
  });
  // ... rest ensures consistency

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: "Server error" }));
    throw new Error(err.error || `Save failed (${response.status})`);
  }

  const result = await response.json();
  console.log("[Phone Bridge] Saved via server:", result.savedName);
  return result.savedName;
}

// ─── UI Helpers (using provideUI which works) ───────────────────────

function updateModalContent(html: string) {
  logseq.provideUI({
    key: "phone-bridge-modal",
    template: html,
  });
  logseq.showMainUI({ autoFocus: false });
}

function wireCloseButton(cleanupFn: () => void) {
  // Use setTimeout to let provideUI render the DOM first
  setTimeout(() => {
    const btn = parent.document.getElementById("pb-cancel");
    if (btn) {
      btn.addEventListener("click", cleanupFn);
    }
    // Also close on overlay click
    const overlay = parent.document.getElementById("pb-overlay");
    if (overlay) {
      overlay.addEventListener("click", (e) => {
        if ((e.target as HTMLElement).id === "pb-overlay") {
          cleanupFn();
        }
      });
    }
  }, 200);
}

function wireCopyButton(url: string) {
  setTimeout(() => {
    const btn = parent.document.getElementById("pb-copy-btn");
    if (btn) {
      btn.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(url);
        } catch (_) {
          // Fallback: select text
          const textEl = parent.document.getElementById("pb-url-text");
          if (textEl) {
            const range = document.createRange();
            range.selectNodeContents(textEl);
            const sel = window.getSelection();
            sel?.removeAllRanges();
            sel?.addRange(range);
            document.execCommand("copy");
          }
        }
        const tooltip = parent.document.getElementById("pb-copy-tooltip");
        if (tooltip) {
          tooltip.classList.add("show");
          setTimeout(() => tooltip.classList.remove("show"), 1500);
        }
      });
    }
  }, 200);
}

// ─── Main ───────────────────────────────────────────────────────────

// ─── Signaling Client ───────────────────────────────────────────────

class LocalSignaling {
  private es: EventSource | null = null;
  private sessionId: string;
  private onMsg: (msg: any) => void;

  constructor(sessionId: string, onMsg: (msg: any) => void) {
    this.sessionId = sessionId;
    this.onMsg = onMsg;
  }

  connect() {
    const url = `${getLocalServerUrl()}/events?id=${this.sessionId}&role=receiver`;
    console.log("[Phone Bridge] Connecting signaling (HTTP):", url);

    this.es = new EventSource(url);
    this.es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        console.log("[Phone Bridge] Sig msg:", msg.type);
        this.onMsg(msg);
      } catch (err) {
        console.error("[Phone Bridge] Sig parse error:", err);
      }
    };
    this.es.onerror = (e) => console.error("[Phone Bridge] Sig error:", e);
  }

  async send(msg: any) {
    await fetch(`${getLocalServerUrl()}/signal?id=${this.sessionId}&role=receiver`, {
      method: "POST",
      body: JSON.stringify(msg),
    });
  }

  close() {
    if (this.es) {
      this.es.close();
      this.es = null;
    }
  }
}

// ─── Main ───────────────────────────────────────────────────────────

function main() {
  console.log("[Phone Bridge] Plugin loaded");

  // Settings
  logseq.useSettingsSchema([
    {
      key: "senderAppUrl",
      type: "string",
      title: "Sender App URL (optional)",
      description:
        "Leave empty to use built-in server. For Tailscale, enter your IP like http://100.x.x.x:8083",
      default: "",
    },
    {
      key: "serverPort",
      type: "number",
      title: "Server Port",
      description: "Port for the built-in sender server (default: 8083)",
      default: DEFAULT_SERVER_PORT,
    },
  ]);

  // Inject styles once
  logseq.provideStyle(`
    #pb-overlay {
      position: fixed; inset: 0; z-index: 999;
      display: flex; align-items: center; justify-content: center;
      background: rgba(0,0,0,0.6);
      backdrop-filter: blur(4px);
    }
    #pb-card {
      background: linear-gradient(145deg, #1a1a2e, #1e1e35);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 20px; padding: 28px; width: 360px; max-width: 90vw;
      text-align: center; color: #e0e0ff;
      font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
      box-shadow: 0 32px 64px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04) inset;
    }
    #pb-card h3 {
      margin: 0 0 4px; font-size: 20px; font-weight: 700;
      background: linear-gradient(135deg, #e0e0ff, #b0b0ff);
      -webkit-background-clip: text; -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    #pb-card .sub { color: #6b6b88; font-size: 12px; margin-bottom: 18px; }
    #pb-card img {
      display: block; margin: 0 auto 14px;
      width: 220px; height: 220px; border-radius: 12px;
      background: #fff; padding: 10px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.3);
    }
    .pb-url-row {
      display: flex; align-items: center; gap: 8px;
      background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
      border-radius: 10px; padding: 8px 12px; margin-bottom: 14px;
      position: relative;
    }
    .pb-url-text {
      flex: 1; font-size: 11px; color: #8888aa;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      text-align: left; user-select: all;
    }
    .pb-copy-btn {
      flex-shrink: 0; background: rgba(100,120,255,0.15);
      border: 1px solid rgba(100,120,255,0.2); border-radius: 8px;
      padding: 6px 8px; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: all 0.2s ease; position: relative;
    }
    .pb-copy-btn:hover {
      background: rgba(100,120,255,0.25);
      border-color: rgba(100,120,255,0.4);
      transform: translateY(-1px);
    }
    .pb-copy-btn svg { width: 14px; height: 14px; color: #8b9eff; }
    .pb-copy-tooltip {
      position: absolute; bottom: calc(100% + 6px); left: 50%;
      transform: translateX(-50%); background: #32dc78; color: #0f0f1a;
      font-size: 10px; font-weight: 600; padding: 4px 8px;
      border-radius: 4px; white-space: nowrap;
      opacity: 0; pointer-events: none; transition: opacity 0.2s;
    }
    .pb-copy-tooltip.show { opacity: 1; }
    .pb-status {
      font-size: 13px; padding: 10px 12px; border-radius: 10px; margin-bottom: 14px;
      font-weight: 500;
    }
    .pb-wait { background: rgba(255,180,50,0.08); color: #ffb432; }
    .pb-conn { background: rgba(50,180,255,0.08); color: #32b4ff; }
    .pb-recv { background: rgba(150,100,255,0.08); color: #9664ff; }
    .pb-ok { background: rgba(50,220,120,0.08); color: #32dc78; }
    .pb-err { background: rgba(255,80,80,0.08); color: #ff5050; }
    #pb-cancel {
      width: 100%; padding: 10px;
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 10px; background: transparent;
      color: #6b6b88; cursor: pointer; font-size: 13px;
      transition: all 0.2s ease;
    }
    #pb-cancel:hover { background: rgba(255,80,80,0.08); color: #f66; }
  `);

  // Close on Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") cleanup();
  });

  let activeSignaling: LocalSignaling | null = null;
  let activePC: RTCPeerConnection | null = null;
  let dataChannel: RTCDataChannel | null = null;

  function cleanup() {
    try {
      if (activeSignaling) activeSignaling.close();
      if (activePC) activePC.close();
      activeSignaling = null;
      activePC = null;
      dataChannel = null;
    } catch (_) { }
    // Robust UI cleanup
    logseq.provideUI({ key: "phone-bridge-modal", template: "" });
    logseq.hideMainUI();
  }

  // ─── Slash Command ──────────────────────────────────────────────
  logseq.Editor.registerSlashCommand("photo", async () => {
    cleanup();

    const sessionId = generateSessionId();
    console.log("[Phone Bridge] Session:", sessionId);

    // Show loading immediately
    updateModalContent(`
      <div id="pb-overlay">
        <div id="pb-card">
          <h3>📱 Phone Bridge</h3>
          <p class="sub">Please wait...</p>
          <div class="pb-status pb-wait">Initializing connection...</div>
          <button id="pb-cancel">Cancel</button>
        </div>
      </div>
    `);
    wireCloseButton(cleanup);

    try {
      // Lazy-load QR
      const [{ default: QRCode }] = await Promise.all([import("qrcode")]);

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });
      activePC = pc;

      // Handle Data Channel
      // Transfer State
      let incomingFile: {
        filename: string;
        type: string;
        size: number;
        receivedSize: number;
        buffer: Uint8Array;
      } | null = null;

      pc.ondatachannel = (e) => {
        const dc = e.channel;
        dataChannel = dc;
        dc.onopen = () => {
          console.log("[Phone Bridge] Data channel open");
          const st = parent.document.getElementById("pb-live-status");
          if (st) { st.className = "pb-status pb-conn"; st.textContent = "Connected! Waiting for transfer..."; }
        };

        dc.onmessage = async (msg) => {
          try {
            // Handle Binary Chunk
            if (msg.data instanceof ArrayBuffer) {
              if (!incomingFile) {
                console.warn("[Phone Bridge] Got binary data without header");
                return;
              }

              const chunk = new Uint8Array(msg.data);
              incomingFile.buffer.set(chunk, incomingFile.receivedSize);
              incomingFile.receivedSize += chunk.length;

              // Update Progress
              const percent = Math.round((incomingFile.receivedSize / incomingFile.size) * 100);
              const st = parent.document.getElementById("pb-live-status");
              if (st) {
                st.textContent = `Receiving ${incomingFile.filename}... ${percent}%`;
              }

              // Check Completion
              if (incomingFile.receivedSize >= incomingFile.size) {
                console.log("[Phone Bridge] Transfer complete!");
                const finalPayload: ImageTransferPayload = {
                  filename: incomingFile.filename,
                  type: incomingFile.type,
                  data: incomingFile.buffer.buffer as ArrayBuffer
                };

                incomingFile = null; // Reset

                if (st) { st.className = "pb-status pb-recv"; st.textContent = "Saving..."; }

                const graph = await logseq.App.getCurrentGraph();
                const savedName = await saveImageToAssets(finalPayload, graph?.path);

                // improved path resolution
                // improved path resolution
                let imgUrl = `../assets/${savedName}`;

                try {
                  const graph = await logseq.App.getCurrentGraph();
                  if (graph) {
                    // Fallback to file:// protocol for immediate access locally
                    const isWin = navigator.platform.toLowerCase().includes('win');
                    const sep = isWin ? '\\' : '/';
                    const graphPath = graph.path.endsWith(sep) ? graph.path.slice(0, -1) : graph.path;
                    const fullPath = `${graphPath}${sep}assets${sep}${savedName}`;
                    imgUrl = `file://${fullPath}`;
                  }
                } catch (e) { console.error("Graph path error", e); }

                try {
                  const url = await logseq.Assets.makeUrl(`assets/${savedName}`);
                  if (url) imgUrl = url;
                } catch (e) {
                  console.error("makeUrl failed", e);
                }

                await logseq.Editor.insertAtEditingCursor(
                  `![${finalPayload.filename}](${imgUrl})`
                );

                if (st) { st.className = "pb-status pb-ok"; st.textContent = `✓ Saved: ${savedName}`; }
                setTimeout(cleanup, 2000);
              }

            } else {
              // Handle JSON Message (Metadata)
              const text = msg.data;
              let json;
              try { json = JSON.parse(text); } catch (e) { return; }

              if (json.type === 'start') {
                console.log("[Phone Bridge] Starting transfer:", json.filename, json.size);
                incomingFile = {
                  filename: json.filename,
                  type: json.mime,
                  size: json.size,
                  receivedSize: 0,
                  buffer: new Uint8Array(json.size)
                };

                const st = parent.document.getElementById("pb-live-status");
                if (st) { st.className = "pb-status pb-recv"; st.textContent = `Receiving ${json.filename}... 0%`; }
              }
            }
          } catch (err: any) {
            console.error("[Phone Bridge] Transfer error:", err);
            const st = parent.document.getElementById("pb-live-status");
            if (st) { st.className = "pb-status pb-err"; st.textContent = "Transfer error"; }
            incomingFile = null;
          }
        };
      };

      // Signaling
      const signaling = new LocalSignaling(sessionId, async (msg) => {
        if (msg.type === "offer") {
          await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await signaling.send({ type: "answer", sdp: answer });
        } else if (msg.type === "candidate") {
          if (msg.candidate) {
            await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
          }
        }
      });
      activeSignaling = signaling;
      signaling.connect();

      // Handle ICE Candidates
      pc.onicecandidate = (e) => {
        if (e.candidate) {
          signaling.send({ type: "candidate", candidate: e.candidate });
        }
      };

      // Build sender URL and QR
      const senderUrl = `${getSenderUrl()}/?id=${sessionId}`;
      console.log("[Phone Bridge] Sender URL:", senderUrl);

      const qrDataUrl = await QRCode.toDataURL(senderUrl, {
        width: 220, margin: 2,
        color: { dark: "#1a1a2e", light: "#ffffff" },
      });

      // Show QR code + URL with copy button
      const copySvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;

      updateModalContent(`
        <div id="pb-overlay">
          <div id="pb-card">
            <h3>📱 Phone Bridge</h3>
            <p class="sub">Scan with your phone to send an image</p>
            <img src="${qrDataUrl}" alt="QR Code" />
            <div class="pb-url-row">
              <span class="pb-url-text" id="pb-url-text" title="${senderUrl}">${senderUrl}</span>
              <button class="pb-copy-btn" id="pb-copy-btn" title="Copy URL">
                ${copySvg}
                <span class="pb-copy-tooltip" id="pb-copy-tooltip">Copied!</span>
              </button>
            </div>
            <div class="pb-status pb-wait" id="pb-live-status">Waiting for phone...</div>
            <button id="pb-cancel">Cancel</button>
          </div>
        </div>
      `);
      wireCloseButton(cleanup);
      wireCopyButton(senderUrl);

    } catch (err: any) {
      console.error("[Phone Bridge] Init error:", err);
      updateModalContent(`
        <div id="pb-overlay">
          <div id="pb-card">
            <h3>❌ Connection Failed</h3>
            <div class="pb-status pb-err">${err.message || "Could not connect"}</div>
            <button id="pb-cancel">Close</button>
          </div>
        </div>
      `);
      wireCloseButton(cleanup);
    }
  });

  // ─── Test Server Command ──────────────────────────────────────────
  logseq.Editor.registerSlashCommand("test-server", async () => {
    try {
      // Try to require http via electron remote or main process
      // Usually unavailable in iframe, but let's check standard require or window.require
      const http = (window as any).require ? (window as any).require("http") : null;
      const cp = (window as any).require ? (window as any).require("child_process") : null;

      if (cp) {
        logseq.UI.showMsg("Child Process IS available!", "success");
      } else {
        logseq.UI.showMsg("Child Process NOT available.", "warning");
      }

      if (!http) {
        logseq.UI.showMsg("Node.js 'http' module not available.", "error");
        return;
      }

      const server = http.createServer((req: any, res: any) => {
        res.writeHead(200);
        res.end("Hello from Plugin!");
      });

      server.listen(8090, "0.0.0.0", () => {
        logseq.UI.showMsg("Server started on port 8090!", "success");
        console.log("Plugin Server running on 8090");
      });

      server.on("error", (e: any) => {
        logseq.UI.showMsg("Server error: " + e.message, "error");
      });

    } catch (e: any) {
      logseq.UI.showMsg("Failed to start server: " + e.message, "error");
    }
  });

  // Cleanup on unload
  logseq.beforeunload(async () => {
    if (activeSignaling) activeSignaling.close();
    if (activePC) activePC.close();
  });
}

logseq.ready(main).catch(console.error);
