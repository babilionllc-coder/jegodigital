#!/usr/bin/env node

// ONE LEAD AT A TIME ANALYSIS SYSTEM
// Analyzes one lead completely, then writes to Google Sheet
// Perfect for seeing progress and ensuring quality

const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const fs = require('fs');

class OneLeadAtATime {
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
            // Create or get the AI Analysis sheet
            this.sheet = this.doc.sheetsByTitle['One Lead Analysis'];
            
            if (!this.sheet) {
                this.sheet = await this.doc.addSheet({
                    title: 'One Lead Analysis',
                    headerValues: this.getHeaderColumns()
                });
                console.log('✅ Created new "One Lead Analysis" sheet');
            } else {
                console.log('✅ Using existing "One Lead Analysis" sheet');
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
        console.log(`    🌐 Analyzing website: ${website}`);
        
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
                problems.push('Losing mobile customers (60% of users)');
                opportunities.push('Make mobile-friendly design');
            }
            
            // Check for contact information
            const contactInfo = content.toLowerCase();
            const hasPhone = contactInfo.includes('phone') || contactInfo.includes('tel:');
            const hasWhatsapp = contactInfo.includes('whatsapp');
            const hasContact = contactInfo.includes('contact') || contactInfo.includes('contacto');
            
            if (!hasPhone && !hasWhatsapp && !hasContact) {
                issues.push('Missing contact information');
                problems.push('Customers can\'t reach business easily');
                opportunities.push('Add clear contact details');
            }
            
            // Check for social media links
            const socialLinks = $('a[href*="facebook"], a[href*="instagram"], a[href*="twitter"]').length;
            if (socialLinks === 0) {
                issues.push('No social media integration');
                problems.push('Missing social media presence');
                opportunities.push('Connect social media accounts');
            }
            
            // Check page load speed (basic)
            const loadTime = Date.now() - (await page.evaluate(() => performance.timing.navigationStart));
            if (loadTime > 3000) {
                issues.push('Slow loading speed');
                problems.push('Users leaving due to slow site');
                opportunities.push('Optimize loading speed');
            }
            
            // Check for modern design elements
            const hasModernElements = $('.container, .row, .col, .grid, .flex, .card').length > 0;
            if (!hasModernElements) {
                issues.push('Outdated design');
                problems.push('Unprofessional appearance');
                opportunities.push('Modern design upgrade');
            }
            
            // Check for business information
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
            
            console.log(`    ✅ Website analysis complete - ${issues.length} issues found`);
            
            return {
                status: 'Analyzed',
                issues: issues,
                problems: problems,
                opportunities: opportunities,
                loadTime: loadTime
            };
            
        } catch (error) {
            console.log(`    ⚠️ Website analysis failed: ${error.message}`);
            return {
                status: 'Analysis Failed',
                issues: ['Technical issues', 'Analysis failed'],
                problems: ['Unknown website quality'],
                opportunities: ['Website audit needed']
            };
        }
    }

    async analyzeGoogleMaps(businessName, location) {
        console.log(`    🗺️ Checking Google Maps for: ${businessName}`);
        
        try {
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
            const hasResults = content.includes('directions') || content.includes('reviews') || content.includes('photos') || content.includes('hours');
            
            if (!hasResults) {
                issues.push('Not found on Google Maps');
                problems.push('Missing from local searches', 'No local visibility');
                opportunities.push('Create Google Maps listing', 'Claim business profile');
            } else {
                console.log(`    ✅ Found on Google Maps`);
                
                // Check for reviews
                const reviewCount = (content.match(/reviews?/gi) || []).length;
                if (reviewCount === 0) {
                    issues.push('No customer reviews');
                    problems.push('No social proof', 'No customer feedback');
                    opportunities.push('Encourage customer reviews', 'Review management strategy');
                } else {
                    console.log(`    ✅ Has reviews`);
                }
                
                // Check for photos
                const photoCount = (content.match(/photos?/gi) || []).length;
                if (photoCount === 0) {
                    issues.push('No business photos');
                    problems.push('No visual appeal', 'Customers can\'t see business');
                    opportunities.push('Add business photos', 'Visual content strategy');
                } else {
                    console.log(`    ✅ Has photos`);
                }
                
                // Check for business hours
                const hasHours = content.includes('hours') || content.includes('horarios');
                if (!hasHours) {
                    issues.push('No business hours listed');
                    problems.push('Customers don\'t know when to visit');
                    opportunities.push('Add business hours');
                }
            }
            
            await page.close();
            
            console.log(`    ✅ Google Maps analysis complete - ${issues.length} issues found`);
            
            return {
                status: hasResults ? 'Found' : 'Not Found',
                issues: issues,
                problems: problems,
                opportunities: opportunities
            };
            
        } catch (error) {
            console.log(`    ⚠️ Google Maps analysis failed: ${error.message}`);
            return {
                status: 'Analysis Failed',
                issues: ['Maps analysis failed'],
                problems: ['Unknown maps presence'],
                opportunities: ['Verify Google Maps listing']
            };
        }
    }

    async analyzeSocialMedia(businessName, location) {
        console.log(`    📱 Checking social media for: ${businessName}`);
        
        try {
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
                if (facebookContent.includes('pages') && (facebookContent.includes('likes') || facebookContent.includes('followers'))) {
                    socialPlatforms.push('Facebook');
                    console.log(`    ✅ Found Facebook page`);
                } else {
                    issues.push('No Facebook page found');
                    problems.push('Missing Facebook presence', 'No social media marketing');
                    opportunities.push('Create Facebook business page', 'Start Facebook marketing');
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
                    console.log(`    ✅ Found Instagram presence`);
                } else {
                    issues.push('No Instagram presence');
                    problems.push('Missing Instagram marketing', 'No visual content');
                    opportunities.push('Start Instagram marketing', 'Create visual content strategy');
                }
            } catch (e) {
                issues.push('Instagram check failed');
            }
            
            await page.close();
            
            console.log(`    ✅ Social media analysis complete - Found: ${socialPlatforms.join(', ')}`);
            
            return {
                platforms: socialPlatforms,
                issues: issues,
                problems: problems,
                opportunities: opportunities
            };
            
        } catch (error) {
            console.log(`    ⚠️ Social media analysis failed: ${error.message}`);
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
        
        // Add specific issues found (limit to top 3)
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
            'Analysis Notes': `Real analysis completed - ${analysis.leadScore}/100 score - ${analysis.allProblems.length} problems identified`,
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
            await this.closeBrowser();
            return false;
        }
    }

    async run() {
        console.log('🚀 STARTING ONE LEAD AT A TIME ANALYSIS');
        console.log('=======================================');
        
        try {
            // Analyze the first lead
            const continueAnalysis = await this.analyzeNextLead();
            
            if (continueAnalysis) {
                console.log('\n✅ First lead analysis complete!');
                console.log('📋 To analyze the next lead, run this command again');
                console.log('🔄 Or run: node one-lead-at-a-time.js next');
            }
            
        } catch (error) {
            console.error('❌ System error:', error.message);
            await this.closeBrowser();
        }
    }

    async runNext() {
        console.log('🔄 CONTINUING WITH NEXT LEAD');
        console.log('============================');
        
        try {
            const continueAnalysis = await this.analyzeNextLead();
            
            if (continueAnalysis) {
                console.log('\n✅ Next lead analysis complete!');
                console.log('📋 To analyze the next lead, run: node one-lead-at-a-time.js next');
            } else {
                console.log('\n🎉 All leads analyzed!');
            }
            
        } catch (error) {
            console.error('❌ System error:', error.message);
            await this.closeBrowser();
        }
    }
}

// Run the system
if (require.main === module) {
    const system = new OneLeadAtATime();
    
    const command = process.argv[2];
    
    if (command === 'next') {
        system.runNext().catch(console.error);
    } else {
        system.run().catch(console.error);
    }
}

module.exports = OneLeadAtATime;


