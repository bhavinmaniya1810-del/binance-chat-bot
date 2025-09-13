const express = require('express');
const WebSocket = require('ws');
const bodyParser = require('body-parser');
const { createCanvas } = require('canvas'); // <-- install: npm i canvas

const app = express();
app.use(bodyParser.json());

/**
 * Helper: Send payload over WebSocket with timeout
 */
async function sendWsMessage(chatWssUrl, payload, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    if (!chatWssUrl) return reject(new Error('chatWssUrl is required'));
    const ws = new WebSocket(chatWssUrl);
    let finished = false;

    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      try { ws.terminate(); } catch {}
      reject(new Error(`WebSocket timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    ws.on('open', () => {
      ws.send(JSON.stringify(payload), (err) => {
        clearTimeout(timer);
        if (finished) return;
        finished = true;
        if (err) {
          try { ws.terminate(); } catch {}
          return reject(err);
        }
        try { ws.close(); } catch {}
        resolve({ success: true, sent: payload });
      });
    });

    ws.on('error', (err) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      try { ws.terminate(); } catch {}
      reject(err);
    });

    ws.on('close', (code, reason) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      reject(new Error(`WebSocket closed early: code=${code}, reason=${reason}`));
    });
  });
}

/**
 * Existing endpoint: /send-message
 */
app.post('/send-message', async (req, res) => {
  const { type, chatWssUrl, orderNo, amount, utr } = req.body;

  if (!type || !chatWssUrl) {
    return res.status(400).json({ success: false, message: 'Missing required parameters: type, chatWssUrl' });
  }

  let content;
  if (type === 'success') {
    if (!orderNo || !amount || !utr) {
      return res.status(400).json({ success: false, message: 'Missing required parameters for success message: orderNo, amount, utr' });
    }
    content = `Hi, payment has been successfully processed.\nAmount: ${amount}\nUTR/Transaction ID: ${utr}\nPlease confirm once you receive it. Thank you !`;
  } else if (type === 'cancel') {
    content = `Hi, I had to cancel the order because the bank details provided were incorrect. Please double-check them and place a new order with the correct information. Let me know once it's done. Thanks!`;
  } else {
    return res.status(400).json({ success: false, message: 'Invalid type. Allowed values: success, cancel' });
  }

  const payload = {
    type: "text",
    uuid: `${Date.now()}`,
    orderNo: orderNo || null,
    content,
    self: true,
    clientType: "web",
    createTime: Date.now(),
    sendStatus: 0,
  };

  try {
    const result = await sendWsMessage(chatWssUrl, payload);
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * 🆕 New endpoint: /generate-receipt
 * Uses Canvas (no chromium required)
 */
app.post('/generate-receipt', async (req, res) => {
  try {
    const { date, name, account, ifsc, utr, transactionId, status, transactionType } = req.body;

    if (!date || !name || !account || !ifsc || !utr || !transactionId || !status || !transactionType) {
      return res.status(400).json({ success: false, message: 'Missing one or more required fields.' });
    }

    // ---- Canvas setup ----
    const width = 1000;
    const height = 400;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    // Border
    ctx.strokeStyle = "#e8e8e8";
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, width, height);

    // Title
    ctx.fillStyle = "#000000";
    ctx.font = "bold 30px Arial";
    ctx.fillText("Transfer Receipt", 30, 50);

    // Status
    ctx.fillStyle = status.toLowerCase() === "success" ? "#16a34a" : "#dc2626";
    ctx.font = "bold 24px Arial";
    ctx.fillText(`Status: ${status}`, 30, 90);

    // Draw details
    ctx.fillStyle = "#000";
    ctx.font = "20px Arial";
    const lineHeight = 35;
    let y = 140;

    const details = [
      ["Date", date],
      ["Recipient Name", name],
      ["Account", account],
      ["IFSC", ifsc],
      ["UTR", utr],
      ["Transaction ID", transactionId],
      ["Transaction Type", transactionType],
    ];

    details.forEach(([label, value]) => {
      ctx.fillStyle = "#6b7280";
      ctx.font = "bold 18px Arial";
      ctx.fillText(`${label}:`, 30, y);
      ctx.fillStyle = "#000000";
      ctx.font = "18px Arial";
      ctx.fillText(`${value}`, 250, y);
      y += lineHeight;
    });

    // ---- Export to Base64 ----
    const buffer = canvas.toBuffer("image/png");
    const base64Image = buffer.toString("base64");

    return res.json({
      success: true,
      image: `data:image/png;base64,${base64Image}`,
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
