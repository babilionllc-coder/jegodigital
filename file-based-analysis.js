// File-Based Analysis - Writes results to files instead of terminal
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const fs = require('fs');

class FileBasedAnalysis {
    constructor() {
        this.spreadsheetId = '1nzknj5DlU_1oXeu_7VcMRD6_FRcSkgef2I0ObXxYoLg';
        this.credentials = JSON.parse(fs.readFileSync('./google-service-account-config.json', 'utf8'));
        this.logFile = 'analysis-log.txt';
        this.resultsFile = 'analysis-results.json';
    }
    
    log(message) {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] ${message}\n`;
        fs.appendFileSync(this.logFile, logMessage);
        console.log(message); // Also try console.log
    }
    
    async initialize() {
        this.log('🚀 Starting File-Based Analysis');
        this.log('🔗 Connecting to Google Sheets...');
        
        try {
            const auth = new JWT({
                email: this.credentials.client_email,
                key: this.credentials.private_key,
                scopes: [
                    'https://www.googleapis.com/auth/spreadsheets',
                    'https://www.googleapis.com/auth/drive.file'
                ]
            });
            
            const doc = new GoogleSpreadsheet(this.spreadsheetId, auth);
            await doc.loadInfo();
            
            this.log(`✅ Connected to: ${doc.title}`);
            this.log(`📊 Available sheets: ${doc.sheetsByIndex.map(s => s.title).join(', ')}`);
            
            return doc;
        } catch (error) {
            this.log(`❌ Connection failed: ${error.message}`);
            throw error;
        }
    }
    
    async analyzeFirstLead(doc) {
        this.log('📖 Getting first lead from sheet...');
        
        try {
            const sheet = doc.sheetsByIndex[0];
            await sheet.loadHeaderRow();
            const rows = await sheet.getRows();
            
            if (rows.length === 0) {
                throw new Error('No leads found');
            }
            
            const firstRow = rows[0];
            const lead = {};
            
            sheet.headerValues.forEach(header => {
                lead[header.toLowerCase().replace(/[^a-z0-9]/g, '_')] = firstRow.get(header) || '';
            });
            lead.id = lead.id || 'LEAD_001';
            
            this.log(`✅ Found first lead: ${lead.business_name || lead.name || 'Unknown'}`);
            this.log(`📧 Email: ${lead.email || 'Not provided'}`);
            this.log(`📞 Phone: ${lead.phone_number || lead.phone || 'Not provided'}`);
            this.log(`🌐 Website: ${lead.website || lead.current_website || 'Not provided'}`);
            
            // Create analysis result
            const analysisResult = {
                leadId: lead.id,
                businessName: lead.business_name || lead.name || 'Unknown',
                email: lead.email || '',
                phone: lead.phone_number || lead.phone || '',
                website: lead.website || lead.current_website || '',
                industry: lead.industry || '',
                analysisDate: new Date().toISOString(),
                status: 'Ready for detailed analysis'
            };
            
            // Save results to file
            fs.writeFileSync(this.resultsFile, JSON.stringify(analysisResult, null, 2));
            this.log(`💾 Results saved to: ${this.resultsFile}`);
            
            return analysisResult;
            
        } catch (error) {
            this.log(`❌ Error analyzing lead: ${error.message}`);
            throw error;
        }
    }
    
    async execute() {
        try {
            this.log('🚀 FILE-BASED ANALYSIS STARTING...');
            
            const doc = await this.initialize();
            const result = await this.analyzeFirstLead(doc);
            
            this.log('🎉 ANALYSIS COMPLETE!');
            this.log('📊 Check the following files for results:');
            this.log(`   - ${this.logFile} (detailed log)`);
            this.log(`   - ${this.resultsFile} (analysis results)`);
            
            // Also create a simple status file
            fs.writeFileSync('analysis-status.txt', 'COMPLETED - Check analysis-results.json for details');
            
            return result;
            
        } catch (error) {
            this.log(`❌ Analysis failed: ${error.message}`);
            fs.writeFileSync('analysis-status.txt', `FAILED: ${error.message}`);
            throw error;
        }
    }
}

// Execute the analysis
async function main() {
    const analyzer = new FileBasedAnalysis();
    await analyzer.execute();
}

if (require.main === module) {
    main().catch(error => {
        console.error('Error:', error.message);
        fs.writeFileSync('analysis-status.txt', `ERROR: ${error.message}`);
    });
}

module.exports = FileBasedAnalysis;


