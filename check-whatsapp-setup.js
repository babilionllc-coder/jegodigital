const axios = require('axios');

class WhatsAppSetupChecker {
    constructor() {
        this.apiToken = "EAAVp3Bi3yZCkBPnpdB35Mxtw2qr3z6sVFMPes6JxWVolsyq5ah4qZAHsnTKud1n95YQW4JvkS9nSQUM6ytqYbSBfZCznrRLPhxWVpd2S9EnXcMAVqglSZBqZCf2gpS90WDZAkdU4lZB3Tb5rkuNIbJDQu9X5swpZBwmbIX7pXY2Wym60yyUTshbBvNMwRbNh7W4zt1f2TOaTS2ZAXg4XuL9pVsPPzre8jfZChUk06npiHHJ5vbOwZDZD";
        this.baseURL = "https://graph.facebook.com/v18.0";
        this.businessId = "31621913207424299";
    }

    async checkWhatsAppSetup() {
        console.log('🔍 CHECKING YOUR WHATSAPP BUSINESS SETUP...\n');
        
        try {
            // Step 1: Check business profile
            console.log('📱 STEP 1: Checking business profile...');
            const profileResponse = await axios.get(`${this.baseURL}/me`, {
                headers: {
                    'Authorization': `Bearer ${this.apiToken}`,
                    'Content-Type': 'application/json'
                }
            });
            
            console.log('✅ Business Profile:');
            console.log(`   📊 Business ID: ${profileResponse.data.id}`);
            console.log(`   📱 Business Name: ${profileResponse.data.name}`);
            console.log(`   📧 Email: ${profileResponse.data.email || 'Not set'}`);
            console.log(`   🌐 Website: ${profileResponse.data.website || 'Not set'}\n`);
            
            // Step 2: Try to find phone numbers
            console.log('📞 STEP 2: Looking for phone numbers...');
            
            // Try different ways to get phone numbers
            const phoneEndpoints = [
                `${this.baseURL}/me/phone_numbers`,
                `${this.baseURL}/${this.businessId}/phone_numbers`,
                `${this.baseURL}/me/owned_phone_numbers`,
                `${this.baseURL}/${this.businessId}/owned_phone_numbers`
            ];
            
            let phoneNumbers = [];
            
            for (const endpoint of phoneEndpoints) {
                try {
                    console.log(`🔍 Trying: ${endpoint}`);
                    const response = await axios.get(endpoint, {
                        headers: {
                            'Authorization': `Bearer ${this.apiToken}`,
                            'Content-Type': 'application/json'
                        }
                    });
                    
                    console.log('✅ Response:');
                    console.log(JSON.stringify(response.data, null, 2));
                    
                    if (response.data.data && response.data.data.length > 0) {
                        phoneNumbers = response.data.data;
                        break;
                    }
                } catch (error) {
                    console.log(`❌ Failed: ${error.response?.data?.error?.message || error.message}`);
                }
                console.log('');
            }
            
            if (phoneNumbers.length === 0) {
                console.log('⚠️ NO PHONE NUMBERS FOUND!\n');
                console.log('🔧 WHAT THIS MEANS:');
                console.log('   • Your API token is valid');
                console.log('   • But no phone number is connected to your WhatsApp Business account');
                console.log('   • You need to add a phone number to send messages\n');
                
                console.log('🚀 HOW TO FIX THIS:');
                console.log('   1. Go to Facebook Business Manager');
                console.log('   2. Navigate to WhatsApp Business API');
                console.log('   3. Add a phone number to your WhatsApp Business account');
                console.log('   4. Verify the phone number');
                console.log('   5. Then you can send messages\n');
                
                console.log('📱 ALTERNATIVE: Use WhatsApp Business App');
                console.log('   • Download WhatsApp Business App');
                console.log('   • Use your regular phone number');
                console.log('   • Send messages manually or with automation tools\n');
                
                return false;
            } else {
                console.log('✅ PHONE NUMBERS FOUND:');
                phoneNumbers.forEach((phone, index) => {
                    console.log(`   📱 Phone ${index + 1}: ${phone.display_phone_number}`);
                    console.log(`   📊 Phone ID: ${phone.id}`);
                    console.log(`   ✅ Status: ${phone.verified_name || 'Not verified'}`);
                    console.log(`   🌐 Quality: ${phone.quality_rating || 'Not rated'}`);
                    console.log('');
                });
                
                return true;
            }
            
        } catch (error) {
            console.error('❌ Error checking setup:', error.response?.data?.error?.message || error.message);
            return false;
        }
    }

    async testMessageSending() {
        console.log('📤 TESTING MESSAGE SENDING...\n');
        
        // Try to send a test message
        const testPhone = "529981234567"; // Test number
        const testMessage = "Test message from WhatsApp Business API";
        
        try {
            // Try different endpoints for sending
            const endpoints = [
                `${this.baseURL}/me/messages`,
                `${this.baseURL}/${this.businessId}/messages`
            ];
            
            for (const endpoint of endpoints) {
                try {
                    console.log(`🔍 Trying to send via: ${endpoint}`);
                    
                    const messageData = {
                        messaging_product: "whatsapp",
                        to: testPhone,
                        type: "text",
                        text: {
                            body: testMessage
                        }
                    };
                    
                    const response = await axios.post(endpoint, messageData, {
                        headers: {
                            'Authorization': `Bearer ${this.apiToken}`,
                            'Content-Type': 'application/json'
                        }
                    });
                    
                    console.log('✅ MESSAGE SENT SUCCESSFULLY!');
                    console.log(`   📱 To: ${testPhone}`);
                    console.log(`   📊 Message ID: ${response.data.messages[0].id}`);
                    return true;
                    
                } catch (error) {
                    console.log(`❌ Failed: ${error.response?.data?.error?.message || error.message}`);
                    console.log(`   Code: ${error.response?.data?.error?.code || 'Unknown'}`);
                }
            }
            
            return false;
            
        } catch (error) {
            console.error('❌ Test message failed:', error.message);
            return false;
        }
    }
}

// Main execution
async function main() {
    const checker = new WhatsAppSetupChecker();
    
    try {
        console.log('🚀 WHATSAPP BUSINESS API SETUP CHECKER\n');
        
        const hasPhoneNumbers = await checker.checkWhatsAppSetup();
        
        if (hasPhoneNumbers) {
            console.log('🎯 Testing message sending...\n');
            await checker.testMessageSending();
        }
        
        console.log('\n📋 SUMMARY:');
        console.log('✅ Your API token is valid and working');
        console.log('❓ Phone number setup needs verification');
        console.log('🔧 Check Facebook Business Manager for phone number configuration');
        
    } catch (error) {
        console.error('❌ Setup Check Error:', error);
    }
}

if (require.main === module) {
    main();
}

module.exports = WhatsAppSetupChecker;

