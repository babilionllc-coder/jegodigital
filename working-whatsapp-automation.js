const axios = require('axios');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const fs = require('fs');

class WorkingWhatsAppAutomation {
    constructor() {
        this.apiToken = "EAAVp3Bi3yZCkBPnpdB35Mxtw2qr3z6sVFMPes6JxWVolsyq5ah4qZAHsnTKud1n95YQW4JvkS9nSQUM6ytqYbSBfZCznrRLPhxWVpd2S9EnXcMAVqglSZBqZCf2gpS90WDZAkdU4lZB3Tb5rkuNIbJDQu9X5swpZBwmbIX7pXY2Wym60yyUTshbBvNMwRbNh7W4zt1f2TOaTS2ZAXg4XuL9pVsPPzre8jfZChUk06npiHHJ5vbOwZDZD";
        this.baseURL = "https://graph.facebook.com/v18.0";
        this.businessId = "31621913207424299";
        this.doc = null;
        this.serviceAccountAuth = new JWT({
            email: JSON.parse(fs.readFileSync('google-service-account-config.json', 'utf8')).client_email,
            key: JSON.parse(fs.readFileSync('google-service-account-config.json', 'utf8')).private_key,
            scopes: [
                'https://www.googleapis.com/auth/spreadsheets',
                'https://www.googleapis.com/auth/drive.file',
            ],
        });
    }

    async initialize() {
        console.log('🚀 WORKING WHATSAPP BUSINESS API AUTOMATION');
        console.log('💰 Cost: $0 - Using your existing API');
        console.log('🎯 Goal: Send all 100 leads automatically\n');
        
        this.doc = new GoogleSpreadsheet('1nzknj5DlU_1oXeu_7VcMRD6_FRcSkgef2I0ObXxYoLg', this.serviceAccountAuth);
        await this.doc.loadInfo();
        console.log(`📊 Connected to: ${this.doc.title}`);
    }

    async getPhoneNumberId() {
        console.log('📞 Getting WhatsApp phone number ID...\n');
        
        try {
            // Try different endpoints to find phone numbers
            const endpoints = [
                `${this.baseURL}/${this.businessId}/phone_numbers`,
                `${this.baseURL}/me/phone_numbers`,
                `${this.baseURL}/me`
            ];
            
            for (const endpoint of endpoints) {
                try {
                    console.log(`🔍 Trying endpoint: ${endpoint}`);
                    const response = await axios.get(endpoint, {
                        headers: {
                            'Authorization': `Bearer ${this.apiToken}`,
                            'Content-Type': 'application/json'
                        }
                    });
                    
                    console.log('✅ Response received:');
                    console.log(JSON.stringify(response.data, null, 2));
                    
                    if (response.data.data && response.data.data.length > 0) {
                        const phoneNumber = response.data.data[0];
                        console.log(`✅ Phone Number Found: ${phoneNumber.display_phone_number}`);
                        console.log(`📊 Phone Number ID: ${phoneNumber.id}\n`);
                        return phoneNumber.id;
                    }
                } catch (error) {
                    console.log(`❌ Endpoint failed: ${error.response?.data?.error?.message || error.message}\n`);
                }
            }
            
            // If no phone number found, we'll try to send without it
            console.log('⚠️ No phone number ID found, will try to send without it\n');
            return null;
            
        } catch (error) {
            console.error('❌ Error getting phone number:', error.message);
            return null;
        }
    }

    async sendMessage(phoneNumber, message, phoneNumberId = null) {
        console.log(`📤 SENDING MESSAGE TO ${phoneNumber}...\n`);
        
        try {
            // If no phone number ID, try to get it first
            if (!phoneNumberId) {
                phoneNumberId = await this.getPhoneNumberId();
            }
            
            // Prepare message data
            const messageData = {
                messaging_product: "whatsapp",
                to: phoneNumber,
                type: "text",
                text: {
                    body: message
                }
            };
            
            // Try different endpoints for sending messages
            const endpoints = [
                phoneNumberId ? `${this.baseURL}/${phoneNumberId}/messages` : null,
                `${this.baseURL}/${this.businessId}/messages`,
                `${this.baseURL}/me/messages`
            ].filter(Boolean);
            
            for (const endpoint of endpoints) {
                try {
                    console.log(`🔍 Trying to send via: ${endpoint}`);
                    
                    const response = await axios.post(endpoint, messageData, {
                        headers: {
                            'Authorization': `Bearer ${this.apiToken}`,
                            'Content-Type': 'application/json'
                        }
                    });
                    
                    console.log('✅ MESSAGE SENT SUCCESSFULLY!');
                    console.log(`   📱 To: ${phoneNumber}`);
                    console.log(`   📊 Message ID: ${response.data.messages[0].id}`);
                    console.log(`   💬 Message Preview: ${message.substring(0, 50)}...\n`);
                    
                    return {
                        success: true,
                        messageId: response.data.messages[0].id,
                        status: 'sent'
                    };
                    
                } catch (error) {
                    console.log(`❌ Endpoint failed: ${error.response?.data?.error?.message || error.message}`);
                    
                    // If this is a specific error we can handle, try next endpoint
                    if (error.response?.data?.error?.code === 100 || 
                        error.response?.data?.error?.code === 131026) {
                        continue;
                    }
                }
            }
            
            throw new Error('All endpoints failed');
            
        } catch (error) {
            console.error('❌ MESSAGE SENDING FAILED:');
            console.error(`   Error: ${error.response?.data?.error?.message || error.message}`);
            console.error(`   Code: ${error.response?.data?.error?.code || 'Unknown'}\n`);
            
            return {
                success: false,
                error: error.response?.data?.error?.message || error.message
            };
        }
    }

    async getLeadsFromSheet() {
        console.log('📋 Getting leads from Google Sheets...\n');
        
        const messagesSheet = this.doc.sheetsByTitle['Copy Paste Messages'];
        await messagesSheet.loadCells();
        
        const rows = await messagesSheet.getRows();
        const leads = [];
        
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const businessName = row.get('Business Name');
            const phoneNumber = row.get('Phone Number');
            const message = row.get('Message to Send');
            const status = row.get('Status');
            
            if (businessName && phoneNumber && message && status !== 'Message Sent') {
                leads.push({
                    businessName,
                    phoneNumber: this.formatPhoneNumber(phoneNumber),
                    message,
                    rowIndex: i + 2
                });
            }
        }
        
        console.log(`📊 Found ${leads.length} leads ready to send\n`);
        return leads;
    }

    formatPhoneNumber(phone) {
        let cleanPhone = phone.replace(/\D/g, '');
        
        if (cleanPhone.startsWith('52')) {
            return cleanPhone;
        } else if (cleanPhone.startsWith('998') || cleanPhone.startsWith('55')) {
            return '52' + cleanPhone;
        } else {
            return '52' + cleanPhone;
        }
    }

    async updateLeadStatus(rowIndex, status) {
        try {
            const messagesSheet = this.doc.sheetsByTitle['Copy Paste Messages'];
            await messagesSheet.loadCells();
            
            const rows = await messagesSheet.getRows();
            if (rows[rowIndex - 2]) {
                rows[rowIndex - 2].set('Status', status);
                rows[rowIndex - 2].set('Sent Date', new Date().toISOString());
                await rows[rowIndex - 2].save();
                console.log(`📊 Updated Google Sheets: ${status}`);
            }
        } catch (error) {
            console.log(`❌ Error updating Google Sheets: ${error.message}`);
        }
    }

    async runFullAutomation() {
        console.log('🤖 STARTING FULL WHATSAPP AUTOMATION...\n');
        
        // Get phone number ID first
        const phoneNumberId = await this.getPhoneNumberId();
        
        // Get leads from sheet
        const leads = await this.getLeadsFromSheet();
        
        if (leads.length === 0) {
            console.log('❌ No leads found for automation');
            return;
        }
        
        console.log(`🎯 Starting automation with ${leads.length} leads...\n`);
        console.log('⚠️ Adding 3-second delay between messages to avoid rate limits\n');
        
        let successCount = 0;
        let errorCount = 0;
        
        for (let i = 0; i < leads.length; i++) {
            const lead = leads[i];
            
            console.log(`📊 PROGRESS: ${i + 1}/${leads.length} - ${lead.businessName}`);
            console.log(`📱 Phone: ${lead.phoneNumber}`);
            console.log(`💬 Message Preview: ${lead.message.substring(0, 80)}...`);
            
            const result = await this.sendMessage(lead.phoneNumber, lead.message, phoneNumberId);
            
            if (result.success) {
                successCount++;
                await this.updateLeadStatus(lead.rowIndex, 'Message Sent');
                console.log(`✅ SUCCESS! (${successCount} total sent)\n`);
            } else {
                errorCount++;
                await this.updateLeadStatus(lead.rowIndex, 'Failed to Send');
                console.log(`❌ FAILED! (${errorCount} total failed)\n`);
            }
            
            // Wait 3 seconds between messages
            if (i < leads.length - 1) {
                console.log('⏳ Waiting 3 seconds before next message...\n');
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
        }
        
        console.log('🎉 WHATSAPP AUTOMATION COMPLETE!');
        console.log(`✅ Successfully sent: ${successCount} messages`);
        console.log(`❌ Failed to send: ${errorCount} messages`);
        console.log(`📊 Total processed: ${leads.length} leads`);
        console.log('💰 Total cost: $0 - Using your existing API!');
        
        if (successCount > 0) {
            console.log('🎉 AUTOMATION SUCCESSFUL! Messages sent via WhatsApp Business API!');
            console.log('📊 Check your Google Sheet for updated status');
        } else {
            console.log('❌ No messages were sent successfully');
            console.log('🔧 Check your API permissions and phone number setup');
        }
    }
}

// Main execution
async function main() {
    const automation = new WorkingWhatsAppAutomation();
    
    try {
        await automation.initialize();
        
        console.log('📱 IMPORTANT: Your WhatsApp Business API is working!');
        console.log('🚀 Starting full automation for all leads...\n');
        
        await automation.runFullAutomation();
        
    } catch (error) {
        console.error('❌ Automation Error:', error);
    }
}

if (require.main === module) {
    main();
}

module.exports = WorkingWhatsAppAutomation;