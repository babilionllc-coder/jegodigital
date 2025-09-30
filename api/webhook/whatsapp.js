// WhatsApp Webhook Handler for Vercel
// This handles incoming messages and status updates from WhatsApp Business API

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
    if (req.method === 'GET') {
        // Webhook verification
        const mode = req.query['hub.mode'];
        const token = req.query['hub.verify_token'];
        const challenge = req.query['hub.challenge'];

        // Your verify token (same as in Meta App Dashboard)
        const VERIFY_TOKEN = 'jegodigital_webhook_2024_secure_token';
        
        // Your access token for API calls
        const ACCESS_TOKEN = 'EAAJ7bvfnUoUBPrZCiZCfAPvZAo08ZCRWa4nbTVrN8PuEdoWjBrMyTkYMD0CJiHkirtuh8gXwgtaWfDFRwjQLKtRpJqrcWLYKXPi3hb7ZAow5jzxhZAhOxrvSMxkj9I1XUU7RDvAgBazYQIZCSCZA8TUAHxfXI8TxuZCED57ctEBz5K8hUYAYGx5EYZCr97GpXPWk7rzhNZAgCqyPyWU9yYRyWrDM4NprgZB109BRxXjOIM7kdQJNPAZDZD';

        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            console.log('✅ Webhook verified successfully');
            console.log('Challenge:', challenge);
            res.status(200).send(challenge);
        } else {
            console.log('❌ Webhook verification failed');
            console.log('Mode:', mode);
            console.log('Token:', token);
            console.log('Expected token:', VERIFY_TOKEN);
            res.status(403).send('Forbidden');
        }
    } else if (req.method === 'POST') {
        // Handle incoming webhook data
        const body = req.body;

        console.log('📨 Received webhook:', JSON.stringify(body, null, 2));

        // Check if it's a WhatsApp message
        if (body.object === 'whatsapp_business_account') {
            body.entry.forEach(entry => {
                entry.changes.forEach(change => {
                    if (change.field === 'messages') {
                        const messages = change.value.messages;
                        const statuses = change.value.statuses;

                        // Handle incoming messages
                        if (messages) {
                            messages.forEach(message => {
                                handleIncomingMessage(message);
                            });
                        }

                        // Handle message status updates
                        if (statuses) {
                            statuses.forEach(status => {
                                handleMessageStatus(status);
                            });
                        }
                    }
                });
            });
        }

        res.status(200).send('OK');
    } else {
        res.status(405).send('Method Not Allowed');
    }
}

// Handle incoming messages
function handleIncomingMessage(message) {
    console.log('💬 New message received:', message);
    
    const messageData = {
        id: message.id,
        from: message.from,
        timestamp: message.timestamp,
        type: message.type,
        text: message.text?.body || '',
        context: message.context
    };

    // Log the message (in production, save to database)
    console.log('📝 Message data:', messageData);
    
    // TODO: Save to database or send to dashboard
    // For now, we'll just log it
}

// Handle message status updates
function handleMessageStatus(status) {
    console.log('📊 Message status update:', status);
    
    const statusData = {
        id: status.id,
        status: status.status, // sent, delivered, read, failed
        timestamp: status.timestamp,
        recipient_id: status.recipient_id,
        conversation: status.conversation
    };

    // Log the status update (in production, update database)
    console.log('📝 Status data:', statusData);
    
    // TODO: Update message status in database
    // For now, we'll just log it
}
