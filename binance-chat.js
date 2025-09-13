// -------------------- Receipt PNG Generation as Base64 -----------------------
app.post('/convert-receipt', async (req, res) => {
    try {
        const data = req.body;

        const html = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Transfer Receipt</title>
<style>
/* --- Paste all your CSS here --- */
* {margin:0;padding:0;box-sizing:border-box;}
body {font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;background:#fff;}
.receipt-container {width:1000px;height:392px;background:#fff;border:1px solid #e8e8e8;border-radius:8px;position:relative;overflow:hidden;}
.receipt-header {height:88px;display:flex;align-items:center;justify-content:space-between;padding:0 32px 0 31px;border-bottom:1px solid #f0f0f0;}
.receipt-left {display:flex;align-items:center;gap:20px;height:100%;}
.icon-container {width:32px;height:60px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;}
.checkbox {width:20px;height:20px;border:2px solid #dc2626;border-radius:2px;background:transparent;}
.arrows {display:flex;flex-direction:column;gap:1px;}
.arrow-right, .arrow-left {width:24px;height:2px;background:#6b7280;position:relative;}
.arrow-right::after {content:'';position:absolute;right:-4px;top:-2px;width:0;height:0;border-left:4px solid #6b7280;border-top:3px solid transparent;border-bottom:3px solid transparent;}
.arrow-left::before {content:'';position:absolute;left:-4px;top:-2px;width:0;height:0;border-right:4px solid #6b7280;border-top:3px solid transparent;border-bottom:3px solid transparent;}
.recipient-info {display:flex;flex-direction:column;gap:4px;}
.recipient-name {font-size:20px;font-weight:600;color:#000;line-height:24px;margin:0;}
.transaction-id {font-size:12px;color:#6b7280;font-weight:400;line-height:16px;}
.receipt-right {display:flex;flex-direction:column;align-items:flex-end;gap:4px;position:relative;}
.payment-type {font-size:12px;color:#dc2626;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;line-height:16px;}
.amount {font-size:26px;font-weight:700;color:#000;line-height:32px;}
.date-section {height:36px;display:flex;align-items:center;padding:0 32px 0 31px;}
.date {font-size:16px;font-weight:600;color:#000;line-height:20px;}
.details-section {height:268px;padding:0 32px 0 31px;display:flex;flex-direction:column;justify-content:space-between;}
.details-content {flex:1;display:flex;flex-direction:column;padding-top:8px;}
.detail-row {height:40px;display:flex;align-items:center;border-bottom:1px solid #f5f5f5;position:relative;}
.detail-row:last-of-type {border-bottom:none;}
.detail-label {font-size:12px;color:#9ca3af;text-transform:uppercase;font-weight:500;letter-spacing:0.8px;line-height:16px;position:absolute;left:16px;}
.detail-value {font-size:14px;color:#000;font-weight:600;line-height:18px;position:absolute;left:230px;}
.action-section {height:50px;display:flex;align-items:center;padding-bottom:16px;}
.action-button {width:48%;height:44px;background:#dc2626;color:#fff;border:none;border-radius:16px;font-size:13px;font-weight:600;cursor:pointer;transition:background-color 0.2s;line-height:16px;}
.action-button:hover {background:#b91c1c;}
.action-button:active {background:#991b1b;}
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

        // Convert PNG to Base64
        const base64Image = pngBuffer.toString('base64');

        // Return JSON with Base64
        res.json({
            success: true,
            mimeType: 'image/png',
            fileName: 'receipt.png',
            base64: base64Image
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: err.message });
    }
});
