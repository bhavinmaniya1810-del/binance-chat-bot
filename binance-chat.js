// binance-chat.js
const express = require('express');
const WebSocket = require('ws');
const bodyParser = require('body-parser');
const puppeteer = require('puppeteer'); // <- install this: npm i puppeteer

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
 * 🆕 New Endpoint: /generate-receipt
 * Accepts JSON body with receipt details and returns base64 image
 */
app.post('/generate-receipt', async (req, res) => {
  try {
    const { date, name, account, ifsc, utr, transactionId, status, transactionType } = req.body;

    if (!date || !name || !account || !ifsc || !utr || !transactionId || !status || !transactionType) {
      return res.status(400).json({ success: false, message: 'Missing one or more required fields.' });
    }

    // 1️⃣ Prepare dynamic HTML
    const html = `
      ${/* 👇 insert your full HTML here, replacing values dynamically */''}
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>${/* Use same <style> as your template */''}</style>
      </head>
      <body>
        <script>
          window.data = ${JSON.stringify({
            recipientName: name,
            utr,
            date,
            paymentType: transactionType,
            transactionId,
            toAccount: account,
            ifsc
          })}
        </script>
        ${/* Put your template here but call updateReceipt(window.data) at the end */''}
      </body>
      </html>
    `;

    // 2️⃣ Launch Puppeteer and generate screenshot
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const screenshotBuffer = await page.screenshot({ type: 'png' });
    await browser.close();

    // 3️⃣ Convert to base64 and return
    const base64Image = screenshotBuffer.toString('base64');

    res.json({
      success: true,
      image: `data:image/png;base64,${base64Image}`
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
