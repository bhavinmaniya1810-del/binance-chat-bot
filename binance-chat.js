const express = require('express');
const WebSocket = require('ws');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

app.post('/send-message', async (req, res) => {
  const { chatWssUrl, orderNo, amount, utr } = req.body;

  if (!chatWssUrl || !orderNo || !amount || !utr) {
    return res.status(400).json({ success: false, message: 'Missing required parameters' });
  }

  const payload = {
    type: "text",
    uuid: `${Date.now()}`,
    orderNo,
    content: `Hi, payment has been successfully processed.\nAmount: ${amount}\nUTR/Transaction ID: ${utr}\nPlease confirm once you receive it. Thank you!`,
    self: true,
    clientType: "web",
    createTime: Date.now(),
    sendStatus: 0,
  };

  const ws = new WebSocket(chatWssUrl);

  ws.on('open', () => {
    ws.send(JSON.stringify(payload));
    ws.close();
    return res.status(200).json({ success: true, sent: payload });
  });

  ws.on('error', (err) => {
    return res.status(500).json({ success: false, message: 'WebSocket error', error: err.message });
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Binance WebSocket Messenger is running on port ${PORT}`);
});
