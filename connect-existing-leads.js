// Connect to Existing Google Sheets with Leads Data
const fetch = require('node-fetch');

class ExistingLeadsConnector {
    constructor() {
        // Your existing Google Sheets configuration
        this.spreadsheetId = '1nzknj5DlU_1oXeu_7VcMRD6_FRcSkgef2I0ObXxYoLg';
        this.apiKey = 'AIzaSyA-1HU2daAhNIuVOdK6ZN_GOIW9YB1i7a4';
        this.sheetName = 'jegodigital-leads-template';
        this.baseUrl = `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}/values/${this.sheetName}`;
    }

    // Fetch existing leads from your Google Sheet
    async fetchExistingLeads() {
        try {
            console.log('📊 Fetching existing leads from your Google Sheet...');
            console.log(`🔗 Sheet URL: https://docs.google.com/spreadsheets/d/${this.spreadsheetId}`);
            
            const response = await fetch(`${this.baseUrl}?key=${this.apiKey}`);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (!data.values || data.values.length === 0) {
                throw new Error('No data found in Google Sheet');
            }
            
            // Convert sheet data to lead objects
            const leads = this.convertSheetDataToLeads(data.values);
            
            console.log(`✅ Successfully fetched ${leads.length} leads from Google Sheet`);
            console.log(`📋 Sample lead:`, leads[0]);
            
            return leads;
            
        } catch (error) {
            console.error('❌ Error fetching leads from Google Sheet:', error.message);
            return [];
        }
    }

    // Convert Google Sheets data to lead objects
    convertSheetDataToLeads(sheetData) {
        if (sheetData.length < 2) {
            console.log('⚠️ No data rows found in sheet');
            return [];
        }

        // Get headers from first row
        const headers = sheetData[0];
        console.log('📋 Headers found:', headers);

        // Convert data rows to lead objects
        const leads = [];
        
        for (let i = 1; i < sheetData.length; i++) {
            const row = sheetData[i];
            
            // Skip empty rows
            if (!row || row.length === 0 || !row[0]) {
                continue;
            }

            const lead = {};
            
            // Map each column to lead property
            headers.forEach((header, index) => {
                const value = row[index] || '';
                const cleanHeader = header.toLowerCase().replace(/[^a-z0-9]/g, '_');
                lead[cleanHeader] = value;
            });

            // Add standard properties
            lead.id = lead.id || `LEAD_${i.toString().padStart(3, '0')}`;
            lead.name = lead.name || lead.contact_name || lead.full_name || '';
            lead.phone = lead.phone || lead.phone_number || lead.mobile || '';
            lead.email = lead.email || lead.email_address || '';
            lead.business_name = lead.business_name || lead.company || lead.business || '';
            lead.location = lead.location || lead.city || lead.address || 'Cancún';
            lead.business_type = lead.business_type || lead.industry || lead.business_category || '';
            lead.interest = lead.interest || lead.service_interest || lead.services_needed || '';
            lead.source = lead.source || lead.lead_source || lead.how_did_you_find_us || '';
            lead.budget = lead.budget || lead.estimated_budget || lead.budget_range || '';
            lead.timeline = lead.timeline || lead.when_do_you_need_this || lead.urgency || '';
            lead.notes = lead.notes || lead.additional_notes || lead.comments || '';

            // Add quality indicators
            lead.current_website = lead.current_website || lead.website_status || lead.has_website || '';
            lead.monthly_revenue = lead.monthly_revenue || lead.revenue || lead.monthly_sales || '';
            lead.employees = lead.employees || lead.team_size || lead.staff_count || '';

            leads.push(lead);
        }

        return leads;
    }

    // Analyze the leads data structure
    analyzeLeadsStructure(leads) {
        if (leads.length === 0) {
            console.log('⚠️ No leads to analyze');
            return;
        }

        console.log('\n📊 LEADS DATA ANALYSIS:');
        console.log('========================');
        console.log(`Total Leads: ${leads.length}`);
        
        // Analyze data completeness
        const completenessStats = {
            hasName: leads.filter(l => l.name && l.name.trim()).length,
            hasPhone: leads.filter(l => l.phone && l.phone.trim()).length,
            hasEmail: leads.filter(l => l.email && l.email.trim()).length,
            hasBusinessName: leads.filter(l => l.business_name && l.business_name.trim()).length,
            hasLocation: leads.filter(l => l.location && l.location.trim()).length,
            hasInterest: leads.filter(l => l.interest && l.interest.trim()).length,
            hasBudget: leads.filter(l => l.budget && l.budget.trim()).length
        };

        console.log('\n📋 Data Completeness:');
        Object.entries(completenessStats).forEach(([field, count]) => {
            const percentage = ((count / leads.length) * 100).toFixed(1);
            console.log(`${field}: ${count}/${leads.length} (${percentage}%)`);
        });

        // Analyze lead sources
        const sources = {};
        leads.forEach(lead => {
            const source = lead.source || 'Unknown';
            sources[source] = (sources[source] || 0) + 1;
        });

        console.log('\n📈 Lead Sources:');
        Object.entries(sources).forEach(([source, count]) => {
            console.log(`${source}: ${count} leads`);
        });

        // Analyze interests
        const interests = {};
        leads.forEach(lead => {
            const interest = lead.interest || 'Not specified';
            interests[interest] = (interests[interest] || 0) + 1;
        });

        console.log('\n🎯 Service Interests:');
        Object.entries(interests).forEach(([interest, count]) => {
            console.log(`${interest}: ${count} leads`);
        });

        // Analyze locations
        const locations = {};
        leads.forEach(lead => {
            const location = lead.location || 'Not specified';
            locations[location] = (locations[location] || 0) + 1;
        });

        console.log('\n📍 Locations:');
        Object.entries(locations).forEach(([location, count]) => {
            console.log(`${location}: ${count} leads`);
        });

        return {
            totalLeads: leads.length,
            completeness: completenessStats,
            sources: sources,
            interests: interests,
            locations: locations
        };
    }

    // Test connection to Google Sheets
    async testConnection() {
        try {
            console.log('🔍 Testing connection to your Google Sheet...');
            
            const response = await fetch(`${this.baseUrl}?key=${this.apiKey}`);
            
            if (response.ok) {
                const data = await response.json();
                console.log('✅ Connection successful!');
                console.log(`📊 Sheet has ${data.values ? data.values.length : 0} rows`);
                
                if (data.values && data.values.length > 0) {
                    console.log('📋 Headers:', data.values[0]);
                }
                
                return true;
            } else {
                console.log('❌ Connection failed:', response.status, response.statusText);
                return false;
            }
        } catch (error) {
            console.error('❌ Connection error:', error.message);
            return false;
        }
    }
}

// Export for use
module.exports = ExistingLeadsConnector;

// If running directly, test the connection and fetch leads
if (require.main === module) {
    const connector = new ExistingLeadsConnector();
    
    async function run() {
        console.log('🚀 Testing connection to your existing Google Sheet...\n');
        
        // Test connection
        const connected = await connector.testConnection();
        
        if (connected) {
            // Fetch and analyze leads
            const leads = await connector.fetchExistingLeads();
            
            if (leads.length > 0) {
                // Analyze the data
                connector.analyzeLeadsStructure(leads);
                
                console.log('\n🎯 Ready to proceed with lead analysis and personalization!');
                console.log(`📊 Found ${leads.length} leads in your Google Sheet`);
                console.log('🔗 Sheet URL: https://docs.google.com/spreadsheets/d/1nzknj5DlU_1oXeu_7VcMRD6_FRcSkgef2I0ObXxYoLg');
            } else {
                console.log('⚠️ No leads found in the sheet');
            }
        } else {
            console.log('❌ Could not connect to Google Sheet');
        }
    }
    
    run().catch(console.error);
}


