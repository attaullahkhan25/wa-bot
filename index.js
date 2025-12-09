// ==========================
// WhatsApp Bot with Baileys
// ==========================
import makeWASocket from "@whiskeysockets/baileys";
import { useMultiFileAuthState, downloadMediaMessage } from "@whiskeysockets/baileys";
import axios from "axios";
import FormData from "form-data";
import express from "express";
import qrcode from "qrcode-terminal";

// ==========================
// Config
// ==========================
const WORKER_URL = process.env.WORKER_URL; // https://bronqii.com/ai-image-analyzer
const UPLOAD_URL = process.env.UPLOAD_URL; // https://ar-hosting.pages.dev/upload

// ==========================
// Start WhatsApp Bot
// ==========================
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("auth");
  const sock = makeWASocket({ auth: state });

  sock.ev.on("creds.update", saveCreds);

  // Connection updates
  sock.ev.on("connection.update", ({ connection, qr }) => {
    if (qr) qrcode.generate(qr, { small: true });
    if (connection === "open") console.log("🔥 Bot connected!");
    else if (connection === "close") startBot();
  });

  // Message handler
  sock.ev.on("messages.upsert", async ({ messages }) => {
    try {
      const msg = messages[0];
      if (!msg.message || !msg.message.imageMessage) return;

      const from = msg.key.remoteJid;
      const caption = msg.message.imageMessage.caption || "";

      // Check commands
      const lower = caption.toLowerCase().trim();
      let textPrompt = "";

      if (lower.startsWith("/explain")) {
        textPrompt = caption.slice(8).trim() || "describe this image";
      } else if (lower.startsWith("/ai")) {
        textPrompt = caption.slice(3).trim() || "describe this image";
      } else {
        return; // ignore other messages
      }

      // 1️⃣ Download image
      const imgBuffer = await downloadMediaMessage(msg, "buffer", {});

      // 2️⃣ Upload image
      const form = new FormData();
      form.append("file", imgBuffer, "photo.jpg");

      const uploadRes = await axios.post(UPLOAD_URL, form, {
        headers: { ...form.getHeaders() },
        maxBodyLength: Infinity
      });

      const publicUrl = uploadRes.data?.url || uploadRes.data;
      if (!publicUrl) throw new Error("Failed to get public URL from host");

      // 3️⃣ Call Worker API
      const workerApi = `${WORKER_URL}?text=${encodeURIComponent(textPrompt)}&image=${encodeURIComponent(publicUrl)}`;

      const workerRes = await axios.get(workerApi);
      const cleanText = workerRes.data?.cleanText || "No description found.";

      // 4️⃣ Reply
      await sock.sendMessage(from, { text: cleanText });
    } catch (err) {
      console.log("❌ Message handler error:", err.message);
    }
  });
}

// Start bot
startBot().catch(err => console.log("❌ Bot start failed:", err));

// ==========================
// Express keep-alive
// ==========================
const app = express();

app.get("/", (req, res) => res.send("Bot alive!")); // ping endpoint

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌐 Express server running on port ${PORT}`));
