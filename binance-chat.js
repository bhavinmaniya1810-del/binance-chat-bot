const express = require('express');
const WebSocket = require('ws');
const bodyParser = require('body-parser');
const sharp = require('sharp');

const app = express();
app.use(bodyParser.json());

// -------------------- Binance WebSocket Messenger -----------------------
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

app.post('/send-message', async (req, res) => {
    const { type, chatWssUrl, orderNo, amount, utr } = req.body;
    if (!type || !chatWssUrl) return res.status(400).json({ success: false, message: 'Missing required parameters: type, chatWssUrl' });

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

// -------------------- Receipt SVG to PNG API -----------------------
app.post('/convert-receipt', async (req, res) => {
    try {
        const data = req.body.data;
        if (!data) return res.status(400).json({ success: false, message: 'Data is required' });

        const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="1000" height="392">
          <rect x="0" y="0" width="1000" height="392" rx="8" ry="8" fill="#ffffff" stroke="#e8e8e8"/>
          <text x="50%" y="40" font-size="28" font-weight="bold" text-anchor="middle" fill="#dc2626">Transfer Receipt</text>

          <text x="30" y="90" font-size="18" font-weight="bold">Recipient Name</text>
          <text x="230" y="90" font-size="18">${data.recipientName || ''}</text>

          <text x="30" y="130" font-size="18" font-weight="bold">UTR</text>
          <text x="230" y="130" font-size="18">${data.utr || ''}</text>

          <text x="30" y="170" font-size="18" font-weight="bold">Amount</text>
          <text x="230" y="170" font-size="18">${data.amount || ''}</text>

          <text x="30" y="210" font-size="18" font-weight="bold">Date</text>
          <text x="230" y="210" font-size="18">${data.date || ''}</text>

          <text x="30" y="250" font-size="18" font-weight="bold">Payment Type</text>
          <text x="230" y="250" font-size="18">${data.paymentType || ''}</text>

          <text x="30" y="290" font-size="18" font-weight="bold">Transaction ID</text>
          <text x="230" y="290" font-size="18">${data.transactionId || ''}</text>

          <text x="30" y="330" font-size="18" font-weight="bold">To Account</text>
          <text x="230" y="330" font-size="18">${data.toAccount || ''}</text>

          <text x="30" y="370" font-size="18" font-weight="bold">IFSC</text>
          <text x="230" y="370" font-size="18">${data.ifsc || ''}</text>

          <text x="700" y="90" font-size="18" font-weight="bold" fill="${data.status === 'Success' ? 'green' : 'red'}">${data.status || ''}</text>

          <text x="50%" y="380" font-size="14" text-anchor="middle" fill="#888">This is a computer-generated receipt. No signature required.</text>
        </svg>
        `;

        const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();

        return res.status(200).json({
            success: true,
            mimeType: 'image/png',
            fileName: 'receipt.png',
            data: pngBuffer.toString('base64')
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: err.message });
    }
});

// ---------------------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Binance WebSocket Messenger & Receipt API running on port ${PORT}`);
});
