const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const fs = require('fs');

async function fixSheetAndContinue() {
    try {
        console.log('🔧 Fixing Google Sheets setup...');
        
        // Load service account credentials
        const serviceAccountConfig = JSON.parse(fs.readFileSync('google-service-account-config.json', 'utf8'));
        const serviceAccountAuth = new JWT({
            email: serviceAccountConfig.client_email,
            key: serviceAccountConfig.private_key,
            scopes: [
                'https://www.googleapis.com/auth/spreadsheets',
                'https://www.googleapis.com/auth/drive.file',
            ],
        });

        // Connect to spreadsheet
        const doc = new GoogleSpreadsheet('1nzknj5DlU_1oXeu_7VcMRD6_FRcSkgef2I0ObXxYoLg', serviceAccountAuth);
        await doc.loadInfo();
        console.log('✅ Connected to:', doc.title);

        // Get or create the analysis sheet
        let analysisSheet = doc.sheetsByTitle['REAL AI Lead Analysis'];
        
        if (!analysisSheet) {
            console.log('📊 Creating REAL AI Lead Analysis sheet...');
            analysisSheet = await doc.addSheet({
                title: 'REAL AI Lead Analysis',
                headerRowCount: 1,
                gridProperties: {
                    rowCount: 1000,
                    columnCount: 35  // Ensure enough columns
                }
            });
        } else {
            console.log('📊 Found existing REAL AI Lead Analysis sheet');
            // Ensure sheet has enough columns
            if (analysisSheet.columnCount < 35) {
                console.log('🔧 Resizing sheet to accommodate all columns...');
                await analysisSheet.resize({
                    rowCount: 1000,
                    columnCount: 35
                });
            }
        }

        // Set up headers
        const headers = [
            'Lead ID', 'Business Name', 'Contact Name', 'Phone', 'Email',
            'Location', 'Business Type', 'Current Website',
            'Website Status', 'Website Issues Found', 'Website Problems', 'Website Opportunities',
            'Google Maps Status', 'Google Maps Issues', 'Google Maps Problems', 'Google Maps Opportunities',
            'Social Media Found', 'Social Media Issues', 'Social Media Problems', 'Social Media Opportunities',
            'All Problems Identified', 'All Growth Opportunities',
            'Service Recommendations', 'Urgency Level', 'Budget Estimate',
            'Lead Quality Score', 'Personalized Message', 'Message Length',
            'Follow-up Date', 'Status', 'Analysis Notes', 'Analysis Date',
            'Website URL', 'Google Maps URL', 'Social Media URLs'
        ];

        console.log('📝 Setting up headers...');
        await analysisSheet.setHeaderRow(headers);
        
        console.log('✅ Sheet setup complete!');
        console.log('🚀 Now running REAL AI analysis...');
        
        // Now run the main analysis
        const { spawn } = require('child_process');
        const analysisProcess = spawn('node', ['REAL-AI-LEAD-SYSTEM.js'], {
            stdio: 'inherit'
        });

        analysisProcess.on('close', (code) => {
            console.log(`Analysis process exited with code ${code}`);
        });

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

fixSheetAndContinue();

