// WhatsApp Business API Integration
// This script handles all WhatsApp Business API operations

class WhatsAppBusinessAPI {
    constructor() {
        this.phoneNumberId = "780878615114928"; // From your API setup
        this.businessAccountId = "1796802194255827"; // From your API setup
        this.accessToken = null; // Will be set when user generates token
        this.certificate = "CmwKKAjVzJCHk9P9AhIGZW500ndhlg9KZWdvRGlnaXRhbFdoYXRQ3LTqxgYaQE5sIH7UJY4MKO0564JHUbyJmloEqvgshSJ6hfH/VEc619VaRlhF29W28Wg9nD84n/r4jFcT3C8h/GKVIkGIQgSLm0QBZ7/r9+L9lq1s5usaiuVWOHtXMXYwflmR06tPJAY4wo9Bd2QSJPWhkbg7NY=";
        this.apiUrl = `https://graph.facebook.com/v18.0/${this.phoneNumberId}/messages`;
        this.webhookUrl = null; // Will be set for receiving messages
    }

    // Set access token (user needs to generate this from WhatsApp Business API)
    setAccessToken(token) {
        this.accessToken = token;
        console.log('WhatsApp Business API access token set');
    }

    // Send message to a single recipient
    async sendMessage(phoneNumber, message, templateName = null) {
        if (!this.accessToken) {
            throw new Error('Access token not set. Please generate access token from WhatsApp Business API.');
        }

        try {
            const messageData = {
                messaging_product: "whatsapp",
                to: phoneNumber,
                type: "text",
                text: {
                    body: message
                }
            };

            // If using template, modify message structure
            if (templateName) {
                messageData.type = "template";
                messageData.template = {
                    name: templateName,
                    language: {
                        code: "es"
                    }
                };
            }

            const response = await fetch(this.apiUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(messageData)
            });

            const result = await response.json();

            if (response.ok) {
                console.log('Message sent successfully:', result);
                return {
                    success: true,
                    messageId: result.messages[0].id,
                    data: result
                };
            } else {
                console.error('Error sending message:', result);
                return {
                    success: false,
                    error: result.error?.message || 'Unknown error',
                    data: result
                };
            }

        } catch (error) {
            console.error('Network error:', error);
            return {
                success: false,
                error: error.message,
                data: null
            };
        }
    }

    // Send bulk messages to multiple recipients
    async sendBulkMessages(recipients, message, delay = 1000) {
        const results = [];
        
        for (let i = 0; i < recipients.length; i++) {
            const recipient = recipients[i];
            
            try {
                const result = await this.sendMessage(recipient.phone, message);
                results.push({
                    phone: recipient.phone,
                    name: recipient.name,
                    success: result.success,
                    messageId: result.messageId,
                    error: result.error
                });

                // Add delay between messages to avoid rate limiting
                if (i < recipients.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, delay));
                }

            } catch (error) {
                results.push({
                    phone: recipient.phone,
                    name: recipient.name,
                    success: false,
                    error: error.message
                });
            }
        }

        return results;
    }

    // Test API connection
    async testConnection() {
        if (!this.accessToken) {
            return {
                success: false,
                error: 'Access token not set'
            };
        }

        try {
            const response = await fetch(`https://graph.facebook.com/v18.0/${this.phoneNumberId}`, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`
                }
            });

            if (response.ok) {
                return {
                    success: true,
                    message: 'WhatsApp Business API connection successful'
                };
            } else {
                const error = await response.json();
                return {
                    success: false,
                    error: error.error?.message || 'Connection failed'
                };
            }
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Generate personalized message for lead
    generatePersonalizedMessage(lead) {
        const templates = [
            `¡Hola! Soy Alex Jego de JegoDigital. He analizado tu sitio web ${lead.website || 'y encontré oportunidades importantes'} para aumentar tus ventas. ¿Te interesa una consulta GRATUITA?`,
            
            `Hola! Vi tu negocio ${lead.businessName || 'y me encanta'}. Te puedo ayudar a conseguir más clientes con marketing digital. ¿Te interesa saber cómo?`,
            
            `¡Buenos días! Soy Alex de JegoDigital. Tu ${lead.businessType || 'negocio'} tiene mucho potencial. Te ayudo a conseguir más clientes con estrategias digitales. ¿Te interesa?`,
            
            `¡Hola! Soy Alex Jego de JegoDigital. He visto tu ${lead.businessName || 'negocio'} y tiene excelente potencial. Te puedo ayudar a aumentar tus ventas con marketing digital. ¿Te gustaría una consulta GRATUITA?`
        ];

        // Select template based on lead score or random
        const templateIndex = lead.score < 20 ? 0 : Math.floor(Math.random() * templates.length);
        return templates[templateIndex];
    }
}

// Export for use in dashboard
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WhatsAppBusinessAPI;
} else if (typeof window !== 'undefined') {
    window.WhatsAppBusinessAPI = WhatsAppBusinessAPI;
}
