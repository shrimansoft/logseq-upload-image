# 📱 Logseq Phone Bridge

> Transfer images from your phone to Logseq via WebRTC — zero server, peer-to-peer.

## How It Works

```
┌──────────────┐    QR Code     ┌──────────────┐
│   Logseq     │ ─────────────> │    Phone      │
│   Plugin     │                │   Browser     │
│  (Receiver)  │ <───────────── │   (Sender)    │
└──────────────┘   WebRTC P2P   └──────────────┘
```

1. In Logseq, type `/add Image` in any block
2. A QR code appears in a modal
3. Scan the QR code with your phone
4. Select or capture a photo on your phone
5. The image is sent directly to Logseq via WebRTC
6. Image is saved to `assets/phone-bridge/` and markdown is inserted at cursor

## Setup

### Prerequisites
- [Node.js](https://nodejs.org/) 18+  
- [Logseq Desktop](https://logseq.com/) with **Developer Mode** enabled

### Install & Build

```bash
# Install dependencies
npm install

# Build the plugin
npm run build
```

### Load in Logseq

1. Open Logseq → **Settings** → Enable **Developer Mode**
2. Click the **⋯** menu → **Plugins** → **Load unpacked plugin**
3. Select **this project's root folder** (not `dist/`)
4. The "Phone Bridge" plugin should appear in your plugins list

### Host the Sender App

The `sender/index.html` page needs to be accessible from your phone. Options:

- **GitHub Pages**: Push this repo to GitHub, enable Pages, the sender is at:  
  `https://<username>.github.io/<repo>/sender/index.html`
- **Local Network**: Serve with `npx serve sender/` and use your LAN IP
- **Vercel/Netlify**: Deploy the `sender/` folder

Then update the `SENDER_APP_URL` constant in `src/main.ts` to match your hosted URL.

## Configuration

In `src/main.ts`, update this line before building:

```typescript
const SENDER_APP_URL = "https://your-username.github.io/logseq-phone-bridge/sender";
```

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Plugin SDK | [@logseq/libs](https://github.com/logseq/logseq-plugin-sdk) |
| P2P Connection | [PeerJS](https://peerjs.com/) (WebRTC) |
| QR Generation | [qrcode](https://www.npmjs.com/package/qrcode) |
| Build Tool | [Vite](https://vitejs.dev/) |

## Project Structure

```
logseq-phone-bridge/
├── src/
│   ├── main.ts          # Plugin entry point (receiver)
│   └── style.css        # Plugin styles
├── sender/
│   └── index.html       # Mobile sender web app
├── dist/                # Built plugin (after npm run build)
├── package.json
├── vite.config.ts
├── tsconfig.json
└── README.md
```

## Security

- **No server upload**: Images transfer directly between devices via WebRTC
- **Session-based**: Each transfer uses a unique, random session ID
- **Ephemeral**: Connections are destroyed after each transfer

## License

MIT
