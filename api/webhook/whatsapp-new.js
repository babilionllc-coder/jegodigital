// Simple WhatsApp Webhook Handler
export default function handler(req, res) {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    console.log('🔗 Webhook request:', req.method, req.url);
    console.log('📋 Query params:', req.query);
    console.log('📦 Body:', req.body);

    if (req.method === 'GET') {
        // Webhook verification
        const mode = req.query['hub.mode'];
        const token = req.query['hub.verify_token'];
        const challenge = req.query['hub.challenge'];

        console.log('🔍 Verification attempt:');
        console.log('  Mode:', mode);
        console.log('  Token:', token);
        console.log('  Challenge:', challenge);

        const VERIFY_TOKEN = 'jegodigital_webhook_2024_secure_token';

        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            console.log('✅ Webhook verification successful!');
            res.status(200).send(challenge);
        } else {
            console.log('❌ Webhook verification failed');
            console.log('  Expected token:', VERIFY_TOKEN);
            console.log('  Received token:', token);
            res.status(403).send('Forbidden');
        }
    } else if (req.method === 'POST') {
        // Handle webhook events
        console.log('📨 Received webhook event:', JSON.stringify(req.body, null, 2));
        
        // Process the webhook data
        const body = req.body;
        
        if (body.object === 'whatsapp_business_account') {
            body.entry.forEach(entry => {
                entry.changes.forEach(change => {
                    if (change.field === 'messages') {
                        console.log('💬 Messages field update:', change.value);
                        
                        // Handle messages
                        if (change.value.messages) {
                            change.value.messages.forEach(message => {
                                console.log('📩 New message:', message);
                            });
                        }
                        
                        // Handle statuses
                        if (change.value.statuses) {
                            change.value.statuses.forEach(status => {
                                console.log('📊 Status update:', status);
                            });
                        }
                    }
                });
            });
        }
        
        res.status(200).send('OK');
    } else {
        console.log('❌ Unsupported method:', req.method);
        res.status(405).send('Method Not Allowed');
    }
}
