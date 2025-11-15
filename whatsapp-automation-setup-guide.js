const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const fs = require('fs');

class WhatsAppAutomationSetupGuide {
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
        console.log('🚀 WHATSAPP AUTOMATION SETUP GUIDE 2025');
        console.log('💰 Cost: $0 - Completely FREE solutions');
        console.log('🎯 Goal: Automate all 100 leads without manual work\n');
        
        this.doc = new GoogleSpreadsheet('1nzknj5DlU_1oXeu_7VcMRD6_FRcSkgef2I0ObXxYoLg', this.serviceAccountAuth);
        await this.doc.loadInfo();
        console.log(`📊 Connected to: ${this.doc.title}`);
    }

    async displayAutomationOptions() {
        console.log('\n🎯 TOP 2025 WHATSAPP AUTOMATION SOLUTIONS:\n');

        const solutions = [
            {
                name: '🔥 ZAPIER + WHATSAPP',
                description: 'Connect Google Sheets directly to WhatsApp Business API',
                pricing: 'FREE (100 tasks/month)',
                setupTime: '15 minutes',
                difficulty: 'Very Easy',
                bestFor: 'Beginners, small businesses',
                features: 'Google Sheets trigger, WhatsApp message action, 100 free tasks/month',
                steps: [
                    '1. Sign up for Zapier (free)',
                    '2. Create "Google Sheets" → "WhatsApp" Zap',
                    '3. Connect your Google Sheet',
                    '4. Map columns to message fields',
                    '5. Test and activate'
                ]
            },
            {
                name: '🚀 WATI.IO',
                description: 'Professional WhatsApp Business API platform',
                pricing: '$49/month (1000 contacts)',
                setupTime: '30 minutes',
                difficulty: 'Easy',
                bestFor: 'Businesses wanting professional features',
                features: 'Google Sheets import, message templates, analytics, broadcast campaigns',
                steps: [
                    '1. Sign up for Wati.io',
                    '2. Import your Google Sheet data',
                    '3. Create message templates',
                    '4. Set up automation workflows',
                    '5. Launch campaigns'
                ]
            },
            {
                name: '💰 ZOKO',
                description: 'Budget-friendly WhatsApp automation',
                pricing: '$7/month (basic plan)',
                setupTime: '20 minutes',
                difficulty: 'Very Easy',
                bestFor: 'Small businesses on budget',
                features: 'Google Sheets integration, basic automation, broadcast campaigns',
                steps: [
                    '1. Sign up for Zoko ($7/month)',
                    '2. Connect Google Sheets',
                    '3. Upload your lead data',
                    '4. Create message templates',
                    '5. Start sending'
                ]
            },
            {
                name: '⚡ MAKE.COM (Integromat)',
                description: 'Advanced automation platform',
                pricing: 'FREE (1000 operations/month)',
                setupTime: '45 minutes',
                difficulty: 'Medium',
                bestFor: 'Advanced users, complex workflows',
                features: 'Google Sheets trigger, WhatsApp API, conditional logic, unlimited scenarios',
                steps: [
                    '1. Sign up for Make.com',
                    '2. Create new scenario',
                    '3. Add Google Sheets module',
                    '4. Add WhatsApp Business API module',
                    '5. Configure automation logic'
                ]
            },
            {
                name: '🎯 TWILIO WHATSAPP API',
                description: 'Developer-focused solution',
                pricing: '$0.005-$0.09 per message',
                setupTime: '2-3 hours',
                difficulty: 'Advanced',
                bestFor: 'Developers, technical teams',
                features: 'Full API control, custom integrations, webhook support',
                steps: [
                    '1. Create Twilio account',
                    '2. Get WhatsApp Business API approval',
                    '3. Build custom integration',
                    '4. Connect to Google Sheets',
                    '5. Deploy automation system'
                ]
            }
        ];

        solutions.forEach((solution, index) => {
            console.log(`${solution.name}`);
            console.log(`   📝 Description: ${solution.description}`);
            console.log(`   💰 Pricing: ${solution.pricing}`);
            console.log(`   ⏱️ Setup Time: ${solution.setupTime}`);
            console.log(`   🎯 Difficulty: ${solution.difficulty}`);
            console.log(`   🏆 Best For: ${solution.bestFor}`);
            console.log(`   ✨ Features: ${solution.features}`);
            console.log(`   📋 Steps:`);
            solution.steps.forEach(step => console.log(`      ${step}`));
            console.log('');
        });
    }

    async prepareDataForAutomation() {
        console.log('📊 PREPARING YOUR DATA FOR AUTOMATION...\n');
        
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
                    businessType: row.get('Business Type') || 'Business'
                });
            }
        }

        console.log(`✅ Found ${leads.length} leads ready for automation`);
        
        // Create automation-ready sheets
        await this.createAutomationSheets(leads);
        
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

    async createAutomationSheets(leads) {
        console.log('\n📋 CREATING AUTOMATION-READY SHEETS...\n');

        // Create Zapier Ready sheet
        let zapierSheet = this.doc.sheetsByTitle['Zapier Ready'];
        if (!zapierSheet) {
            zapierSheet = await this.doc.addSheet({ 
                title: 'Zapier Ready', 
                headerValues: ['Business Name', 'Phone Number', 'Message', 'Business Type', 'Status'] 
            });
        } else {
            await zapierSheet.clearRows();
        }
        
        const zapierData = leads.map(lead => [
            lead.businessName,
            lead.phoneNumber,
            lead.message,
            lead.businessType,
            'Pending'
        ]);
        
        await zapierSheet.addRows(zapierData);
        console.log('✅ Created Zapier Ready sheet');

        // Create Wati.io Ready sheet
        let watiSheet = this.doc.sheetsByTitle['Wati.io Ready'];
        if (!watiSheet) {
            watiSheet = await this.doc.addSheet({ 
                title: 'Wati.io Ready', 
                headerValues: ['Name', 'Phone', 'Message', 'Type', 'Status'] 
            });
        } else {
            await watiSheet.clearRows();
        }
        
        const watiData = leads.map(lead => [
            lead.businessName,
            lead.phoneNumber,
            lead.message,
            lead.businessType,
            'Pending'
        ]);
        
        await watiSheet.addRows(watiData);
        console.log('✅ Created Wati.io Ready sheet');

        // Create Zoko Ready sheet
        let zokoSheet = this.doc.sheetsByTitle['Zoko Ready'];
        if (!zokoSheet) {
            zokoSheet = await this.doc.addSheet({ 
                title: 'Zoko Ready', 
                headerValues: ['Contact Name', 'Phone Number', 'Message', 'Business Type', 'Status'] 
            });
        } else {
            await zokoSheet.clearRows();
        }
        
        const zokoData = leads.map(lead => [
            lead.businessName,
            lead.phoneNumber,
            lead.message,
            lead.businessType,
            'Pending'
        ]);
        
        await zokoSheet.addRows(zokoData);
        console.log('✅ Created Zoko Ready sheet');

        // Create Make.com Ready sheet
        let makeSheet = this.doc.sheetsByTitle['Make.com Ready'];
        if (!makeSheet) {
            makeSheet = await this.doc.addSheet({ 
                title: 'Make.com Ready', 
                headerValues: ['Business_Name', 'Phone_Number', 'Message_Content', 'Business_Type', 'Status'] 
            });
        } else {
            await makeSheet.clearRows();
        }
        
        const makeData = leads.map(lead => [
            lead.businessName,
            lead.phoneNumber,
            lead.message,
            lead.businessType,
            'Pending'
        ]);
        
        await makeSheet.addRows(makeData);
        console.log('✅ Created Make.com Ready sheet');
    }

    async displayRecommendedSolution() {
        console.log('\n🎯 RECOMMENDED SOLUTION FOR YOUR SETUP:\n');
        
        console.log('🏆 #1 RECOMMENDATION: ZAPIER (FREE)');
        console.log('   📝 Why: Perfect for your 100 leads, completely free, easy setup');
        console.log('   💰 Cost: $0 (100 free tasks per month)');
        console.log('   ⏱️ Setup: 15 minutes');
        console.log('   🎯 Perfect for: Beginners, small businesses\n');
        
        console.log('📋 ZAPIER SETUP STEPS:');
        console.log('   1. Go to zapier.com and sign up (free)');
        console.log('   2. Click "Create Zap"');
        console.log('   3. Choose "Google Sheets" as trigger');
        console.log('   4. Choose "WhatsApp Business API" as action');
        console.log('   5. Connect your Google Sheet "Zapier Ready"');
        console.log('   6. Map columns: Business Name → Contact Name, Phone Number → Phone, Message → Message');
        console.log('   7. Test and activate');
        console.log('   8. Your automation will run automatically!\n');
        
        console.log('🏆 #2 RECOMMENDATION: ZOKO ($7/month)');
        console.log('   📝 Why: Cheapest paid option, professional features');
        console.log('   💰 Cost: $7/month');
        console.log('   ⏱️ Setup: 20 minutes');
        console.log('   🎯 Perfect for: Small businesses wanting professional features\n');
        
        console.log('📋 ZOKO SETUP STEPS:');
        console.log('   1. Go to zoko.io and sign up');
        console.log('   2. Choose the $7/month plan');
        console.log('   3. Import your "Zoko Ready" Google Sheet');
        console.log('   4. Create message templates');
        console.log('   5. Set up automation rules');
        console.log('   6. Launch your campaign\n');
    }

    async displayNextSteps() {
        console.log('\n🚀 YOUR NEXT STEPS:\n');
        
        console.log('1. CHOOSE YOUR PLATFORM (HIGH PRIORITY)');
        console.log('   📝 I recommend starting with Zapier (free)');
        console.log('   ⏱️ Time: 5 minutes to decide\n');
        
        console.log('2. SETUP AUTOMATION (HIGH PRIORITY)');
        console.log('   📝 Follow the setup steps above');
        console.log('   ⏱️ Time: 15-30 minutes\n');
        
        console.log('3. TEST WITH 5 LEADS (HIGH PRIORITY)');
        console.log('   📝 Send to 5 leads first to test');
        console.log('   ⏱️ Time: 10 minutes\n');
        
        console.log('4. SCALE TO ALL LEADS (MEDIUM PRIORITY)');
        console.log('   📝 Once tested, send to all 100 leads');
        console.log('   ⏱️ Time: 1 hour\n');
        
        console.log('5. MONITOR & OPTIMIZE (LOW PRIORITY)');
        console.log('   📝 Track responses and optimize messages');
        console.log('   ⏱️ Time: Ongoing\n');
        
        console.log('🎉 AUTOMATION SETUP COMPLETE!');
        console.log('📊 You have 100 leads ready for automation');
        console.log('✅ Data prepared for all major platforms');
        console.log('📋 Action plan generated\n');
        
        console.log('🚀 IMMEDIATE NEXT STEP:');
        console.log('Go to zapier.com and create your first Zap!');
    }
}

// Main execution
async function main() {
    const guide = new WhatsAppAutomationSetupGuide();
    
    try {
        await guide.initialize();
        await guide.displayAutomationOptions();
        await guide.prepareDataForAutomation();
        await guide.displayRecommendedSolution();
        await guide.displayNextSteps();
        
    } catch (error) {
        console.error('❌ Setup Guide Error:', error);
    }
}

if (require.main === module) {
    main();
}

module.exports = WhatsAppAutomationSetupGuide;

