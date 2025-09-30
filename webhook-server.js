const express = require('express');
const app = express();
const port = 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// WhatsApp Webhook Handler
app.get('/webhook', (req, res) => {
    console.log('🔗 GET webhook called');
    console.log('📋 Query params:', req.query);
    
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    console.log('🔍 Verification params:', { mode, token, challenge });

    const VERIFY_TOKEN = 'jegodigital_webhook_2024_secure_token';

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        console.log('✅ Verification successful! Sending challenge:', challenge);
        res.status(200).send(challenge);
    } else {
        console.log('❌ Verification failed');
        console.log('Expected token:', VERIFY_TOKEN);
        console.log('Received token:', token);
        res.status(403).send('Forbidden');
    }
});

app.post('/webhook', (req, res) => {
    console.log('📨 POST webhook called');
    console.log('Body:', JSON.stringify(req.body, null, 2));
    res.status(200).send('OK');
});

app.listen(port, () => {
    console.log(`🚀 Webhook server running at http://localhost:${port}/webhook`);
    console.log('🔑 Verify token: jegodigital_webhook_2024_secure_token');
});