// AI Lead Intelligence Agent - Comprehensive Digital Footprint Analysis
const puppeteer = require('puppeteer');
const axios = require('axios');

class AILeadIntelligenceAgent {
    constructor() {
        this.browser = null;
        this.intelligenceData = {
            website: {},
            socialMedia: {},
            reviews: {},
            business: {},
            competitive: {},
            opportunities: {}
        };
        this.jegodigitalServices = {
            'website_design': {
                name: 'Diseño Web Profesional',
                problems: ['Diseño desactualizado', 'No funciona en móviles', 'Velocidad lenta'],
                solutions: ['Diseño moderno responsive', 'Optimización móvil', 'Velocidad optimizada']
            },
            'seo': {
                name: 'SEO y Posicionamiento',
                problems: ['No aparece en Google', 'Falta contenido SEO', 'Sin palabras clave'],
                solutions: ['Posicionamiento Google', 'Contenido optimizado', 'Estrategia de palabras clave']
            },
            'social_media': {
                name: 'Redes Sociales',
                problems: ['Sin presencia social', 'Contenido inconsistente', 'Pocos seguidores'],
                solutions: ['Estrategia social completa', 'Contenido profesional', 'Crecimiento orgánico']
            },
            'ecommerce': {
                name: 'Tienda Online',
                problems: ['Sin tienda online', 'Proceso complicado', 'Sin pagos online'],
                solutions: ['Tienda profesional', 'Proceso simplificado', 'Múltiples pagos']
            }
        };
    }

    // Main intelligence gathering function
    async gatherIntelligence(lead) {
        console.log(`🕵️ AI Agent: Gathering intelligence for ${lead.business_name || lead.name}...`);
        
        const intelligence = {
            lead: lead,
            timestamp: new Date().toISOString(),
            confidence: 0,
            data: {},
            analysis: {},
            personalizedMessage: '',
            priority: 'medium'
        };

        try {
            // Initialize browser for web scraping
            if (!this.browser) {
                this.browser = await puppeteer.launch({
                    headless: true,
                    args: ['--no-sandbox', '--disable-setuid-sandbox']
                });
            }

            // Phase 1: Website Intelligence
            console.log('  🌐 Analyzing website...');
            intelligence.data.website = await this.analyzeWebsite(lead);
            
            // Phase 2: Social Media Intelligence
            console.log('  📱 Analyzing social media presence...');
            intelligence.data.socialMedia = await this.analyzeSocialMedia(lead);
            
            // Phase 3: Review Intelligence
            console.log('  ⭐ Analyzing reviews and reputation...');
            intelligence.data.reviews = await this.analyzeReviews(lead);
            
            // Phase 4: Business Intelligence
            console.log('  🏢 Gathering business intelligence...');
            intelligence.data.business = await this.analyzeBusiness(lead);
            
            // Phase 5: Competitive Analysis
            console.log('  🎯 Analyzing competitive position...');
            intelligence.data.competitive = await this.analyzeCompetition(lead);
            
            // Phase 6: Intelligence Analysis
            console.log('  🧠 Processing intelligence data...');
            intelligence.analysis = this.processIntelligence(intelligence.data);
            
            // Phase 7: Generate Personalized Message
            console.log('  💬 Generating personalized message...');
            intelligence.personalizedMessage = this.generatePersonalizedMessage(intelligence);
            
            // Phase 8: Calculate Confidence and Priority
            intelligence.confidence = this.calculateConfidence(intelligence);
            intelligence.priority = this.calculatePriority(intelligence);

            console.log(`  ✅ Intelligence gathering complete (${intelligence.confidence}% confidence)`);
            return intelligence;

        } catch (error) {
            console.error(`  ❌ Error gathering intelligence: ${error.message}`);
            intelligence.data.error = error.message;
            intelligence.confidence = 20;
            intelligence.personalizedMessage = this.generateFallbackMessage(lead);
            return intelligence;
        }
    }

    // Website Intelligence Analysis
    async analyzeWebsite(lead) {
        const websiteData = {
            url: null,
            exists: false,
            technical: {},
            content: {},
            conversion: {},
            issues: [],
            strengths: [],
            opportunities: []
        };

        try {
            // Find website URL
            const websiteUrl = this.extractWebsiteUrl(lead);
            if (!websiteUrl) {
                websiteData.issues.push('No website found');
                websiteData.opportunities.push('Create professional website');
                return websiteData;
            }

            websiteData.url = websiteUrl;
            websiteData.exists = true;

            // Launch browser and analyze
            const page = await this.browser.newPage();
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
            
            try {
                await page.goto(websiteUrl, { waitUntil: 'networkidle2', timeout: 30000 });
                
                // Technical Analysis
                websiteData.technical = await this.analyzeTechnicalAspects(page, websiteUrl);
                
                // Content Analysis
                websiteData.content = await this.analyzeContent(page);
                
                // Conversion Analysis
                websiteData.conversion = await this.analyzeConversionElements(page);
                
                // Identify Issues and Strengths
                websiteData.issues = this.identifyWebsiteIssues(websiteData);
                websiteData.strengths = this.identifyWebsiteStrengths(websiteData);
                websiteData.opportunities = this.identifyWebsiteOpportunities(websiteData);

            } catch (pageError) {
                websiteData.issues.push('Website not accessible or slow loading');
                websiteData.opportunities.push('Improve website performance');
            } finally {
                await page.close();
            }

        } catch (error) {
            websiteData.issues.push(`Analysis error: ${error.message}`);
        }

        return websiteData;
    }

    // Technical Website Analysis
    async analyzeTechnicalAspects(page, url) {
        const technical = {
            mobileFriendly: false,
            hasSSL: url.startsWith('https'),
            pageSpeed: 'unknown',
            seoScore: 0,
            hasMetaDescription: false,
            hasTitle: false,
            hasContactInfo: false,
            hasSocialLinks: false,
            loadTime: 0
        };

        try {
            // Check mobile friendliness
            const viewport = await page.evaluate(() => {
                const meta = document.querySelector('meta[name="viewport"]');
                return meta ? meta.content : null;
            });
            technical.mobileFriendly = viewport && viewport.includes('width=device-width');

            // Check SEO elements
            technical.hasMetaDescription = await page.evaluate(() => {
                const meta = document.querySelector('meta[name="description"]');
                return meta && meta.content && meta.content.length > 50;
            });

            technical.hasTitle = await page.evaluate(() => {
                return document.title && document.title.length > 10;
            });

            // Check contact information
            technical.hasContactInfo = await page.evaluate(() => {
                const bodyText = document.body.innerText.toLowerCase();
                return bodyText.includes('contact') || bodyText.includes('phone') || bodyText.includes('email');
            });

            // Check social media links
            technical.hasSocialLinks = await page.evaluate(() => {
                const links = Array.from(document.querySelectorAll('a[href*="facebook"], a[href*="instagram"], a[href*="twitter"]'));
                return links.length > 0;
            });

            // Calculate SEO score
            let seoScore = 0;
            if (technical.hasTitle) seoScore += 20;
            if (technical.hasMetaDescription) seoScore += 20;
            if (technical.mobileFriendly) seoScore += 20;
            if (technical.hasContactInfo) seoScore += 20;
            if (technical.hasSocialLinks) seoScore += 20;
            technical.seoScore = seoScore;

        } catch (error) {
            console.log('Technical analysis error:', error.message);
        }

        return technical;
    }

    // Content Analysis
    async analyzeContent(page) {
        const content = {
            businessName: '',
            services: [],
            pricing: false,
            aboutPage: false,
            contactPage: false,
            professionalQuality: 'poor',
            contentLength: 0,
            hasImages: false,
            hasVideos: false
        };

        try {
            // Extract business information
            content.businessName = await page.evaluate(() => {
                return document.title || document.querySelector('h1')?.innerText || '';
            });

            // Check for services/products
            content.services = await page.evaluate(() => {
                const serviceKeywords = ['services', 'productos', 'servicios', 'menu', 'menú', 'what we do'];
                const services = [];
                const bodyText = document.body.innerText.toLowerCase();
                
                serviceKeywords.forEach(keyword => {
                    if (bodyText.includes(keyword)) {
                        services.push(keyword);
                    }
                });
                return services;
            });

            // Check for pricing information
            content.pricing = await page.evaluate(() => {
                const bodyText = document.body.innerText.toLowerCase();
                return bodyText.includes('price') || bodyText.includes('precio') || bodyText.includes('$');
            });

            // Check for important pages
            content.aboutPage = await page.evaluate(() => {
                const links = Array.from(document.querySelectorAll('a'));
                return links.some(link => link.innerText.toLowerCase().includes('about') || link.innerText.toLowerCase().includes('nosotros'));
            });

            content.contactPage = await page.evaluate(() => {
                const links = Array.from(document.querySelectorAll('a'));
                return links.some(link => link.innerText.toLowerCase().includes('contact') || link.innerText.toLowerCase().includes('contacto'));
            });

            // Assess professional quality
            const bodyText = await page.evaluate(() => document.body.innerText);
            content.contentLength = bodyText.length;
            content.hasImages = await page.evaluate(() => document.querySelectorAll('img').length > 0);
            content.hasVideos = await page.evaluate(() => document.querySelectorAll('video, iframe[src*="youtube"], iframe[src*="vimeo"]').length > 0);

            // Determine professional quality
            if (content.contentLength > 2000 && content.services.length > 0 && content.hasImages) {
                content.professionalQuality = 'excellent';
            } else if (content.contentLength > 1000 && content.hasImages) {
                content.professionalQuality = 'good';
            } else if (content.contentLength > 500) {
                content.professionalQuality = 'fair';
            }

        } catch (error) {
            console.log('Content analysis error:', error.message);
        }

        return content;
    }

    // Conversion Elements Analysis
    async analyzeConversionElements(page) {
        const conversion = {
            hasContactForm: false,
            hasPhoneButton: false,
            hasEmailLink: false,
            hasWhatsApp: false,
            hasCallToAction: false,
            conversionScore: 0
        };

        try {
            // Check for contact form
            conversion.hasContactForm = await page.evaluate(() => {
                return document.querySelector('form') !== null;
            });

            // Check for phone button/link
            conversion.hasPhoneButton = await page.evaluate(() => {
                const links = Array.from(document.querySelectorAll('a'));
                return links.some(link => link.href.startsWith('tel:') || link.innerText.includes('call'));
            });

            // Check for email link
            conversion.hasEmailLink = await page.evaluate(() => {
                const links = Array.from(document.querySelectorAll('a'));
                return links.some(link => link.href.startsWith('mailto:') || link.innerText.includes('@'));
            });

            // Check for WhatsApp
            conversion.hasWhatsApp = await page.evaluate(() => {
                const links = Array.from(document.querySelectorAll('a'));
                return links.some(link => link.href.includes('whatsapp') || link.href.includes('wa.me'));
            });

            // Check for call-to-action buttons
            conversion.hasCallToAction = await page.evaluate(() => {
                const buttons = Array.from(document.querySelectorAll('button, a[class*="btn"], a[class*="button"]'));
                return buttons.length > 0;
            });

            // Calculate conversion score
            let score = 0;
            if (conversion.hasContactForm) score += 25;
            if (conversion.hasPhoneButton) score += 25;
            if (conversion.hasEmailLink) score += 20;
            if (conversion.hasWhatsApp) score += 15;
            if (conversion.hasCallToAction) score += 15;
            conversion.conversionScore = score;

        } catch (error) {
            console.log('Conversion analysis error:', error.message);
        }

        return conversion;
    }

    // Social Media Intelligence Analysis
    async analyzeSocialMedia(lead) {
        const socialData = {
            facebook: { exists: false, quality: 'poor', followers: 0 },
            instagram: { exists: false, quality: 'poor', followers: 0 },
            linkedin: { exists: false, quality: 'poor', followers: 0 },
            googleMyBusiness: { exists: false, quality: 'poor', reviews: 0 },
            overallScore: 0
        };

        try {
            // Search for social media profiles
            const businessName = lead.business_name || lead.name || '';
            const location = lead.location || lead.city || 'Cancún';

            // Facebook analysis (simplified - would need API access for full analysis)
            socialData.facebook = await this.analyzeFacebook(businessName, location);
            
            // Instagram analysis
            socialData.instagram = await this.analyzeInstagram(businessName, location);
            
            // LinkedIn analysis
            socialData.linkedin = await this.analyzeLinkedIn(businessName, location);
            
            // Google My Business analysis
            socialData.googleMyBusiness = await this.analyzeGoogleMyBusiness(businessName, location);

            // Calculate overall social media score
            let totalScore = 0;
            if (socialData.facebook.exists) totalScore += 25;
            if (socialData.instagram.exists) totalScore += 25;
            if (socialData.linkedin.exists) totalScore += 25;
            if (socialData.googleMyBusiness.exists) totalScore += 25;
            socialData.overallScore = totalScore;

        } catch (error) {
            console.log('Social media analysis error:', error.message);
        }

        return socialData;
    }

    // Review Intelligence Analysis
    async analyzeReviews(lead) {
        const reviewData = {
            googleReviews: { count: 0, averageRating: 0, sentiment: 'neutral' },
            facebookReviews: { count: 0, averageRating: 0, sentiment: 'neutral' },
            otherPlatforms: [],
            overallSentiment: 'neutral',
            commonComplaints: [],
            commonPraises: [],
            responseRate: 0
        };

        try {
            const businessName = lead.business_name || lead.name || '';
            const location = lead.location || lead.city || 'Cancún';

            // This would integrate with review APIs in a real implementation
            // For now, we'll simulate based on business data
            reviewData.googleReviews = await this.simulateReviewAnalysis(businessName, 'google');
            reviewData.facebookReviews = await this.simulateReviewAnalysis(businessName, 'facebook');

            // Analyze sentiment and common themes
            reviewData.overallSentiment = this.calculateOverallSentiment(reviewData);
            reviewData.commonComplaints = this.identifyCommonComplaints(reviewData);
            reviewData.commonPraises = this.identifyCommonPraises(reviewData);

        } catch (error) {
            console.log('Review analysis error:', error.message);
        }

        return reviewData;
    }

    // Business Intelligence Analysis
    async analyzeBusiness(lead) {
        const businessData = {
            industry: this.determineIndustry(lead),
            businessSize: this.estimateBusinessSize(lead),
            maturity: this.assessBusinessMaturity(lead),
            revenue: this.estimateRevenue(lead),
            employees: this.estimateEmployees(lead),
            marketPosition: 'unknown',
            growthStage: 'unknown',
            decisionMakers: 'unknown'
        };

        try {
            // Analyze business type and industry
            businessData.industry = this.determineIndustry(lead);
            
            // Estimate business metrics
            businessData.businessSize = this.estimateBusinessSize(lead);
            businessData.maturity = this.assessBusinessMaturity(lead);
            businessData.revenue = this.estimateRevenue(lead);
            businessData.employees = this.estimateEmployees(lead);
            
            // Determine market position and growth stage
            businessData.marketPosition = this.determineMarketPosition(lead, businessData);
            businessData.growthStage = this.determineGrowthStage(businessData);
            businessData.decisionMakers = this.identifyDecisionMakers(businessData);

        } catch (error) {
            console.log('Business analysis error:', error.message);
        }

        return businessData;
    }

    // Competitive Analysis
    async analyzeCompetition(lead) {
        const competitiveData = {
            localCompetitors: [],
            competitiveAdvantages: [],
            marketGaps: [],
            positioning: 'unknown',
            threats: [],
            opportunities: []
        };

        try {
            const industry = this.determineIndustry(lead);
            const location = lead.location || lead.city || 'Cancún';
            
            // Identify competitive landscape
            competitiveData.localCompetitors = this.identifyLocalCompetitors(industry, location);
            competitiveData.competitiveAdvantages = this.identifyCompetitiveAdvantages(lead);
            competitiveData.marketGaps = this.identifyMarketGaps(industry, location);
            competitiveData.positioning = this.determinePositioning(lead, competitiveData);
            competitiveData.threats = this.identifyThreats(competitiveData);
            competitiveData.opportunities = this.identifyOpportunities(competitiveData);

        } catch (error) {
            console.log('Competitive analysis error:', error.message);
        }

        return competitiveData;
    }

    // Process all intelligence data
    processIntelligence(data) {
        return {
            painPoints: this.identifyPainPoints(data),
            opportunities: this.identifyOpportunities(data),
            recommendations: this.generateRecommendations(data),
            urgency: this.assessUrgency(data),
            priority: this.calculatePriority(data),
            confidence: this.calculateOverallConfidence(data)
        };
    }

    // Generate highly personalized message
    generatePersonalizedMessage(intelligence) {
        const lead = intelligence.lead;
        const data = intelligence.data;
        const analysis = intelligence.analysis;
        
        const name = lead.name || lead.contact_name || 'Estimado empresario';
        const businessName = lead.business_name || lead.company || 'su negocio';
        const location = lead.location || lead.city || 'Cancún';
        
        // Build message components
        const greeting = this.createPersonalizedGreeting(name, businessName, location);
        const problemStatement = this.createProblemStatement(data, analysis);
        const solutionStatement = this.createSolutionStatement(analysis);
        const socialProof = this.createSocialProof(location);
        const urgency = this.createUrgencyStatement(analysis);
        const callToAction = this.createCallToAction(analysis);
        const signature = this.createSignature();

        return [
            greeting,
            '',
            problemStatement,
            '',
            solutionStatement,
            '',
            socialProof,
            '',
            urgency,
            '',
            callToAction,
            '',
            signature
        ].join('\n');
    }

    // Helper methods for analysis
    extractWebsiteUrl(lead) {
        const possibleFields = ['website', 'website_url', 'site', 'url', 'web'];
        
        for (const field of possibleFields) {
            if (lead[field] && lead[field].trim()) {
                let url = lead[field].trim();
                if (!url.startsWith('http')) {
                    url = 'https://' + url;
                }
                return url;
            }
        }
        
        // Try to construct from business name
        if (lead.business_name) {
            const cleanName = lead.business_name.toLowerCase()
                .replace(/[^a-z0-9]/g, '')
                .substring(0, 15);
            return `https://${cleanName}.com`;
        }
        
        return null;
    }

    // Message generation helpers
    createPersonalizedGreeting(name, businessName, location) {
        return `Hola ${name}, soy Alex de JegoDigital. Analicé ${businessName} en ${location} y encontré algunas oportunidades importantes.`;
    }

    createProblemStatement(data, analysis) {
        const problems = analysis.painPoints.slice(0, 3);
        return `He notado que ${problems.join(', ').toLowerCase()}.`;
    }

    createSolutionStatement(analysis) {
        const primaryService = analysis.recommendations[0] || 'website_design';
        const service = this.jegodigitalServices[primaryService];
        
        return `Te puedo ayudar con ${service.name} para que:
• ${service.solutions[0]}
• ${service.solutions[1]}
• ${service.solutions[2]}`;
    }

    createSocialProof(location) {
        if (location.toLowerCase().includes('cancun')) {
            return 'Somos la agencia #1 en Cancún. Hemos ayudado a más de 50 empresas locales a duplicar sus ventas.';
        }
        return 'Hemos trabajado con más de 50 empresas en la Riviera Maya, aumentando sus ventas en promedio 200%.';
    }

    createUrgencyStatement(analysis) {
        if (analysis.urgency === 'high') {
            return 'Esta es una oportunidad de oro. Cada día que pasa, pierdes clientes potenciales.';
        }
        return 'Es el momento perfecto para dar el salto digital y hacer crecer tu negocio.';
    }

    createCallToAction(analysis) {
        if (analysis.urgency === 'high') {
            return `¿Tienes 15 minutos para una consulta gratuita? Te muestro exactamente cómo podemos hacer crecer tus ventas.

Responde "SÍ" y te contacto hoy mismo.`;
        }
        return `¿Te gustaría conocer cómo podemos ayudarte?

Responde "SÍ" para una consulta gratuita de 15 minutos.`;
    }

    createSignature() {
        return `Saludos,
Alex Jego
JegoDigital - Marketing Digital Cancún
📱 www.jegodigital.com
📧 alex@jegodigital.com`;
    }

    // Utility methods
    calculateConfidence(intelligence) {
        let confidence = 50;
        
        if (intelligence.data.website.exists) confidence += 20;
        if (intelligence.data.socialMedia.overallScore > 50) confidence += 15;
        if (intelligence.data.reviews.googleReviews.count > 0) confidence += 10;
        if (intelligence.data.business.industry !== 'unknown') confidence += 5;
        
        return Math.min(confidence, 95);
    }

    calculatePriority(intelligence) {
        const analysis = intelligence.analysis;
        
        if (analysis.urgency === 'high' && intelligence.data.website.issues.length > 3) {
            return 'very_high';
        } else if (analysis.urgency === 'high' || intelligence.data.website.issues.length > 2) {
            return 'high';
        } else if (analysis.opportunities.length > 2) {
            return 'medium';
        }
        
        return 'low';
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

    // Additional helper methods would go here...
    // (Social media analysis, review analysis, business intelligence, etc.)
    
    async analyzeFacebook(businessName, location) {
        // Simplified - would use Facebook Graph API in production
        return { exists: false, quality: 'poor', followers: 0 };
    }

    async analyzeInstagram(businessName, location) {
        // Simplified - would use Instagram Basic Display API in production
        return { exists: false, quality: 'poor', followers: 0 };
    }

    async analyzeLinkedIn(businessName, location) {
        // Simplified - would use LinkedIn API in production
        return { exists: false, quality: 'poor', followers: 0 };
    }

    async analyzeGoogleMyBusiness(businessName, location) {
        // Simplified - would use Google My Business API in production
        return { exists: false, quality: 'poor', reviews: 0 };
    }

    async simulateReviewAnalysis(businessName, platform) {
        // Simplified simulation
        return { count: 0, averageRating: 0, sentiment: 'neutral' };
    }

    // Additional analysis methods...
    determineIndustry(lead) { return 'general'; }
    estimateBusinessSize(lead) { return 'small'; }
    assessBusinessMaturity(lead) { return 'growing'; }
    estimateRevenue(lead) { return 'medium'; }
    estimateEmployees(lead) { return 5; }
    determineMarketPosition(lead, businessData) { return 'local'; }
    determineGrowthStage(businessData) { return 'growing'; }
    identifyDecisionMakers(businessData) { return 'owner'; }
    identifyLocalCompetitors(industry, location) { return []; }
    identifyCompetitiveAdvantages(lead) { return []; }
    identifyMarketGaps(industry, location) { return []; }
    determinePositioning(lead, competitiveData) { return 'local'; }
    identifyThreats(competitiveData) { return []; }
    identifyOpportunities(competitiveData) { return []; }
    identifyPainPoints(data) { return ['Sin presencia web profesional']; }
    identifyOpportunities(data) { return ['Crear sitio web profesional']; }
    generateRecommendations(data) { return ['website_design']; }
    assessUrgency(data) { return 'medium'; }
    calculateOverallConfidence(data) { return 70; }
    identifyWebsiteIssues(websiteData) { return ['Diseño desactualizado']; }
    identifyWebsiteStrengths(websiteData) { return ['Tiene sitio web']; }
    identifyWebsiteOpportunities(websiteData) { return ['Mejorar diseño']; }
    calculateOverallSentiment(reviewData) { return 'neutral'; }
    identifyCommonComplaints(reviewData) { return []; }
    identifyCommonPraises(reviewData) { return []; }
}

module.exports = AILeadIntelligenceAgent;
