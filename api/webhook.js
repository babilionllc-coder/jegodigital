// WhatsApp Business API Webhook for Vercel
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

    console.log('🔗 WhatsApp Webhook:', req.method, req.url);

    if (req.method === 'GET') {
        // Webhook verification
        const mode = req.query['hub.mode'];
        const token = req.query['hub.verify_token'];
        const challenge = req.query['hub.challenge'];

        console.log('🔍 Verification attempt:', { mode, token, challenge });

        const VERIFY_TOKEN = 'jegodigital_webhook_2024_secure_token';

        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            console.log('✅ Webhook verification successful!');
            res.status(200).send(challenge);
        } else {
            console.log('❌ Webhook verification failed');
            console.log('Expected token:', VERIFY_TOKEN);
            console.log('Received token:', token);
            res.status(403).send('Forbidden');
        }
    } 
    
    else if (req.method === 'POST') {
        // Handle webhook events
        console.log('📨 WhatsApp event received');
        console.log('Event data:', JSON.stringify(req.body, null, 2));
        
        const body = req.body;
        
        // Process WhatsApp Business Account events
        if (body.object === 'whatsapp_business_account') {
            body.entry?.forEach(entry => {
                entry.changes?.forEach(change => {
                    if (change.field === 'messages') {
                        console.log('💬 Messages field update:', change.value);
                        
                        // Handle incoming messages
                        if (change.value.messages) {
                            change.value.messages.forEach(message => {
                                console.log('📩 New message from:', message.from);
                                console.log('Message text:', message.text?.body);
                                console.log('Message type:', message.type);
                                
                                // Here you can add your message processing logic
                                // For example: save to database, send auto-reply, etc.
                            });
                        }
                        
                        // Handle message statuses (delivered, read, etc.)
                        if (change.value.statuses) {
                            change.value.statuses.forEach(status => {
                                console.log('📊 Message status:', status.status, 'for message ID:', status.id);
                            });
                        }
                    }
                });
            });
        }
        
        // Always respond with 200 OK to acknowledge receipt
        res.status(200).send('OK');
    } 
    
    else {
        console.log('❌ Unsupported method:', req.method);
        res.status(405).send('Method Not Allowed');
    }
}