# 📱 Logseq Phone Bridge

> **Transfer images from your phone to Logseq directly over local Wi-Fi.**  
> Zero Cloud. Zero external accounts. 100% Private.

## ✨ Features

- **Local Only**: Uses your LAN for transfer. No data leaves your network.
- **Zero Server Setup**: The signaling server is a single, zero-dependency Node.js script included in the plugin.
- **Fast**: Direct P2P WebRTC connection between phone and PC.
- **Smart**: Automatically detects your current graph path (works with multiple graphs).

---

## 🚀 Getting Started

### 1. Requirements

- **Node.js**: You need [Node.js](https://nodejs.org/) installed on your computer to run the local bridge.
- **Logseq**: Desktop application.
- **Wi-Fi**: Both phone and PC must be on the same network (LAN/Wi-Fi).

### 2. Installation

1. Install this plugin from the Logseq Marketplace.
2. Locate the plugin folder on your computer:
   - Usually inside `~/.logseq/plugins/logseq-phone-bridge/`
3. Open a terminal in that folder.

### 3. Run the Bridge Server

The plugin requires a lightweight local server to signal the connection. It has **no dependencies**—just run it with Node:

```bash
# Usage: node server.js <path-to-your-logseq-graph>
# Example:
node server.js ~/Documents/Logseq/MyGraph
```

> **Tip:** You can create a simple startup script/bat file to run this automatically in the background.

---

## 📸 Usage

1. In Logseq, type **`/photo`** in any block.
2. A QR code will appear.
3. **Scan the QR code** with your phone's camera.
4. Open the link (it loads a local web app from your PC).
5. Select a photo or take a new one.
6. The image will instantly appear in your Logseq block! 

The image file is saved safely to your graph's `assets/` folder.

---

## 🛠 Troubleshooting

- **"Connection Failed" / QR Code doesn't load?**
  - Ensure `server.js` is running.
  - Ensure your phone and PC are on the same Wi-Fi.
  - Check if your firewall is blocking port `8083` or `8084`.

- **"File not found" / Broken Image?**
  - The plugin automatically tells the server where to save the file based on your active graph.
  - Ensure the path passed to `server.js` is at least valid (it serves as a default).

---

## 🔒 Privacy & Security

- **Self-Hosted**: The "sender app" is hosted on your own PC (port 8083).
- **Encrypted**: WebRTC encrypts the media stream.
- **Open Source**: Verify the code yourself.

---

## 📜 License

MIT
