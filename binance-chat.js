// binance-chat.js
const express = require('express');
const WebSocket = require('ws');
const bodyParser = require('body-parser');
const puppeteer = require('puppeteer');

const app = express();
app.use(bodyParser.json({ limit: '10mb' })); // Allow large JSON payloads

// -------------------- Helper: Send payload over WebSocket -----------------------
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
                if (err) { try { ws.terminate(); } catch {}; return reject(err); }
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

// -------------------- Endpoint: Send Chat Message -----------------------
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

// -------------------- Endpoint: Convert Receipt JSON → PNG -----------------------
app.post('/convert-receipt', async (req, res) => {
    try {
        const data = req.body;

        // HTML template for receipt
        const html = `
        <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            .receipt { width: 800px; border: 1px solid #ddd; padding: 20px; border-radius: 8px; }
            h2 { text-align: center; color: #dc2626; }
            .row { display: flex; justify-content: space-between; margin: 8px 0; }
            .label { font-weight: bold; width: 200px; }
            .status { font-weight: bold; color: ${data.status === 'Success' ? 'green' : 'red'}; }
            .footer { text-align: center; font-size: 12px; color: #888; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="receipt">
            <h2>Transfer Receipt</h2>
            <div class="row"><div class="label">Recipient Name</div><div>${data.recipientName || ''}</div></div>
            <div class="row"><div class="label">Date</div><div>${data.date || ''}</div></div>
            <div class="row"><div class="label">Amount</div><div>${data.amount || ''}</div></div>
            <div class="row"><div class="label">Payment Type</div><div>${data.paymentType || ''}</div></div>
            <div class="row"><div class="label">Transaction ID</div><div>${data.transactionId || ''}</div></div>
            <div class="row"><div class="label">To Account</div><div>${data.toAccount || ''}</div></div>
            <div class="row"><div class="label">IFSC</div><div>${data.ifsc || ''}</div></div>
            <div class="row"><div class="label">UTR</div><div>${data.utr || ''}</div></div>
            <div class="row"><div class="label">Status</div><div class="status">${data.status || ''}</div></div>
            <div class="footer">This is a computer-generated receipt. No signature required.</div>
          </div>
        </body>
        </html>
        `;

        // Launch Puppeteer
        const browser = await puppeteer.launch({
            executablePath: '/snap/bin/chromium', // Use your installed Chromium path
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' });

        const receiptElement = await page.$('.receipt');
        const pngBuffer = await receiptElement.screenshot({ omitBackground: true });

        await browser.close();

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

// -------------------- Start Server -----------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Binance WebSocket Messenger & Receipt API running on port ${PORT}`);
});
