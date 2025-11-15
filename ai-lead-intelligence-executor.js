// AI Lead Intelligence Executor - Main script to run comprehensive lead analysis
const AILeadIntelligenceAgent = require('./ai-agents/lead-intelligence-agent');
const AdvancedWebsiteAnalyzer = require('./ai-agents/advanced-website-analyzer');
const GoogleSheetsIntegration = require('./google-sheets-integration');

class AILeadIntelligenceExecutor {
    constructor() {
        this.intelligenceAgent = new AILeadIntelligenceAgent();
        this.websiteAnalyzer = new AdvancedWebsiteAnalyzer();
        this.sheetsIntegration = new GoogleSheetsIntegration();
        this.results = [];
    }

    // Main execution function
    async executeIntelligenceAnalysis(leads, spreadsheetId) {
        console.log('🤖 AI Lead Intelligence Agent - Starting Comprehensive Analysis');
        console.log(`📊 Processing ${leads.length} leads with deep digital footprint analysis...\n`);

        const executionResults = {
            totalLeads: leads.length,
            processedLeads: [],
            summary: {},
            errors: [],
            personalizedMessages: []
        };

        try {
            // Initialize Google Sheets
            console.log('📋 Step 1: Initializing Google Sheets integration...');
            const sheetsInitialized = await this.sheetsIntegration.initialize(spreadsheetId);
            if (!sheetsInitialized) {
                throw new Error('Failed to initialize Google Sheets');
            }

            // Setup leads sheet with intelligence columns
            console.log('📝 Step 2: Setting up intelligence analysis sheet...');
            const sheetSetup = await this.setupIntelligenceSheet();
            if (!sheetSetup) {
                throw new Error('Failed to setup intelligence sheet');
            }

            // Process leads in batches
            console.log('🔍 Step 3: Starting AI intelligence gathering...');
            const batchSize = 5; // Smaller batches for thorough analysis
            let processedCount = 0;

            for (let i = 0; i < leads.length; i += batchSize) {
                const batch = leads.slice(i, i + batchSize);
                const batchNumber = Math.floor(i / batchSize) + 1;
                const totalBatches = Math.ceil(leads.length / batchSize);

                console.log(`\n📊 Processing batch ${batchNumber}/${totalBatches} (${batch.length} leads)...`);

                const batchResults = await this.processBatch(batch, batchNumber);
                executionResults.processedLeads.push(...batchResults);
                processedCount += batchResults.length;

                console.log(`✅ Batch ${batchNumber} complete - ${processedCount}/${leads.length} leads processed`);
                
                // Delay between batches to avoid overwhelming systems
                if (i + batchSize < leads.length) {
                    console.log('⏳ Waiting 3 seconds before next batch...');
                    await this.delay(3000);
                }
            }

            // Generate comprehensive summary
            console.log('\n📈 Step 4: Generating comprehensive analysis summary...');
            executionResults.summary = this.generateComprehensiveSummary(executionResults.processedLeads);

            // Format results for Google Sheets
            console.log('\n📊 Step 5: Formatting results for Google Sheets...');
            executionResults.personalizedMessages = this.formatIntelligenceResults(executionResults.processedLeads);

            // Add results to Google Sheets
            console.log('\n💾 Step 6: Adding intelligence results to Google Sheets...');
            const sheetsUpdated = await this.addIntelligenceToSheets(executionResults.personalizedMessages);
            if (!sheetsUpdated) {
                console.log('⚠️ Warning: Could not add results to Google Sheets');
            }

            // Create summary dashboard
            console.log('\n📊 Step 7: Creating intelligence summary dashboard...');
            await this.createIntelligenceDashboard(executionResults.summary);

            // Display final results
            console.log('\n🎉 AI INTELLIGENCE ANALYSIS COMPLETE!');
            this.displayFinalResults(executionResults);

            return {
                success: true,
                totalLeads: leads.length,
                processedLeads: executionResults.processedLeads.length,
                highIntelligenceLeads: executionResults.summary.highIntelligenceLeads,
                averageConfidence: executionResults.summary.averageConfidence,
                topOpportunities: executionResults.summary.topOpportunities,
                spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
                results: executionResults
            };

        } catch (error) {
            console.error('\n❌ Intelligence analysis failed:', error.message);
            executionResults.errors.push(error.message);
            
            return {
                success: false,
                error: error.message,
                partialResults: executionResults
            };
        } finally {
            // Cleanup browser if it was opened
            if (this.intelligenceAgent.browser) {
                await this.intelligenceAgent.browser.close();
            }
        }
    }

    // Process a batch of leads with comprehensive intelligence gathering
    async processBatch(leads, batchNumber) {
        const batchResults = [];
        
        for (const [index, lead] of leads.entries()) {
            const leadNumber = ((batchNumber - 1) * 5) + index + 1;
            
            try {
                console.log(`  🔍 ${leadNumber}. Analyzing: ${lead.business_name || lead.name || 'Unknown business'}...`);
                
                // Gather comprehensive intelligence
                const intelligence = await this.intelligenceAgent.gatherIntelligence(lead);
                
                // Add batch and lead number for tracking
                intelligence.batchNumber = batchNumber;
                intelligence.leadNumber = leadNumber;
                
                batchResults.push(intelligence);
                
                // Show progress for this lead
                const confidence = intelligence.confidence || 0;
                const priority = intelligence.priority || 'medium';
                const websiteStatus = intelligence.data?.website?.exists ? 'Has website' : 'No website';
                
                console.log(`    ✅ Intelligence gathered - Confidence: ${confidence}%, Priority: ${priority}, ${websiteStatus}`);
                
                // Small delay between leads
                await this.delay(500);
                
            } catch (error) {
                console.log(`    ❌ Error analyzing lead ${leadNumber}: ${error.message}`);
                
                // Add error result
                batchResults.push({
                    lead: lead,
                    batchNumber: batchNumber,
                    leadNumber: leadNumber,
                    data: { error: error.message },
                    analysis: { painPoints: ['Analysis failed'], opportunities: ['Manual review needed'] },
                    personalizedMessage: this.generateFallbackMessage(lead),
                    confidence: 20,
                    priority: 'low'
                });
            }
        }
        
        return batchResults;
    }

    // Setup Google Sheets with intelligence columns
    async setupIntelligenceSheet() {
        try {
            // Try to get existing sheet
            let sheet = this.sheetsIntegration.doc.sheetsByTitle['AI Intelligence Analysis'];
            
            if (!sheet) {
                // Create new sheet with intelligence columns
                sheet = await this.sheetsIntegration.doc.addSheet({
                    title: 'AI Intelligence Analysis',
                    headerValues: this.getIntelligenceHeaders()
                });
                console.log('✅ Created new AI Intelligence Analysis sheet');
            } else {
                console.log('✅ Using existing AI Intelligence Analysis sheet');
            }

            this.sheetsIntegration.sheet = sheet;
            return true;
        } catch (error) {
            console.error('❌ Error setting up intelligence sheet:', error.message);
            return false;
        }
    }

    // Get headers for intelligence analysis sheet
    getIntelligenceHeaders() {
        return [
            'Lead ID',
            'Name',
            'Business Name',
            'Phone',
            'Email',
            'Location',
            'Business Type',
            'Industry',
            'Website URL',
            'Website Exists',
            'Website Quality',
            'Technical Score',
            'SEO Score',
            'Conversion Score',
            'Content Quality',
            'Mobile Friendly',
            'Has SSL',
            'Fast Loading',
            'Has Contact Form',
            'Has Phone Button',
            'Has WhatsApp',
            'Social Media Score',
            'Review Count',
            'Average Rating',
            'Business Size',
            'Revenue Potential',
            'Digital Maturity',
            'Growth Stage',
            'Decision Makers',
            'Pain Points',
            'Opportunities',
            'Recommendations',
            'Urgency Level',
            'Priority Level',
            'Confidence Score',
            'AI Analysis',
            'Personalized Message',
            'Message Length',
            'Recommended Action',
            'Follow-up Date',
            'Status',
            'Notes'
        ];
    }

    // Generate comprehensive summary
    generateComprehensiveSummary(processedLeads) {
        const summary = {
            totalLeads: processedLeads.length,
            highIntelligenceLeads: 0,
            averageConfidence: 0,
            websiteAnalysis: {},
            socialMediaAnalysis: {},
            businessAnalysis: {},
            topOpportunities: [],
            topPainPoints: [],
            serviceRecommendations: {},
            priorityDistribution: {},
            confidenceDistribution: {}
        };

        if (processedLeads.length === 0) return summary;

        // Calculate metrics
        const confidences = processedLeads.map(lead => lead.confidence || 0);
        summary.averageConfidence = Math.round(confidences.reduce((a, b) => a + b, 0) / confidences.length);
        summary.highIntelligenceLeads = processedLeads.filter(lead => (lead.confidence || 0) >= 80).length;

        // Website analysis
        const websiteData = processedLeads.map(lead => lead.data?.website || {});
        summary.websiteAnalysis = {
            hasWebsite: websiteData.filter(w => w.exists).length,
            noWebsite: websiteData.filter(w => !w.exists).length,
            mobileFriendly: websiteData.filter(w => w.technical?.mobileFriendly).length,
            hasSSL: websiteData.filter(w => w.technical?.sslCertificate).length,
            fastLoading: websiteData.filter(w => w.performance?.fastLoading).length
        };

        // Social media analysis
        const socialData = processedLeads.map(lead => lead.data?.socialMedia || {});
        summary.socialMediaAnalysis = {
            hasFacebook: socialData.filter(s => s.facebook?.exists).length,
            hasInstagram: socialData.filter(s => s.instagram?.exists).length,
            hasLinkedIn: socialData.filter(s => s.linkedin?.exists).length,
            hasGoogleMyBusiness: socialData.filter(s => s.googleMyBusiness?.exists).length
        };

        // Business analysis
        const businessData = processedLeads.map(lead => lead.data?.business || {});
        summary.businessAnalysis = {
            industries: this.groupBy(businessData, 'industry'),
            businessSizes: this.groupBy(businessData, 'businessSize'),
            revenueLevels: this.groupBy(businessData, 'revenue'),
            growthStages: this.groupBy(businessData, 'growthStage')
        };

        // Top opportunities and pain points
        const allPainPoints = processedLeads.flatMap(lead => lead.analysis?.painPoints || []);
        const allOpportunities = processedLeads.flatMap(lead => lead.analysis?.opportunities || []);
        const allRecommendations = processedLeads.flatMap(lead => lead.analysis?.recommendations || []);

        summary.topPainPoints = this.getTopOccurrences(allPainPoints, 5);
        summary.topOpportunities = this.getTopOccurrences(allOpportunities, 5);
        summary.serviceRecommendations = this.getTopOccurrences(allRecommendations, 5);

        // Priority and confidence distribution
        summary.priorityDistribution = this.groupBy(processedLeads, 'priority');
        summary.confidenceDistribution = this.calculateConfidenceDistribution(confidences);

        return summary;
    }

    // Format intelligence results for Google Sheets
    formatIntelligenceResults(processedLeads) {
        return processedLeads.map(lead => {
            const data = lead.data || {};
            const analysis = lead.analysis || {};
            
            return {
                'Lead ID': lead.lead?.id || `LEAD_${lead.leadNumber || 'UNKNOWN'}`,
                'Name': lead.lead?.name || lead.lead?.contact_name || '',
                'Business Name': lead.lead?.business_name || lead.lead?.company || '',
                'Phone': lead.lead?.phone || '',
                'Email': lead.lead?.email || '',
                'Location': lead.lead?.location || lead.lead?.city || 'Cancún',
                'Business Type': data.business?.industry || '',
                'Industry': lead.lead?.industry || '',
                'Website URL': data.website?.url || '',
                'Website Exists': data.website?.exists ? 'Yes' : 'No',
                'Website Quality': data.website?.content?.professionalQuality || 'unknown',
                'Technical Score': this.calculateTechnicalScore(data.website?.technical || {}),
                'SEO Score': data.website?.seo?.score || 0,
                'Conversion Score': data.website?.conversion?.score || 0,
                'Content Quality': data.website?.content?.professionalQuality || 'poor',
                'Mobile Friendly': data.website?.technical?.mobileFriendly ? 'Yes' : 'No',
                'Has SSL': data.website?.technical?.sslCertificate ? 'Yes' : 'No',
                'Fast Loading': data.website?.performance?.fastLoading ? 'Yes' : 'No',
                'Has Contact Form': data.website?.conversion?.forms?.hasContactForm ? 'Yes' : 'No',
                'Has Phone Button': data.website?.conversion?.contactMethods?.phone?.clickable ? 'Yes' : 'No',
                'Has WhatsApp': data.website?.conversion?.contactMethods?.whatsapp?.exists ? 'Yes' : 'No',
                'Social Media Score': data.socialMedia?.overallScore || 0,
                'Review Count': data.reviews?.googleReviews?.count || 0,
                'Average Rating': data.reviews?.googleReviews?.averageRating || 0,
                'Business Size': data.business?.businessSize || 'unknown',
                'Revenue Potential': data.business?.revenue || 'unknown',
                'Digital Maturity': data.business?.maturity || 'unknown',
                'Growth Stage': data.business?.growthStage || 'unknown',
                'Decision Makers': data.business?.decisionMakers || 'unknown',
                'Pain Points': (analysis.painPoints || []).join(', '),
                'Opportunities': (analysis.opportunities || []).join(', '),
                'Recommendations': (analysis.recommendations || []).join(', '),
                'Urgency Level': analysis.urgency || 'medium',
                'Priority Level': lead.priority || 'medium',
                'Confidence Score': lead.confidence || 0,
                'AI Analysis': JSON.stringify(analysis),
                'Personalized Message': lead.personalizedMessage || '',
                'Message Length': (lead.personalizedMessage || '').length,
                'Recommended Action': this.getRecommendedAction(lead),
                'Follow-up Date': this.calculateFollowUpDate(lead),
                'Status': 'Ready for Intelligence-Based Outreach',
                'Notes': this.generateIntelligenceNotes(lead)
            };
        });
    }

    // Add intelligence results to Google Sheets
    async addIntelligenceToSheets(formattedResults) {
        try {
            console.log(`📊 Adding ${formattedResults.length} intelligence results to Google Sheets...`);
            await this.sheetsIntegration.sheet.addRows(formattedResults);
            console.log('✅ Intelligence results added to Google Sheets');
            return true;
        } catch (error) {
            console.error('❌ Error adding intelligence results to sheets:', error.message);
            return false;
        }
    }

    // Create intelligence dashboard
    async createIntelligenceDashboard(summary) {
        try {
            let dashboardSheet = this.sheetsIntegration.doc.sheetsByTitle['AI Intelligence Dashboard'];
            
            if (!dashboardSheet) {
                dashboardSheet = await this.sheetsIntegration.doc.addSheet({
                    title: 'AI Intelligence Dashboard',
                    headerValues: ['Metric', 'Count', 'Percentage', 'Insights']
                });
            }

            const dashboardData = [
                {
                    'Metric': 'Total Leads Analyzed',
                    'Count': summary.totalLeads,
                    'Percentage': '100%',
                    'Insights': 'Complete AI intelligence analysis'
                },
                {
                    'Metric': 'High Intelligence Leads',
                    'Count': summary.highIntelligenceLeads,
                    'Percentage': `${Math.round((summary.highIntelligenceLeads / summary.totalLeads) * 100)}%`,
                    'Insights': 'Leads with 80%+ confidence score'
                },
                {
                    'Metric': 'Average Confidence Score',
                    'Count': summary.averageConfidence,
                    'Percentage': `${summary.averageConfidence}%`,
                    'Insights': 'Overall AI analysis confidence'
                },
                {
                    'Metric': 'Leads with Website',
                    'Count': summary.websiteAnalysis.hasWebsite,
                    'Percentage': `${Math.round((summary.websiteAnalysis.hasWebsite / summary.totalLeads) * 100)}%`,
                    'Insights': 'Opportunity for website improvement'
                },
                {
                    'Metric': 'Leads without Website',
                    'Count': summary.websiteAnalysis.noWebsite,
                    'Percentage': `${Math.round((summary.websiteAnalysis.noWebsite / summary.totalLeads) * 100)}%`,
                    'Insights': 'Major opportunity for new websites'
                },
                {
                    'Metric': 'Mobile-Friendly Websites',
                    'Count': summary.websiteAnalysis.mobileFriendly,
                    'Percentage': `${Math.round((summary.websiteAnalysis.mobileFriendly / summary.totalLeads) * 100)}%`,
                    'Insights': 'Mobile optimization needed'
                },
                {
                    'Metric': 'Secure Websites (SSL)',
                    'Count': summary.websiteAnalysis.hasSSL,
                    'Percentage': `${Math.round((summary.websiteAnalysis.hasSSL / summary.totalLeads) * 100)}%`,
                    'Insights': 'Security improvements needed'
                }
            ];

            await dashboardSheet.clear();
            await dashboardSheet.setHeaderRow(['Metric', 'Count', 'Percentage', 'Insights']);
            await dashboardSheet.addRows(dashboardData);

            console.log('✅ AI Intelligence Dashboard created');
            return true;
        } catch (error) {
            console.error('❌ Error creating intelligence dashboard:', error.message);
            return false;
        }
    }

    // Display final results
    displayFinalResults(results) {
        console.log('\n📊 AI INTELLIGENCE ANALYSIS RESULTS:');
        console.log('=====================================');
        console.log(`Total Leads Processed: ${results.processedLeads.length}`);
        console.log(`High Intelligence Leads: ${results.summary.highIntelligenceLeads}`);
        console.log(`Average Confidence: ${results.summary.averageConfidence}%`);
        
        console.log('\n🌐 WEBSITE ANALYSIS:');
        console.log(`Has Website: ${results.summary.websiteAnalysis.hasWebsite}`);
        console.log(`No Website: ${results.summary.websiteAnalysis.noWebsite}`);
        console.log(`Mobile Friendly: ${results.summary.websiteAnalysis.mobileFriendly}`);
        console.log(`Has SSL Security: ${results.summary.websiteAnalysis.hasSSL}`);
        
        console.log('\n📱 SOCIAL MEDIA ANALYSIS:');
        console.log(`Facebook Presence: ${results.summary.socialMediaAnalysis.hasFacebook}`);
        console.log(`Instagram Presence: ${results.summary.socialMediaAnalysis.hasInstagram}`);
        console.log(`LinkedIn Presence: ${results.summary.socialMediaAnalysis.hasLinkedIn}`);
        console.log(`Google My Business: ${results.summary.socialMediaAnalysis.hasGoogleMyBusiness}`);
        
        console.log('\n🎯 TOP OPPORTUNITIES:');
        results.summary.topOpportunities.forEach((opp, index) => {
            console.log(`${index + 1}. ${opp.item} (${opp.count} leads)`);
        });
        
        console.log('\n💡 TOP PAIN POINTS:');
        results.summary.topPainPoints.forEach((pain, index) => {
            console.log(`${index + 1}. ${pain.item} (${pain.count} leads)`);
        });
        
        console.log('\n🚀 SERVICE RECOMMENDATIONS:');
        results.summary.serviceRecommendations.forEach((service, index) => {
            console.log(`${index + 1}. ${service.item} (${service.count} leads)`);
        });
        
        console.log('\n📞 PERSONALIZED MESSAGES GENERATED:');
        console.log(`✅ ${results.personalizedMessages.length} highly personalized messages ready`);
        console.log('📊 Check Google Sheets for complete intelligence analysis');
        console.log('🎯 Messages are tailored to specific pain points and opportunities');
        console.log('💬 Each message addresses unique business needs identified by AI');
        
        console.log('\n🎯 NEXT STEPS:');
        console.log('1. Review intelligence analysis in Google Sheets');
        console.log('2. Start with highest priority and confidence leads');
        console.log('3. Use personalized messages for WhatsApp outreach');
        console.log('4. Track responses and update lead status');
        console.log('5. Analyze which pain points get best responses');
    }

    // Helper methods
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    groupBy(array, key) {
        return array.reduce((groups, item) => {
            const value = item[key] || 'unknown';
            groups[value] = (groups[value] || 0) + 1;
            return groups;
        }, {});
    }

    getTopOccurrences(items, count) {
        const occurrences = {};
        items.forEach(item => {
            occurrences[item] = (occurrences[item] || 0) + 1;
        });
        
        return Object.entries(occurrences)
            .sort(([,a], [,b]) => b - a)
            .slice(0, count)
            .map(([item, count]) => ({ item, count }));
    }

    calculateConfidenceDistribution(confidences) {
        return {
            '90-100%': confidences.filter(c => c >= 90).length,
            '80-89%': confidences.filter(c => c >= 80 && c < 90).length,
            '70-79%': confidences.filter(c => c >= 70 && c < 80).length,
            '60-69%': confidences.filter(c => c >= 60 && c < 70).length,
            'Below 60%': confidences.filter(c => c < 60).length
        };
    }

    calculateTechnicalScore(technical) {
        if (!technical) return 0;
        
        let score = 0;
        if (technical.mobileFriendly) score += 25;
        if (technical.sslCertificate) score += 25;
        if (technical.responsiveDesign) score += 25;
        if (technical.modernStandards) score += 25;
        
        return score;
    }

    getRecommendedAction(lead) {
        const priority = lead.priority || 'medium';
        const confidence = lead.confidence || 0;
        
        if (priority === 'very_high' || (priority === 'high' && confidence >= 80)) {
            return 'Contact Immediately';
        } else if (priority === 'high' || confidence >= 70) {
            return 'Priority Contact';
        } else if (priority === 'medium' || confidence >= 50) {
            return 'Standard Contact';
        } else {
            return 'Low Priority';
        }
    }

    calculateFollowUpDate(lead) {
        const priority = lead.priority || 'medium';
        let daysToAdd = 7;
        
        if (priority === 'very_high') daysToAdd = 1;
        else if (priority === 'high') daysToAdd = 3;
        else if (priority === 'low') daysToAdd = 14;
        
        const followUpDate = new Date();
        followUpDate.setDate(followUpDate.getDate() + daysToAdd);
        
        return followUpDate.toISOString().split('T')[0];
    }

    generateIntelligenceNotes(lead) {
        const notes = [];
        const data = lead.data || {};
        
        if (data.website?.exists) {
            notes.push('Has website');
            if (data.website.technical?.mobileFriendly) notes.push('Mobile friendly');
            if (!data.website.technical?.sslCertificate) notes.push('Needs SSL');
        } else {
            notes.push('No website - major opportunity');
        }
        
        if (lead.confidence >= 80) notes.push('High confidence analysis');
        if (lead.priority === 'very_high') notes.push('Very high priority');
        
        return notes.join(' | ');
    }

    generateFallbackMessage(lead) {
        const name = lead.name || lead.contact_name || 'Estimado empresario';
        
        return `Hola ${name}, soy Alex de JegoDigital.

Tu negocio tiene un gran potencial digital. Te puedo ayudar a crear una presencia web profesional que genere más clientes.

Somos la agencia #1 en Cancún y hemos ayudado a más de 50 empresas locales a duplicar sus ventas.

¿Te gustaría conocer cómo podemos ayudarte?

Responde "SÍ" para una consulta gratuita de 15 minutos.

Saludos,
Alex Jego
JegoDigital - Marketing Digital Cancún
📱 www.jegodigital.com
📧 alex@jegodigital.com`;
    }
}

module.exports = AILeadIntelligenceExecutor;


