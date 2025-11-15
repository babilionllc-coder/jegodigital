const { google } = require('googleapis');
const fs = require('fs');

class GoogleSheetsHelper {
    constructor() {
        this.creds = JSON.parse(fs.readFileSync('google-service-account-config.json', 'utf8'));
        this.auth = new google.auth.GoogleAuth({
            credentials: this.creds,
            scopes: ['https://www.googleapis.com/auth/spreadsheets']
        });
        this.sheets = null;
        this.spreadsheetId = '1nzknj5DlU_1oXeu_7VcMRD6_FRcSkgef2I0ObXxYoLg';
    }

    async initialize() {
        this.sheets = google.sheets({ version: 'v4', auth: this.auth });
        console.log('✅ Google Sheets API initialized');
    }

    async getSheetData(range) {
        try {
            const res = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: range
            });
            return res.data.values || [];
        } catch (error) {
            console.error('❌ Error getting sheet data:', error.message);
            return [];
        }
    }

    async updateSheet(range, values) {
        try {
            await this.sheets.spreadsheets.values.update({
                spreadsheetId: this.spreadsheetId,
                range: range,
                valueInputOption: 'RAW',
                requestBody: { values }
            });
            console.log(`✅ Updated Google Sheet: ${range}`);
        } catch (error) {
            console.error('❌ Error updating sheet:', error.message);
        }
    }

    async getWhatsAppLeads() {
        console.log('📋 Getting WhatsApp leads from Copy Paste Messages sheet...');
        
        const range = 'Copy Paste Messages!A:J'; // Get all columns
        const rows = await this.getSheetData(range);
        
        if (rows.length === 0) {
            console.log('❌ No data found in Copy Paste Messages sheet');
            return [];
        }

        // Skip header row
        const dataRows = rows.slice(1);
        const leads = [];
        let alreadySentCount = 0;

        for (let i = 0; i < dataRows.length; i++) {
            const row = dataRows[i];
            
            // Assuming columns: Business Name, Phone Number, Business Type, Message to Send, Status, etc.
            const businessName = row[0] || '';
            const phoneNumber = row[1] || '';
            const message = row[3] || ''; // Message to Send column
            const status = row[4] || ''; // Status column

            // Skip if already sent
            if (status === 'Message Sent') {
                alreadySentCount++;
                continue;
            }

            if (businessName && phoneNumber && message) {
                leads.push({
                    businessName,
                    phoneNumber: this.formatPhoneNumber(phoneNumber),
                    message,
                    rowIndex: i + 2 // +2 because we skipped header and array is 0-indexed
                });
            }
        }

        console.log(`📊 Found ${leads.length} leads ready to send`);
        console.log(`⏭️ Skipping ${alreadySentCount} leads already sent`);
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
            const range = `Copy Paste Messages!E${rowIndex}`; // Status column
            await this.updateSheet(range, [[status]]);
            
            // Also update sent date
            const dateRange = `Copy Paste Messages!F${rowIndex}`; // Assuming F is date column
            const currentDate = new Date().toISOString();
            await this.updateSheet(dateRange, [[currentDate]]);
            
            console.log(`📊 Updated lead status: ${status} at row ${rowIndex}`);
        } catch (error) {
            console.error(`❌ Error updating lead status: ${error.message}`);
        }
    }
}

module.exports = GoogleSheetsHelper;

