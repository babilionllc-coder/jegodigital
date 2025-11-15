const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const fs = require('fs');

class FreeWhatsAppAlternatives {
    constructor() {
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
        console.log('🚀 FREE WHATSAPP ALTERNATIVES (NO API NEEDED)');
        console.log('💰 Cost: $0 - Completely FREE');
        console.log('🎯 Goal: Send all 100 leads without WhatsApp Business API\n');
        
        this.doc = new GoogleSpreadsheet('1nzknj5DlU_1oXeu_7VcMRD6_FRcSkgef2I0ObXxYoLg', this.serviceAccountAuth);
        await this.doc.loadInfo();
        console.log(`📊 Connected to: ${this.doc.title}`);
    }

    async displayFreeAlternatives() {
        console.log('\n🎯 FREE WHATSAPP ALTERNATIVES (NO BUSINESS API NEEDED):\n');

        const alternatives = [
            {
                name: '🔥 ZAPIER + EMAIL NOTIFICATIONS',
                description: 'Get email notifications when new leads added, then send WhatsApp manually',
                pricing: 'FREE',
                setupTime: '10 minutes',
                difficulty: 'Very Easy',
                features: 'Email alerts, Google Sheets integration, no WhatsApp API needed',
                steps: [
                    '1. Go to zapier.com and sign up (free)',
                    '2. Create "Google Sheets" → "Email" Zap',
                    '3. Trigger: New row added to sheet',
                    '4. Action: Send email with lead details',
                    '5. You receive email → Copy to WhatsApp manually',
                    '6. Update status in sheet when sent'
                ],
                pros: ['Completely free', 'No API needed', 'Works immediately', 'Email notifications'],
                cons: ['Manual WhatsApp sending', 'Not fully automated']
            },
            {
                name: '📱 WHATSAPP WEB + GOOGLE SHEETS AUTOMATION',
                description: 'Automated Google Sheets updates + manual WhatsApp sending',
                pricing: 'FREE',
                setupTime: '15 minutes',
                difficulty: 'Easy',
                features: 'Auto sheet updates, WhatsApp Web integration, status tracking',
                steps: [
                    '1. Use WhatsApp Web (web.whatsapp.com)',
                    '2. Set up Google Sheets automation',
                    '3. Get notifications when new leads added',
                    '4. Copy phone number and message',
                    '5. Send via WhatsApp Web',
                    '6. Mark as sent in sheet'
                ],
                pros: ['100% free', 'No API needed', 'Professional setup', 'Status tracking'],
                cons: ['Semi-manual process', 'Requires WhatsApp Web']
            },
            {
                name: '⚡ GOOGLE APPS SCRIPT + WHATSAPP',
                description: 'Automated Google Sheets script with WhatsApp integration',
                pricing: 'FREE',
                setupTime: '30 minutes',
                difficulty: 'Medium',
                features: 'Automated sheet processing, WhatsApp Web integration, batch sending',
                steps: [
                    '1. Create Google Apps Script',
                    '2. Set up WhatsApp Web automation',
                    '3. Script reads sheet and processes leads',
                    '4. Automatically opens WhatsApp Web',
                    '5. Sends messages batch by batch',
                    '6. Updates status automatically'
                ],
                pros: ['Fully automated', 'Free Google service', 'Professional', 'Batch processing'],
                cons: ['Requires coding', 'Complex setup']
            },
            {
                name: '🎯 BROWSER EXTENSION + GOOGLE SHEETS',
                description: 'Use WhatsApp browser extensions with Google Sheets',
                pricing: 'FREE',
                setupTime: '20 minutes',
                difficulty: 'Easy',
                features: 'Browser automation, Google Sheets integration, message templates',
                steps: [
                    '1. Install WhatsApp Web Plus extension',
                    '2. Set up Google Sheets integration',
                    '3. Import your lead data',
                    '4. Create message templates',
                    '5. Send messages in batches',
                    '6. Track status in sheet'
                ],
                pros: ['Easy setup', 'Browser-based', 'Template support', 'Batch sending'],
                cons: ['Extension dependent', 'Limited automation']
            }
        ];

        alternatives.forEach((alt, index) => {
            console.log(`${alt.name}`);
            console.log(`   📝 Description: ${alt.description}`);
            console.log(`   💰 Pricing: ${alt.pricing}`);
            console.log(`   ⏱️ Setup Time: ${alt.setupTime}`);
            console.log(`   🎯 Difficulty: ${alt.difficulty}`);
            console.log(`   ✨ Features: ${alt.features}`);
            console.log(`   📋 Steps:`);
            alt.steps.forEach(step => console.log(`      ${step}`));
            console.log(`   ✅ Pros: ${alt.pros.join(', ')}`);
            console.log(`   ⚠️ Cons: ${alt.cons.join(', ')}`);
            console.log('');
        });
    }

    async createEmailNotificationSetup() {
        console.log('\n📧 CREATING EMAIL NOTIFICATION SETUP...\n');
        
        // Create a sheet for email notifications
        let emailSheet = this.doc.sheetsByTitle['Email Notifications'];
        if (!emailSheet) {
            emailSheet = await this.doc.addSheet({ 
                title: 'Email Notifications', 
                headerValues: ['Business Name', 'Phone Number', 'Message', 'Business Type', 'Status', 'Email Sent', 'WhatsApp Sent', 'Date Added'] 
            });
        } else {
            await emailSheet.clearRows();
        }
        
        // Get leads from Copy Paste Messages
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
                leads.push([
                    businessName,
                    phoneNumber,
                    message,
                    row.get('Business Type') || 'Business',
                    'Pending',
                    'No',
                    'No',
                    new Date().toISOString()
                ]);
            }
        }
        
        await emailSheet.addRows(leads);
        console.log(`✅ Created Email Notifications sheet with ${leads.length} leads`);
        
        return leads.length;
    }

    async displayZapierEmailSetup() {
        console.log('\n🔥 ZAPIER EMAIL NOTIFICATION SETUP:\n');
        
        console.log('📋 ZAPIER SETUP STEPS (NO WHATSAPP API NEEDED):');
        console.log('   1. Go to zapier.com and sign up (free)');
        console.log('   2. Click "Create Zap"');
        console.log('   3. Choose "Google Sheets" as trigger');
        console.log('   4. Choose "Gmail" or "Email" as action');
        console.log('   5. Connect your "Email Notifications" Google Sheet');
        console.log('   6. Set trigger: "New row added"');
        console.log('   7. Set email template with lead details');
        console.log('   8. Test and activate');
        console.log('   9. You\'ll get emails with lead details');
        console.log('   10. Copy details to WhatsApp manually');
        console.log('   11. Update status in sheet when sent\n');
        
        console.log('📧 EMAIL TEMPLATE EXAMPLE:');
        console.log('   Subject: New Lead Ready for WhatsApp - [Business Name]');
        console.log('   Body:');
        console.log('   Business: [Business Name]');
        console.log('   Phone: [Phone Number]');
        console.log('   Message: [Message]');
        console.log('   Type: [Business Type]');
        console.log('   ');
        console.log('   Copy this info to WhatsApp and mark as sent in the sheet.\n');
    }

    async displayManualProcess() {
        console.log('\n📱 MANUAL WHATSAPP PROCESS (MOST RELIABLE):\n');
        
        console.log('🎯 STEP-BY-STEP MANUAL PROCESS:');
        console.log('   1. Open WhatsApp Web (web.whatsapp.com)');
        console.log('   2. Open your "Email Notifications" Google Sheet');
        console.log('   3. For each lead:');
        console.log('      - Copy phone number');
        console.log('      - Start new chat in WhatsApp Web');
        console.log('      - Paste phone number');
        console.log('      - Copy personalized message');
        console.log('      - Paste and send message');
        console.log('      - Mark as "WhatsApp Sent" in sheet');
        console.log('   4. Repeat for all 100 leads');
        console.log('   5. Track progress in Google Sheet\n');
        
        console.log('⏱️ TIME ESTIMATE:');
        console.log('   - 2 minutes per lead');
        console.log('   - 100 leads = 200 minutes (3.3 hours)');
        console.log('   - Can be done over multiple days');
        console.log('   - Most reliable method\n');
    }

    async displayRecommendation() {
        console.log('\n🎯 MY RECOMMENDATION:\n');
        
        console.log('🏆 BEST APPROACH: HYBRID AUTOMATION');
        console.log('   📝 Combine Zapier email notifications + manual WhatsApp sending');
        console.log('   💰 Cost: $0 (completely free)');
        console.log('   ⏱️ Setup: 15 minutes');
        console.log('   🎯 Reliability: 100% (no API issues)\n');
        
        console.log('📋 WHY THIS WORKS BEST:');
        console.log('   ✅ No WhatsApp Business API needed');
        console.log('   ✅ Completely free');
        console.log('   ✅ Reliable and works immediately');
        console.log('   ✅ Professional setup with tracking');
        console.log('   ✅ Can be done over time');
        console.log('   ✅ Full control over messaging\n');
        
        console.log('🚀 IMMEDIATE NEXT STEPS:');
        console.log('   1. Set up Zapier email notifications (15 min)');
        console.log('   2. Start sending WhatsApp messages manually');
        console.log('   3. Track progress in Google Sheets');
        console.log('   4. Complete all 100 leads over time');
        console.log('   5. Monitor responses and optimize\n');
    }
}

// Main execution
async function main() {
    const alternatives = new FreeWhatsAppAlternatives();
    
    try {
        await alternatives.initialize();
        await alternatives.displayFreeAlternatives();
        await alternatives.createEmailNotificationSetup();
        await alternatives.displayZapierEmailSetup();
        await alternatives.displayManualProcess();
        await alternatives.displayRecommendation();
        
    } catch (error) {
        console.error('❌ Setup Error:', error);
    }
}

if (require.main === module) {
    main();
}

module.exports = FreeWhatsAppAlternatives;

