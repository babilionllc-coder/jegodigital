const axios = require('axios');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const fs = require('fs');

class WhatsAppAPITester {
    constructor() {
        this.apiToken = "EAAVp3Bi3yZCkBPnpdB35Mxtw2qr3z6sVFMPes6JxWVolsyq5ah4qZAHsnTKud1n95YQW4JvkS9nSQUM6ytqYbSBfZCznrRLPhxWVpd2S9EnXcMAVqglSZBqZCf2gpS90WDZAkdU4lZB3Tb5rkuNIbJDQu9X5swpZBwmbIX7pXY2Wym60yyUTshbBvNMwRbNh7W4zt1f2TOaTS2ZAXg4XuL9pVsPPzre8jfZChUk06npiHHJ5vbOwZDZD";
        this.baseURL = "https://graph.facebook.com/v18.0";
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
        console.log('🚀 WHATSAPP BUSINESS API TESTER');
        console.log('💰 Cost: $0 - Using your existing API');
        console.log('🎯 Goal: Test and use your WhatsApp Business API\n');
        
        this.doc = new GoogleSpreadsheet('1nzknj5DlU_1oXeu_7VcMRD6_FRcSkgef2I0ObXxYoLg', this.serviceAccountAuth);
        await this.doc.loadInfo();
        console.log(`📊 Connected to: ${this.doc.title}`);
    }

    async testAPIConnection() {
        console.log('🔍 TESTING WHATSAPP BUSINESS API CONNECTION...\n');
        
        try {
            // Test 1: Get business profile
            console.log('📱 Test 1: Getting business profile...');
            const profileResponse = await axios.get(`${this.baseURL}/me`, {
                headers: {
                    'Authorization': `Bearer ${this.apiToken}`,
                    'Content-Type': 'application/json'
                }
            });
            
            console.log('✅ Business Profile Retrieved:');
            console.log(`   📊 Business ID: ${profileResponse.data.id}`);
            console.log(`   📱 Business Name: ${profileResponse.data.name || 'Not set'}`);
            console.log(`   📧 Business Email: ${profileResponse.data.email || 'Not set'}`);
            console.log(`   🌐 Website: ${profileResponse.data.website || 'Not set'}\n`);
            
            // Test 2: Get phone number info
            console.log('📞 Test 2: Getting phone number information...');
            const phoneResponse = await axios.get(`${this.baseURL}/me/phone_numbers`, {
                headers: {
                    'Authorization': `Bearer ${this.apiToken}`,
                    'Content-Type': 'application/json'
                }
            });
            
            console.log('✅ Phone Numbers Found:');
            phoneResponse.data.data.forEach((phone, index) => {
                console.log(`   📱 Phone ${index + 1}: ${phone.display_phone_number}`);
                console.log(`   📊 Phone ID: ${phone.id}`);
                console.log(`   ✅ Status: ${phone.verified_name || 'Not verified'}`);
                console.log(`   🌐 Quality Rating: ${phone.quality_rating || 'Not rated'}\n`);
            });
            
            return {
                businessId: profileResponse.data.id,
                businessName: profileResponse.data.name,
                phoneNumbers: phoneResponse.data.data,
                status: 'ACTIVE'
            };
            
        } catch (error) {
            console.error('❌ API Connection Failed:');
            console.error(`   Error: ${error.response?.data?.error?.message || error.message}`);
            console.error(`   Code: ${error.response?.data?.error?.code || 'Unknown'}`);
            console.error(`   Type: ${error.response?.data?.error?.type || 'Unknown'}\n`);
            
            if (error.response?.data?.error?.code === 190) {
                console.log('🔧 SOLUTION: Token may be expired or invalid');
                console.log('   📝 Check your Facebook Developer Console');
                console.log('   🔄 Generate a new access token');
                console.log('   ⏰ Make sure token has WhatsApp permissions\n');
            }
            
            return { status: 'FAILED', error: error.message };
        }
    }

    async sendTestMessage(phoneNumber, message) {
        console.log(`📤 SENDING TEST MESSAGE TO ${phoneNumber}...\n`);
        
        try {
            // First, get the phone number ID
            const phoneResponse = await axios.get(`${this.baseURL}/me/phone_numbers`, {
                headers: {
                    'Authorization': `Bearer ${this.apiToken}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (phoneResponse.data.data.length === 0) {
                throw new Error('No phone numbers found in your WhatsApp Business account');
            }
            
            const phoneNumberId = phoneResponse.data.data[0].id;
            
            // Send the message
            const messageData = {
                messaging_product: "whatsapp",
                to: phoneNumber,
                type: "text",
                text: {
                    body: message
                }
            };
            
            const response = await axios.post(`${this.baseURL}/${phoneNumberId}/messages`, messageData, {
                headers: {
                    'Authorization': `Bearer ${this.apiToken}`,
                    'Content-Type': 'application/json'
                }
            });
            
            console.log('✅ MESSAGE SENT SUCCESSFULLY!');
            console.log(`   📱 To: ${phoneNumber}`);
            console.log(`   📊 Message ID: ${response.data.messages[0].id}`);
            console.log(`   💬 Message: ${message.substring(0, 50)}...\n`);
            
            return {
                success: true,
                messageId: response.data.messages[0].id,
                status: 'sent'
            };
            
        } catch (error) {
            console.error('❌ MESSAGE SENDING FAILED:');
            console.error(`   Error: ${error.response?.data?.error?.message || error.message}`);
            console.error(`   Code: ${error.response?.data?.error?.code || 'Unknown'}\n`);
            
            if (error.response?.data?.error?.code === 131026) {
                console.log('🔧 SOLUTION: Phone number not registered on WhatsApp');
                console.log('   📝 Make sure the phone number is registered on WhatsApp');
                console.log('   📱 Try with a different phone number\n');
            }
            
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
        
        for (let i = 0; i < Math.min(5, rows.length); i++) { // Get first 5 for testing
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
        
        console.log(`📊 Found ${leads.length} leads for testing\n`);
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

    async runAutomatedTest() {
        console.log('🤖 RUNNING AUTOMATED WHATSAPP TEST...\n');
        
        // Test API connection first
        const apiStatus = await this.testAPIConnection();
        
        if (apiStatus.status === 'FAILED') {
            console.log('❌ Cannot proceed with automation - API connection failed');
            return;
        }
        
        console.log('✅ API connection successful! Proceeding with test messages...\n');
        
        // Get leads from sheet
        const leads = await this.getLeadsFromSheet();
        
        if (leads.length === 0) {
            console.log('❌ No leads found for testing');
            return;
        }
        
        console.log(`🎯 Testing with ${leads.length} leads...\n`);
        
        let successCount = 0;
        let errorCount = 0;
        
        for (let i = 0; i < leads.length; i++) {
            const lead = leads[i];
            
            console.log(`📊 TEST ${i + 1}/${leads.length}: ${lead.businessName}`);
            console.log(`📱 Phone: ${lead.phoneNumber}`);
            
            const result = await this.sendTestMessage(lead.phoneNumber, lead.message);
            
            if (result.success) {
                successCount++;
                await this.updateLeadStatus(lead.rowIndex, 'Message Sent');
                console.log(`✅ SUCCESS! (${successCount} total sent)\n`);
            } else {
                errorCount++;
                await this.updateLeadStatus(lead.rowIndex, 'Failed to Send');
                console.log(`❌ FAILED! (${errorCount} total failed)\n`);
            }
            
            // Wait 2 seconds between messages
            if (i < leads.length - 1) {
                console.log('⏳ Waiting 2 seconds before next message...\n');
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
        
        console.log('🎉 AUTOMATED TEST COMPLETE!');
        console.log(`✅ Successfully sent: ${successCount} messages`);
        console.log(`❌ Failed to send: ${errorCount} messages`);
        console.log(`📊 Total processed: ${leads.length} leads`);
        
        if (successCount > 0) {
            console.log('🎉 YOUR WHATSAPP BUSINESS API IS WORKING!');
            console.log('🚀 Ready to send messages to all 100 leads!');
        } else {
            console.log('❌ API test failed - check your token and setup');
        }
    }
}

// Main execution
async function main() {
    const tester = new WhatsAppAPITester();
    
    try {
        await tester.initialize();
        await tester.runAutomatedTest();
        
    } catch (error) {
        console.error('❌ Test Error:', error);
    }
}

if (require.main === module) {
    main();
}

module.exports = WhatsAppAPITester;

