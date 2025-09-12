// binance-chat.js
const express = require('express');
const WebSocket = require('ws');
const bodyParser = require('body-parser');
const sharp = require('sharp');

const app = express();
app.use(bodyParser.json({ limit: '10mb' })); // increased limit for SVG content

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
    content = `Hi, payment has been successfully processed.\nAmount: ${amount}\nUTR/Transaction ID: ${utr}\nPlease confirm once you receive it. Thank you!`;
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
 * New endpoint: /convert-svg
 * Converts an SVG string to JPG and returns Base64
 */
app.post('/convert-svg', async (req, res) => {
  try {
    const { svg } = req.body;

    if (!svg) {
      return res.status(400).json({ success: false, message: 'SVG content is required' });
    }

    // Convert SVG to JPG using sharp
    const jpgBuffer = await sharp(Buffer.from(svg))
      .jpeg({ quality: 90 })
      .toBuffer();

    const jpgBase64 = jpgBuffer.toString('base64');

    res.json({
      success: true,
      jpgBase64,
      mimeType: 'image/jpeg'
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Failed to convert SVG to JPG', error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Binance WebSocket Messenger + SVG Converter running on port ${PORT}`);
});
