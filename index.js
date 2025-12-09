const makeWASocket = require("@whiskeysockets/baileys").default;
const { useMultiFileAuthState, downloadMediaMessage } = require("@whiskeysockets/baileys");
const axios = require("axios");
const FormData = require("form-data");
const qrcode = require("qrcode-terminal");

const WORKER_URL = "https://bronqii.com/ai-image-analyzer"; // your Worker
const UPLOAD_URL = "https://ar-hosting.pages.dev/upload";    // free public host

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("auth");
  const sock = makeWASocket({ auth: state });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", ({ connection, qr }) => {
    if (qr) qrcode.generate(qr, { small: true });
    if (connection === "open") console.log("🔥 Bot connected!");
    else if (connection === "close") startBot();
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || !msg.message.imageMessage) return;

    const from = msg.key.remoteJid;
    const caption = msg.message.imageMessage.caption || "";

    // Check if caption starts with /explain or /ai
    const lowerCap = caption.trim().toLowerCase();
    if (lowerCap.startsWith("/explain") || lowerCap.startsWith("/ai")) {
      try {
        // Determine prompt
        let textPrompt = "describe this image"; // default
        const splitSpace = caption.split(" ");
        if (splitSpace.length > 1) {
          splitSpace.shift(); // remove /ai or /explain
          textPrompt = splitSpace.join(" "); // use rest as prompt
        }

        // 1️⃣ Download WhatsApp image
        const imgBuffer = await downloadMediaMessage(msg, "buffer", {});

        // 2️⃣ Upload to ar-hosting
        const form = new FormData();
        form.append("file", imgBuffer, "photo.jpg");

        const uploadRes = await axios.post(UPLOAD_URL, form, {
          headers: { ...form.getHeaders() },
          maxBodyLength: Infinity
        });

        const publicUrl = uploadRes.data?.url || uploadRes.data; // depends on host response

        if (!publicUrl) throw new Error("Failed to get public URL from host");

        // 3️⃣ Send GET request to your Worker
        const workerApi = `${WORKER_URL}?text=${encodeURIComponent(textPrompt)}&image=${encodeURIComponent(publicUrl)}`;
        const workerRes = await axios.get(workerApi);

        // 4️⃣ Reply AI text
        await sock.sendMessage(from, { text: workerRes.data.cleanText || "No description found." });
      } catch (err) {
        console.log("❌ Error:", err.message);
        await sock.sendMessage(from, { text: "⚠️ Something went wrong." });
      }
    }
  });
}

startBot();


const express = require('express');        // import Express
const app = express();                     // create an app instance

app.get('/', (req, res) => res.send('Bot alive!')); // responds "Bot alive!" when pinged

app.listen(process.env.PORT || 3000);     // listen on Railway's assigned port or 3000 locally
