// AI Message Personalization Engine
class AIMessagePersonalizer {
    constructor() {
        this.jegodigitalServices = {
            'website_design': {
                name: 'Diseño Web Profesional',
                benefits: ['Aumenta credibilidad', 'Genera más clientes', 'Funciona 24/7'],
                problems: ['Sitio web desactualizado', 'No funciona en móviles', 'No genera leads'],
                priceRange: '$5,000 - $50,000 MXN'
            },
            'seo': {
                name: 'SEO y Posicionamiento',
                benefits: ['Apareces en Google', 'Más clientes locales', 'Competencia directa'],
                problems: ['No apareces en Google', 'Competencia te gana', 'Pocos clientes online'],
                priceRange: '$3,000 - $15,000 MXN'
            },
            'social_media': {
                name: 'Redes Sociales',
                benefits: ['Más engagement', 'Branding profesional', 'Clientes leales'],
                problems: ['Pocos seguidores', 'Contenido inconsistente', 'No genera ventas'],
                priceRange: '$2,000 - $10,000 MXN'
            },
            'ecommerce': {
                name: 'Tienda Online',
                benefits: ['Ventas 24/7', 'Más ingresos', 'Escalabilidad'],
                problems: ['Sin ventas online', 'Proceso complicado', 'Pocos productos'],
                priceRange: '$8,000 - $80,000 MXN'
            }
        };

        this.cancunAdvantages = [
            'Somos la agencia #1 en Cancún',
            'Hemos trabajado con 50+ empresas locales',
            'Conocemos perfectamente el mercado cancunense',
            'Resultados comprobados en la Riviera Maya'
        ];
    }

    // Main personalization function
    async personalizeMessages(leads) {
        console.log('🤖 AI Personalizer: Generating personalized messages...');
        
        const personalizedLeads = [];
        
        for (const lead of leads) {
            const personalizedMessage = await this.createPersonalizedMessage(lead);
            personalizedLeads.push({
                ...lead,
                personalizedMessage: personalizedMessage,
                aiAnalysis: this.analyzeLeadForPersonalization(lead)
            });
        }

        console.log(`✅ Generated ${personalizedLeads.length} personalized messages!`);
        return personalizedLeads;
    }

    // Create personalized message for individual lead
    async createPersonalizedMessage(lead) {
        const analysis = this.analyzeLeadForPersonalization(lead);
        
        // Determine message structure based on lead profile
        const messageStructure = this.determineMessageStructure(analysis);
        
        // Build personalized message
        const message = {
            greeting: this.createPersonalizedGreeting(lead, analysis),
            problemIdentification: this.identifyProblems(lead, analysis),
            solutionPresentation: this.presentSolution(lead, analysis),
            socialProof: this.addSocialProof(lead, analysis),
            callToAction: this.createCallToAction(lead, analysis),
            signature: this.createSignature(lead, analysis)
        };

        // Combine into final message
        return this.combineMessage(message, messageStructure);
    }

    // Analyze lead for personalization
    analyzeLeadForPersonalization(lead) {
        return {
            businessType: this.determineBusinessType(lead),
            painPoints: this.identifyPainPoints(lead),
            serviceInterest: this.determineServiceInterest(lead),
            urgency: this.assessUrgency(lead),
            communicationStyle: this.determineCommunicationStyle(lead),
            budget: this.estimateBudget(lead),
            location: this.getLocation(lead),
            competitiveAdvantage: this.selectCompetitiveAdvantage(lead)
        };
    }

    // Create personalized greeting
    createPersonalizedGreeting(lead, analysis) {
        const name = lead.name || lead.contact_name || 'Estimado empresario';
        
        if (analysis.businessType) {
            return `Hola ${name}, soy Alex de JegoDigital. Vi que tienes ${analysis.businessType} en ${analysis.location || 'Cancún'}.`;
        } else {
            return `Hola ${name}, soy Alex de JegoDigital.`;
        }
    }

    // Identify problems based on lead data
    identifyProblems(lead, analysis) {
        const problems = [];
        
        // Website-related problems
        if (lead.current_website === 'none' || lead.current_website === 'outdated') {
            problems.push('tu negocio no tiene presencia web profesional');
        }
        
        if (lead.current_website === 'outdated') {
            problems.push('tu sitio web está desactualizado y no funciona bien en móviles');
        }
        
        // SEO problems
        if (lead.google_ranking === 'none' || lead.google_ranking === 'poor') {
            problems.push('no apareces en las primeras páginas de Google cuando tus clientes te buscan');
        }
        
        // Social media problems
        if (lead.social_media_presence === 'none' || lead.social_media_presence === 'poor') {
            problems.push('no tienes presencia profesional en redes sociales');
        }
        
        // Revenue problems
        if (lead.monthly_revenue && parseInt(lead.monthly_revenue) < 50000) {
            problems.push('tus ingresos podrían ser mucho mayores con una estrategia digital correcta');
        }
        
        // Competition problems
        problems.push('tus competidores te están ganando clientes en internet');

        return problems;
    }

    // Present solution
    presentSolution(lead, analysis) {
        const service = this.jegodigitalServices[analysis.serviceInterest] || this.jegodigitalServices['website_design'];
        
        return `Te puedo ayudar con ${service.name} para que:
• ${service.benefits[0]}
• ${service.benefits[1]}
• ${service.benefits[2]}

${analysis.competitiveAdvantage}`;
    }

    // Add social proof
    addSocialProof(lead, analysis) {
        const proofs = [
            'Hemos ayudado a más de 50 empresas en Cancún a crecer sus ventas',
            'Nuestros clientes han aumentado sus ingresos en promedio 200%',
            'Somos la agencia de marketing digital #1 en Cancún'
        ];

        // Select relevant proof based on lead profile
        if (analysis.businessType && analysis.businessType.includes('restaurante')) {
            return 'Específicamente, hemos ayudado a restaurantes como [Restaurante X] a duplicar sus reservas online.';
        } else if (analysis.businessType && analysis.businessType.includes('hotel')) {
            return 'Hemos trabajado con hoteles en la Riviera Maya aumentando sus reservas directas en 300%.';
        } else {
            return proofs[Math.floor(Math.random() * proofs.length)];
        }
    }

    // Create call to action
    createCallToAction(lead, analysis) {
        const urgency = analysis.urgency;
        
        if (urgency === 'high') {
            return `¿Tienes 5 minutos para una consulta gratuita? Te puedo mostrar exactamente cómo podemos hacer crecer tu negocio.

Responde "SÍ" y te contacto hoy mismo.`;
        } else {
            return `¿Te gustaría conocer cómo podemos ayudarte a hacer crecer tu negocio?

Responde "SÍ" para una consulta gratuita de 15 minutos.`;
        }
    }

    // Create signature
    createSignature(lead, analysis) {
        return `Saludos,
Alex Jego
JegoDigital - Marketing Digital Cancún
📱 www.jegodigital.com
📧 alex@jegodigital.com`;
    }

    // Combine message parts
    combineMessage(message, structure) {
        const parts = [
            message.greeting,
            '',
            `He notado que ${message.problemIdentification.join(', ')}.`,
            '',
            message.solutionPresentation,
            '',
            message.socialProof,
            '',
            message.callToAction,
            '',
            message.signature
        ];

        return parts.join('\n');
    }

    // Helper methods
    determineBusinessType(lead) {
        const businessType = lead.business_type || lead.industry || '';
        const businessName = lead.business_name || '';
        
        if (businessType.toLowerCase().includes('restaurant') || businessName.toLowerCase().includes('restaurant')) {
            return 'un restaurante';
        } else if (businessType.toLowerCase().includes('hotel') || businessName.toLowerCase().includes('hotel')) {
            return 'un hotel';
        } else if (businessType.toLowerCase().includes('retail') || businessType.toLowerCase().includes('tienda')) {
            return 'una tienda';
        } else if (businessType.toLowerCase().includes('service') || businessType.toLowerCase().includes('servicio')) {
            return 'un negocio de servicios';
        } else {
            return 'un negocio';
        }
    }

    identifyPainPoints(lead) {
        const painPoints = [];
        
        if (lead.current_website === 'none') {
            painPoints.push('falta_de_presencia_web');
        }
        
        if (lead.google_ranking === 'poor' || lead.google_ranking === 'none') {
            painPoints.push('mal_posicionamiento_seo');
        }
        
        if (lead.social_media_presence === 'none' || lead.social_media_presence === 'poor') {
            painPoints.push('sin_redes_sociales');
        }
        
        if (lead.monthly_revenue && parseInt(lead.monthly_revenue) < 50000) {
            painPoints.push('bajos_ingresos');
        }

        return painPoints;
    }

    determineServiceInterest(lead) {
        const interest = lead.interest || lead.service_interest || '';
        
        if (interest.toLowerCase().includes('website') || interest.toLowerCase().includes('web')) {
            return 'website_design';
        } else if (interest.toLowerCase().includes('seo') || interest.toLowerCase().includes('google')) {
            return 'seo';
        } else if (interest.toLowerCase().includes('social') || interest.toLowerCase().includes('instagram')) {
            return 'social_media';
        } else if (interest.toLowerCase().includes('ecommerce') || interest.toLowerCase().includes('tienda')) {
            return 'ecommerce';
        } else {
            return 'website_design'; // default
        }
    }

    assessUrgency(lead) {
        const timeline = lead.timeline || '';
        const urgency = lead.urgency || '';
        
        if (timeline.toLowerCase().includes('urgent') || 
            timeline.toLowerCase().includes('asap') || 
            urgency.toLowerCase().includes('high')) {
            return 'high';
        } else if (timeline.toLowerCase().includes('soon') || 
                   timeline.toLowerCase().includes('month')) {
            return 'medium';
        } else {
            return 'low';
        }
    }

    determineCommunicationStyle(lead) {
        // Analyze lead's communication preferences
        if (lead.preferred_contact === 'phone') {
            return 'direct';
        } else if (lead.preferred_contact === 'email') {
            return 'formal';
        } else {
            return 'casual';
        }
    }

    estimateBudget(lead) {
        const budget = lead.budget || lead.estimated_budget || '';
        
        if (budget && parseInt(budget) >= 50000) {
            return 'high';
        } else if (budget && parseInt(budget) >= 20000) {
            return 'medium';
        } else {
            return 'low';
        }
    }

    getLocation(lead) {
        return lead.location || lead.city || 'Cancún';
    }

    selectCompetitiveAdvantage(lead) {
        const location = this.getLocation(lead);
        
        if (location.toLowerCase().includes('cancun')) {
            return 'Somos la agencia #1 en Cancún y conocemos perfectamente el mercado local.';
        } else {
            return 'Tenemos experiencia comprobada ayudando a empresas como la tuya a crecer.';
        }
    }

    determineMessageStructure(analysis) {
        // Determine message flow based on lead profile
        if (analysis.urgency === 'high') {
            return 'urgent';
        } else if (analysis.budget === 'high') {
            return 'premium';
        } else if (analysis.communicationStyle === 'formal') {
            return 'formal';
        } else {
            return 'standard';
        }
    }
}

module.exports = AIMessagePersonalizer;
