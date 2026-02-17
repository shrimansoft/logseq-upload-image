const https = require('https');
const crypto = require('crypto');

// Ignore self-signed certs for testing
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const PORT = 8083;
const SESSION_ID = "test-session-" + crypto.randomBytes(4).toString('hex');
const BASE_URL = `https://localhost:${PORT}`;

console.log(`Testing Signaling Server on ${BASE_URL} with Session ${SESSION_ID}`);

function listenSSE(role) {
    console.log(`[${role}] Connecting...`);
    const req = https.request(`${BASE_URL}/events?id=${SESSION_ID}&role=${role}`, (res) => {
        console.log(`[${role}] Connected: ${res.statusCode}`);
        res.on('data', (chunk) => {
            const lines = chunk.toString().split('\n');
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    try {
                        const msg = JSON.parse(data);
                        console.log(`[${role}] Received:`, msg);
                        handleMessage(role, msg);
                    } catch (e) {
                        console.log(`[${role}] Raw: ${data}`);
                    }
                }
            }
        });
    });
    req.on('error', (e) => console.error(`[${role}] Error:`, e.message));
    req.end();
}

function sendSignal(role, msg) {
    const data = JSON.stringify(msg);
    const req = https.request(`${BASE_URL}/signal?id=${SESSION_ID}&role=${role}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': data.length
        }
    }, (res) => {
        // console.log(`[${role}] Sent (${res.statusCode})`);
    });
    req.write(data);
    req.end();
}

function handleMessage(role, msg) {
    if (role === 'sender' && msg.type === 'peer-joined') {
        console.log(`[sender] Peer joined! Sending offer...`);
        sendSignal('sender', { type: 'offer', sdp: 'mock-sdp-offer' });
    }
    if (role === 'receiver' && msg.type === 'offer') {
        console.log(`[receiver] Got offer! Sending answer...`);
        sendSignal('receiver', { type: 'answer', sdp: 'mock-sdp-answer' });
    }
    if (role === 'sender' && msg.type === 'answer') {
        console.log(`[sender] Got answer! SUCCESS.`);
        process.exit(0);
    }
}

// Start Simulator
// 1. Start Receiver (Logseq)
listenSSE('receiver');

// 2. Start Sender (Phone) after 1 second
setTimeout(() => {
    listenSSE('sender');
}, 1000);
