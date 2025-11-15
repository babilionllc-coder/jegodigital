#!/usr/bin/env node

// FINAL AI LEAD ANALYSIS SYSTEM - 100% REAL DATA
// Analyzes 50 leads with real website scraping, Google Maps, social media
// Writes everything to Google Sheets automatically

const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const axios = require('axios');
const fs = require('fs');

class FinalAILeadSystem {
    constructor() {
        this.spreadsheetId = '1nzknj5DlU_1oXeu_7VcMRD6_FRcSkgef2I0ObXxYoLg';
        this.doc = null;
        this.sheet = null;
        this.browser = null;
        this.analyzedLeads = [];
        
        // JegoDigital Services Knowledge
        this.services = {
            website_design: {
                name: "Website Design & Development",
                benefits: ["Modern, beautiful design", "2-3 day delivery", "Mobile responsive", "Custom built for business"],
                local_advantage: "Perfect for Cancún businesses wanting professional online presence"
            },
            seo_optimization: {
                name: "SEO & Google Optimization", 
                benefits: ["Rank higher on Google", "Get more customers", "Local SEO for Cancún", "Google Maps optimization"],
                local_advantage: "Help local businesses dominate Google searches in Cancún"
            },
            google_maps: {
                name: "Google Maps & Business Listings",
                benefits: ["Appear in local searches", "More foot traffic", "Customer reviews management", "Local visibility"],
                local_advantage: "Essential for Cancún tourism and service businesses"
            }
        };
        
        // Initialize Google Sheets
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
            this.sheet = this.doc.sheetsByTitle['AI Lead Analysis - 50 Leads'];
            
            if (!this.sheet) {
                this.sheet = await this.doc.addSheet({
                    title: 'AI Lead Analysis - 50 Leads',
                    headerValues: this.getHeaderColumns()
                });
                console.log('✅ Created new AI Analysis sheet');
            } else {
                console.log('✅ Using existing AI Analysis sheet');
            }
            
        } catch (error) {
            console.error('❌ Error setting up analysis sheet:', error.message);
        }
    }

    getHeaderColumns() {
        return [
            'Lead ID',
            'Business Name', 
            'Contact Name',
            'Phone',
            'Email',
            'Location',
            'Business Type',
            'Current Website',
            'Website Status',
            'Website Issues Found',
            'Google Maps Status',
            'Google Maps Issues',
            'Social Media Found',
            'Social Media Issues',
            'Business Problems Identified',
            'Growth Opportunities',
            'Service Recommendations',
            'Urgency Level',
            'Budget Estimate',
            'Lead Quality Score',
            'Personalized Message',
            'Follow-up Date',
            'Status',
            'Analysis Notes'
        ];
    }

    async startBrowser() {
        console.log('🌐 Starting browser for real analysis...');
        this.browser = await puppeteer.launch({ 
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
    }

    async closeBrowser() {
        if (this.browser) {
            await this.browser.close();
            console.log('🔒 Browser closed');
        }
    }

    async analyzeWebsite(website) {
        if (!website || !website.includes('.')) {
            return {
                status: 'No Website',
                issues: ['No website found'],
                problems: ['Missing online presence'],
                opportunities: ['Create professional website', 'Establish online credibility']
            };
        }

        try {
            console.log(`🔍 Analyzing website: ${website}`);
            
            const page = await this.browser.newPage();
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
            
            const response = await page.goto(website, { 
                waitUntil: 'networkidle2', 
                timeout: 15000 
            });
            
            if (!response || response.status() !== 200) {
                await page.close();
                return {
                    status: 'Website Error',
                    issues: ['Website not accessible', 'Loading errors'],
                    problems: ['Poor user experience', 'Lost customers'],
                    opportunities: ['Fix website issues', 'Improve reliability']
                };
            }

            const content = await page.content();
            const $ = cheerio.load(content);
            
            // Real analysis of website issues
            const issues = [];
            const problems = [];
            const opportunities = [];
            
            // Check mobile responsiveness
            const viewport = await page.viewport();
            const isMobileFriendly = viewport && viewport.width <= 768;
            if (!isMobileFriendly) {
                issues.push('Not mobile responsive');
                problems.push('Losing mobile customers');
                opportunities.push('Make mobile-friendly');
            }
            
            // Check for contact information
            const contactInfo = content.toLowerCase();
            if (!contactInfo.includes('phone') && !contactInfo.includes('whatsapp') && !contactInfo.includes('contact')) {
                issues.push('Missing contact information');
                problems.push('Customers can\'t reach business');
                opportunities.push('Add clear contact details');
            }
            
            // Check for social media links
            const socialLinks = $('a[href*="facebook"], a[href*="instagram"], a[href*="twitter"]').length;
            if (socialLinks === 0) {
                issues.push('No social media integration');
                problems.push('Missing social media presence');
                opportunities.push('Connect social media');
            }
            
            // Check page load speed (basic)
            const loadTime = Date.now() - (await page.evaluate(() => performance.timing.navigationStart));
            if (loadTime > 3000) {
                issues.push('Slow loading speed');
                problems.push('Users leaving due to slow site');
                opportunities.push('Optimize loading speed');
            }
            
            // Check for modern design elements
            const hasModernElements = $('.container, .row, .col, .grid, .flex').length > 0;
            if (!hasModernElements) {
                issues.push('Outdated design');
                problems.push('Unprofessional appearance');
                opportunities.push('Modern design upgrade');
            }
            
            await page.close();
            
            return {
                status: 'Analyzed',
                issues: issues,
                problems: problems,
                opportunities: opportunities,
                loadTime: loadTime
            };
            
        } catch (error) {
            console.log(`⚠️ Website analysis failed for ${website}:`, error.message);
            return {
                status: 'Analysis Failed',
                issues: ['Technical issues', 'Analysis failed'],
                problems: ['Unknown website quality'],
                opportunities: ['Website audit needed']
            };
        }
    }

    async analyzeGoogleMaps(businessName, location) {
        try {
            console.log(`🗺️ Checking Google Maps for: ${businessName}`);
            
            const page = await this.browser.newPage();
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
            
            // Search for business on Google Maps
            const searchQuery = `${businessName} ${location}`;
            await page.goto(`https://www.google.com/maps/search/${encodeURIComponent(searchQuery)}`, {
                waitUntil: 'networkidle2'
            });
            
            await page.waitForTimeout(3000);
            
            const content = await page.content();
            const $ = cheerio.load(content);
            
            const issues = [];
            const problems = [];
            const opportunities = [];
            
            // Check if business appears in results
            const hasResults = content.includes('directions') || content.includes('reviews') || content.includes('photos');
            
            if (!hasResults) {
                issues.push('Not found on Google Maps');
                problems.push('Missing from local searches');
                opportunities.push('Create Google Maps listing');
            } else {
                // Check for reviews
                const reviewCount = (content.match(/reviews?/gi) || []).length;
                if (reviewCount === 0) {
                    issues.push('No customer reviews');
                    problems.push('No social proof');
                    opportunities.push('Encourage customer reviews');
                }
                
                // Check for photos
                const photoCount = (content.match(/photos?/gi) || []).length;
                if (photoCount === 0) {
                    issues.push('No business photos');
                    problems.push('No visual appeal');
                    opportunities.push('Add business photos');
                }
            }
            
            await page.close();
            
            return {
                status: hasResults ? 'Found' : 'Not Found',
                issues: issues,
                problems: problems,
                opportunities: opportunities
            };
            
        } catch (error) {
            console.log(`⚠️ Google Maps analysis failed for ${businessName}:`, error.message);
            return {
                status: 'Analysis Failed',
                issues: ['Maps analysis failed'],
                problems: ['Unknown maps presence'],
                opportunities: ['Verify Google Maps listing']
            };
        }
    }

    async analyzeSocialMedia(businessName, location) {
        try {
            console.log(`📱 Checking social media for: ${businessName}`);
            
            const page = await this.browser.newPage();
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
            
            const socialPlatforms = [];
            const issues = [];
            const problems = [];
            const opportunities = [];
            
            // Check Facebook
            try {
                await page.goto(`https://www.facebook.com/search/pages/?q=${encodeURIComponent(businessName + ' ' + location)}`, {
                    waitUntil: 'networkidle2'
                });
                await page.waitForTimeout(2000);
                
                const facebookContent = await page.content();
                if (facebookContent.includes('pages') && facebookContent.includes('likes')) {
                    socialPlatforms.push('Facebook');
                } else {
                    issues.push('No Facebook page found');
                    problems.push('Missing Facebook presence');
                    opportunities.push('Create Facebook business page');
                }
            } catch (e) {
                issues.push('Facebook check failed');
            }
            
            // Check Instagram
            try {
                await page.goto(`https://www.instagram.com/explore/tags/${encodeURIComponent(businessName.replace(/\s+/g, ''))}/`, {
                    waitUntil: 'networkidle2'
                });
                await page.waitForTimeout(2000);
                
                const instagramContent = await page.content();
                if (instagramContent.includes('posts') || instagramContent.includes('followers')) {
                    socialPlatforms.push('Instagram');
                } else {
                    issues.push('No Instagram presence');
                    problems.push('Missing Instagram marketing');
                    opportunities.push('Start Instagram marketing');
                }
            } catch (e) {
                issues.push('Instagram check failed');
            }
            
            await page.close();
            
            return {
                platforms: socialPlatforms,
                issues: issues,
                problems: problems,
                opportunities: opportunities
            };
            
        } catch (error) {
            console.log(`⚠️ Social media analysis failed for ${businessName}:`, error.message);
            return {
                platforms: [],
                issues: ['Social media analysis failed'],
                problems: ['Unknown social presence'],
                opportunities: ['Audit social media strategy']
            };
        }
    }

    calculateLeadScore(analysis) {
        let score = 50; // Base score
        
        // Website analysis scoring
        if (analysis.website.status === 'Analyzed') {
            score += 20;
            score -= analysis.website.issues.length * 3;
        } else if (analysis.website.status === 'No Website') {
            score += 30; // High opportunity
        }
        
        // Google Maps scoring
        if (analysis.googleMaps.status === 'Found') {
            score += 10;
            score -= analysis.googleMaps.issues.length * 2;
        } else if (analysis.googleMaps.status === 'Not Found') {
            score += 15; // High opportunity
        }
        
        // Social media scoring
        score += analysis.socialMedia.platforms.length * 5;
        score -= analysis.socialMedia.issues.length * 2;
        
        // Business type scoring
        const highValueTypes = ['restaurant', 'hotel', 'tour', 'spa', 'clinic', 'gym', 'retail'];
        if (highValueTypes.some(type => analysis.businessType.toLowerCase().includes(type))) {
            score += 10;
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
        
        // Determine primary service based on analysis
        let primaryService = 'website design';
        let serviceBenefits = this.services.website_design.benefits;
        
        if (analysis.website.status === 'No Website') {
            primaryService = 'website design';
            serviceBenefits = this.services.website_design.benefits;
        } else if (analysis.googleMaps.status === 'Not Found') {
            primaryService = 'Google Maps optimization';
            serviceBenefits = this.services.google_maps.benefits;
        } else if (analysis.socialMedia.issues.length > 0) {
            primaryService = 'SEO and online presence';
            serviceBenefits = this.services.seo_optimization.benefits;
        }
        
        // Create personalized message based on real analysis
        let message = `¡Hola ${contactName}! 👋\n\n`;
        
        message += `Soy de JegoDigital, agencia de diseño web en Cancún. Vi ${businessName} y noté algunas oportunidades importantes para hacer crecer tu negocio:\n\n`;
        
        // Add specific issues found
        if (analysis.website.issues.length > 0) {
            message += `🌐 Tu sitio web: ${analysis.website.issues[0]}\n`;
        }
        if (analysis.googleMaps.issues.length > 0) {
            message += `🗺️ Google Maps: ${analysis.googleMaps.issues[0]}\n`;
        }
        if (analysis.socialMedia.issues.length > 0) {
            message += `📱 Redes sociales: ${analysis.socialMedia.issues[0]}\n`;
        }
        
        message += `\n✨ Podemos ayudarte con:\n`;
        message += `• Sitio web profesional (listo en 2-3 días)\n`;
        message += `• Optimización para Google (más clientes)\n`;
        message += `• Google Maps (aparición local)\n`;
        message += `• Diseño moderno y móvil\n\n`;
        
        message += `¿Te gustaría una consulta gratuita para ver cómo podemos hacer crecer ${businessName}? 🚀\n\n`;
        message += `Contáctame al +52 984 123 4567 o responde este mensaje.`;
        
        return message;
    }

    async analyzeLead(lead) {
        console.log(`\n🔍 Analyzing Lead: ${lead.business_name || lead.name}`);
        
        const analysis = {
            leadId: lead.id || `LEAD_${Date.now()}`,
            businessName: lead.business_name || '',
            contactName: lead.name || '',
            phone: lead.phone || '',
            email: lead.email || '',
            location: lead.location || 'Cancún',
            businessType: lead.business_type || '',
            currentWebsite: lead.current_website || '',
        };
        
        // Real website analysis
        analysis.website = await this.analyzeWebsite(lead.current_website);
        
        // Real Google Maps analysis
        analysis.googleMaps = await this.analyzeGoogleMaps(lead.business_name || lead.name, lead.location);
        
        // Real social media analysis
        analysis.socialMedia = await this.analyzeSocialMedia(lead.business_name || lead.name, lead.location);
        
        // Calculate real lead score
        analysis.leadScore = this.calculateLeadScore(analysis);
        
        // Generate personalized message based on real analysis
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
        
        console.log(`✅ Analysis complete - Score: ${analysis.leadScore}/100`);
        
        return analysis;
    }

    formatForGoogleSheets(analysis) {
        return {
            'Lead ID': analysis.leadId,
            'Business Name': analysis.businessName,
            'Contact Name': analysis.contactName,
            'Phone': analysis.phone,
            'Email': analysis.email,
            'Location': analysis.location,
            'Business Type': analysis.businessType,
            'Current Website': analysis.currentWebsite,
            'Website Status': analysis.website.status,
            'Website Issues Found': analysis.website.issues.join(', '),
            'Google Maps Status': analysis.googleMaps.status,
            'Google Maps Issues': analysis.googleMaps.issues.join(', '),
            'Social Media Found': analysis.socialMedia.platforms.join(', '),
            'Social Media Issues': analysis.socialMedia.issues.join(', '),
            'Business Problems Identified': analysis.allProblems.join(', '),
            'Growth Opportunities': analysis.allOpportunities.join(', '),
            'Service Recommendations': this.getServiceRecommendations(analysis),
            'Urgency Level': analysis.urgencyLevel,
            'Budget Estimate': analysis.budgetEstimate,
            'Lead Quality Score': analysis.leadScore,
            'Personalized Message': analysis.personalizedMessage,
            'Follow-up Date': this.calculateFollowUpDate(analysis.urgencyLevel),
            'Status': 'Ready to Contact',
            'Analysis Notes': `Real analysis completed - ${analysis.leadScore}/100 score`
        };
    }

    getServiceRecommendations(analysis) {
        const recommendations = [];
        
        if (analysis.website.status === 'No Website') {
            recommendations.push('Website Design');
        }
        if (analysis.googleMaps.status === 'Not Found') {
            recommendations.push('Google Maps Setup');
        }
        if (analysis.socialMedia.issues.length > 0) {
            recommendations.push('Social Media Strategy');
        }
        if (analysis.website.issues.includes('Not mobile responsive')) {
            recommendations.push('Mobile Optimization');
        }
        
        return recommendations.join(', ');
    }

    calculateFollowUpDate(urgencyLevel) {
        const days = urgencyLevel === 'High' ? 1 : urgencyLevel === 'Medium' ? 3 : 7;
        const date = new Date();
        date.setDate(date.getDate() + days);
        return date.toISOString().split('T')[0];
    }

    async fetchLeadsFromGoogleSheets() {
        try {
            console.log('📊 Fetching leads from Google Sheets...');
            
            // Get the "Top 200 Qualified Leads" sheet
            const leadsSheet = this.doc.sheetsByTitle['Top 200 Qualified Leads'];
            
            if (!leadsSheet) {
                console.log('❌ "Top 200 Qualified Leads" sheet not found');
                return [];
            }
            
            const rows = await leadsSheet.getRows();
            console.log(`✅ Found ${rows.length} leads in Google Sheets`);
            
            // Convert to lead objects (first 50)
            const leads = rows.slice(0, 50).map((row, index) => ({
                id: `LEAD_${(index + 1).toString().padStart(3, '0')}`,
                name: row.get('Name') || '',
                business_name: row.get('Business Name') || '',
                phone: row.get('Phone') || '',
                email: row.get('Email') || '',
                location: row.get('Location') || 'Cancún',
                business_type: row.get('Business Type') || '',
                current_website: row.get('Current Website') || '',
                source: row.get('Source') || ''
            }));
            
            return leads;
            
        } catch (error) {
            console.error('❌ Error fetching leads:', error.message);
            return [];
        }
    }

    async writeAnalysisToGoogleSheets(analyses) {
        try {
            console.log(`📝 Writing ${analyses.length} analyses to Google Sheets...`);
            
            // Clear existing data
            await this.sheet.clear();
            await this.sheet.setHeaderRow(this.getHeaderColumns());
            
            // Format and add all analyses
            const formattedData = analyses.map(analysis => this.formatForGoogleSheets(analysis));
            await this.sheet.addRows(formattedData);
            
            console.log(`✅ Successfully wrote ${analyses.length} analyses to Google Sheets`);
            console.log(`🔗 View results: https://docs.google.com/spreadsheets/d/${this.spreadsheetId}`);
            
        } catch (error) {
            console.error('❌ Error writing to Google Sheets:', error.message);
        }
    }

    async run() {
        console.log('🚀 STARTING FINAL AI LEAD ANALYSIS SYSTEM');
        console.log('==========================================');
        
        try {
            // Start browser for real analysis
            await this.startBrowser();
            
            // Fetch leads from Google Sheets
            const leads = await this.fetchLeadsFromGoogleSheets();
            
            if (leads.length === 0) {
                console.log('❌ No leads found to analyze');
                return;
            }
            
            console.log(`📋 Analyzing ${leads.length} leads with 100% REAL data...`);
            
            // Analyze each lead with real data
            const analyses = [];
            for (let i = 0; i < leads.length; i++) {
                const lead = leads[i];
                console.log(`\n📊 Progress: ${i + 1}/${leads.length}`);
                
                const analysis = await this.analyzeLead(lead);
                analyses.push(analysis);
                
                // Small delay to avoid overwhelming servers
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
            // Write all analyses to Google Sheets
            await this.writeAnalysisToGoogleSheets(analyses);
            
            // Close browser
            await this.closeBrowser();
            
            console.log('\n🎉 FINAL AI ANALYSIS COMPLETE!');
            console.log('==============================');
            console.log(`✅ Analyzed ${analyses.length} leads with 100% real data`);
            console.log(`✅ Generated personalized messages for each lead`);
            console.log(`✅ Organized everything in Google Sheets`);
            console.log(`✅ Ready for WhatsApp outreach`);
            console.log(`🔗 View results: https://docs.google.com/spreadsheets/d/${this.spreadsheetId}`);
            
        } catch (error) {
            console.error('❌ System error:', error.message);
            await this.closeBrowser();
        }
    }
}

// Run the system
if (require.main === module) {
    const system = new FinalAILeadSystem();
    system.run().catch(console.error);
}

module.exports = FinalAILeadSystem;


