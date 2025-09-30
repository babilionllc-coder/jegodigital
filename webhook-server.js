// WhatsApp Webhook Handler
// This handles incoming messages and status updates from WhatsApp Business API

const express = require('express');
const crypto = require('crypto');
const app = express();

// Middleware to parse JSON
app.use(express.json());

// Webhook verification endpoint
app.get('/webhook/whatsapp', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    // Your verify token (same as in Meta App Dashboard)
    const VERIFY_TOKEN = 'jegodigital_webhook_2024_secure_token';

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        console.log('✅ Webhook verified successfully');
        res.status(200).send(challenge);
    } else {
        console.log('❌ Webhook verification failed');
        res.status(403).send('Forbidden');
    }
});

// Webhook endpoint for receiving messages
app.post('/webhook/whatsapp', (req, res) => {
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
});

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

    // Save to database or send to dashboard
    saveMessageToDatabase(messageData);
    
    // Send notification to dashboard
    notifyDashboard('new_message', messageData);
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

    // Update message status in database
    updateMessageStatus(statusData);
    
    // Send notification to dashboard
    notifyDashboard('status_update', statusData);
}

// Save message to database
function saveMessageToDatabase(messageData) {
    // TODO: Implement database saving
    console.log('💾 Saving message to database:', messageData);
    
    // For now, save to local storage or send to dashboard
    if (typeof window !== 'undefined' && window.dashboardAPI) {
        window.dashboardAPI.saveIncomingMessage(messageData);
    }
}

// Update message status in database
function updateMessageStatus(statusData) {
    // TODO: Implement database update
    console.log('🔄 Updating message status:', statusData);
    
    // For now, update dashboard
    if (typeof window !== 'undefined' && window.dashboardAPI) {
        window.dashboardAPI.updateMessageStatus(statusData);
    }
}

// Notify dashboard of new events
function notifyDashboard(eventType, data) {
    console.log(`🔔 Dashboard notification: ${eventType}`, data);
    
    // Send to dashboard if available
    if (typeof window !== 'undefined' && window.dashboardAPI) {
        window.dashboardAPI.handleWebhookEvent(eventType, data);
    }
}

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 WhatsApp Webhook server running on port ${PORT}`);
    console.log(`📡 Webhook URL: https://jegodigital.com/webhook/whatsapp`);
    console.log(`🔑 Verify Token: jegodigital_webhook_2024_secure_token`);
});

module.exports = app;
