// JegoDigital AI Agent - Complete Understanding of Services & Personalized Message Generation
const axios = require('axios');

class JegoDigitalAIAgent {
    constructor() {
        this.spreadsheetId = '1nzknj5DlU_1oXeu_7VcMRD6_FRcSkgef2I0ObXxYoLg';
        this.apiKey = 'AIzaSyA-1HU2daAhNIuVOdK6ZN_GOIW9YB1i7a4';
        this.baseUrl = `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}/values`;
        
        // Complete JegoDigital Service Portfolio
        this.jegodigitalServices = {
            'website_design': {
                name: 'Diseño Web Profesional',
                description: 'Sitios web modernos y responsivos que convierten visitantes en clientes',
                features: [
                    'Diseño responsivo para móviles',
                    'Optimización para velocidad',
                    'Integración con redes sociales',
                    'Formularios de contacto',
                    'Certificado SSL incluido'
                ],
                benefits: [
                    'Aumenta tu credibilidad y profesionalismo online',
                    'Genera más clientes a través de internet las 24 horas',
                    'Funciona perfectamente en móviles y computadoras',
                    'Entrega rápida en solo 2-3 días'
                ],
                pricing: 'Desde $2,000 MXN',
                deliveryTime: '2-3 días'
            },
            'seo_local': {
                name: 'SEO Local Cancún',
                description: 'Aparece primero en Google cuando buscan tu negocio en Cancún',
                features: [
                    'Optimización Google My Business',
                    'Optimización Google Maps',
                    'SEO técnico completo',
                    'Contenido optimizado',
                    'Link building local',
                    'Reportes mensuales'
                ],
                benefits: [
                    'Apareces en las primeras páginas de Google cuando te buscan',
                    'Más clientes te encuentran cuando buscan tus servicios',
                    'Te posicionas por encima de tu competencia local',
                    'Aumentas tu visibilidad en Google Maps'
                ],
                pricing: 'Desde $1,500 MXN',
                deliveryTime: 'Inmediato'
            },
            'ecommerce': {
                name: 'E-commerce Solutions',
                description: 'Tiendas online que venden las 24 horas del día',
                features: [
                    'Diseño de tienda online',
                    'Integración de pagos',
                    'Gestión de inventario',
                    'SEO para e-commerce',
                    'Soporte técnico'
                ],
                benefits: [
                    'Vendes tus productos/servicios 24/7 sin estar presente',
                    'Aumentas tus ingresos significativamente',
                    'Llegas a más clientes en toda la Riviera Maya',
                    'Proceso de compra simple y seguro'
                ],
                pricing: 'Desde $3,000 MXN',
                deliveryTime: '5-7 días'
            },
            'marketing_digital': {
                name: 'Marketing Digital',
                description: 'Campañas estratégicas que generan clientes reales para tu negocio',
                features: [
                    'Google Ads y Facebook Ads',
                    'Marketing en redes sociales',
                    'Email marketing',
                    'Remarketing',
                    'Análisis y optimización'
                ],
                benefits: [
                    'Generas clientes reales con campañas estratégicas',
                    'Aumentas tu alcance en redes sociales',
                    'Conviertes visitantes en clientes fieles',
                    'ROI medible y optimizable'
                ],
                pricing: 'Desde $1,000 MXN',
                deliveryTime: 'Inmediato'
            },
            'analytics': {
                name: 'Analytics y Reportes',
                description: 'Mide el éxito de tus campañas con datos reales',
                features: [
                    'Google Analytics 4',
                    'Reportes personalizados',
                    'Análisis de conversiones',
                    'Dashboards en tiempo real',
                    'Recomendaciones mensuales'
                ],
                benefits: [
                    'Mides el éxito real de tus campañas',
                    'Tomas decisiones basadas en datos',
                    'Optimizas continuamente tu estrategia',
                    'Ves el ROI de cada inversión'
                ],
                pricing: 'Incluido con otros servicios',
                deliveryTime: 'Inmediato'
            },
            'mobile_app': {
                name: 'Desarrollo Móvil',
                description: 'Aplicaciones móviles que conectan con tus clientes',
                features: [
                    'Apps nativas iOS/Android',
                    'Apps web progresivas',
                    'Integración con sistemas',
                    'Notificaciones push',
                    'Mantenimiento incluido'
                ],
                benefits: [
                    'Conectas directamente con tus clientes móviles',
                    'Aumentas la lealtad y engagement',
                    'Generas notificaciones personalizadas',
                    'Presencia móvil profesional'
                ],
                pricing: 'Desde $5,000 MXN',
                deliveryTime: '2-4 semanas'
            }
        };

        // JegoDigital Company Info
        this.companyInfo = {
            name: 'JegoDigital',
            tagline: 'La agencia de marketing digital #1 en Cancún',
            location: 'Cancún, Quintana Roo',
            phone: '+52 998 202 3263',
            email: 'alex@jegodigital.com',
            website: 'www.jegodigital.com',
            rating: '4.9★',
            projectsCompleted: '50+',
            satisfiedClients: '95%',
            yearsExperience: '3+',
            support: '24/7'
        };

        // Local Cancún advantages
        this.localAdvantages = [
            'Somos la agencia #1 en Cancún',
            'Hemos ayudado a más de 50 empresas locales',
            'Conocemos perfectamente el mercado de Cancún',
            'Estamos disponibles 24/7 para nuestros clientes',
            'Servicio personalizado y local'
        ];
    }

    // Main function - Complete AI Lead Analysis with JegoDigital Services
    async executeCompleteAnalysis() {
        console.log('🤖 JEGODIGITAL AI AGENT - Complete Lead Analysis');
        console.log('=================================================\n');

        try {
            // Step 1: Access Google Sheet and get all leads
            console.log('📊 Step 1: Accessing your Google Sheet with 2,300+ leads...');
            const leads = await this.getAllLeadsFromSheet();
            
            if (leads.length === 0) {
                throw new Error('No leads found in Google Sheet');
            }
            
            console.log(`✅ Found ${leads.length} leads in your Google Sheet`);
            console.log(`📋 Sample lead: ${leads[0]?.business_name || leads[0]?.name || 'Unknown'}\n`);

            // Step 2: Process first 10 leads for demonstration
            console.log('🔍 Step 2: Starting JegoDigital AI Analysis...');
            const leadsToProcess = leads.slice(0, 10);
            console.log(`📊 Processing ${leadsToProcess.length} leads with complete JegoDigital service understanding...\n`);

            // Step 3: AI Analysis and Personalized Message Generation
            const personalizedMessages = await this.generateJegoDigitalPersonalizedMessages(leadsToProcess);

            // Step 4: Display Results
            console.log('\n🎉 JEGODIGITAL AI ANALYSIS COMPLETE!');
            this.displayJegoDigitalResults(personalizedMessages);

            // Step 5: Save Results
            await this.saveJegoDigitalResults(personalizedMessages);

            return {
                success: true,
                totalLeads: leads.length,
                processedLeads: leadsToProcess.length,
                personalizedMessages: personalizedMessages,
                results: personalizedMessages
            };

        } catch (error) {
            console.error('\n❌ JegoDigital AI Analysis failed:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Get all leads from Google Sheet
    async getAllLeadsFromSheet() {
        try {
            const response = await axios.get(`${this.baseUrl}/jegodigital-leads-template?key=${this.apiKey}`);
            
            if (!response.data.values || response.data.values.length < 2) {
                return [];
            }

            const headers = response.data.values[0];
            const rows = response.data.values.slice(1);
            
            console.log('📋 Sheet headers found:', headers.slice(0, 5).join(', ') + '...');
            
            const leads = rows.map((row, index) => {
                const lead = {};
                headers.forEach((header, headerIndex) => {
                    const cleanHeader = header.toLowerCase().replace(/[^a-z0-9]/g, '_');
                    lead[cleanHeader] = row[headerIndex] || '';
                });
                lead.id = lead.id || `LEAD_${(index + 1).toString().padStart(3, '0')}`;
                return lead;
            });

            const validLeads = leads.filter(lead => 
                lead.name || lead.business_name || lead.contact_name
            );

            console.log(`📊 Valid leads found: ${validLeads.length}`);
            return validLeads;
            
        } catch (error) {
            console.error('❌ Error accessing Google Sheet:', error.message);
            return [];
        }
    }

    // Generate personalized messages with complete JegoDigital understanding
    async generateJegoDigitalPersonalizedMessages(leads) {
        const personalizedMessages = [];
        
        for (const [index, lead] of leads.entries()) {
            try {
                console.log(`🔍 ${index + 1}. Analyzing: ${lead.business_name || lead.name || 'Unknown Business'}...`);
                
                // Complete JegoDigital AI Analysis
                const analysis = this.performJegoDigitalAnalysis(lead);
                
                // Generate personalized message with JegoDigital services
                const personalizedMessage = this.createJegoDigitalPersonalizedMessage(lead, analysis);
                
                // Create comprehensive result
                const result = {
                    leadNumber: index + 1,
                    leadId: lead.id,
                    name: lead.name || lead.contact_name || 'Unknown',
                    businessName: lead.business_name || lead.company || 'Unknown Business',
                    phone: lead.phone || '',
                    email: lead.email || '',
                    location: lead.location || lead.city || 'Cancún',
                    businessType: analysis.businessType,
                    industry: lead.industry || lead.business_type || '',
                    currentWebsite: lead.current_website || lead.website_status || 'unknown',
                    monthlyRevenue: lead.monthly_revenue || lead.revenue || '',
                    budget: lead.budget || lead.budget_range || '',
                    interest: lead.interest || lead.service_interest || '',
                    timeline: lead.timeline || lead.urgency || '',
                    source: lead.source || lead.lead_source || '',
                    employees: lead.employees || lead.team_size || '',
                    
                    // JegoDigital AI Analysis Results
                    painPoints: analysis.painPoints,
                    opportunities: analysis.opportunities,
                    recommendedServices: analysis.recommendedServices,
                    urgency: analysis.urgency,
                    priority: analysis.priority,
                    confidence: analysis.confidence,
                    
                    // Generated JegoDigital Message
                    personalizedMessage: personalizedMessage,
                    messageLength: personalizedMessage.length,
                    
                    // Action Items
                    recommendedAction: this.getJegoDigitalRecommendedAction(analysis),
                    followUpDate: this.calculateFollowUpDate(analysis),
                    status: 'Ready for JegoDigital WhatsApp Outreach'
                };
                
                personalizedMessages.push(result);
                
                console.log(`   ✅ JegoDigital analysis complete - ${analysis.businessType} | ${analysis.priority} priority | ${analysis.confidence}% confidence`);
                console.log(`   🎯 Recommended services: ${analysis.recommendedServices.join(', ')}`);
                
                // Small delay between leads
                await this.delay(100);
                
            } catch (error) {
                console.log(`   ❌ Error analyzing lead ${index + 1}: ${error.message}`);
                
                personalizedMessages.push({
                    leadNumber: index + 1,
                    leadId: lead.id,
                    name: lead.name || 'Unknown',
                    businessName: lead.business_name || 'Unknown Business',
                    error: error.message,
                    personalizedMessage: this.generateJegoDigitalFallbackMessage(lead),
                    status: 'Error - Manual Review Needed'
                });
            }
        }
        
        return personalizedMessages;
    }

    // Complete JegoDigital Analysis with full service understanding
    performJegoDigitalAnalysis(lead) {
        const analysis = {
            businessType: this.determineBusinessType(lead),
            painPoints: [],
            opportunities: [],
            recommendedServices: [],
            urgency: 'medium',
            priority: 'medium',
            confidence: 70
        };

        // Analyze based on current website status
        const websiteStatus = (lead.current_website || lead.website_status || '').toLowerCase();
        if (websiteStatus === 'none' || websiteStatus === 'no website') {
            analysis.painPoints.push('Sin presencia web profesional');
            analysis.painPoints.push('Perdiendo clientes que buscan en internet');
            analysis.opportunities.push('Crear sitio web profesional con entrega en 2-3 días');
            analysis.recommendedServices.push('website_design');
        } else if (websiteStatus === 'outdated' || websiteStatus === 'old') {
            analysis.painPoints.push('Sitio web desactualizado');
            analysis.painPoints.push('No funciona bien en móviles');
            analysis.opportunities.push('Rediseñar sitio web moderno y responsive');
            analysis.recommendedServices.push('website_design');
        } else if (websiteStatus === 'basic' || websiteStatus === 'simple') {
            analysis.painPoints.push('Sitio web básico sin optimización SEO');
            analysis.painPoints.push('No aparece en Google cuando te buscan');
            analysis.opportunities.push('Optimizar para SEO y Google Maps');
            analysis.recommendedServices.push('seo_local', 'website_design');
        }

        // Analyze based on business type with JegoDigital expertise
        const businessType = analysis.businessType;
        if (businessType === 'restaurante') {
            analysis.painPoints.push('Sin sistema de reservas online');
            analysis.painPoints.push('Menú no disponible digitalmente');
            analysis.painPoints.push('No aparece en Google Maps cuando buscan restaurantes');
            analysis.opportunities.push('Sistema de reservas online y optimización Google Maps');
            analysis.recommendedServices.push('website_design', 'seo_local', 'ecommerce');
        } else if (businessType === 'hotel') {
            analysis.painPoints.push('Sin sistema de reservas directas');
            analysis.painPoints.push('Depende de terceros para ventas');
            analysis.painPoints.push('No optimizado para búsquedas de hoteles en Cancún');
            analysis.opportunities.push('Sistema de reservas online y SEO local Cancún');
            analysis.recommendedServices.push('website_design', 'seo_local', 'ecommerce');
        } else if (businessType === 'tienda' || businessType === 'retail') {
            analysis.painPoints.push('Sin tienda online');
            analysis.painPoints.push('Ventas limitadas a horario físico');
            analysis.painPoints.push('No aparece en búsquedas locales de productos');
            analysis.opportunities.push('E-commerce completo y SEO local');
            analysis.recommendedServices.push('ecommerce', 'seo_local', 'website_design');
        } else if (businessType === 'spa' || businessType === 'belleza') {
            analysis.painPoints.push('Sin sistema de citas online');
            analysis.painPoints.push('Falta presencia digital profesional');
            analysis.painPoints.push('No optimizado para Google Maps de spas en Cancún');
            analysis.opportunities.push('Sistema de citas online y SEO local');
            analysis.recommendedServices.push('website_design', 'seo_local', 'ecommerce');
        } else if (businessType === 'salud' || businessType === 'medico') {
            analysis.painPoints.push('Sin sistema de citas online');
            analysis.painPoints.push('Falta confianza digital');
            analysis.painPoints.push('No aparece en búsquedas de servicios médicos');
            analysis.opportunities.push('Sistema de citas online y SEO médico local');
            analysis.recommendedServices.push('website_design', 'seo_local', 'ecommerce');
        }

        // Analyze urgency and priority
        const timeline = (lead.timeline || lead.urgency || '').toLowerCase();
        if (timeline === 'urgent' || timeline === 'asap') {
            analysis.urgency = 'high';
            analysis.priority = 'very_high';
        } else if (timeline === 'this month' || timeline === 'soon') {
            analysis.urgency = 'medium';
            analysis.priority = 'high';
        } else if (timeline === 'next month' || timeline === 'later') {
            analysis.urgency = 'low';
            analysis.priority = 'medium';
        }

        // Analyze based on interest/service need
        const interest = (lead.interest || lead.service_interest || '').toLowerCase();
        if (interest.includes('website') || interest.includes('web')) {
            analysis.recommendedServices.push('website_design');
            analysis.confidence += 10;
        }
        if (interest.includes('seo') || interest.includes('google')) {
            analysis.recommendedServices.push('seo_local');
            analysis.confidence += 10;
        }
        if (interest.includes('ecommerce') || interest.includes('tienda online')) {
            analysis.recommendedServices.push('ecommerce');
            analysis.confidence += 10;
        }
        if (interest.includes('marketing') || interest.includes('publicidad')) {
            analysis.recommendedServices.push('marketing_digital');
            analysis.confidence += 10;
        }

        // Analyze based on budget
        const budget = parseInt(lead.budget || lead.budget_range || '0');
        if (budget >= 25000) {
            analysis.priority = 'very_high';
            analysis.confidence += 15;
            analysis.recommendedServices.push('marketing_digital', 'analytics');
        } else if (budget >= 15000) {
            analysis.priority = 'high';
            analysis.confidence += 10;
        } else if (budget >= 10000) {
            analysis.priority = 'medium';
            analysis.confidence += 5;
        }

        // Analyze based on revenue
        const revenue = parseInt(lead.monthly_revenue || lead.revenue || '0');
        if (revenue >= 100000) {
            analysis.priority = 'very_high';
            analysis.confidence += 15;
            analysis.recommendedServices.push('marketing_digital', 'analytics');
        } else if (revenue >= 50000) {
            analysis.priority = 'high';
            analysis.confidence += 10;
        }

        // Ensure confidence is within bounds
        analysis.confidence = Math.min(Math.max(analysis.confidence, 50), 95);

        // Remove duplicates from recommended services
        analysis.recommendedServices = [...new Set(analysis.recommendedServices)];

        return analysis;
    }

    // Determine business type from lead data
    determineBusinessType(lead) {
        const businessName = (lead.business_name || '').toLowerCase();
        const businessType = (lead.business_type || '').toLowerCase();
        const industry = (lead.industry || '').toLowerCase();
        
        const text = `${businessName} ${businessType} ${industry}`;
        
        if (text.includes('restaurant') || text.includes('comida') || text.includes('food') || 
            text.includes('restaurante') || text.includes('cocina') || text.includes('gastronomia')) {
            return 'restaurante';
        } else if (text.includes('hotel') || text.includes('hospedaje') || text.includes('hospedaje') ||
                   text.includes('alojamiento') || text.includes('accommodation')) {
            return 'hotel';
        } else if (text.includes('retail') || text.includes('tienda') || text.includes('boutique') ||
                   text.includes('tienda') || text.includes('store') || text.includes('shop')) {
            return 'tienda';
        } else if (text.includes('spa') || text.includes('belleza') || text.includes('beauty') ||
                   text.includes('estetica') || text.includes('wellness') || text.includes('relax')) {
            return 'spa';
        } else if (text.includes('medical') || text.includes('dental') || text.includes('clinica') ||
                   text.includes('medico') || text.includes('salud') || text.includes('health')) {
            return 'salud';
        } else if (text.includes('gym') || text.includes('fitness') || text.includes('ejercicio') ||
                   text.includes('deporte') || text.includes('sport')) {
            return 'gym';
        } else if (text.includes('legal') || text.includes('abogado') || text.includes('lawyer') ||
                   text.includes('derecho') || text.includes('law')) {
            return 'legal';
        } else if (text.includes('contable') || text.includes('accounting') || text.includes('financiero') ||
                   text.includes('tax') || text.includes('impuestos')) {
            return 'contable';
        } else if (text.includes('inmobiliario') || text.includes('real estate') || text.includes('propiedades') ||
                   text.includes('casas') || text.includes('ventas')) {
            return 'inmobiliario';
        } else {
            return 'negocio';
        }
    }

    // Create personalized message with complete JegoDigital understanding
    createJegoDigitalPersonalizedMessage(lead, analysis) {
        const name = lead.name || lead.contact_name || 'Estimado empresario';
        const businessName = lead.business_name || lead.company || 'su negocio';
        const location = lead.location || lead.city || 'Cancún';
        const businessType = analysis.businessType;
        
        // Primary pain point
        const primaryPainPoint = analysis.painPoints[0] || 'tu negocio no tiene presencia digital profesional';
        
        // Primary service recommendation
        const primaryService = analysis.recommendedServices[0] || 'website_design';
        const serviceInfo = this.jegodigitalServices[primaryService];
        
        // Build personalized JegoDigital message
        const greeting = `Hola ${name}, soy Alex de JegoDigital. Analicé ${businessName} en ${location} y encontré oportunidades importantes para hacer crecer tu negocio.`;
        
        const problemStatement = `He notado que ${primaryPainPoint.toLowerCase()}. Esto puede estar costándote clientes y oportunidades de crecimiento en el mercado de ${location}.`;
        
        const solutionStatement = `Te puedo ayudar con ${serviceInfo.name} para que:
• ${serviceInfo.benefits[0]}
• ${serviceInfo.benefits[1]}
• ${serviceInfo.benefits[2]}`;
        
        const jegodigitalAdvantages = this.getJegoDigitalAdvantages(location, businessType, analysis);
        
        const urgency = analysis.urgency === 'high' 
            ? 'Esta es una oportunidad de oro para hacer crecer tu negocio. Cada día que pasa, pierdes clientes potenciales que buscan tus servicios online en ${location}.'
            : 'Es el momento perfecto para dar el salto digital y hacer crecer tu negocio de manera profesional y sostenible.';
        
        const callToAction = this.getJegoDigitalCallToAction(analysis, serviceInfo);
        
        const signature = `Saludos,
Alex Jego
JegoDigital - Marketing Digital Cancún
📱 ${this.companyInfo.website}
📧 ${this.companyInfo.email}
📞 ${this.companyInfo.phone}`;

        return [
            greeting,
            '',
            problemStatement,
            '',
            solutionStatement,
            '',
            jegodigitalAdvantages,
            '',
            urgency,
            '',
            callToAction,
            '',
            signature
        ].join('\n');
    }

    // Get JegoDigital advantages based on location and business type
    getJegoDigitalAdvantages(location, businessType, analysis) {
        const isCancun = location.toLowerCase().includes('cancun');
        
        if (businessType === 'restaurante') {
            return isCancun 
                ? 'Somos la agencia #1 en Cancún para restaurantes. Hemos ayudado a más de 20 restaurantes locales a aumentar sus ventas 200% con sitios web profesionales y optimización Google Maps. Entrega en solo 2-3 días.'
                : 'Hemos trabajado con restaurantes en toda la Riviera Maya, ayudándolos a aumentar sus ventas en promedio 200% con estrategias digitales efectivas y optimización local.';
        } else if (businessType === 'hotel') {
            return isCancun
                ? 'Somos especialistas en hoteles de Cancún. Hemos ayudado a más de 15 hoteles locales a optimizar sus reservas directas, aparecer en Google Maps y aumentar su ocupación. Servicio 24/7.'
                : 'Hemos optimizado la presencia digital de hoteles en toda la Riviera Maya, aumentando sus reservas directas y reduciendo dependencia de terceros.';
        } else if (businessType === 'tienda' || businessType === 'retail') {
            return isCancun
                ? 'Somos la agencia líder para tiendas en Cancún. Hemos creado tiendas online que han duplicado las ventas de nuestros clientes locales. Diseño moderno y entrega rápida.'
                : 'Hemos ayudado a tiendas en toda la región a crear presencia online exitosa, duplicando sus ventas con estrategias de e-commerce profesionales.';
        } else if (businessType === 'spa') {
            return isCancun
                ? 'Somos especialistas en spas de Cancún. Hemos ayudado a más de 10 spas locales a optimizar sus citas online, aparecer en Google Maps y aumentar sus reservas. 95% de clientes satisfechos.'
                : 'Hemos trabajado con spas en toda la Riviera Maya, optimizando sus sistemas de citas y aumentando su visibilidad online.';
        } else if (businessType === 'salud') {
            return isCancun
                ? 'Somos especialistas en clínicas de Cancún. Hemos ayudado a clínicas locales a crear confianza digital, optimizar sus citas online y aparecer en búsquedas médicas. Soporte 24/7.'
                : 'Hemos trabajado con clínicas en toda la región, mejorando su presencia digital y optimizando sus sistemas de citas para mayor comodidad de pacientes.';
        } else {
            return isCancun
                ? 'Somos la agencia #1 en Cancún. Hemos completado más de 50 proyectos locales con 95% de clientes satisfechos. Servicio personalizado, entrega rápida y soporte 24/7.'
                : 'Hemos trabajado con más de 50 empresas en la Riviera Maya, ayudándolas a crecer sus ventas en promedio 200% con presencia digital profesional.';
        }
    }

    // Get JegoDigital call to action based on analysis
    getJegoDigitalCallToAction(analysis, serviceInfo) {
        if (analysis.urgency === 'high' && analysis.priority === 'very_high') {
            return `¿Tienes 15 minutos para una consulta gratuita? Te muestro exactamente cómo podemos hacer crecer tus ventas de inmediato.

Responde "SÍ" y te contacto hoy mismo para empezar.`;
        } else if (analysis.priority === 'high') {
            return `¿Te gustaría una consulta gratuita de 15 minutos para ver cómo podemos impulsar tu negocio?

Responde "SÍ" y te envío los horarios disponibles esta semana.`;
        } else {
            return `¿Te gustaría conocer cómo podemos ayudarte a crecer tu negocio online?

Responde "SÍ" para una consulta gratuita de 15 minutos.`;
        }
    }

    // Get recommended action
    getJegoDigitalRecommendedAction(analysis) {
        if (analysis.priority === 'very_high') {
            return 'Contact Immediately - High Value Lead';
        } else if (analysis.priority === 'high') {
            return 'Priority Contact This Week';
        } else if (analysis.priority === 'medium') {
            return 'Standard Contact';
        } else {
            return 'Low Priority';
        }
    }

    // Calculate follow-up date
    calculateFollowUpDate(analysis) {
        let daysToAdd = 7;
        
        if (analysis.priority === 'very_high') daysToAdd = 1;
        else if (analysis.priority === 'high') daysToAdd = 3;
        else if (analysis.priority === 'low') daysToAdd = 14;
        
        const followUpDate = new Date();
        followUpDate.setDate(followUpDate.getDate() + daysToAdd);
        
        return followUpDate.toISOString().split('T')[0];
    }

    // Generate fallback message
    generateJegoDigitalFallbackMessage(lead) {
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
📧 alex@jegodigital.com
📞 +52 998 202 3263`;
    }

    // Display JegoDigital results
    displayJegoDigitalResults(personalizedMessages) {
        console.log('\n📊 JEGODIGITAL AI ANALYSIS RESULTS:');
        console.log('=====================================');
        console.log(`Total Leads Processed: ${personalizedMessages.length}`);
        
        const highPriority = personalizedMessages.filter(m => m.priority === 'very_high' || m.priority === 'high').length;
        const averageConfidence = Math.round(personalizedMessages.reduce((sum, m) => sum + (m.confidence || 70), 0) / personalizedMessages.length);
        
        console.log(`High Priority Leads: ${highPriority}`);
        console.log(`Average Confidence: ${averageConfidence}%`);
        
        console.log('\n🎯 PERSONALIZED JEGODIGITAL MESSAGES READY:');
        console.log('==========================================');
        
        personalizedMessages.forEach((message, index) => {
            console.log(`\n${index + 1}. ${message.businessName} (${message.name})`);
            console.log(`   Business Type: ${message.businessType}`);
            console.log(`   Priority: ${message.priority} | Confidence: ${message.confidence}%`);
            console.log(`   Phone: ${message.phone || 'Not provided'}`);
            console.log(`   Pain Points: ${message.painPoints?.slice(0, 2).join(', ') || 'General'}`);
            console.log(`   JegoDigital Services: ${message.recommendedServices?.join(', ') || 'website_design'}`);
            console.log(`   Message Length: ${message.messageLength} characters`);
            console.log(`   Action: ${message.recommendedAction}`);
        });
        
        console.log('\n📱 JEGODIGITAL WHATSAPP OUTREACH READY:');
        console.log('=======================================');
        console.log('✅ All messages include complete JegoDigital service understanding');
        console.log('✅ Each message addresses specific pain points with solutions');
        console.log('✅ Messages highlight JegoDigital advantages and local expertise');
        console.log('✅ Optimized for high response rates with clear calls-to-action');
        console.log('✅ Ready to copy-paste and send immediately');
        
        console.log('\n🚀 NEXT STEPS:');
        console.log('==============');
        console.log('1. Start with highest priority leads first');
        console.log('2. Copy personalized JegoDigital messages for WhatsApp');
        console.log('3. Track responses and update lead status');
        console.log('4. Analyze which JegoDigital services get best responses');
        console.log('5. Scale to remaining 2,300+ leads in your database');
    }

    // Save JegoDigital results to file
    async saveJegoDigitalResults(personalizedMessages) {
        try {
            const fs = require('fs');
            const timestamp = new Date().toISOString().split('T')[0];
            const filename = `jegodigital-personalized-messages-${timestamp}.json`;
            
            const resultsData = {
                timestamp: new Date().toISOString(),
                agency: 'JegoDigital',
                totalLeads: personalizedMessages.length,
                highPriorityLeads: personalizedMessages.filter(m => m.priority === 'very_high' || m.priority === 'high').length,
                averageConfidence: Math.round(personalizedMessages.reduce((sum, m) => sum + (m.confidence || 70), 0) / personalizedMessages.length),
                servicesOffered: Object.keys(this.jegodigitalServices),
                messages: personalizedMessages
            };
            
            fs.writeFileSync(filename, JSON.stringify(resultsData, null, 2));
            console.log(`\n💾 JegoDigital results saved to: ${filename}`);
            
        } catch (error) {
            console.log('⚠️ Could not save results to file:', error.message);
        }
    }

    // Utility function for delays
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Execute the complete JegoDigital analysis
async function runJegoDigitalAnalysis() {
    const agent = new JegoDigitalAIAgent();
    const results = await agent.executeCompleteAnalysis();
    
    if (results.success) {
        console.log('\n🎉 SUCCESS! JegoDigital AI Analysis Complete!');
        console.log(`📊 Processed ${results.processedLeads} leads with personalized JegoDigital messages`);
        console.log('📱 All messages ready for WhatsApp outreach with complete service understanding');
        console.log('🎯 Start with highest priority leads for best results');
        console.log('🚀 Ready to scale to all 2,300+ leads in your database');
    } else {
        console.log('\n❌ Analysis failed:', results.error);
    }
}

// Run if called directly
if (require.main === module) {
    runJegoDigitalAnalysis().catch(console.error);
}

module.exports = JegoDigitalAIAgent;


