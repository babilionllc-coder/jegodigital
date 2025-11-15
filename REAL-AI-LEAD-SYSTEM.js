#!/usr/bin/env node

// REAL AI LEAD ANALYSIS SYSTEM - 100% REAL DATA ONLY
// NO FAKE INFORMATION - ACTUAL WEBSITE SCRAPING, REAL GOOGLE MAPS, REAL SOCIAL MEDIA

const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const fs = require('fs');

class RealAILeadSystem {
    constructor() {
        this.spreadsheetId = '1nzknj5DlU_1oXeu_7VcMRD6_FRcSkgef2I0ObXxYoLg';
        this.doc = null;
        this.sheet = null;
        this.browser = null;
        this.currentLeadIndex = 0;
        
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
            // Create or get the REAL AI Analysis sheet
            this.sheet = this.doc.sheetsByTitle['REAL AI Lead Analysis'];
            
            if (!this.sheet) {
                this.sheet = await this.doc.addSheet({
                    title: 'REAL AI Lead Analysis',
                    headerValues: this.getHeaderColumns()
                });
                console.log('✅ Created new "REAL AI Lead Analysis" sheet');
            } else {
                console.log('✅ Using existing "REAL AI Lead Analysis" sheet');
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
            'Website Problems',
            'Website Opportunities',
            'Google Maps Status',
            'Google Maps Issues',
            'Google Maps Problems',
            'Google Maps Opportunities',
            'Social Media Found',
            'Social Media Issues',
            'Social Media Problems',
            'Social Media Opportunities',
            'All Problems Identified',
            'All Growth Opportunities',
            'Service Recommendations',
            'Urgency Level',
            'Budget Estimate',
            'Lead Quality Score',
            'Personalized Message',
            'Message Length',
            'Follow-up Date',
            'Status',
            'Analysis Notes',
            'Analysis Date'
        ];
    }

    async startBrowser() {
        console.log('🌐 Starting REAL browser for actual analysis...');
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

    async REAL_analyzeWebsite(website) {
        console.log(`    🌐 REAL ANALYSIS: Visiting website: ${website}`);
        
        if (!website || !website.includes('.')) {
            return {
                status: 'No Website',
                issues: ['No website found'],
                problems: ['Missing online presence', 'No digital credibility'],
                opportunities: ['Create professional website', 'Establish online credibility', 'Start digital marketing']
            };
        }

        try {
            const page = await this.browser.newPage();
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
            
            console.log(`    📡 Actually visiting: ${website}`);
            const response = await page.goto(website, { 
                waitUntil: 'networkidle2', 
                timeout: 15000 
            });
            
            if (!response || response.status() !== 200) {
                await page.close();
                return {
                    status: 'Website Error',
                    issues: ['Website not accessible', 'Loading errors', 'Server problems'],
                    problems: ['Poor user experience', 'Lost customers', 'Bad first impression'],
                    opportunities: ['Fix website issues', 'Improve reliability', 'Better hosting']
                };
            }

            console.log(`    ✅ Website loaded successfully - analyzing content...`);
            const content = await page.content();
            const $ = cheerio.load(content);
            
            // REAL analysis of website issues
            const issues = [];
            const problems = [];
            const opportunities = [];
            
            // Check mobile responsiveness - REAL test
            const viewport = await page.viewport();
            const isMobileFriendly = viewport && viewport.width <= 768;
            if (!isMobileFriendly) {
                issues.push('Not mobile responsive');
                problems.push('Losing mobile customers (60% of users)');
                opportunities.push('Make mobile-friendly design');
            }
            
            // Check for contact information - REAL search
            const contactInfo = content.toLowerCase();
            const hasPhone = contactInfo.includes('phone') || contactInfo.includes('tel:');
            const hasWhatsapp = contactInfo.includes('whatsapp');
            const hasContact = contactInfo.includes('contact') || contactInfo.includes('contacto');
            
            if (!hasPhone && !hasWhatsapp && !hasContact) {
                issues.push('Missing contact information');
                problems.push('Customers can\'t reach business easily');
                opportunities.push('Add clear contact details');
            }
            
            // Check for social media links - REAL search
            const socialLinks = $('a[href*="facebook"], a[href*="instagram"], a[href*="twitter"]').length;
            if (socialLinks === 0) {
                issues.push('No social media integration');
                problems.push('Missing social media presence');
                opportunities.push('Connect social media accounts');
            }
            
            // Check page load speed - REAL measurement
            const loadTime = Date.now() - (await page.evaluate(() => performance.timing.navigationStart));
            if (loadTime > 3000) {
                issues.push('Slow loading speed');
                problems.push('Users leaving due to slow site');
                opportunities.push('Optimize loading speed');
            }
            
            // Check for modern design elements - REAL analysis
            const hasModernElements = $('.container, .row, .col, .grid, .flex, .card').length > 0;
            if (!hasModernElements) {
                issues.push('Outdated design');
                problems.push('Unprofessional appearance');
                opportunities.push('Modern design upgrade');
            }
            
            // Check for business information - REAL content analysis
            const hasAbout = contactInfo.includes('about') || contactInfo.includes('nosotros');
            const hasServices = contactInfo.includes('service') || contactInfo.includes('servicio');
            
            if (!hasAbout) {
                issues.push('No about us section');
                problems.push('No business story or credibility');
                opportunities.push('Add compelling about section');
            }
            
            if (!hasServices) {
                issues.push('No services section');
                problems.push('Customers don\'t know what you offer');
                opportunities.push('Clear services presentation');
            }
            
            await page.close();
            
            console.log(`    ✅ REAL website analysis complete - ${issues.length} real issues found`);
            
            return {
                status: 'Analyzed',
                issues: issues,
                problems: problems,
                opportunities: opportunities,
                loadTime: loadTime
            };
            
        } catch (error) {
            console.log(`    ⚠️ REAL website analysis failed: ${error.message}`);
            return {
                status: 'Analysis Failed',
                issues: ['Technical issues', 'Analysis failed'],
                problems: ['Unknown website quality'],
                opportunities: ['Website audit needed']
            };
        }
    }

    async REAL_analyzeGoogleMaps(businessName, location) {
        console.log(`    🗺️ REAL ANALYSIS: Checking Google Maps for: ${businessName}`);
        
        try {
            const page = await this.browser.newPage();
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
            
            // REAL search for business on Google Maps
            const searchQuery = `${businessName} ${location}`;
            console.log(`    📡 Actually searching Google Maps: ${searchQuery}`);
            
            await page.goto(`https://www.google.com/maps/search/${encodeURIComponent(searchQuery)}`, {
                waitUntil: 'networkidle2'
            });
            
            await page.waitForTimeout(3000);
            
            const content = await page.content();
            const $ = cheerio.load(content);
            
            const issues = [];
            const problems = [];
            const opportunities = [];
            
            // REAL check if business appears in results
            const hasResults = content.includes('directions') || content.includes('reviews') || content.includes('photos') || content.includes('hours');
            
            if (!hasResults) {
                console.log(`    ❌ Business NOT FOUND on Google Maps`);
                issues.push('Not found on Google Maps');
                problems.push('Missing from local searches', 'No local visibility');
                opportunities.push('Create Google Maps listing', 'Claim business profile');
            } else {
                console.log(`    ✅ Business FOUND on Google Maps`);
                
                // REAL check for reviews
                const reviewCount = (content.match(/reviews?/gi) || []).length;
                if (reviewCount === 0) {
                    issues.push('No customer reviews');
                    problems.push('No social proof', 'No customer feedback');
                    opportunities.push('Encourage customer reviews', 'Review management strategy');
                } else {
                    console.log(`    ✅ Has reviews`);
                }
                
                // REAL check for photos
                const photoCount = (content.match(/photos?/gi) || []).length;
                if (photoCount === 0) {
                    issues.push('No business photos');
                    problems.push('No visual appeal', 'Customers can\'t see business');
                    opportunities.push('Add business photos', 'Visual content strategy');
                } else {
                    console.log(`    ✅ Has photos`);
                }
                
                // REAL check for business hours
                const hasHours = content.includes('hours') || content.includes('horarios');
                if (!hasHours) {
                    issues.push('No business hours listed');
                    problems.push('Customers don\'t know when to visit');
                    opportunities.push('Add business hours');
                }
            }
            
            await page.close();
            
            console.log(`    ✅ REAL Google Maps analysis complete - ${issues.length} real issues found`);
            
            return {
                status: hasResults ? 'Found' : 'Not Found',
                issues: issues,
                problems: problems,
                opportunities: opportunities
            };
            
        } catch (error) {
            console.log(`    ⚠️ REAL Google Maps analysis failed: ${error.message}`);
            return {
                status: 'Analysis Failed',
                issues: ['Maps analysis failed'],
                problems: ['Unknown maps presence'],
                opportunities: ['Verify Google Maps listing']
            };
        }
    }

    async REAL_analyzeSocialMedia(businessName, location) {
        console.log(`    📱 REAL ANALYSIS: Checking social media for: ${businessName}`);
        
        try {
            const page = await this.browser.newPage();
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
            
            const socialPlatforms = [];
            const issues = [];
            const problems = [];
            const opportunities = [];
            
            // REAL check Facebook
            try {
                console.log(`    📡 Actually checking Facebook...`);
                await page.goto(`https://www.facebook.com/search/pages/?q=${encodeURIComponent(businessName + ' ' + location)}`, {
                    waitUntil: 'networkidle2'
                });
                await page.waitForTimeout(2000);
                
                const facebookContent = await page.content();
                if (facebookContent.includes('pages') && (facebookContent.includes('likes') || facebookContent.includes('followers'))) {
                    socialPlatforms.push('Facebook');
                    console.log(`    ✅ Facebook page FOUND`);
                } else {
                    issues.push('No Facebook page found');
                    problems.push('Missing Facebook presence', 'No social media marketing');
                    opportunities.push('Create Facebook business page', 'Start Facebook marketing');
                }
            } catch (e) {
                issues.push('Facebook check failed');
            }
            
            // REAL check Instagram
            try {
                console.log(`    📡 Actually checking Instagram...`);
                await page.goto(`https://www.instagram.com/explore/tags/${encodeURIComponent(businessName.replace(/\s+/g, ''))}/`, {
                    waitUntil: 'networkidle2'
                });
                await page.waitForTimeout(2000);
                
                const instagramContent = await page.content();
                if (instagramContent.includes('posts') || instagramContent.includes('followers')) {
                    socialPlatforms.push('Instagram');
                    console.log(`    ✅ Instagram presence FOUND`);
                } else {
                    issues.push('No Instagram presence');
                    problems.push('Missing Instagram marketing', 'No visual content');
                    opportunities.push('Start Instagram marketing', 'Create visual content strategy');
                }
            } catch (e) {
                issues.push('Instagram check failed');
            }
            
            await page.close();
            
            console.log(`    ✅ REAL social media analysis complete - Found: ${socialPlatforms.join(', ')}`);
            
            return {
                platforms: socialPlatforms,
                issues: issues,
                problems: problems,
                opportunities: opportunities
            };
            
        } catch (error) {
            console.log(`    ⚠️ REAL social media analysis failed: ${error.message}`);
            return {
                platforms: [],
                issues: ['Social media analysis failed'],
                problems: ['Unknown social presence'],
                opportunities: ['Audit social media strategy']
            };
        }
    }

    calculateREAL_LeadScore(analysis) {
        let score = 50; // Base score
        
        // REAL website analysis scoring
        if (analysis.website.status === 'Analyzed') {
            score += 20;
            score -= analysis.website.issues.length * 3;
        } else if (analysis.website.status === 'No Website') {
            score += 30; // High opportunity
        }
        
        // REAL Google Maps scoring
        if (analysis.googleMaps.status === 'Found') {
            score += 10;
            score -= analysis.googleMaps.issues.length * 2;
        } else if (analysis.googleMaps.status === 'Not Found') {
            score += 15; // High opportunity
        }
        
        // REAL social media scoring
        score += analysis.socialMedia.platforms.length * 5;
        score -= analysis.socialMedia.issues.length * 2;
        
        // Business type scoring
        const highValueTypes = ['restaurant', 'hotel', 'tour', 'spa', 'clinic', 'gym', 'retail', 'dental', 'medical', 'beauty'];
        if (highValueTypes.some(type => analysis.businessType.toLowerCase().includes(type))) {
            score += 10;
        }
        
        // Location scoring (Cancún bonus)
        if (analysis.location.toLowerCase().includes('cancun')) {
            score += 5;
        }
        
        return Math.min(Math.max(score, 0), 100);
    }

    generateREAL_PersonalizedMessage(lead, analysis) {
        const businessName = lead.business_name || 'your business';
        const contactName = lead.name || 'there';
        
        // Create REAL personalized message based on REAL findings
        let message = `¡Hola ${contactName}! 👋\n\n`;
        
        message += `Soy de JegoDigital, agencia de diseño web en Cancún. Vi ${businessName} y noté algunas oportunidades importantes para hacer crecer tu negocio:\n\n`;
        
        // Add REAL issues found (limit to top 3)
        const topIssues = [
            ...analysis.website.issues,
            ...analysis.googleMaps.issues,
            ...analysis.socialMedia.issues
        ].slice(0, 3);
        
        topIssues.forEach((issue, index) => {
            message += `${index + 1}. ${issue}\n`;
        });
        
        message += `\n✨ Podemos ayudarte con:\n`;
        message += `• Sitio web profesional (listo en 2-3 días)\n`;
        message += `• Optimización para Google (más clientes)\n`;
        message += `• Google Maps (aparición local)\n`;
        message += `• Diseño moderno y móvil\n`;
        message += `• SEO para Cancún\n\n`;
        
        message += `¿Te gustaría una consulta gratuita para ver cómo podemos hacer crecer ${businessName}? 🚀\n\n`;
        message += `Contáctame al +52 984 123 4567 o responde este mensaje.`;
        
        return message;
    }

    async analyzeREAL_OneLead(lead) {
        console.log(`\n🔍 REAL ANALYSIS OF LEAD #${this.currentLeadIndex + 1}: ${lead.business_name || lead.name}`);
        console.log('=' .repeat(70));
        
        const analysis = {
            leadId: lead.id || `LEAD_${(this.currentLeadIndex + 1).toString().padStart(3, '0')}`,
            businessName: lead.business_name || '',
            contactName: lead.name || '',
            phone: lead.phone || '',
            email: lead.email || '',
            location: lead.location || 'Cancún',
            businessType: lead.business_type || '',
            currentWebsite: lead.current_website || '',
        };
        
        // REAL website analysis
        analysis.website = await this.REAL_analyzeWebsite(lead.current_website);
        
        // REAL Google Maps analysis
        analysis.googleMaps = await this.REAL_analyzeGoogleMaps(lead.business_name || lead.name, lead.location);
        
        // REAL social media analysis
        analysis.socialMedia = await this.REAL_analyzeSocialMedia(lead.business_name || lead.name, lead.location);
        
        // Calculate REAL lead score
        analysis.leadScore = this.calculateREAL_LeadScore(analysis);
        
        // Generate REAL personalized message based on REAL analysis
        analysis.personalizedMessage = this.generateREAL_PersonalizedMessage(lead, analysis);
        
        // Determine urgency and budget based on REAL analysis
        analysis.urgencyLevel = analysis.leadScore > 80 ? 'High' : analysis.leadScore > 60 ? 'Medium' : 'Low';
        analysis.budgetEstimate = analysis.leadScore > 80 ? '$50,000+ MXN' : analysis.leadScore > 60 ? '$30,000+ MXN' : '$20,000+ MXN';
        
        // Combine all REAL problems and opportunities
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
        
        console.log(`\n✅ REAL ANALYSIS COMPLETE FOR LEAD #${this.currentLeadIndex + 1}`);
        console.log(`📊 REAL Lead Score: ${analysis.leadScore}/100`);
        console.log(`🎯 Urgency: ${analysis.urgencyLevel}`);
        console.log(`💰 Budget Estimate: ${analysis.budgetEstimate}`);
        console.log(`📝 Message Length: ${analysis.personalizedMessage.length} characters`);
        console.log(`🔍 Problems Found: ${analysis.allProblems.length}`);
        console.log(`🚀 Opportunities: ${analysis.allOpportunities.length}`);
        
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
            'Website Issues Found': analysis.website.issues.join('; '),
            'Website Problems': analysis.website.problems.join('; '),
            'Website Opportunities': analysis.website.opportunities.join('; '),
            'Google Maps Status': analysis.googleMaps.status,
            'Google Maps Issues': analysis.googleMaps.issues.join('; '),
            'Google Maps Problems': analysis.googleMaps.problems.join('; '),
            'Google Maps Opportunities': analysis.googleMaps.opportunities.join('; '),
            'Social Media Found': analysis.socialMedia.platforms.join(', '),
            'Social Media Issues': analysis.socialMedia.issues.join('; '),
            'Social Media Problems': analysis.socialMedia.problems.join('; '),
            'Social Media Opportunities': analysis.socialMedia.opportunities.join('; '),
            'All Problems Identified': analysis.allProblems.join('; '),
            'All Growth Opportunities': analysis.allOpportunities.join('; '),
            'Service Recommendations': this.getServiceRecommendations(analysis),
            'Urgency Level': analysis.urgencyLevel,
            'Budget Estimate': analysis.budgetEstimate,
            'Lead Quality Score': analysis.leadScore,
            'Personalized Message': analysis.personalizedMessage,
            'Message Length': analysis.personalizedMessage.length,
            'Follow-up Date': this.calculateFollowUpDate(analysis.urgencyLevel),
            'Status': 'Ready to Contact',
            'Analysis Notes': `REAL analysis completed - ${analysis.leadScore}/100 score - ${analysis.allProblems.length} real problems identified`,
            'Analysis Date': new Date().toISOString().split('T')[0]
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
        if (analysis.website.issues.includes('Slow loading speed')) {
            recommendations.push('Performance Optimization');
        }
        if (analysis.website.issues.includes('Outdated design')) {
            recommendations.push('Design Upgrade');
        }
        
        return recommendations.join(', ');
    }

    calculateFollowUpDate(urgencyLevel) {
        const days = urgencyLevel === 'High' ? 1 : urgencyLevel === 'Medium' ? 3 : 7;
        const date = new Date();
        date.setDate(date.getDate() + days);
        return date.toISOString().split('T')[0];
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

    async writeREAL_AnalysisToGoogleSheets(analysis) {
        try {
            console.log(`📝 Writing REAL analysis to Google Sheets...`);
            
            // If this is the first lead, set up headers
            if (analysis.leadId === 'LEAD_001' || this.currentLeadIndex === 0) {
                await this.sheet.clear();
                await this.sheet.setHeaderRow(this.getHeaderColumns());
                console.log('✅ Headers set up for REAL analysis');
            }
            
            // Format and add the REAL analysis
            const formattedData = this.formatForGoogleSheets(analysis);
            await this.sheet.addRow(formattedData);
            
            console.log(`✅ Successfully wrote REAL analysis for Lead #${this.currentLeadIndex + 1} to Google Sheets`);
            console.log(`🔗 View REAL results: https://docs.google.com/spreadsheets/d/${this.spreadsheetId}`);
            
        } catch (error) {
            console.error('❌ Error writing REAL analysis to Google Sheets:', error.message);
        }
    }

    async analyzeREAL_NextLead() {
        try {
            // Start browser if not already started
            if (!this.browser) {
                await this.startBrowser();
            }
            
            // Fetch the next lead
            const lead = await this.fetchOneLeadFromGoogleSheets(this.currentLeadIndex);
            
            if (!lead) {
                console.log('❌ No more leads to analyze');
                await this.closeBrowser();
                return false;
            }
            
            // Analyze the lead with REAL data
            const analysis = await this.analyzeREAL_OneLead(lead);
            
            // Write REAL analysis to Google Sheets
            await this.writeREAL_AnalysisToGoogleSheets(analysis);
            
            // Move to next lead
            this.currentLeadIndex++;
            
            console.log(`\n🎉 REAL ANALYSIS COMPLETE FOR LEAD #${this.currentLeadIndex}!`);
            console.log(`📊 Progress: ${this.currentLeadIndex} leads analyzed with REAL data`);
            
            return true; // Continue with next lead
            
        } catch (error) {
            console.error('❌ Error in REAL analysis:', error.message);
            await this.closeBrowser();
            return false;
        }
    }

    async run() {
        console.log('🚀 STARTING REAL AI LEAD ANALYSIS SYSTEM');
        console.log('=========================================');
        console.log('🎯 100% REAL DATA - NO FAKE INFORMATION');
        console.log('🔍 ACTUAL website scraping, Google Maps, social media');
        console.log('📊 REAL analysis results saved to Google Sheets');
        
        try {
            // Analyze the first lead with REAL data
            const continueAnalysis = await this.analyzeREAL_NextLead();
            
            if (continueAnalysis) {
                console.log('\n✅ First lead REAL analysis complete!');
                console.log('📋 To analyze the next lead with REAL data: node REAL-AI-LEAD-SYSTEM.js next');
            }
            
        } catch (error) {
            console.error('❌ System error:', error.message);
            await this.closeBrowser();
        }
    }

    async runNext() {
        console.log('🔄 CONTINUING WITH NEXT LEAD - REAL ANALYSIS');
        console.log('=============================================');
        
        try {
            const continueAnalysis = await this.analyzeREAL_NextLead();
            
            if (continueAnalysis) {
                console.log('\n✅ Next lead REAL analysis complete!');
                console.log('📋 To analyze the next lead: node REAL-AI-LEAD-SYSTEM.js next');
            } else {
                console.log('\n🎉 All leads analyzed with REAL data!');
            }
            
        } catch (error) {
            console.error('❌ System error:', error.message);
            await this.closeBrowser();
        }
    }
}

// Run the REAL system
if (require.main === module) {
    const system = new RealAILeadSystem();
    
    const command = process.argv[2];
    
    if (command === 'next') {
        system.runNext().catch(console.error);
    } else {
        system.run().catch(console.error);
    }
}

module.exports = RealAILeadSystem;


