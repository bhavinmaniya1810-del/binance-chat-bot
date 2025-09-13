// binance-chat.js
const express = require('express');
const WebSocket = require('ws');
const bodyParser = require('body-parser');
const puppeteer = require('puppeteer');

const app = express();
app.use(bodyParser.json({ limit: '20mb' })); // Allow large payloads

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

// -------------------- Generate Receipt PNG as Base64 -----------------------
async function generateReceiptBase64(data) {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Receipt</title>
<style>
/* --- Paste your full CSS here --- */
*{margin:0;padding:0;box-sizing:border-box;}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Roboto',sans-serif;background:#fff;} .receipt-container{width:1000px;height:392px;background:#fff;border:1px solid #e8e8e8;border-radius:8px;position:relative;overflow:hidden;} .receipt-header{height:88px;display:flex;align-items:center;justify-content:space-between;padding:0 32px 0 31px;border-bottom:1px solid #f0f0f0;} .receipt-left{display:flex;align-items:center;gap:20px;height:100%;} .icon-container{width:32px;height:60px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;} .checkbox{width:20px;height:20px;border:2px solid #dc2626;border-radius:2px;background:transparent;} .arrows{display:flex;flex-direction:column;gap:1px;} .arrow-right,.arrow-left{width:24px;height:2px;background:#6b7280;position:relative;} .arrow-right::after{content:'';position:absolute;right:-4px;top:-2px;width:0;height:0;border-left:4px solid #6b7280;border-top:3px solid transparent;border-bottom:3px solid transparent;} .arrow-left::before{content:'';position:absolute;left:-4px;top:-2px;width:0;height:0;border-right:4px solid #6b7280;border-top:3px solid transparent;border-bottom:3px solid transparent;} .recipient-info{display:flex;flex-direction:column;gap:4px;} .recipient-name{font-size:20px;font-weight:600;color:#000;line-height:24px;margin:0;} .transaction-id{font-size:12px;color:#6b7280;font-weight:400;line-height:16px;} .receipt-right{display:flex;flex-direction:column;align-items:flex-end;gap:4px;position:relative;} .payment-type{font-size:12px;color:#dc2626;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;line-height:16px;} .amount{font-size:26px;font-weight:700;color:#000;line-height:32px;} .date-section{height:36px;display:flex;align-items:center;padding:0 32px 0 31px;} .date{font-size:16px;font-weight:600;color:#000;line-height:20px;} .details-section{height:268px;padding:0 32px 0 31px;display:flex;flex-direction:column;justify-content:space-between;} .details-content{flex:1;display:flex;flex-direction:column;padding-top:8px;} .detail-row{height:40px;display:flex;align-items:center;border-bottom:1px solid #f5f5f5;position:relative;} .detail-row:last-of-type{border-bottom:none;} .detail-label{font-size:12px;color:#9ca3af;text-transform:uppercase;font-weight:500;letter-spacing:0.8px;line-height:16px;position:absolute;left:16px;} .detail-value{font-size:14px;color:#000;font-weight:600;line-height:18px;position:absolute;left:230px;}
</style>
</head>
<body>
<div class="receipt-container">
    <div class="receipt-header">
        <div class="receipt-left">
            <div class="icon-container">
                <div class="checkbox"></div>
                <div class="arrows">
                    <div class="arrow-right"></div>
                    <div class="arrow-left"></div>
                </div>
            </div>
            <div class="recipient-info">
                <h2 class="recipient-name">${data.recipientName || ''}</h2>
                <div class="transaction-id">UTR : ${data.utr || ''}</div>
            </div>
        </div>
        <div class="receipt-right">
            <div class="payment-type">${data.paymentType || ''}</div>
            <div class="amount">${data.amount || ''}</div>
        </div>
    </div>
    <div class="date-section">
        <div class="date">${data.date || ''}</div>
    </div>
    <div class="details-section">
        <div class="details-content">
            <div class="detail-row">
                <span class="detail-label">PAYMENT TYPE</span>
                <span class="detail-value">${data.paymentType || ''}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">TRANSACTION ID</span>
                <span class="detail-value">${data.transactionId || ''}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">TO ACCOUNT</span>
                <span class="detail-value">${data.toAccount || ''}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">IFSC</span>
                <span class="detail-value">${data.ifsc || ''}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">COUNTER PARTY NAME</span>
                <span class="detail-value">${data.recipientName || ''}</span>
            </div>
        </div>
    </div>
</div>
</body>
</html>
`;

    const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pngBuffer = await page.screenshot({ type: 'png', fullPage: true });
    await browser.close();

    return pngBuffer.toString('base64');
}

// -------------------- Combined Endpoint: Generate PNG + Send to Binance -----------------------
app.post('/send-receipt', async (req, res) => {
    const { chatWssUrl, ...receiptData } = req.body;

    if (!chatWssUrl) {
        return res.status(400).json({ success: false, message: 'chatWssUrl is required' });
    }

    try {
        // Generate Base64 PNG
        const base64Image = await generateReceiptBase64(receiptData);

        // Create payload for Binance WebSocket
        const payload = {
            type: "image",
            uuid: `${Date.now()}`,
            orderNo: receiptData.orderNo || null,
            content: base64Image, // Send PNG as Base64
            mimeType: 'image/png',
            self: true,
            clientType: "web",
            createTime: Date.now(),
            sendStatus: 0,
        };

        const result = await sendWsMessage(chatWssUrl, payload);

        res.status(200).json({ success: true, sent: result, base64Image });

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// -------------------- Start Server -----------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Binance chat bot & receipt PNG generator running on port ${PORT}`);
});
