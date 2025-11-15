// Google Sheets Integration for Lead Management
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

class GoogleSheetsIntegration {
    constructor() {
        this.doc = null;
        this.sheet = null;
        this.serviceAccountAuth = new JWT({
            email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            key: process.env.GOOGLE_PRIVATE_KEY,
            scopes: [
                'https://www.googleapis.com/auth/spreadsheets',
                'https://www.googleapis.com/auth/drive.file',
            ],
        });
    }

    // Initialize connection to Google Sheets
    async initialize(spreadsheetId) {
        try {
            this.doc = new GoogleSpreadsheet(spreadsheetId, this.serviceAccountAuth);
            await this.doc.loadInfo();
            console.log(`✅ Connected to Google Sheets: ${this.doc.title}`);
            return true;
        } catch (error) {
            console.error('❌ Error connecting to Google Sheets:', error.message);
            return false;
        }
    }

    // Create or get the leads sheet
    async setupLeadsSheet() {
        try {
            // Try to get existing sheet
            this.sheet = this.doc.sheetsByTitle['Lead Analysis & Messages'];
            
            if (!this.sheet) {
                // Create new sheet if it doesn't exist
                this.sheet = await this.doc.addSheet({
                    title: 'Lead Analysis & Messages',
                    headerValues: this.getHeaderColumns()
                });
                console.log('✅ Created new leads sheet');
            } else {
                console.log('✅ Using existing leads sheet');
            }

            return true;
        } catch (error) {
            console.error('❌ Error setting up leads sheet:', error.message);
            return false;
        }
    }

    // Get header columns for the sheet
    getHeaderColumns() {
        return [
            'Lead ID',
            'Name',
            'Business Name',
            'Phone',
            'Email',
            'Location',
            'Business Type',
            'Industry',
            'Current Website',
            'Monthly Revenue',
            'Budget',
            'Interest',
            'Timeline',
            'Source',
            'Lead Quality Score',
            'Lead Grade',
            'Pain Points',
            'Service Interest',
            'Urgency Level',
            'Budget Level',
            'AI Analysis',
            'Personalized Message',
            'Message Length',
            'Recommended Action',
            'Follow-up Date',
            'Status',
            'Notes'
        ];
    }

    // Add personalized leads to Google Sheets
    async addPersonalizedLeads(personalizedLeads) {
        try {
            console.log(`📊 Adding ${personalizedLeads.length} leads to Google Sheets...`);

            const rows = personalizedLeads.map(lead => this.formatLeadForSheet(lead));
            
            // Add rows to sheet
            await this.sheet.addRows(rows);
            
            console.log(`✅ Successfully added ${personalizedLeads.length} leads to Google Sheets`);
            return true;
        } catch (error) {
            console.error('❌ Error adding leads to Google Sheets:', error.message);
            return false;
        }
    }

    // Format lead data for Google Sheets
    formatLeadForSheet(lead) {
        const analysis = lead.aiAnalysis || {};
        const message = lead.personalizedMessage || '';
        
        return {
            'Lead ID': lead.id || `LEAD_${Date.now()}`,
            'Name': lead.name || lead.contact_name || '',
            'Business Name': lead.business_name || '',
            'Phone': lead.phone || '',
            'Email': lead.email || '',
            'Location': lead.location || lead.city || 'Cancún',
            'Business Type': lead.business_type || '',
            'Industry': lead.industry || '',
            'Current Website': lead.current_website || '',
            'Monthly Revenue': lead.monthly_revenue || '',
            'Budget': lead.budget || lead.estimated_budget || '',
            'Interest': lead.interest || lead.service_interest || '',
            'Timeline': lead.timeline || '',
            'Source': lead.source || lead.lead_source || '',
            'Lead Quality Score': lead.realScore?.total || lead.score || '',
            'Lead Grade': lead.realScore?.grade || lead.grade || '',
            'Pain Points': analysis.painPoints?.join(', ') || '',
            'Service Interest': analysis.serviceInterest || '',
            'Urgency Level': analysis.urgency || '',
            'Budget Level': analysis.budget || '',
            'AI Analysis': JSON.stringify(analysis),
            'Personalized Message': message,
            'Message Length': message.length,
            'Recommended Action': this.getRecommendedAction(lead),
            'Follow-up Date': this.calculateFollowUpDate(lead),
            'Status': 'Ready to Contact',
            'Notes': this.generateNotes(lead)
        };
    }

    // Get recommended action based on lead analysis
    getRecommendedAction(lead) {
        const analysis = lead.aiAnalysis || {};
        
        if (analysis.urgency === 'high') {
            return 'Contact Immediately';
        } else if (lead.realScore?.total >= 80) {
            return 'Priority Contact';
        } else if (lead.realScore?.total >= 70) {
            return 'Standard Contact';
        } else {
            return 'Low Priority';
        }
    }

    // Calculate follow-up date
    calculateFollowUpDate(lead) {
        const analysis = lead.aiAnalysis || {};
        const urgency = analysis.urgency || 'low';
        
        let daysToAdd = 7; // default
        
        if (urgency === 'high') {
            daysToAdd = 1;
        } else if (urgency === 'medium') {
            daysToAdd = 3;
        }
        
        const followUpDate = new Date();
        followUpDate.setDate(followUpDate.getDate() + daysToAdd);
        
        return followUpDate.toISOString().split('T')[0];
    }

    // Generate notes based on lead analysis
    generateNotes(lead) {
        const notes = [];
        const analysis = lead.aiAnalysis || {};
        
        if (analysis.businessType) {
            notes.push(`Business: ${analysis.businessType}`);
        }
        
        if (lead.budget && parseInt(lead.budget) >= 50000) {
            notes.push('High budget prospect');
        }
        
        if (lead.timeline && lead.timeline.toLowerCase().includes('urgent')) {
            notes.push('Urgent timeline');
        }
        
        if (lead.location && lead.location.toLowerCase().includes('cancun')) {
            notes.push('Local market');
        }
        
        return notes.join(' | ');
    }

    // Read existing leads from Google Sheets
    async readExistingLeads() {
        try {
            console.log('📖 Reading existing leads from Google Sheets...');
            
            await this.sheet.loadCells();
            const rows = await this.sheet.getRows();
            
            const leads = rows.map(row => ({
                id: row.get('Lead ID'),
                name: row.get('Name'),
                business_name: row.get('Business Name'),
                phone: row.get('Phone'),
                email: row.get('Email'),
                location: row.get('Location'),
                business_type: row.get('Business Type'),
                industry: row.get('Industry'),
                current_website: row.get('Current Website'),
                monthly_revenue: row.get('Monthly Revenue'),
                budget: row.get('Budget'),
                interest: row.get('Interest'),
                timeline: row.get('Timeline'),
                source: row.get('Source'),
                score: row.get('Lead Quality Score'),
                grade: row.get('Lead Grade'),
                status: row.get('Status'),
                notes: row.get('Notes')
            }));

            console.log(`✅ Read ${leads.length} existing leads from Google Sheets`);
            return leads;
        } catch (error) {
            console.error('❌ Error reading leads from Google Sheets:', error.message);
            return [];
        }
    }

    // Update lead status in Google Sheets
    async updateLeadStatus(leadId, status, notes = '') {
        try {
            const rows = await this.sheet.getRows();
            const row = rows.find(r => r.get('Lead ID') === leadId);
            
            if (row) {
                row.set('Status', status);
                if (notes) {
                    row.set('Notes', row.get('Notes') + ' | ' + notes);
                }
                await row.save();
                console.log(`✅ Updated lead ${leadId} status to ${status}`);
                return true;
            } else {
                console.log(`❌ Lead ${leadId} not found in sheet`);
                return false;
            }
        } catch (error) {
            console.error('❌ Error updating lead status:', error.message);
            return false;
        }
    }

    // Get leads by status
    async getLeadsByStatus(status) {
        try {
            const rows = await this.sheet.getRows();
            return rows.filter(row => row.get('Status') === status);
        } catch (error) {
            console.error('❌ Error getting leads by status:', error.message);
            return [];
        }
    }

    // Create summary dashboard
    async createSummaryDashboard() {
        try {
            // Try to get existing summary sheet
            let summarySheet = this.doc.sheetsByTitle['Lead Summary Dashboard'];
            
            if (!summarySheet) {
                summarySheet = await this.doc.addSheet({
                    title: 'Lead Summary Dashboard',
                    headerValues: [
                        'Metric',
                        'Count',
                        'Percentage',
                        'Notes'
                    ]
                });
            }

            // Get lead data
            const rows = await this.sheet.getRows();
            const totalLeads = rows.length;
            
            const summary = [
                {
                    'Metric': 'Total Leads',
                    'Count': totalLeads,
                    'Percentage': '100%',
                    'Notes': 'All leads in database'
                },
                {
                    'Metric': 'High Quality Leads (A/A+)',
                    'Count': rows.filter(r => r.get('Lead Grade') === 'A' || r.get('Lead Grade') === 'A+').length,
                    'Percentage': `${((rows.filter(r => r.get('Lead Grade') === 'A' || r.get('Lead Grade') === 'A+').length / totalLeads) * 100).toFixed(1)}%`,
                    'Notes': 'Leads with highest potential'
                },
                {
                    'Metric': 'Ready to Contact',
                    'Count': rows.filter(r => r.get('Status') === 'Ready to Contact').length,
                    'Percentage': `${((rows.filter(r => r.get('Status') === 'Ready to Contact').length / totalLeads) * 100).toFixed(1)}%`,
                    'Notes': 'Leads with personalized messages ready'
                },
                {
                    'Metric': 'High Urgency Leads',
                    'Count': rows.filter(r => r.get('Urgency Level') === 'high').length,
                    'Percentage': `${((rows.filter(r => r.get('Urgency Level') === 'high').length / totalLeads) * 100).toFixed(1)}%`,
                    'Notes': 'Leads requiring immediate attention'
                },
                {
                    'Metric': 'Local Market (Cancún)',
                    'Count': rows.filter(r => r.get('Location').toLowerCase().includes('cancun')).length,
                    'Percentage': `${((rows.filter(r => r.get('Location').toLowerCase().includes('cancun')).length / totalLeads) * 100).toFixed(1)}%`,
                    'Notes': 'Local market opportunities'
                }
            ];

            // Clear existing data and add new summary
            await summarySheet.clear();
            await summarySheet.setHeaderRow(['Metric', 'Count', 'Percentage', 'Notes']);
            await summarySheet.addRows(summary);

            console.log('✅ Created summary dashboard');
            return true;
        } catch (error) {
            console.error('❌ Error creating summary dashboard:', error.message);
            return false;
        }
    }
}

module.exports = GoogleSheetsIntegration;


