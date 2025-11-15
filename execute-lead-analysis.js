// Main Lead Analysis and Personalization Execution Script
const LeadScoringAnalyzer = require('./lead-scoring-analyzer');
const AIMessagePersonalizer = require('./ai-agents/message-personalizer');
const GoogleSheetsIntegration = require('./google-sheets-integration');

class LeadAnalysisExecutor {
    constructor() {
        this.scoringAnalyzer = new LeadScoringAnalyzer();
        this.messagePersonalizer = new AIMessagePersonalizer();
        this.sheetsIntegration = new GoogleSheetsIntegration();
    }

    // Main execution function
    async executeLeadAnalysis(leads, spreadsheetId) {
        console.log('🚀 Starting Lead Analysis and Personalization Process...');
        console.log(`📊 Processing ${leads.length} leads...`);

        try {
            // Step 1: Initialize Google Sheets
            console.log('\n📋 Step 1: Initializing Google Sheets...');
            const sheetsInitialized = await this.sheetsIntegration.initialize(spreadsheetId);
            if (!sheetsInitialized) {
                throw new Error('Failed to initialize Google Sheets');
            }

            // Step 2: Setup leads sheet
            console.log('\n📝 Step 2: Setting up leads sheet...');
            const sheetSetup = await this.sheetsIntegration.setupLeadsSheet();
            if (!sheetSetup) {
                throw new Error('Failed to setup leads sheet');
            }

            // Step 3: Analyze lead scoring
            console.log('\n🔍 Step 3: Analyzing lead scoring...');
            const scoringAnalysis = this.scoringAnalyzer.analyzeCurrentScoring(leads);
            this.displayScoringAnalysis(scoringAnalysis);

            // Step 4: Filter qualified leads (first 50 for testing)
            console.log('\n✅ Step 4: Filtering qualified leads...');
            const qualifiedLeads = scoringAnalysis.realQualifiedLeads.slice(0, 50);
            console.log(`📈 Selected ${qualifiedLeads.length} highest quality leads for personalization`);

            // Step 5: Generate personalized messages
            console.log('\n🤖 Step 5: Generating personalized messages...');
            const personalizedLeads = await this.messagePersonalizer.personalizeMessages(qualifiedLeads);

            // Step 6: Add to Google Sheets
            console.log('\n📊 Step 6: Adding to Google Sheets...');
            const sheetsUpdated = await this.sheetsIntegration.addPersonalizedLeads(personalizedLeads);
            if (!sheetsUpdated) {
                throw new Error('Failed to add leads to Google Sheets');
            }

            // Step 7: Create summary dashboard
            console.log('\n📈 Step 7: Creating summary dashboard...');
            await this.sheetsIntegration.createSummaryDashboard();

            // Step 8: Display results
            console.log('\n🎉 PROCESS COMPLETED SUCCESSFULLY!');
            this.displayResults(personalizedLeads, scoringAnalysis);

            return {
                success: true,
                totalLeads: leads.length,
                qualifiedLeads: qualifiedLeads.length,
                personalizedLeads: personalizedLeads.length,
                spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
                analysis: scoringAnalysis
            };

        } catch (error) {
            console.error('❌ Error in lead analysis execution:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Display scoring analysis results
    displayScoringAnalysis(analysis) {
        console.log('\n📊 LEAD SCORING ANALYSIS RESULTS:');
        console.log('=====================================');
        console.log(`Total Leads Analyzed: ${analysis.totalLeads}`);
        console.log(`Real Qualified Leads: ${analysis.realQualifiedLeads.length}`);
        console.log(`Fake Qualified Leads: ${analysis.fakeQualifiedLeads.length}`);
        console.log(`Scoring Accuracy: ${analysis.scoringAccuracy.accuracyRate}%`);
        console.log(`Over-qualified Issues: ${analysis.scoringAccuracy.overQualifiedCount}`);
        console.log(`Under-qualified Issues: ${analysis.scoringAccuracy.underQualifiedCount}`);

        console.log('\n🎯 QUALIFICATION BREAKDOWN:');
        console.log('============================');
        const gradeDistribution = {};
        analysis.realQualifiedLeads.forEach(lead => {
            const grade = lead.realScore.grade;
            gradeDistribution[grade] = (gradeDistribution[grade] || 0) + 1;
        });

        Object.entries(gradeDistribution).forEach(([grade, count]) => {
            console.log(`${grade}: ${count} leads`);
        });

        console.log('\n💡 RECOMMENDATIONS:');
        console.log('====================');
        analysis.recommendations.immediate.forEach(rec => {
            console.log(`• ${rec}`);
        });
    }

    // Display final results
    displayResults(personalizedLeads, scoringAnalysis) {
        console.log('\n📋 PERSONALIZED MESSAGES GENERATED:');
        console.log('=====================================');
        
        personalizedLeads.slice(0, 3).forEach((lead, index) => {
            console.log(`\n${index + 1}. ${lead.name} (${lead.business_name || 'No business name'})`);
            console.log(`   Quality Score: ${lead.realScore.total}/100 (${lead.realScore.grade})`);
            console.log(`   Service Interest: ${lead.aiAnalysis.serviceInterest}`);
            console.log(`   Urgency: ${lead.aiAnalysis.urgency}`);
            console.log(`   Message Preview: ${lead.personalizedMessage.substring(0, 100)}...`);
        });

        console.log(`\n📊 SUMMARY STATISTICS:`);
        console.log('========================');
        console.log(`• Total Personalized Messages: ${personalizedLeads.length}`);
        console.log(`• Average Quality Score: ${this.calculateAverageScore(personalizedLeads).toFixed(1)}/100`);
        console.log(`• High Urgency Leads: ${personalizedLeads.filter(l => l.aiAnalysis.urgency === 'high').length}`);
        console.log(`• Local Market (Cancún): ${personalizedLeads.filter(l => l.location && l.location.toLowerCase().includes('cancun')).length}`);

        console.log(`\n🎯 NEXT STEPS:`);
        console.log('==============');
        console.log('1. Review personalized messages in Google Sheets');
        console.log('2. Start contacting high-priority leads first');
        console.log('3. Track responses and update lead status');
        console.log('4. Follow up based on recommended follow-up dates');
        console.log('5. Analyze response rates and optimize messages');

        console.log(`\n📱 WHATSAPP OUTREACH STRATEGY:`);
        console.log('===============================');
        console.log('• Send messages during business hours (9 AM - 6 PM)');
        console.log('• Personalize each message with lead-specific information');
        console.log('• Track delivery and read receipts');
        console.log('• Follow up based on lead urgency and engagement');
        console.log('• Update lead status in Google Sheets after each contact');
    }

    // Calculate average score
    calculateAverageScore(leads) {
        const totalScore = leads.reduce((sum, lead) => sum + (lead.realScore?.total || 0), 0);
        return totalScore / leads.length;
    }

    // Generate sample leads for testing (if no real data available)
    generateSampleLeads(count = 50) {
        const sampleLeads = [];
        const businessTypes = ['restaurant', 'hotel', 'retail', 'service', 'beauty', 'fitness'];
        const locations = ['Cancún', 'Playa del Carmen', 'Tulum', 'Cozumel'];
        const interests = ['website_design', 'seo', 'social_media', 'ecommerce'];
        const sources = ['website_form', 'google_ads', 'referral', 'social_media'];

        for (let i = 1; i <= count; i++) {
            const businessType = businessTypes[Math.floor(Math.random() * businessTypes.length)];
            const location = locations[Math.floor(Math.random() * locations.length)];
            const interest = interests[Math.floor(Math.random() * interests.length)];
            const source = sources[Math.floor(Math.random() * sources.length)];

            sampleLeads.push({
                id: `LEAD_${i.toString().padStart(3, '0')}`,
                name: `Lead ${i}`,
                business_name: `${businessType.charAt(0).toUpperCase() + businessType.slice(1)} ${i}`,
                phone: `+52998${Math.floor(Math.random() * 10000000).toString().padStart(7, '0')}`,
                email: `lead${i}@${businessType}.com`,
                location: location,
                business_type: businessType,
                industry: businessType,
                current_website: Math.random() > 0.5 ? 'none' : 'outdated',
                monthly_revenue: Math.floor(Math.random() * 100000) + 10000,
                budget: Math.floor(Math.random() * 50000) + 5000,
                interest: interest,
                timeline: Math.random() > 0.7 ? 'urgent' : 'this month',
                source: source,
                employees: Math.floor(Math.random() * 20) + 1,
                business_description: `Professional ${businessType} in ${location}`,
                google_ranking: Math.random() > 0.6 ? 'poor' : 'none',
                social_media_presence: Math.random() > 0.5 ? 'poor' : 'none'
            });
        }

        return sampleLeads;
    }
}

// Export for use
module.exports = LeadAnalysisExecutor;

// If running directly, execute with sample data
if (require.main === module) {
    const executor = new LeadAnalysisExecutor();
    
    // Sample execution
    console.log('🚀 Starting Lead Analysis with Sample Data...');
    
    // Generate sample leads
    const sampleLeads = executor.generateSampleLeads(50);
    
    // Replace with your actual Google Sheets ID
    const spreadsheetId = 'YOUR_GOOGLE_SHEETS_ID_HERE';
    
    // Execute analysis
    executor.executeLeadAnalysis(sampleLeads, spreadsheetId)
        .then(result => {
            if (result.success) {
                console.log('\n✅ Lead analysis completed successfully!');
                console.log(`📊 Check your Google Sheets: ${result.spreadsheetUrl}`);
            } else {
                console.log('\n❌ Lead analysis failed:', result.error);
            }
        })
        .catch(error => {
            console.error('❌ Execution error:', error);
        });
}
