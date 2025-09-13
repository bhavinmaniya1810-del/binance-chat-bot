// binance-chat.js
const express = require('express');
const WebSocket = require('ws');
const bodyParser = require('body-parser');
const nodeHtmlToImage = require('node-html-to-image'); // <-- install: npm i node-html-to-image

const app = express();
app.use(bodyParser.json());

/**
 * Existing WebSocket Helper
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
 * Existing Endpoint
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
 * 🆕 New Endpoint: /generate-receipt (No Puppeteer)
 */
app.post('/generate-receipt', async (req, res) => {
  try {
    const { date, name, account, ifsc, utr, transactionId, status, transactionType } = req.body;

    if (!date || !name || !account || !ifsc || !utr || !transactionId || !status || !transactionType) {
      return res.status(400).json({ success: false, message: 'Missing one or more required fields.' });
    }

    // Prepare HTML dynamically
    const html = `
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        /* Paste the CSS from your template here */
        body { font-family: Arial, sans-serif; background: #fff; }
        .receipt-container { width: 800px; border: 1px solid #ddd; padding: 20px; border-radius: 10px; }
        h2 { margin: 0; font-size: 20px; }
        .amount { font-size: 24px; font-weight: bold; margin-top: 10px; }
        .detail-row { display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid #f0f0f0; }
        .detail-label { font-size: 12px; color: #888; text-transform: uppercase; }
        .detail-value { font-weight: bold; }
      </style>
    </head>
    <body>
      <div class="receipt-container">
        <h2>${name}</h2>
        <div class="amount">${status}</div>
        <div class="detail-row"><span class="detail-label">Date</span><span class="detail-value">${date}</span></div>
        <div class="detail-row"><span class="detail-label">Account</span><span class="detail-value">${account}</span></div>
        <div class="detail-row"><span class="detail-label">IFSC</span><span class="detail-value">${ifsc}</span></div>
        <div class="detail-row"><span class="detail-label">UTR</span><span class="detail-value">${utr}</span></div>
        <div class="detail-row"><span class="detail-label">Transaction ID</span><span class="detail-value">${transactionId}</span></div>
        <div class="detail-row"><span class="detail-label">Transaction Type</span><span class="detail-value">${transactionType}</span></div>
      </div>
    </body>
    </html>`;

    // Generate PNG from HTML
    const imageBuffer = await nodeHtmlToImage({
      html,
      quality: 100,
      type: 'png',
      encoding: 'buffer'
    });

    const base64Image = imageBuffer.toString('base64');
    return res.json({
      success: true,
      image: `data:image/png;base64,${base64Image}`
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
