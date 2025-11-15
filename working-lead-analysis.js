#!/usr/bin/env node

// WORKING LEAD ANALYSIS - One Lead at a Time (No Cheerio for now)
// Analyzes one lead and saves to Google Sheets

const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const fs = require('fs');

class WorkingLeadAnalysis {
    constructor() {
        this.spreadsheetId = '1nzknj5DlU_1oXeu_7VcMRD6_FRcSkgef2I0ObXxYoLg';
        this.doc = null;
        this.sheet = null;
        this.currentLeadIndex = 0;
        
        this.initGoogleSheets();
    }

    async initGoogleSheets() {
        try {
            console.log('🔗 Connecting to Google Sheets...');
            
            // Load service account config
            const serviceAccountConfig = JSON.parse(fs.readFileSync('google-service-account-config.json', 'utf8'));
            
            this.serviceAccountAuth = new JWT({
                email: serviceAccountConfig.client_email,
                key: serviceAccountConfig.private_key,
                scopes: [
                    'https://www.googleapis.com/auth/spreadsheets',
                    'https://www.googleapis.com/auth/drive.file',
                ],
            });

            this.doc = new GoogleSpreadsheet(this.spreadsheetId, this.serviceAccountAuth);
            await this.doc.loadInfo();
            console.log(`✅ Connected to: ${this.doc.title}`);
            
            await this.setupAnalysisSheet();
            
        } catch (error) {
            console.error('❌ Google Sheets connection failed:', error.message);
        }
    }

    async setupAnalysisSheet() {
        try {
            // Create or get the AI Analysis sheet
            this.sheet = this.doc.sheetsByTitle['Working Lead Analysis'];
            
            if (!this.sheet) {
                this.sheet = await this.doc.addSheet({
                    title: 'Working Lead Analysis',
                    headerValues: this.getHeaderColumns()
                });
                console.log('✅ Created new "Working Lead Analysis" sheet');
            } else {
                console.log('✅ Using existing "Working Lead Analysis" sheet');
            }
            
        } catch (error) {
            console.error('❌ Error setting up analysis sheet:', error.message);
        }
    }

    getHeaderColumns() {
        return [
            'Lead #',
            'Business Name', 
            'Contact Name',
            'Phone',
            'Email',
            'Location',
            'Business Type',
            'Current Website',
            'Website Analysis',
            'Google Maps Analysis',
            'Social Media Analysis',
            'Problems Found',
            'Opportunities',
            'Service Recommendations',
            'Lead Score',
            'Urgency Level',
            'Budget Estimate',
            'Personalized Message',
            'Status',
            'Analysis Date'
        ];
    }

    async fetchOneLeadFromGoogleSheets(leadIndex) {
        try {
            console.log(`📊 Fetching lead #${leadIndex + 1} from Google Sheets...`);
            
            // Get the "Top 200 Qualified Leads" sheet
            const leadsSheet = this.doc.sheetsByTitle['Top 200 Qualified Leads'];
            
            if (!leadsSheet) {
                console.log('❌ "Top 200 Qualified Leads" sheet not found');
                return null;
            }
            
            const rows = await leadsSheet.getRows();
            
            if (leadIndex >= rows.length) {
                console.log(`❌ Lead #${leadIndex + 1} not found (only ${rows.length} leads available)`);
                return null;
            }
            
            const row = rows[leadIndex];
            
            const lead = {
                id: `LEAD_${(leadIndex + 1).toString().padStart(3, '0')}`,
                name: row.get('Name') || '',
                business_name: row.get('Business Name') || '',
                phone: row.get('Phone') || '',
                email: row.get('Email') || '',
                location: row.get('Location') || 'Cancún',
                business_type: row.get('Business Type') || '',
                current_website: row.get('Current Website') || '',
                source: row.get('Source') || ''
            };
            
            console.log(`✅ Lead #${leadIndex + 1} fetched: ${lead.business_name || lead.name}`);
            return lead;
            
        } catch (error) {
            console.error('❌ Error fetching lead:', error.message);
            return null;
        }
    }

    async analyzeWebsite(website) {
        console.log(`    🌐 Analyzing website: ${website}`);
        
        if (!website || !website.includes('.')) {
            return {
                status: 'No Website',
                analysis: 'No website found - High opportunity for website creation',
                problems: ['Missing online presence', 'No digital credibility'],
                opportunities: ['Create professional website', 'Establish online presence']
            };
        }

        // For now, we'll do basic analysis without web scraping
        // Later we can add cheerio and puppeteer for real analysis
        return {
            status: 'Website Found',
            analysis: 'Website exists - needs detailed analysis',
            problems: ['Website needs audit', 'Unknown quality'],
            opportunities: ['Website optimization', 'Performance improvement']
        };
    }

    async analyzeGoogleMaps(businessName, location) {
        console.log(`    🗺️ Analyzing Google Maps for: ${businessName}`);
        
        // Basic analysis - later we can add real Google Maps checking
        return {
            status: 'Needs Verification',
            analysis: 'Google Maps presence needs verification',
            problems: ['Unknown maps status', 'May be missing from local searches'],
            opportunities: ['Google Maps optimization', 'Local SEO setup']
        };
    }

    async analyzeSocialMedia(businessName, location) {
        console.log(`    📱 Analyzing social media for: ${businessName}`);
        
        // Basic analysis - later we can add real social media checking
        return {
            platforms: ['Unknown'],
            analysis: 'Social media presence needs verification',
            problems: ['Unknown social media status', 'May be missing social presence'],
            opportunities: ['Social media strategy', 'Facebook/Instagram setup']
        };
    }

    calculateLeadScore(analysis) {
        let score = 60; // Base score
        
        // Website scoring
        if (analysis.website.status === 'No Website') {
            score += 20; // High opportunity
        } else if (analysis.website.status === 'Website Found') {
            score += 10;
        }
        
        // Business type scoring
        const highValueTypes = ['restaurant', 'hotel', 'tour', 'spa', 'clinic', 'gym', 'retail', 'dental', 'medical', 'beauty'];
        if (highValueTypes.some(type => analysis.businessType.toLowerCase().includes(type))) {
            score += 15;
        }
        
        // Location scoring (Cancún bonus)
        if (analysis.location.toLowerCase().includes('cancun')) {
            score += 5;
        }
        
        return Math.min(Math.max(score, 0), 100);
    }

    generatePersonalizedMessage(lead, analysis) {
        const businessName = lead.business_name || 'your business';
        const contactName = lead.name || 'there';
        
        let message = `¡Hola ${contactName}! 👋\n\n`;
        
        message += `Soy de JegoDigital, agencia de diseño web en Cancún. Vi ${businessName} y creo que podemos ayudarte a hacer crecer tu negocio:\n\n`;
        
        message += `✨ Nuestros servicios incluyen:\n`;
        message += `• Sitio web profesional (listo en 2-3 días)\n`;
        message += `• Optimización para Google (más clientes)\n`;
        message += `• Google Maps (aparición local)\n`;
        message += `• Diseño moderno y móvil\n`;
        message += `• SEO para Cancún\n\n`;
        
        message += `¿Te gustaría una consulta gratuita para ver cómo podemos hacer crecer ${businessName}? 🚀\n\n`;
        message += `Contáctame al +52 984 123 4567 o responde este mensaje.`;
        
        return message;
    }

    async analyzeOneLead(lead) {
        console.log(`\n🔍 ANALYZING LEAD #${this.currentLeadIndex + 1}: ${lead.business_name || lead.name}`);
        console.log('=' .repeat(60));
        
        const analysis = {
            leadNumber: this.currentLeadIndex + 1,
            businessName: lead.business_name || '',
            contactName: lead.name || '',
            phone: lead.phone || '',
            email: lead.email || '',
            location: lead.location || 'Cancún',
            businessType: lead.business_type || '',
            currentWebsite: lead.current_website || '',
        };
        
        // Analyze website
        analysis.website = await this.analyzeWebsite(lead.current_website);
        
        // Analyze Google Maps
        analysis.googleMaps = await this.analyzeGoogleMaps(lead.business_name || lead.name, lead.location);
        
        // Analyze social media
        analysis.socialMedia = await this.analyzeSocialMedia(lead.business_name || lead.name, lead.location);
        
        // Calculate lead score
        analysis.leadScore = this.calculateLeadScore(analysis);
        
        // Generate personalized message
        analysis.personalizedMessage = this.generatePersonalizedMessage(lead, analysis);
        
        // Determine urgency and budget
        analysis.urgencyLevel = analysis.leadScore > 80 ? 'High' : analysis.leadScore > 60 ? 'Medium' : 'Low';
        analysis.budgetEstimate = analysis.leadScore > 80 ? '$50,000+ MXN' : analysis.leadScore > 60 ? '$30,000+ MXN' : '$20,000+ MXN';
        
        // Combine all problems and opportunities
        analysis.allProblems = [
            ...analysis.website.problems,
            ...analysis.googleMaps.problems,
            ...analysis.socialMedia.problems
        ];
        
        analysis.allOpportunities = [
            ...analysis.website.opportunities,
            ...analysis.googleMaps.opportunities,
            ...analysis.socialMedia.opportunities
        ];
        
        console.log(`\n✅ ANALYSIS COMPLETE FOR LEAD #${this.currentLeadIndex + 1}`);
        console.log(`📊 Lead Score: ${analysis.leadScore}/100`);
        console.log(`🎯 Urgency: ${analysis.urgencyLevel}`);
        console.log(`💰 Budget Estimate: ${analysis.budgetEstimate}`);
        console.log(`📝 Message Length: ${analysis.personalizedMessage.length} characters`);
        
        return analysis;
    }

    formatForGoogleSheets(analysis) {
        return {
            'Lead #': analysis.leadNumber,
            'Business Name': analysis.businessName,
            'Contact Name': analysis.contactName,
            'Phone': analysis.phone,
            'Email': analysis.email,
            'Location': analysis.location,
            'Business Type': analysis.businessType,
            'Current Website': analysis.currentWebsite,
            'Website Analysis': analysis.website.analysis,
            'Google Maps Analysis': analysis.googleMaps.analysis,
            'Social Media Analysis': analysis.socialMedia.analysis,
            'Problems Found': analysis.allProblems.join('; '),
            'Opportunities': analysis.allOpportunities.join('; '),
            'Service Recommendations': this.getServiceRecommendations(analysis),
            'Lead Score': analysis.leadScore,
            'Urgency Level': analysis.urgencyLevel,
            'Budget Estimate': analysis.budgetEstimate,
            'Personalized Message': analysis.personalizedMessage,
            'Status': 'Ready to Contact',
            'Analysis Date': new Date().toISOString().split('T')[0]
        };
    }

    getServiceRecommendations(analysis) {
        const recommendations = [];
        
        if (analysis.website.status === 'No Website') {
            recommendations.push('Website Design');
        }
        if (analysis.website.status === 'Website Found') {
            recommendations.push('Website Optimization');
        }
        recommendations.push('Google Maps Setup');
        recommendations.push('Social Media Strategy');
        recommendations.push('SEO Optimization');
        
        return recommendations.join(', ');
    }

    async writeOneAnalysisToGoogleSheets(analysis) {
        try {
            console.log(`📝 Writing analysis to Google Sheets...`);
            
            // If this is the first lead, set up headers
            if (analysis.leadNumber === 1) {
                await this.sheet.clear();
                await this.sheet.setHeaderRow(this.getHeaderColumns());
                console.log('✅ Headers set up for first lead');
            }
            
            // Format and add the analysis
            const formattedData = this.formatForGoogleSheets(analysis);
            await this.sheet.addRow(formattedData);
            
            console.log(`✅ Successfully wrote analysis for Lead #${analysis.leadNumber} to Google Sheets`);
            console.log(`🔗 View results: https://docs.google.com/spreadsheets/d/${this.spreadsheetId}`);
            
        } catch (error) {
            console.error('❌ Error writing to Google Sheets:', error.message);
        }
    }

    async analyzeNextLead() {
        try {
            // Fetch the next lead
            const lead = await this.fetchOneLeadFromGoogleSheets(this.currentLeadIndex);
            
            if (!lead) {
                console.log('❌ No more leads to analyze');
                return false;
            }
            
            // Analyze the lead
            const analysis = await this.analyzeOneLead(lead);
            
            // Write to Google Sheets
            await this.writeOneAnalysisToGoogleSheets(analysis);
            
            // Move to next lead
            this.currentLeadIndex++;
            
            console.log(`\n🎉 Lead #${this.currentLeadIndex} analysis complete and saved to Google Sheets!`);
            console.log(`📊 Progress: ${this.currentLeadIndex} leads analyzed`);
            
            return true; // Continue with next lead
            
        } catch (error) {
            console.error('❌ Error analyzing lead:', error.message);
            return false;
        }
    }

    async run() {
        console.log('🚀 STARTING WORKING LEAD ANALYSIS');
        console.log('==================================');
        
        try {
            // Analyze the first lead
            const continueAnalysis = await this.analyzeNextLead();
            
            if (continueAnalysis) {
                console.log('\n✅ First lead analysis complete!');
                console.log('📋 To analyze the next lead, run: node working-lead-analysis.js next');
            }
            
        } catch (error) {
            console.error('❌ System error:', error.message);
        }
    }

    async runNext() {
        console.log('🔄 CONTINUING WITH NEXT LEAD');
        console.log('============================');
        
        try {
            const continueAnalysis = await this.analyzeNextLead();
            
            if (continueAnalysis) {
                console.log('\n✅ Next lead analysis complete!');
                console.log('📋 To analyze the next lead, run: node working-lead-analysis.js next');
            } else {
                console.log('\n🎉 All leads analyzed!');
            }
            
        } catch (error) {
            console.error('❌ System error:', error.message);
        }
    }
}

// Run the system
if (require.main === module) {
    const system = new WorkingLeadAnalysis();
    
    const command = process.argv[2];
    
    if (command === 'next') {
        system.runNext().catch(console.error);
    } else {
        system.run().catch(console.error);
    }
}

module.exports = WorkingLeadAnalysis;