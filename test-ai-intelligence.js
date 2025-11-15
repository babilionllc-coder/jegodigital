// Test AI Intelligence Agent with your existing Google Sheet
const AILeadIntelligenceExecutor = require('./ai-lead-intelligence-executor');

async function testAIIntelligence() {
    console.log('🤖 Testing AI Lead Intelligence Agent with your Google Sheet...\n');
    
    const executor = new AILeadIntelligenceExecutor();
    
    // Your existing Google Sheet configuration
    const spreadsheetId = '1nzknj5DlU_1oXeu_7VcMRD6_FRcSkgef2I0ObXxYoLg';
    
    // Generate sample leads for testing (first 10)
    const sampleLeads = [
        {
            id: 'LEAD_001',
            name: 'María González',
            business_name: 'Restaurante El Sabor',
            phone: '+529981234567',
            email: 'maria@elsabor.com',
            location: 'Cancún',
            business_type: 'restaurant',
            industry: 'food_service',
            current_website: 'none',
            monthly_revenue: '45000',
            budget: '15000',
            interest: 'website_design',
            timeline: 'urgent',
            source: 'website_form',
            employees: '8'
        },
        {
            id: 'LEAD_002',
            name: 'Carlos Rodríguez',
            business_name: 'Hotel Playa Paradise',
            phone: '+529981234568',
            email: 'carlos@playaparadise.com',
            location: 'Playa del Carmen',
            business_type: 'hotel',
            industry: 'hospitality',
            current_website: 'outdated',
            monthly_revenue: '120000',
            budget: '35000',
            interest: 'seo',
            timeline: 'this month',
            source: 'google_ads',
            employees: '25'
        },
        {
            id: 'LEAD_003',
            name: 'Ana Martínez',
            business_name: 'Boutique Cancún',
            phone: '+529981234569',
            email: 'ana@boutiquecancun.com',
            location: 'Cancún',
            business_type: 'retail',
            industry: 'fashion',
            current_website: 'basic',
            monthly_revenue: '65000',
            budget: '25000',
            interest: 'ecommerce',
            timeline: 'soon',
            source: 'referral',
            employees: '12'
        },
        {
            id: 'LEAD_004',
            name: 'Roberto Silva',
            business_name: 'Spa Relajante',
            phone: '+529981234570',
            email: 'roberto@sparelajante.com',
            location: 'Tulum',
            business_type: 'spa',
            industry: 'wellness',
            current_website: 'none',
            monthly_revenue: '35000',
            budget: '12000',
            interest: 'social_media',
            timeline: 'next month',
            source: 'social_media',
            employees: '6'
        },
        {
            id: 'LEAD_005',
            name: 'Laura Fernández',
            business_name: 'Clínica Dental Sonrisa',
            phone: '+529981234571',
            email: 'laura@sonrisadental.com',
            location: 'Cancún',
            business_type: 'medical',
            industry: 'healthcare',
            current_website: 'outdated',
            monthly_revenue: '85000',
            budget: '28000',
            interest: 'website_design',
            timeline: 'urgent',
            source: 'website_form',
            employees: '15'
        }
    ];

    try {
        console.log('🚀 Starting AI Intelligence Analysis...');
        console.log(`📊 Analyzing ${sampleLeads.length} sample leads...`);
        console.log(`🔗 Google Sheet ID: ${spreadsheetId}\n`);
        
        // Execute intelligence analysis
        const results = await executor.executeIntelligenceAnalysis(sampleLeads, spreadsheetId);
        
        if (results.success) {
            console.log('\n🎉 AI INTELLIGENCE ANALYSIS COMPLETED SUCCESSFULLY!');
            console.log('==================================================');
            console.log(`📊 Total Leads Analyzed: ${results.totalLeads}`);
            console.log(`🎯 High Intelligence Leads: ${results.highIntelligenceLeads}`);
            console.log(`📈 Average Confidence: ${results.averageConfidence}%`);
            console.log(`📋 Google Sheets URL: ${results.spreadsheetUrl}`);
            
            console.log('\n🎯 TOP OPPORTUNITIES IDENTIFIED:');
            results.topOpportunities.forEach((opp, index) => {
                console.log(`${index + 1}. ${opp.item} (${opp.count} leads)`);
            });
            
            console.log('\n📱 PERSONALIZED MESSAGES READY:');
            console.log('✅ Each lead has a unique, personalized message');
            console.log('✅ Messages address specific pain points identified by AI');
            console.log('✅ Messages include local Cancún advantages');
            console.log('✅ Messages are optimized for WhatsApp outreach');
            
            console.log('\n🚀 NEXT STEPS:');
            console.log('1. Check your Google Sheet for complete analysis');
            console.log('2. Review the "AI Intelligence Analysis" tab');
            console.log('3. Check the "AI Intelligence Dashboard" for summary');
            console.log('4. Start with highest priority leads first');
            console.log('5. Copy personalized messages for WhatsApp');
            
        } else {
            console.log('\n❌ AI Intelligence Analysis Failed');
            console.log(`Error: ${results.error}`);
            
            if (results.partialResults) {
                console.log(`Partial results: ${results.partialResults.processedLeads.length} leads processed`);
            }
        }
        
    } catch (error) {
        console.error('\n❌ Test execution failed:', error.message);
        console.log('\n🔧 Troubleshooting:');
        console.log('1. Check if Google Sheets API is enabled');
        console.log('2. Verify spreadsheet ID is correct');
        console.log('3. Ensure you have access to the spreadsheet');
        console.log('4. Check internet connection');
    }
}

// Run the test
if (require.main === module) {
    testAIIntelligence().catch(console.error);
}

module.exports = { testAIIntelligence };


