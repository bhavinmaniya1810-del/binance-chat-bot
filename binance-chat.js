// binance-chat.js
const express = require('express');
const WebSocket = require('ws');
const bodyParser = require('body-parser');
const puppeteer = require('puppeteer');

const app = express();
app.use(bodyParser.json());

/**
 * Helper: Send payload over WebSocket with timeout
 */
function sendWsMessage(chatWssUrl, payload, timeoutMs = 8000) {
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
 * Endpoint: /send-message
 * Sends a chat message via Binance WebSocket
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
    content = `Hi, payment has been successfully processed.\nAmount: ${amount}\nUTR/Transaction ID: ${utr}\nPlease confirm once you receive it. Thank you!`;
  } else if (type === 'cancel') {
    content = `Hi, I had to cancel the order because the bank details provided were incorrect. Please double-check them and place a new order. Thanks!`;
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
 * Endpoint: /invoice-png
 * Converts invoice JSON → ready PNG (Base64)
 */
app.post('/invoice-png', async (req, res) => {
  const data = req.body;
  if (!data) return res.status(400).json({ success: false, message: 'Invoice JSON is required' });

  // Simple HTML invoice
  const html = `
  <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; background: #f9f9f9; width: 500px; height: 440px; margin:0; padding:20px; border:3px solid #FF8C00; border-radius:10px;}
        h1 { color: #FF8C00; text-align:center; margin-bottom:20px; }
        .row { display:flex; justify-content: space-between; margin:8px 0; }
        .label { font-weight:bold; }
        .status { font-weight:bold; color:${data.status.toLowerCase() === 'success' ? 'green' : 'red'}; }
        footer { text-align:center; font-size:12px; color:#888; margin-top:20px; }
      </style>
    </head>
    <body>
      <h1>Transaction Receipt</h1>
      <div class="row"><span class="label">Date</span><span>${data.date || ''}</span></div>
      <div class="row"><span class="label">Customer Name</span><span>${data.name || ''}</span></div>
      <div class="row"><span class="label">Bank Account</span><span>${data.account || ''}</span></div>
      <div class="row"><span class="label">IFSC Code</span><span>${data.ifsc || ''}</span></div>
      <div class="row"><span class="label">UTR</span><span>${data.utr || ''}</span></div>
      <div class="row"><span class="label">Transaction ID</span><span>${data.transactionId || ''}</span></div>
      <div class="row"><span class="label">Transaction Type</span><span>${data.transactionType || ''}</span></div>
      <div class="row"><span class="label">Status</span><span class="status">${data.status || ''}</span></div>
      <footer>This is a computer-generated receipt. No signature required.</footer>
    </body>
  </html>`;

  try {
    const browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pngBuffer = await page.screenshot({ type: 'png' });
    await browser.close();

    res.json({
      success: true,
      data: pngBuffer.toString('base64'),
      mimeType: 'image/png'
    });
  } catch (err) {
    console.error('Invoice conversion error:', err);
    res.status(500).json({ success: false, message: 'Failed to generate PNG', error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Binance WebSocket + Invoice PNG API running on port ${PORT}`);
});
