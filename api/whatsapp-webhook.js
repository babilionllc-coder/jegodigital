// WhatsApp Webhook Handler - Root API
export default function handler(req, res) {
    console.log('🔗 Webhook called:', req.method, req.url);
    
    if (req.method === 'GET') {
        const mode = req.query['hub.mode'];
        const token = req.query['hub.verify_token'];
        const challenge = req.query['hub.challenge'];

        console.log('🔍 Verification:', { mode, token, challenge });

        const VERIFY_TOKEN = 'jegodigital_webhook_2024_secure_token';

        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            console.log('✅ Verification successful!');
            return res.status(200).send(challenge);
        } else {
            console.log('❌ Verification failed');
            return res.status(403).send('Forbidden');
        }
    }
    
    if (req.method === 'POST') {
        console.log('📨 Webhook event:', JSON.stringify(req.body, null, 2));
        return res.status(200).send('OK');
    }
    
    return res.status(405).send('Method Not Allowed');
}
