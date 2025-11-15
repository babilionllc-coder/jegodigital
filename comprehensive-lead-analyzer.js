// Comprehensive Lead Analyzer - Scans business info and creates personalized messages
const AIWebsiteAnalyzer = require('./ai-agents/website-analyzer');
const LeadScoringAnalyzer = require('./lead-scoring-analyzer');
const AIMessagePersonalizer = require('./ai-agents/message-personalizer');

class ComprehensiveLeadAnalyzer {
    constructor() {
        this.websiteAnalyzer = new AIWebsiteAnalyzer();
        this.scoringAnalyzer = new LeadScoringAnalyzer();
        this.messagePersonalizer = new AIMessagePersonalizer();
        this.analysisResults = [];
    }

    // Main analysis function for all leads
    async analyzeAllLeads(leads) {
        console.log(`🚀 Starting comprehensive analysis of ${leads.length} leads...`);
        console.log('📊 This will scan business info, analyze websites, and create personalized messages\n');

        const results = {
            totalLeads: leads.length,
            analyzedLeads: [],
            summary: {},
            personalizedMessages: []
        };

        // Process leads in batches to avoid overwhelming
        const batchSize = 10;
        for (let i = 0; i < leads.length; i += batchSize) {
            const batch = leads.slice(i, i + batchSize);
            console.log(`📋 Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(leads.length/batchSize)}...`);
            
            const batchResults = await this.processBatch(batch);
            results.analyzedLeads.push(...batchResults);
            
            // Small delay between batches
            await this.delay(1000);
        }

        // Generate summary and personalized messages
        results.summary = this.generateSummary(results.analyzedLeads);
        results.personalizedMessages = this.formatMessagesForSheets(results.analyzedLeads);

        console.log('\n✅ Comprehensive analysis complete!');
        this.displayResults(results);

        return results;
    }

    // Process a batch of leads
    async processBatch(leads) {
        const batchResults = [];
        
        for (const lead of leads) {
            try {
                const analysis = await this.analyzeIndividualLead(lead);
                batchResults.push(analysis);
                
                // Show progress
                console.log(`  ✅ ${lead.name || lead.business_name || 'Lead'}: ${analysis.websiteAnalysis.quality || 'analyzed'}`);
                
            } catch (error) {
                console.log(`  ❌ Error analyzing ${lead.name || lead.business_name || 'Lead'}: ${error.message}`);
                
                // Add error result
                batchResults.push({
                    lead: lead,
                    websiteAnalysis: { status: 'error', message: error.message },
                    painPoints: ['Error en análisis'],
                    opportunities: ['Contacto directo recomendado'],
                    recommendations: ['website_design'],
                    personalizedMessage: this.generateFallbackMessage(lead),
                    confidence: 30
                });
            }
        }
        
        return batchResults;
    }

    // Analyze individual lead comprehensively
    async analyzeIndividualLead(lead) {
        console.log(`  🔍 Analyzing: ${lead.business_name || lead.name || 'Unknown business'}...`);
        
        // Step 1: Website Analysis
        const websiteAnalysis = await this.websiteAnalyzer.analyzeBusinessWebsite(lead);
        
        // Step 2: Lead Scoring
        const leadScore = this.scoringAnalyzer.calculateRealScore(lead);
        
        // Step 3: Business Intelligence
        const businessIntelligence = this.analyzeBusinessIntelligence(lead);
        
        // Step 4: Competitive Analysis
        const competitiveAnalysis = this.analyzeCompetition(lead);
        
        // Step 5: Market Opportunity
        const marketOpportunity = this.analyzeMarketOpportunity(lead);
        
        // Step 6: Generate Personalized Message
        const personalizedMessage = this.generateComprehensiveMessage({
            lead: lead,
            websiteAnalysis: websiteAnalysis,
            leadScore: leadScore,
            businessIntelligence: businessIntelligence,
            competitiveAnalysis: competitiveAnalysis,
            marketOpportunity: marketOpportunity
        });

        return {
            lead: lead,
            websiteAnalysis: websiteAnalysis,
            leadScore: leadScore,
            businessIntelligence: businessIntelligence,
            competitiveAnalysis: competitiveAnalysis,
            marketOpportunity: marketOpportunity,
            painPoints: websiteAnalysis.painPoints || [],
            opportunities: websiteAnalysis.opportunities || [],
            recommendations: websiteAnalysis.recommendations || [],
            personalizedMessage: personalizedMessage,
            confidence: websiteAnalysis.confidence || 70,
            priority: this.calculatePriority(leadScore, websiteAnalysis)
        };
    }

    // Analyze business intelligence
    analyzeBusinessIntelligence(lead) {
        const intelligence = {
            businessType: this.determineBusinessType(lead),
            marketSize: this.estimateMarketSize(lead),
            digitalMaturity: this.assessDigitalMaturity(lead),
            revenuePotential: this.estimateRevenuePotential(lead),
            growthStage: this.determineGrowthStage(lead),
            decisionMakers: this.identifyDecisionMakers(lead),
            budgetIndicators: this.analyzeBudgetIndicators(lead),
            urgencyFactors: this.identifyUrgencyFactors(lead)
        };

        return intelligence;
    }

    // Analyze competition
    analyzeCompetition(lead) {
        const competition = {
            competitiveAdvantage: this.identifyCompetitiveAdvantage(lead),
            marketPosition: this.assessMarketPosition(lead),
            differentiation: this.findDifferentiation(lead),
            threats: this.identifyThreats(lead),
            opportunities: this.findMarketOpportunities(lead)
        };

        return competition;
    }

    // Analyze market opportunity
    analyzeMarketOpportunity(lead) {
        const opportunity = {
            marketTrends: this.analyzeMarketTrends(lead),
            seasonalFactors: this.identifySeasonalFactors(lead),
            localDemand: this.assessLocalDemand(lead),
            digitalGap: this.calculateDigitalGap(lead),
            potentialROI: this.estimateROI(lead)
        };

        return opportunity;
    }

    // Generate comprehensive personalized message
    generateComprehensiveMessage(analysis) {
        const { lead, websiteAnalysis, leadScore, businessIntelligence, competitiveAnalysis, marketOpportunity } = analysis;
        
        const name = lead.name || lead.contact_name || 'Estimado empresario';
        const businessName = lead.business_name || lead.company || 'su negocio';
        const location = lead.location || lead.city || 'Cancún';
        const businessType = businessIntelligence.businessType;
        
        // Build message components
        const greeting = this.createPersonalizedGreeting(name, businessName, businessType, location);
        const problemAnalysis = this.createProblemAnalysis(websiteAnalysis, businessIntelligence, competitiveAnalysis);
        const solutionPresentation = this.createSolutionPresentation(analysis);
        const socialProof = this.createSocialProof(location, businessType);
        const urgency = this.createUrgencyStatement(marketOpportunity, leadScore);
        const callToAction = this.createCallToAction(leadScore, businessIntelligence);
        const signature = this.createSignature();

        // Combine into final message
        return [
            greeting,
            '',
            problemAnalysis,
            '',
            solutionPresentation,
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

    // Helper methods for business intelligence
    determineBusinessType(lead) {
        const businessName = (lead.business_name || '').toLowerCase();
        const businessType = (lead.business_type || '').toLowerCase();
        const industry = (lead.industry || '').toLowerCase();
        
        const text = `${businessName} ${businessType} ${industry}`;
        
        if (text.includes('restaurant') || text.includes('comida') || text.includes('food')) {
            return 'restaurante';
        } else if (text.includes('hotel') || text.includes('hospedaje') || text.includes('accommodation')) {
            return 'hotel';
        } else if (text.includes('retail') || text.includes('tienda') || text.includes('shop') || text.includes('store')) {
            return 'tienda';
        } else if (text.includes('service') || text.includes('servicio') || text.includes('consulting')) {
            return 'servicios';
        } else if (text.includes('beauty') || text.includes('belleza') || text.includes('spa') || text.includes('salon')) {
            return 'belleza';
        } else if (text.includes('fitness') || text.includes('gym') || text.includes('gimnasio')) {
            return 'fitness';
        } else if (text.includes('medical') || text.includes('medico') || text.includes('health')) {
            return 'salud';
        } else {
            return 'negocio';
        }
    }

    estimateMarketSize(lead) {
        const businessType = this.determineBusinessType(lead);
        const location = (lead.location || '').toLowerCase();
        
        const marketSizes = {
            'restaurante': location.includes('cancun') ? 'grande' : 'mediano',
            'hotel': location.includes('cancun') ? 'muy grande' : 'grande',
            'tienda': 'mediano',
            'servicios': 'mediano',
            'belleza': 'mediano',
            'fitness': 'pequeño',
            'salud': 'grande'
        };
        
        return marketSizes[businessType] || 'mediano';
    }

    assessDigitalMaturity(lead) {
        let score = 0;
        
        if (lead.current_website && lead.current_website !== 'none') score += 3;
        if (lead.social_media_presence && lead.social_media_presence !== 'none') score += 2;
        if (lead.google_ranking && lead.google_ranking !== 'poor') score += 2;
        if (lead.online_reviews && parseInt(lead.online_reviews) > 10) score += 1;
        if (lead.ecommerce && lead.ecommerce === 'yes') score += 2;
        
        if (score >= 8) return 'avanzado';
        if (score >= 5) return 'intermedio';
        if (score >= 2) return 'básico';
        return 'principiante';
    }

    estimateRevenuePotential(lead) {
        const monthlyRevenue = parseInt(lead.monthly_revenue || 0);
        const employees = parseInt(lead.employees || 1);
        const businessType = this.determineBusinessType(lead);
        
        if (monthlyRevenue > 100000) return 'muy alto';
        if (monthlyRevenue > 50000) return 'alto';
        if (monthlyRevenue > 20000) return 'medio';
        if (monthlyRevenue > 5000) return 'bajo';
        
        // Estimate based on business type and employees
        const estimates = {
            'restaurante': employees * 15000,
            'hotel': employees * 25000,
            'tienda': employees * 12000,
            'servicios': employees * 18000,
            'belleza': employees * 8000,
            'fitness': employees * 10000,
            'salud': employees * 30000
        };
        
        const estimated = estimates[businessType] || employees * 10000;
        
        if (estimated > 100000) return 'muy alto';
        if (estimated > 50000) return 'alto';
        if (estimated > 20000) return 'medio';
        return 'bajo';
    }

    determineGrowthStage(lead) {
        const employees = parseInt(lead.employees || 1);
        const monthlyRevenue = parseInt(lead.monthly_revenue || 0);
        const yearsInBusiness = parseInt(lead.years_in_business || 1);
        
        if (employees > 20 || monthlyRevenue > 200000) return 'establecido';
        if (employees > 10 || monthlyRevenue > 100000) return 'en crecimiento';
        if (employees > 3 || monthlyRevenue > 50000) return 'en expansión';
        return 'emergente';
    }

    identifyDecisionMakers(lead) {
        const businessSize = parseInt(lead.employees || 1);
        
        if (businessSize > 20) return 'gerencia';
        if (businessSize > 5) return 'propietario/gerente';
        return 'propietario';
    }

    analyzeBudgetIndicators(lead) {
        const budget = parseInt(lead.budget || 0);
        const monthlyRevenue = parseInt(lead.monthly_revenue || 0);
        const businessType = this.determineBusinessType(lead);
        
        if (budget > 50000) return 'muy alto';
        if (budget > 20000) return 'alto';
        if (budget > 5000) return 'medio';
        
        // Estimate based on revenue and business type
        const revenuePercentage = {
            'restaurante': 0.15,
            'hotel': 0.20,
            'tienda': 0.10,
            'servicios': 0.12,
            'belleza': 0.08,
            'fitness': 0.10,
            'salud': 0.15
        };
        
        const estimatedBudget = monthlyRevenue * (revenuePercentage[businessType] || 0.10);
        
        if (estimatedBudget > 50000) return 'muy alto';
        if (estimatedBudget > 20000) return 'alto';
        if (estimatedBudget > 5000) return 'medio';
        return 'bajo';
    }

    identifyUrgencyFactors(lead) {
        const factors = [];
        
        if (lead.timeline && lead.timeline.toLowerCase().includes('urgent')) {
            factors.push('timeline urgente');
        }
        
        if (lead.competition && lead.competition.toLowerCase().includes('high')) {
            factors.push('competencia alta');
        }
        
        if (lead.season && lead.season.toLowerCase().includes('peak')) {
            factors.push('temporada alta');
        }
        
        if (lead.new_business === 'yes') {
            factors.push('negocio nuevo');
        }
        
        return factors;
    }

    // Message generation helpers
    createPersonalizedGreeting(name, businessName, businessType, location) {
        return `Hola ${name}, soy Alex de JegoDigital. Vi que tienes ${businessName}, ${businessType} en ${location}.`;
    }

    createProblemAnalysis(websiteAnalysis, businessIntelligence, competitiveAnalysis) {
        const problems = [];
        
        if (websiteAnalysis.status === 'no_website') {
            problems.push('tu negocio no tiene presencia web profesional');
            problems.push('estás perdiendo clientes que buscan en internet');
        } else if (websiteAnalysis.quality === 'poor' || websiteAnalysis.quality === 'fair') {
            problems.push('tu sitio web no está optimizado para generar clientes');
            problems.push('tu competencia te está ganando en internet');
        }
        
        if (businessIntelligence.digitalMaturity === 'principiante') {
            problems.push('tu presencia digital es muy limitada');
        }
        
        if (competitiveAnalysis.threats.length > 0) {
            problems.push('tus competidores tienen mejor presencia online');
        }
        
        return `He notado que ${problems.join(', ')}.`;
    }

    createSolutionPresentation(analysis) {
        const { websiteAnalysis, businessIntelligence, marketOpportunity } = analysis;
        
        const solutions = [];
        
        if (websiteAnalysis.status === 'no_website' || websiteAnalysis.quality === 'poor') {
            solutions.push('un sitio web profesional que genere más clientes');
        }
        
        if (businessIntelligence.digitalMaturity === 'principiante' || businessIntelligence.digitalMaturity === 'básico') {
            solutions.push('estrategia digital completa');
        }
        
        if (marketOpportunity.digitalGap > 70) {
            solutions.push('ventaja competitiva digital');
        }
        
        return `Te puedo ayudar a crear ${solutions.join(' y ')} para que:
• Aumentes tus ventas significativamente
• Te posiciones por encima de tu competencia
• Generes más clientes de calidad`;
    }

    createSocialProof(location, businessType) {
        if (location.toLowerCase().includes('cancun')) {
            return 'Somos la agencia #1 en Cancún. Hemos ayudado a más de 50 empresas locales a duplicar sus ventas con estrategias digitales profesionales.';
        } else {
            return 'Hemos trabajado con más de 50 empresas en la Riviera Maya, ayudándolas a crecer sus ventas en promedio 200% con nuestra estrategia digital.';
        }
    }

    createUrgencyStatement(marketOpportunity, leadScore) {
        if (marketOpportunity.potentialROI > 300) {
            return 'Esta es una oportunidad de oro para hacer crecer tu negocio. Cada día que pasa, pierdes clientes potenciales.';
        } else if (leadScore.total >= 80) {
            return 'Tu negocio tiene un gran potencial digital. No dejes que la competencia te gane terreno.';
        } else {
            return 'Es el momento perfecto para dar el salto digital y hacer crecer tu negocio.';
        }
    }

    createCallToAction(leadScore, businessIntelligence) {
        if (leadScore.total >= 80) {
            return `¿Tienes 15 minutos para una consulta gratuita? Te puedo mostrar exactamente cómo podemos hacer crecer ${businessIntelligence.revenuePotential === 'muy alto' ? 'significativamente' : ''} tus ventas.

Responde "SÍ" y te contacto hoy mismo.`;
        } else {
            return `¿Te gustaría conocer cómo podemos ayudarte a hacer crecer tu negocio?

Responde "SÍ" para una consulta gratuita de 15 minutos.`;
        }
    }

    createSignature() {
        return `Saludos,
Alex Jego
JegoDigital - Marketing Digital Cancún
📱 www.jegodigital.com
📧 alex@jegodigital.com`;
    }

    // Utility methods
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    calculatePriority(leadScore, websiteAnalysis) {
        let priority = 'medium';
        
        if (leadScore.total >= 85 && websiteAnalysis.quality === 'poor') {
            priority = 'very_high';
        } else if (leadScore.total >= 75) {
            priority = 'high';
        } else if (leadScore.total >= 60) {
            priority = 'medium';
        } else {
            priority = 'low';
        }
        
        return priority;
    }

    generateFallbackMessage(lead) {
        const name = lead.name || lead.contact_name || 'Estimado empresario';
        
        return `Hola ${name}, soy Alex de JegoDigital.

He notado que tu negocio podría beneficiarse de una mejor presencia digital para generar más clientes.

Te puedo ayudar con diseño web profesional y marketing digital para que:
• Aumentes tus ventas
• Te posiciones por encima de la competencia
• Generes más clientes de calidad

Somos la agencia #1 en Cancún y hemos ayudado a más de 50 empresas locales a duplicar sus ventas.

¿Te gustaría conocer cómo podemos ayudarte?

Responde "SÍ" para una consulta gratuita de 15 minutos.

Saludos,
Alex Jego
JegoDigital - Marketing Digital Cancún
📱 www.jegodigital.com
📧 alex@jegodigital.com`;
    }

    generateSummary(analyzedLeads) {
        const total = analyzedLeads.length;
        const highPriority = analyzedLeads.filter(l => l.priority === 'very_high' || l.priority === 'high').length;
        const noWebsite = analyzedLeads.filter(l => l.websiteAnalysis.status === 'no_website').length;
        const poorWebsite = analyzedLeads.filter(l => l.websiteAnalysis.quality === 'poor').length;
        
        return {
            totalLeads: total,
            highPriorityLeads: highPriority,
            noWebsiteLeads: noWebsite,
            poorWebsiteLeads: poorWebsite,
            averageConfidence: Math.round(analyzedLeads.reduce((sum, l) => sum + l.confidence, 0) / total),
            topOpportunities: this.getTopOpportunities(analyzedLeads)
        };
    }

    getTopOpportunities(analyzedLeads) {
        const opportunities = {};
        analyzedLeads.forEach(lead => {
            lead.opportunities.forEach(opp => {
                opportunities[opp] = (opportunities[opp] || 0) + 1;
            });
        });
        
        return Object.entries(opportunities)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 5)
            .map(([opp, count]) => ({ opportunity: opp, count }));
    }

    formatMessagesForSheets(analyzedLeads) {
        return analyzedLeads.map(analysis => ({
            leadId: analysis.lead.id,
            name: analysis.lead.name || analysis.lead.contact_name,
            businessName: analysis.lead.business_name || analysis.lead.company,
            phone: analysis.lead.phone,
            email: analysis.lead.email,
            location: analysis.lead.location || analysis.lead.city,
            businessType: analysis.businessIntelligence.businessType,
            websiteStatus: analysis.websiteAnalysis.status,
            websiteQuality: analysis.websiteAnalysis.quality,
            leadScore: analysis.leadScore.total,
            leadGrade: analysis.leadScore.grade,
            priority: analysis.priority,
            painPoints: analysis.painPoints.join(', '),
            opportunities: analysis.opportunities.join(', '),
            recommendations: analysis.recommendations.join(', '),
            personalizedMessage: analysis.personalizedMessage,
            messageLength: analysis.personalizedMessage.length,
            confidence: analysis.confidence,
            revenuePotential: analysis.businessIntelligence.revenuePotential,
            digitalMaturity: analysis.businessIntelligence.digitalMaturity,
            marketSize: analysis.businessIntelligence.marketSize,
            growthStage: analysis.businessIntelligence.growthStage
        }));
    }

    displayResults(results) {
        console.log('\n📊 COMPREHENSIVE ANALYSIS RESULTS:');
        console.log('=====================================');
        console.log(`Total Leads Analyzed: ${results.totalLeads}`);
        console.log(`High Priority Leads: ${results.summary.highPriorityLeads}`);
        console.log(`No Website: ${results.summary.noWebsiteLeads}`);
        console.log(`Poor Website Quality: ${results.summary.poorWebsiteLeads}`);
        console.log(`Average Confidence: ${results.summary.averageConfidence}%`);
        
        console.log('\n🎯 TOP OPPORTUNITIES:');
        results.summary.topOpportunities.forEach((opp, index) => {
            console.log(`${index + 1}. ${opp.opportunity} (${opp.count} leads)`);
        });
        
        console.log('\n📱 SAMPLE PERSONALIZED MESSAGES:');
        results.personalizedMessages.slice(0, 3).forEach((msg, index) => {
            console.log(`\n${index + 1}. ${msg.name} (${msg.businessName})`);
            console.log(`   Score: ${msg.leadScore}/100 (${msg.leadGrade})`);
            console.log(`   Priority: ${msg.priority}`);
            console.log(`   Website: ${msg.websiteStatus} (${msg.websiteQuality})`);
            console.log(`   Message Preview: ${msg.personalizedMessage.substring(0, 100)}...`);
        });
    }
}

module.exports = ComprehensiveLeadAnalyzer;
