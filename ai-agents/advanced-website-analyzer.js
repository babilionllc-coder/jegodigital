// Advanced Website Analyzer - Deep technical and content analysis
class AdvancedWebsiteAnalyzer {
    constructor() {
        this.analysisCache = new Map();
        this.technicalMetrics = {
            performance: {},
            seo: {},
            accessibility: {},
            security: {},
            mobile: {}
        };
    }

    // Comprehensive website analysis
    async analyzeWebsite(page, url) {
        console.log(`🔍 Advanced analysis of ${url}...`);
        
        const analysis = {
            url: url,
            timestamp: new Date().toISOString(),
            technical: {},
            content: {},
            conversion: {},
            seo: {},
            performance: {},
            issues: [],
            strengths: [],
            opportunities: [],
            score: 0
        };

        try {
            // Technical Analysis
            analysis.technical = await this.performTechnicalAnalysis(page);
            
            // Content Analysis
            analysis.content = await this.performContentAnalysis(page);
            
            // SEO Analysis
            analysis.seo = await this.performSEOAnalysis(page);
            
            // Performance Analysis
            analysis.performance = await this.performPerformanceAnalysis(page);
            
            // Conversion Analysis
            analysis.conversion = await this.performConversionAnalysis(page);
            
            // Generate insights
            analysis.issues = this.identifyIssues(analysis);
            analysis.strengths = this.identifyStrengths(analysis);
            analysis.opportunities = this.identifyOpportunities(analysis);
            analysis.score = this.calculateOverallScore(analysis);

            console.log(`✅ Analysis complete - Score: ${analysis.score}/100`);
            return analysis;

        } catch (error) {
            console.error(`❌ Analysis failed: ${error.message}`);
            analysis.issues.push(`Analysis error: ${error.message}`);
            return analysis;
        }
    }

    // Technical Analysis
    async performTechnicalAnalysis(page) {
        const technical = {
            mobileFriendly: false,
            responsiveDesign: false,
            sslCertificate: false,
            fastLoading: false,
            cleanCode: false,
            modernStandards: false,
            accessibility: false,
            crossBrowserCompatible: false
        };

        try {
            // Check mobile friendliness
            technical.mobileFriendly = await page.evaluate(() => {
                const viewport = document.querySelector('meta[name="viewport"]');
                return viewport && viewport.content.includes('width=device-width');
            });

            // Check responsive design
            technical.responsiveDesign = await page.evaluate(() => {
                const hasMediaQueries = document.styleSheets.length > 0;
                const hasFlexbox = document.body.style.display === 'flex' || 
                    Array.from(document.querySelectorAll('*')).some(el => 
                        getComputedStyle(el).display === 'flex');
                return hasMediaQueries && hasFlexbox;
            });

            // Check SSL certificate
            technical.sslCertificate = page.url().startsWith('https://');

            // Check for modern web standards
            technical.modernStandards = await page.evaluate(() => {
                const hasHTML5 = document.doctype && document.doctype.name === 'html';
                const hasSemanticElements = document.querySelectorAll('header, nav, main, section, article, footer').length > 0;
                return hasHTML5 && hasSemanticElements;
            });

            // Check accessibility basics
            technical.accessibility = await page.evaluate(() => {
                const hasAltText = Array.from(document.querySelectorAll('img')).every(img => img.alt);
                const hasHeadings = document.querySelectorAll('h1, h2, h3, h4, h5, h6').length > 0;
                const hasFormLabels = Array.from(document.querySelectorAll('input')).every(input => 
                    input.labels.length > 0 || input.getAttribute('aria-label'));
                return hasAltText && hasHeadings && hasFormLabels;
            });

        } catch (error) {
            console.log('Technical analysis error:', error.message);
        }

        return technical;
    }

    // Content Analysis
    async performContentAnalysis(page) {
        const content = {
            businessInfo: {},
            services: [],
            pricing: false,
            contactInfo: {},
            professionalQuality: 'poor',
            contentStructure: {},
            mediaQuality: {}
        };

        try {
            // Extract business information
            content.businessInfo = await page.evaluate(() => {
                return {
                    name: document.title || '',
                    description: document.querySelector('meta[name="description"]')?.content || '',
                    address: Array.from(document.querySelectorAll('*')).find(el => 
                        el.innerText && el.innerText.includes('address'))?.innerText || '',
                    phone: Array.from(document.querySelectorAll('a[href^="tel:"]')).map(a => a.href.replace('tel:', ''))[0] || '',
                    email: Array.from(document.querySelectorAll('a[href^="mailto:"]')).map(a => a.href.replace('mailto:', ''))[0] || ''
                };
            });

            // Identify services/products
            content.services = await page.evaluate(() => {
                const serviceKeywords = [
                    'services', 'servicios', 'productos', 'products', 'menu', 'menú',
                    'what we do', 'que hacemos', 'our services', 'nuestros servicios'
                ];
                const services = [];
                const bodyText = document.body.innerText.toLowerCase();
                
                serviceKeywords.forEach(keyword => {
                    if (bodyText.includes(keyword)) {
                        // Try to extract service names near the keyword
                        const keywordIndex = bodyText.indexOf(keyword);
                        const context = bodyText.substring(keywordIndex, keywordIndex + 500);
                        services.push({ keyword, context: context.substring(0, 100) });
                    }
                });
                return services;
            });

            // Check for pricing information
            content.pricing = await page.evaluate(() => {
                const bodyText = document.body.innerText.toLowerCase();
                const priceIndicators = ['price', 'precio', '$', '€', 'pesos', 'dollars'];
                return priceIndicators.some(indicator => bodyText.includes(indicator));
            });

            // Assess professional quality
            content.professionalQuality = await this.assessProfessionalQuality(page);

            // Analyze content structure
            content.contentStructure = await page.evaluate(() => {
                return {
                    hasHeader: document.querySelector('header') !== null,
                    hasNavigation: document.querySelector('nav') !== null,
                    hasMain: document.querySelector('main') !== null,
                    hasFooter: document.querySelector('footer') !== null,
                    hasSidebar: document.querySelector('aside') !== null,
                    headingStructure: Array.from(document.querySelectorAll('h1, h2, h3')).map(h => h.tagName),
                    paragraphCount: document.querySelectorAll('p').length,
                    linkCount: document.querySelectorAll('a').length
                };
            });

            // Analyze media quality
            content.mediaQuality = await page.evaluate(() => {
                const images = document.querySelectorAll('img');
                const videos = document.querySelectorAll('video, iframe[src*="youtube"], iframe[src*="vimeo"]');
                
                return {
                    imageCount: images.length,
                    videoCount: videos.length,
                    hasHighQualityImages: images.length > 0,
                    hasVideos: videos.length > 0,
                    hasHeroImage: document.querySelector('img') !== null
                };
            });

        } catch (error) {
            console.log('Content analysis error:', error.message);
        }

        return content;
    }

    // SEO Analysis
    async performSEOAnalysis(page) {
        const seo = {
            metaTags: {},
            structure: {},
            content: {},
            technical: {},
            score: 0
        };

        try {
            // Meta tags analysis
            seo.metaTags = await page.evaluate(() => {
                return {
                    title: {
                        exists: !!document.title,
                        length: document.title.length,
                        content: document.title
                    },
                    description: {
                        exists: !!document.querySelector('meta[name="description"]'),
                        length: document.querySelector('meta[name="description"]')?.content?.length || 0,
                        content: document.querySelector('meta[name="description"]')?.content || ''
                    },
                    keywords: {
                        exists: !!document.querySelector('meta[name="keywords"]'),
                        content: document.querySelector('meta[name="keywords"]')?.content || ''
                    },
                    ogTags: {
                        title: document.querySelector('meta[property="og:title"]')?.content || '',
                        description: document.querySelector('meta[property="og:description"]')?.content || '',
                        image: document.querySelector('meta[property="og:image"]')?.content || ''
                    }
                };
            });

            // Content structure for SEO
            seo.structure = await page.evaluate(() => {
                const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'));
                return {
                    hasH1: headings.some(h => h.tagName === 'H1'),
                    h1Count: headings.filter(h => h.tagName === 'H1').length,
                    headingStructure: headings.map(h => ({ tag: h.tagName, text: h.innerText.substring(0, 50) })),
                    hasInternalLinks: Array.from(document.querySelectorAll('a')).some(a => 
                        a.href && a.href.includes(window.location.hostname)),
                    hasExternalLinks: Array.from(document.querySelectorAll('a')).some(a => 
                        a.href && !a.href.includes(window.location.hostname) && a.href.startsWith('http'))
                };
            });

            // Content quality for SEO
            seo.content = await page.evaluate(() => {
                const bodyText = document.body.innerText;
                const wordCount = bodyText.split(' ').length;
                const imageCount = document.querySelectorAll('img').length;
                
                return {
                    wordCount: wordCount,
                    hasSubstantialContent: wordCount > 300,
                    imageCount: imageCount,
                    hasAltText: Array.from(document.querySelectorAll('img')).every(img => img.alt),
                    contentDensity: wordCount / Math.max(document.querySelectorAll('p').length, 1)
                };
            });

            // Technical SEO
            seo.technical = await page.evaluate(() => {
                return {
                    hasRobotsMeta: !!document.querySelector('meta[name="robots"]'),
                    hasCanonical: !!document.querySelector('link[rel="canonical"]'),
                    hasSitemap: !!document.querySelector('link[rel="sitemap"]'),
                    hasFavicon: !!document.querySelector('link[rel="icon"]'),
                    hasLanguage: !!document.documentElement.lang
                };
            });

            // Calculate SEO score
            seo.score = this.calculateSEOScore(seo);

        } catch (error) {
            console.log('SEO analysis error:', error.message);
        }

        return seo;
    }

    // Performance Analysis
    async performPerformanceAnalysis(page) {
        const performance = {
            loadTime: 0,
            resourceCount: 0,
            imageOptimization: false,
            cssOptimization: false,
            jsOptimization: false,
            caching: false,
            compression: false
        };

        try {
            // Get performance metrics
            const metrics = await page.evaluate(() => {
                if (window.performance && window.performance.timing) {
                    const timing = window.performance.timing;
                    return {
                        loadTime: timing.loadEventEnd - timing.navigationStart,
                        domContentLoaded: timing.domContentLoadedEventEnd - timing.navigationStart,
                        firstPaint: timing.loadEventEnd - timing.navigationStart
                    };
                }
                return { loadTime: 0, domContentLoaded: 0, firstPaint: 0 };
            });

            performance.loadTime = metrics.loadTime;
            performance.fastLoading = metrics.loadTime < 3000;

            // Analyze resources
            performance.resourceCount = await page.evaluate(() => {
                return {
                    images: document.querySelectorAll('img').length,
                    css: document.querySelectorAll('link[rel="stylesheet"]').length,
                    js: document.querySelectorAll('script[src]').length,
                    total: document.querySelectorAll('img, link[rel="stylesheet"], script[src]').length
                };
            });

            // Check optimizations
            performance.imageOptimization = await page.evaluate(() => {
                const images = document.querySelectorAll('img');
                return Array.from(images).every(img => {
                    const src = img.src;
                    return src.includes('webp') || src.includes('jpg') || src.includes('png');
                });
            });

        } catch (error) {
            console.log('Performance analysis error:', error.message);
        }

        return performance;
    }

    // Conversion Analysis
    async performConversionAnalysis(page) {
        const conversion = {
            contactMethods: {},
            forms: {},
            callsToAction: {},
            socialProof: {},
            score: 0
        };

        try {
            // Contact methods
            conversion.contactMethods = await page.evaluate(() => {
                return {
                    phone: {
                        visible: Array.from(document.querySelectorAll('*')).some(el => 
                            el.innerText && /\d{3}[-.]?\d{3}[-.]?\d{4}/.test(el.innerText)),
                        clickable: document.querySelectorAll('a[href^="tel:"]').length > 0,
                        count: document.querySelectorAll('a[href^="tel:"]').length
                    },
                    email: {
                        visible: Array.from(document.querySelectorAll('*')).some(el => 
                            el.innerText && /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(el.innerText)),
                        clickable: document.querySelectorAll('a[href^="mailto:"]').length > 0,
                        count: document.querySelectorAll('a[href^="mailto:"]').length
                    },
                    whatsapp: {
                        exists: document.querySelectorAll('a[href*="whatsapp"], a[href*="wa.me"]').length > 0,
                        count: document.querySelectorAll('a[href*="whatsapp"], a[href*="wa.me"]').length
                    },
                    address: {
                        visible: Array.from(document.querySelectorAll('*')).some(el => 
                            el.innerText && el.innerText.includes('address'))
                    }
                };
            });

            // Forms analysis
            conversion.forms = await page.evaluate(() => {
                const forms = document.querySelectorAll('form');
                return {
                    count: forms.length,
                    hasContactForm: forms.length > 0,
                    formTypes: Array.from(forms).map(form => {
                        const inputs = form.querySelectorAll('input, textarea, select');
                        return Array.from(inputs).map(input => input.type || input.tagName.toLowerCase());
                    })
                };
            });

            // Call-to-action buttons
            conversion.callsToAction = await page.evaluate(() => {
                const buttons = document.querySelectorAll('button, a[class*="btn"], a[class*="button"], input[type="submit"]');
                const ctaKeywords = ['contact', 'call', 'email', 'quote', 'buy', 'order', 'book', 'reserve'];
                
                return {
                    count: buttons.length,
                    hasCTA: buttons.length > 0,
                    ctaTexts: Array.from(buttons).map(btn => btn.innerText || btn.value).filter(text => 
                        ctaKeywords.some(keyword => text.toLowerCase().includes(keyword)))
                };
            });

            // Social proof elements
            conversion.socialProof = await page.evaluate(() => {
                return {
                    hasTestimonials: Array.from(document.querySelectorAll('*')).some(el => 
                        el.innerText && (el.innerText.includes('testimonial') || el.innerText.includes('review'))),
                    hasReviews: document.querySelectorAll('[class*="review"], [class*="rating"], [class*="star"]').length > 0,
                    hasSocialMedia: document.querySelectorAll('a[href*="facebook"], a[href*="instagram"], a[href*="twitter"]').length > 0,
                    hasCertifications: Array.from(document.querySelectorAll('*')).some(el => 
                        el.innerText && (el.innerText.includes('certified') || el.innerText.includes('licensed')))
                };
            });

            // Calculate conversion score
            conversion.score = this.calculateConversionScore(conversion);

        } catch (error) {
            console.log('Conversion analysis error:', error.message);
        }

        return conversion;
    }

    // Assessment and calculation methods
    async assessProfessionalQuality(page) {
        const quality = await page.evaluate(() => {
            const bodyText = document.body.innerText;
            const wordCount = bodyText.split(' ').length;
            const hasImages = document.querySelectorAll('img').length > 0;
            const hasProfessionalDesign = document.querySelectorAll('link[rel="stylesheet"]').length > 0;
            const hasContactInfo = bodyText.includes('contact') || bodyText.includes('phone') || bodyText.includes('email');
            const hasServices = bodyText.includes('services') || bodyText.includes('servicios') || bodyText.includes('what we do');
            
            let score = 0;
            if (wordCount > 500) score += 2;
            if (hasImages) score += 2;
            if (hasProfessionalDesign) score += 2;
            if (hasContactInfo) score += 2;
            if (hasServices) score += 2;
            
            if (score >= 8) return 'excellent';
            if (score >= 6) return 'good';
            if (score >= 4) return 'fair';
            return 'poor';
        });
        
        return quality;
    }

    calculateSEOScore(seo) {
        let score = 0;
        
        // Meta tags (30 points)
        if (seo.metaTags.title.exists && seo.metaTags.title.length > 10) score += 10;
        if (seo.metaTags.description.exists && seo.metaTags.description.length > 50) score += 10;
        if (seo.metaTags.ogTags.title) score += 5;
        if (seo.metaTags.ogTags.description) score += 5;
        
        // Structure (25 points)
        if (seo.structure.hasH1 && seo.structure.h1Count === 1) score += 10;
        if (seo.structure.hasInternalLinks) score += 5;
        if (seo.structure.hasExternalLinks) score += 5;
        if (seo.structure.headingStructure.length > 3) score += 5;
        
        // Content (25 points)
        if (seo.content.hasSubstantialContent) score += 10;
        if (seo.content.hasAltText) score += 10;
        if (seo.content.wordCount > 500) score += 5;
        
        // Technical (20 points)
        if (seo.technical.hasRobotsMeta) score += 5;
        if (seo.technical.hasCanonical) score += 5;
        if (seo.technical.hasFavicon) score += 5;
        if (seo.technical.hasLanguage) score += 5;
        
        return Math.min(score, 100);
    }

    calculateConversionScore(conversion) {
        let score = 0;
        
        // Contact methods (40 points)
        if (conversion.contactMethods.phone.visible) score += 15;
        if (conversion.contactMethods.phone.clickable) score += 10;
        if (conversion.contactMethods.email.visible) score += 10;
        if (conversion.contactMethods.whatsapp.exists) score += 5;
        
        // Forms (30 points)
        if (conversion.forms.hasContactForm) score += 20;
        if (conversion.forms.count > 1) score += 10;
        
        // Call-to-actions (20 points)
        if (conversion.callsToAction.hasCTA) score += 15;
        if (conversion.callsToAction.ctaTexts.length > 0) score += 5;
        
        // Social proof (10 points)
        if (conversion.socialProof.hasTestimonials) score += 5;
        if (conversion.socialProof.hasSocialMedia) score += 5;
        
        return Math.min(score, 100);
    }

    // Issue and opportunity identification
    identifyIssues(analysis) {
        const issues = [];
        
        // Technical issues
        if (!analysis.technical.mobileFriendly) issues.push('No es compatible con móviles');
        if (!analysis.technical.sslCertificate) issues.push('Falta certificado SSL de seguridad');
        if (!analysis.technical.responsiveDesign) issues.push('Diseño no responsive');
        if (!analysis.technical.modernStandards) issues.push('No usa estándares web modernos');
        
        // SEO issues
        if (analysis.seo.score < 50) issues.push('SEO deficiente - no aparece en Google');
        if (!analysis.seo.metaTags.title.exists) issues.push('Falta título de página');
        if (!analysis.seo.metaTags.description.exists) issues.push('Falta descripción para SEO');
        
        // Performance issues
        if (analysis.performance.loadTime > 3000) issues.push('Carga muy lenta');
        if (analysis.performance.resourceCount.total > 50) issues.push('Demasiados recursos - lento');
        
        // Conversion issues
        if (analysis.conversion.score < 50) issues.push('Falta elementos de conversión');
        if (!analysis.conversion.contactMethods.phone.visible) issues.push('No tiene teléfono visible');
        if (!analysis.conversion.forms.hasContactForm) issues.push('Sin formulario de contacto');
        
        // Content issues
        if (analysis.content.professionalQuality === 'poor') issues.push('Contenido poco profesional');
        if (!analysis.content.pricing) issues.push('Sin información de precios');
        
        return issues;
    }

    identifyStrengths(analysis) {
        const strengths = [];
        
        // Technical strengths
        if (analysis.technical.mobileFriendly) strengths.push('Compatible con móviles');
        if (analysis.technical.sslCertificate) strengths.push('Sitio seguro con SSL');
        if (analysis.technical.modernStandards) strengths.push('Usa estándares web modernos');
        
        // SEO strengths
        if (analysis.seo.score > 70) strengths.push('SEO bien optimizado');
        if (analysis.seo.metaTags.title.exists) strengths.push('Tiene título optimizado');
        
        // Performance strengths
        if (analysis.performance.fastLoading) strengths.push('Carga rápida');
        
        // Conversion strengths
        if (analysis.conversion.score > 70) strengths.push('Buenos elementos de conversión');
        if (analysis.conversion.contactMethods.phone.clickable) strengths.push('Teléfono clickeable');
        
        // Content strengths
        if (analysis.content.professionalQuality === 'excellent') strengths.push('Contenido muy profesional');
        if (analysis.content.services.length > 0) strengths.push('Información de servicios clara');
        
        return strengths;
    }

    identifyOpportunities(analysis) {
        const opportunities = [];
        
        // Website improvement opportunities
        if (analysis.technical.score < 70) opportunities.push('Mejorar aspectos técnicos del sitio');
        if (analysis.seo.score < 70) opportunities.push('Optimizar para motores de búsqueda');
        if (analysis.conversion.score < 70) opportunities.push('Añadir elementos de conversión');
        if (analysis.content.professionalQuality !== 'excellent') opportunities.push('Mejorar calidad del contenido');
        
        // Business growth opportunities
        if (!analysis.content.pricing) opportunities.push('Añadir información de precios');
        if (analysis.conversion.socialProof.hasSocialMedia) opportunities.push('Integrar mejor las redes sociales');
        
        return opportunities;
    }

    calculateOverallScore(analysis) {
        const weights = {
            technical: 0.25,
            seo: 0.25,
            conversion: 0.25,
            content: 0.15,
            performance: 0.10
        };
        
        let score = 0;
        
        // Technical score (simplified)
        let technicalScore = 0;
        if (analysis.technical.mobileFriendly) technicalScore += 25;
        if (analysis.technical.sslCertificate) technicalScore += 25;
        if (analysis.technical.responsiveDesign) technicalScore += 25;
        if (analysis.technical.modernStandards) technicalScore += 25;
        
        // Content score (simplified)
        let contentScore = 0;
        if (analysis.content.professionalQuality === 'excellent') contentScore = 100;
        else if (analysis.content.professionalQuality === 'good') contentScore = 75;
        else if (analysis.content.professionalQuality === 'fair') contentScore = 50;
        else contentScore = 25;
        
        // Performance score (simplified)
        let performanceScore = analysis.performance.fastLoading ? 80 : 40;
        
        score = (technicalScore * weights.technical) +
                (analysis.seo.score * weights.seo) +
                (analysis.conversion.score * weights.conversion) +
                (contentScore * weights.content) +
                (performanceScore * weights.performance);
        
        return Math.round(score);
    }
}

module.exports = AdvancedWebsiteAnalyzer;


