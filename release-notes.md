# Release v1.0.0: The "Local First" Update 🏠

This major release completely rewrites the signaling architecture to be 100% local, removing the dependency on the public PeerJS cloud server.

## ✨ New Features

- **Local-Only Signaling**: The plugin now hosts its own lightweight signaling server. No metadata or data ever leaves your local network. 🔒
- **Zero-Dependency Server**: The bridge server (`server.js`) now runs with standard Node.js. No `npm install` required to run it!
- **Dynamic Graph Detection**: Automatically detects where your current graph is located and saves images to the correct `assets` folder, even if you switch graphs.
- **Chunked Transfer**: Improved reliability for sending large (high-res) photos by intelligent chunking.
- **Robust Image Loading**: Now uses `file://` protocol to ensure images appear instantly in Logseq without indexing delays.

## 🛠 Fixes & Improvements

- **Fixed**: "File too large" errors when sending high-quality photos.
- **Fixed**: SSL certificate trust issues between Logseq (Electron) and local HTTPS server.
- **Fixed**: Issues where images would be saved to the wrong folder if the graph was moved.
- **Improved**: Validated support for Logseq DB version (alpha) via standard asset paths.

## 🚀 How to Upgrade/Install

1. Download the plugin.
2. Run the bridge server: `node server.js /path/to/your/graph`.
3. Type `/photo` and scan!
