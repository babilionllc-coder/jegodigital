const GoogleSheetsHelper = require('./sheets');
const WhatsAppClient = require('./whatsapp-client');

class WhatsAppAutomation {
    constructor() {
        this.sheets = new GoogleSheetsHelper();
        this.whatsapp = new WhatsAppClient();
        this.isRunning = false;
    }

    async initialize() {
        console.log('🤖 WHATSAPP AUTOMATION SYSTEM INITIALIZING...');
        console.log('💰 Cost: $0 - Completely FREE');
        console.log('🎯 Goal: Send messages to all leads automatically');
        
        await this.sheets.initialize();
        await this.whatsapp.initialize();
        
        console.log('✅ All systems initialized successfully!');
    }

    async startAutomation() {
        console.log('\n🚀 STARTING WHATSAPP AUTOMATION...');
        
        // Get leads from Google Sheets
        const leads = await this.sheets.getWhatsAppLeads();
        
        if (leads.length === 0) {
            console.log('❌ No leads found to send messages to');
            return;
        }

        console.log(`📊 Found ${leads.length} leads ready to send`);
        console.log('⚠️  Adding 3-second delay between messages to avoid spam detection');
        
        this.isRunning = true;
        let successCount = 0;
        let errorCount = 0;

        for (let i = 0; i < leads.length && this.isRunning; i++) {
            const lead = leads[i];
            
            console.log(`\n📊 PROGRESS: ${i + 1}/${leads.length} - ${lead.businessName}`);
            console.log(`📱 Phone: ${lead.phoneNumber}`);
            console.log(`💬 Message Preview: ${lead.message.substring(0, 100)}...`);

            try {
                // Send message via WhatsApp
                const success = await this.whatsapp.sendMessage(lead.phoneNumber, lead.message);
                
                if (success) {
                    successCount++;
                    console.log(`✅ SUCCESS! (${successCount} total sent)`);
                    
                    // Update Google Sheets status
                    await this.sheets.updateLeadStatus(lead.rowIndex, 'Message Sent');
                } else {
                    errorCount++;
                    console.log(`❌ FAILED! (${errorCount} total failed)`);
                    
                    // Update Google Sheets status
                    await this.sheets.updateLeadStatus(lead.rowIndex, 'Failed to Send');
                }

                // Wait between messages (3 seconds)
                if (i < leads.length - 1) {
                    console.log('⏳ Waiting 3 seconds before next message...');
                    await new Promise(resolve => setTimeout(resolve, 3000));
                }

            } catch (error) {
                console.error(`❌ Error processing ${lead.businessName}: ${error.message}`);
                errorCount++;
                
                // Update Google Sheets status
                await this.sheets.updateLeadStatus(lead.rowIndex, 'Error');
            }
        }

        console.log('\n🎉 WHATSAPP AUTOMATION COMPLETE!');
        console.log(`✅ Successfully sent: ${successCount} messages`);
        console.log(`❌ Failed to send: ${errorCount} messages`);
        console.log(`📊 Total processed: ${leads.length} leads`);
        console.log('💰 Total cost: $0 - Completely FREE!');
        
        if (successCount > 0) {
            console.log('🎉 AUTOMATION SUCCESSFUL! Messages sent via WhatsApp!');
            console.log('📊 Check your Google Sheet for updated status');
        } else {
            console.log('❌ No messages were sent successfully');
            console.log('🔧 Check WhatsApp connection and try again');
        }
    }

    async stop() {
        this.isRunning = false;
        console.log('⏹️  Automation stopped by user');
    }

    async close() {
        await this.whatsapp.close();
        console.log('🔧 WhatsApp Automation system closed');
    }
}

// Main execution function
async function main() {
    const automation = new WhatsAppAutomation();
    
    try {
        await automation.initialize();
        
        console.log('\n📱 IMPORTANT INSTRUCTIONS:');
        console.log('1. A QR code will appear - scan it with your phone');
        console.log('2. Make sure WhatsApp Web is working on your phone');
        console.log('3. Once logged in, automation will start automatically');
        console.log('4. Press Ctrl+C to stop anytime');
        
        await automation.startAutomation();
        
    } catch (error) {
        console.error('❌ Automation Error:', error);
    } finally {
        await automation.close();
    }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', async () => {
    console.log('\n⏹️  Received interrupt signal...');
    process.exit(0);
});

if (require.main === module) {
    main();
}

module.exports = WhatsAppAutomation;

