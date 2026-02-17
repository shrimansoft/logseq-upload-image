const https = require('https');
const http = require('http');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

console.log("Verifying Dual Port Setup...");

// 1. Check HTTPS (Phone)
const req1 = https.get('https://localhost:8083', (res) => {
    console.log(`[HTTPS:8083] Status: ${res.statusCode} (Expected 200)`);
    if (res.statusCode === 200) console.log("✅ Phone Port OK");
    else console.error("❌ Phone Port Failed");
});
req1.on('error', (e) => console.error("[HTTPS:8083] Error:", e.message));

// 2. Check HTTP (Plugin)
const req2 = http.get('http://localhost:8084', (res) => {
    console.log(`[HTTP:8084] Status: ${res.statusCode} (Expected 200)`);
    if (res.statusCode === 200) console.log("✅ Plugin Port OK");
    else console.error("❌ Plugin Port Failed");

    // 3. Try to upload image via HTTP
    uploadImage();
});
req2.on('error', (e) => console.error("[HTTP:8084] Error:", e.message));

function uploadImage() {
    const data = JSON.stringify({
        filename: "test-image.png",
        type: "image/png",
        data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNiAAAABgDNjd8qAAAAAElFTkSuQmCC" // 1x1 pixel
    });

    const req = http.request('http://localhost:8084/save-image', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': data.length
        }
    }, (res) => {
        console.log(`[Upload:8084] Status: ${res.statusCode}`);
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => {
            console.log(`[Upload:8084] Response: ${body}`);
            if (res.statusCode === 200) console.log("✅ Image Upload OK");
            else console.error("❌ Image Upload Failed");
        });
    });

    req.on('error', (e) => console.error("[Upload] Error:", e.message));
    req.write(data);
    req.end();
}
