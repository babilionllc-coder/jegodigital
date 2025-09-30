// WhatsApp Webhook Handler - Serverless Function
export default function handler(req, res) {
    // Set proper headers
    res.setHeader('Content-Type', 'text/plain');
    
    console.log('🔗 Webhook called:', req.method, req.url);
    console.log('📋 Query params:', req.query);
    
    if (req.method === 'GET') {
        const mode = req.query['hub.mode'];
        const token = req.query['hub.verify_token'];
        const challenge = req.query['hub.challenge'];

        console.log('🔍 Verification params:', { mode, token, challenge });

        const VERIFY_TOKEN = 'jegodigital_webhook_2024_secure_token';

        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            console.log('✅ Verification successful! Sending challenge:', challenge);
            return res.status(200).send(challenge);
        } else {
            console.log('❌ Verification failed');
            console.log('Expected token:', VERIFY_TOKEN);
            console.log('Received token:', token);
            return res.status(403).send('Forbidden');
        }
    }
    
    if (req.method === 'POST') {
        console.log('📨 Webhook event received');
        console.log('Body:', JSON.stringify(req.body, null, 2));
        return res.status(200).send('OK');
    }
    
    return res.status(405).send('Method Not Allowed');
}
