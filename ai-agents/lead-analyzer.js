// AI Lead Analyzer Agent
class AILeadAnalyzer {
    constructor() {
        this.analysisCache = new Map();
        this.insights = {
            leadScoring: {},
            segmentation: {},
            personalization: {},
            optimization: {}
        };
    }

    // Main analysis function
    async analyzeAllLeads(leads) {
        console.log('🤖 AI Agent: Starting comprehensive lead analysis...');
        
        const results = {
            totalLeads: leads.length,
            analyzedLeads: [],
            insights: {},
            recommendations: {},
            segmentation: {},
            scoring: {}
        };

        // Phase 1: Individual Lead Analysis
        for (const lead of leads) {
            const analysis = await this.analyzeIndividualLead(lead);
            results.analyzedLeads.push(analysis);
        }

        // Phase 2: Pattern Recognition
        results.insights = await this.identifyPatterns(results.analyzedLeads);
        
        // Phase 3: Segmentation Analysis
        results.segmentation = await this.createSegments(results.analyzedLeads);
        
        // Phase 4: Scoring System
        results.scoring = await this.scoreLeads(results.analyzedLeads);
        
        // Phase 5: Generate Recommendations
        results.recommendations = await this.generateRecommendations(results);

        console.log('✅ AI Agent: Analysis complete!');
        return results;
    }

    // Analyze individual lead with AI insights
    async analyzeIndividualLead(lead) {
        const analysis = {
            leadId: lead.id,
            basicInfo: {
                name: lead.name,
                phone: lead.phone,
                email: lead.email,
                source: lead.source
            },
            aiInsights: {
                leadQuality: this.assessLeadQuality(lead),
                buyingIntent: this.assessBuyingIntent(lead),
                engagementLevel: this.assessEngagementLevel(lead),
                budgetEstimate: this.estimateBudget(lead),
                decisionMakingStyle: this.assessDecisionStyle(lead),
                urgencyLevel: this.assessUrgency(lead),
                communicationPreference: this.assessCommunicationStyle(lead),
                painPoints: this.identifyPainPoints(lead),
                competitiveAdvantage: this.assessCompetitiveAdvantage(lead),
                riskFactors: this.identifyRiskFactors(lead)
            },
            personalization: {
                preferredMessageStyle: this.determineMessageStyle(lead),
                optimalContactTime: this.determineOptimalTime(lead),
                personalizedValueProposition: this.createValueProposition(lead),
                customTalkingPoints: this.generateTalkingPoints(lead)
            },
            recommendations: {
                priority: this.determinePriority(lead),
                nextAction: this.recommendNextAction(lead),
                messageTemplate: this.selectMessageTemplate(lead),
                followUpStrategy: this.recommendFollowUpStrategy(lead)
            }
        };

        return analysis;
    }

    // AI-Powered Lead Quality Assessment
    assessLeadQuality(lead) {
        let score = 0;
        const factors = [];

        // Source quality analysis
        const sourceScores = {
            'website_form': 90,
            'google_ads': 85,
            'referral': 95,
            'social_media': 75,
            'cold_outreach': 60,
            'event': 80
        };
        score += sourceScores[lead.source] || 50;
        factors.push(`Source: ${lead.source} (${sourceScores[lead.source] || 50} points)`);

        // Contact completeness
        if (lead.email && lead.phone) {
            score += 20;
            factors.push('Complete contact info (+20 points)');
        } else if (lead.phone) {
            score += 15;
            factors.push('Phone number available (+15 points)');
        }

        // Interest level indicators
        if (lead.interest) {
            score += 25;
            factors.push(`Specific interest: ${lead.interest} (+25 points)`);
        }

        // Lead behavior indicators
        if (lead.tags && lead.tags.includes('hot_lead')) {
            score += 30;
            factors.push('Hot lead indicator (+30 points)');
        }

        // Geographic relevance
        if (lead.tags && lead.tags.includes('cancun')) {
            score += 15;
            factors.push('Local market (+15 points)');
        }

        return {
            score: Math.min(score, 100),
            factors: factors,
            grade: this.getGrade(score)
        };
    }

    // AI-Powered Buying Intent Assessment
    assessBuyingIntent(lead) {
        let intentScore = 0;
        const indicators = [];

        // Time-based indicators
        if (lead.created_at) {
            const daysSinceCreation = (new Date() - new Date(lead.created_at)) / (1000 * 60 * 60 * 24);
            if (daysSinceCreation < 7) {
                intentScore += 40;
                indicators.push('Recent inquiry (+40 points)');
            } else if (daysSinceCreation < 30) {
                intentScore += 20;
                indicators.push('Recent inquiry (+20 points)');
            }
        }

        // Interest specificity
        const highIntentInterests = ['web_design', 'ecommerce', 'seo'];
        if (highIntentInterests.includes(lead.interest)) {
            intentScore += 35;
            indicators.push(`High-intent interest: ${lead.interest} (+35 points)`);
        }

        // Source intent analysis
        if (lead.source === 'website_form') {
            intentScore += 25;
            indicators.push('Direct website inquiry (+25 points)');
        }

        return {
            score: Math.min(intentScore, 100),
            indicators: indicators,
            level: this.getIntentLevel(intentScore)
        };
    }

    // AI-Powered Engagement Level Assessment
    assessEngagementLevel(lead) {
        let engagementScore = 0;
        const factors = [];

        // Previous interaction analysis
        if (lead.message_count > 0) {
            engagementScore += 30;
            factors.push(`Previous interactions: ${lead.message_count} (+30 points)`);
        }

        // Response history
        if (lead.response_status === 'positive') {
            engagementScore += 50;
            factors.push('Positive response history (+50 points)');
        } else if (lead.response_status === 'responded') {
            engagementScore += 25;
            factors.push('Has responded before (+25 points)');
        }

        // Lead stage progression
        const stageScores = {
            'new_lead': 0,
            'contacted': 20,
            'interested': 40,
            'warm_lead': 60,
            'hot_lead': 80,
            'consultation_requested': 90
        };
        engagementScore += stageScores[lead.stage] || 0;
        factors.push(`Stage: ${lead.stage} (+${stageScores[lead.stage] || 0} points)`);

        return {
            score: Math.min(engagementScore, 100),
            factors: factors,
            level: this.getEngagementLevel(engagementScore)
        };
    }

    // AI-Powered Budget Estimation
    estimateBudget(lead) {
        const budgetRanges = {
            'web_design': { min: 5000, max: 50000 },
            'seo': { min: 3000, max: 15000 },
            'social_media': { min: 2000, max: 10000 },
            'ecommerce': { min: 8000, max: 80000 },
            'marketing': { min: 5000, max: 25000 }
        };

        const range = budgetRanges[lead.interest] || { min: 2000, max: 20000 };
        
        return {
            estimatedRange: range,
            confidence: this.calculateBudgetConfidence(lead),
            factors: [
                `Service type: ${lead.interest}`,
                `Market: Cancún`,
                `Source: ${lead.source}`
            ]
        };
    }

    // AI-Powered Decision Making Style Assessment
    assessDecisionStyle(lead) {
        const styles = {
            'analytical': {
                indicators: ['website_form', 'seo', 'email_contact'],
                characteristics: 'Research-focused, data-driven, needs proof'
            },
            'social': {
                indicators: ['referral', 'social_media', 'event'],
                characteristics: 'Relationship-focused, trust-based, needs social proof'
            },
            'direct': {
                indicators: ['phone_contact', 'urgent_inquiry'],
                characteristics: 'Action-oriented, time-sensitive, needs quick results'
            },
            'cautious': {
                indicators: ['multiple_contacts', 'long_research_time'],
                characteristics: 'Risk-averse, needs guarantees, slow decision maker'
            }
        };

        // Determine style based on lead characteristics
        let detectedStyle = 'analytical'; // default
        
        if (lead.source === 'referral') {
            detectedStyle = 'social';
        } else if (lead.tags && lead.tags.includes('urgent')) {
            detectedStyle = 'direct';
        } else if (lead.message_count > 3) {
            detectedStyle = 'cautious';
        }

        return {
            style: detectedStyle,
            characteristics: styles[detectedStyle].characteristics,
            approach: this.recommendApproach(detectedStyle)
        };
    }

    // AI-Powered Urgency Assessment
    assessUrgency(lead) {
        let urgencyScore = 0;
        const factors = [];

        // Time-based urgency
        if (lead.created_at) {
            const hoursSinceCreation = (new Date() - new Date(lead.created_at)) / (1000 * 60 * 60);
            if (hoursSinceCreation < 24) {
                urgencyScore += 40;
                factors.push('Very recent inquiry (+40 points)');
            } else if (hoursSinceCreation < 72) {
                urgencyScore += 25;
                factors.push('Recent inquiry (+25 points)');
            }
        }

        // Interest-based urgency
        const urgentInterests = ['ecommerce', 'web_design'];
        if (urgentInterests.includes(lead.interest)) {
            urgencyScore += 30;
            factors.push(`Urgent interest: ${lead.interest} (+30 points)`);
        }

        // Source urgency
        if (lead.source === 'website_form') {
            urgencyScore += 20;
            factors.push('Direct inquiry (+20 points)');
        }

        // Tag-based urgency
        if (lead.tags && lead.tags.includes('urgent')) {
            urgencyScore += 50;
            factors.push('Urgent tag (+50 points)');
        }

        return {
            score: Math.min(urgencyScore, 100),
            factors: factors,
            level: this.getUrgencyLevel(urgencyScore),
            recommendedAction: this.recommendUrgentAction(urgencyScore)
        };
    }

    // AI-Powered Communication Style Assessment
    assessCommunicationStyle(lead) {
        const styles = {
            'formal': {
                indicators: ['email_contact', 'business_hours', 'detailed_inquiry'],
                approach: 'Professional, detailed, structured'
            },
            'casual': {
                indicators: ['social_media', 'weekend_contact', 'brief_inquiry'],
                approach: 'Friendly, relaxed, conversational'
            },
            'direct': {
                indicators: ['phone_contact', 'urgent_inquiry', 'specific_questions'],
                approach: 'Straightforward, efficient, results-focused'
            },
            'detailed': {
                indicators: ['long_message', 'multiple_questions', 'research_heavy'],
                approach: 'Comprehensive, thorough, information-rich'
            }
        };

        // Determine communication style
        let detectedStyle = 'formal'; // default
        
        if (lead.source === 'social_media') {
            detectedStyle = 'casual';
        } else if (lead.tags && lead.tags.includes('urgent')) {
            detectedStyle = 'direct';
        } else if (lead.notes && lead.notes.length > 100) {
            detectedStyle = 'detailed';
        }

        return {
            style: detectedStyle,
            approach: styles[detectedStyle].approach,
            recommendedTone: this.recommendTone(detectedStyle)
        };
    }

    // AI-Powered Pain Point Identification
    identifyPainPoints(lead) {
        const painPoints = {
            'web_design': [
                'Outdated website affecting credibility',
                'Poor user experience losing customers',
                'Mobile responsiveness issues',
                'Slow loading times',
                'Not generating leads'
            ],
            'seo': [
                'Not appearing in Google search results',
                'Competitors ranking higher',
                'Low website traffic',
                'Poor local visibility',
                'No online presence'
            ],
            'social_media': [
                'Inconsistent posting schedule',
                'Low engagement rates',
                'Not reaching target audience',
                'Poor content quality',
                'No social media strategy'
            ],
            'ecommerce': [
                'Low online sales',
                'Poor checkout experience',
                'No payment processing',
                'Inventory management issues',
                'Poor product presentation'
            ]
        };

        const identifiedPainPoints = painPoints[lead.interest] || [
            'Need for digital presence',
            'Competitive disadvantage',
            'Low customer acquisition',
            'Poor online visibility'
        ];

        return {
            primary: identifiedPainPoints[0],
            secondary: identifiedPainPoints.slice(1, 3),
            all: identifiedPainPoints,
            impact: this.assessPainPointImpact(lead.interest)
        };
    }

    // AI-Powered Competitive Advantage Assessment
    assessCompetitiveAdvantage(lead) {
        const advantages = {
            'local_expertise': 'Deep knowledge of Cancún market',
            'proven_results': '50+ successful projects in Cancún',
            'personal_service': 'Direct access to Alex (owner)',
            'competitive_pricing': '30% below market rates',
            'fast_delivery': 'Quick turnaround times',
            'comprehensive_service': 'Full-service digital marketing'
        };

        // Determine relevant advantages based on lead profile
        const relevantAdvantages = [];
        
        if (lead.tags && lead.tags.includes('cancun')) {
            relevantAdvantages.push('local_expertise', 'proven_results');
        }
        
        if (lead.interest === 'web_design') {
            relevantAdvantages.push('fast_delivery', 'proven_results');
        }
        
        if (lead.source === 'referral') {
            relevantAdvantages.push('proven_results', 'personal_service');
        }

        return {
            primary: relevantAdvantages[0] || 'proven_results',
            secondary: relevantAdvantages.slice(1),
            all: relevantAdvantages,
            messaging: this.createAdvantageMessage(relevantAdvantages)
        };
    }

    // AI-Powered Risk Factor Identification
    identifyRiskFactors(lead) {
        const risks = [];
        
        // Time-based risks
        if (lead.created_at) {
            const daysSinceCreation = (new Date() - new Date(lead.created_at)) / (1000 * 60 * 60 * 24);
            if (daysSinceCreation > 30) {
                risks.push({
                    factor: 'Cold lead',
                    severity: 'medium',
                    mitigation: 'Re-engagement campaign needed'
                });
            }
        }

        // Engagement risks
        if (lead.response_status === 'negative') {
            risks.push({
                factor: 'Negative response',
                severity: 'high',
                mitigation: 'Approach with caution, focus on value'
            });
        }

        // Source risks
        if (lead.source === 'cold_outreach') {
            risks.push({
                factor: 'Cold outreach source',
                severity: 'low',
                mitigation: 'Build trust first, provide value'
            });
        }

        return {
            risks: risks,
            overallRisk: this.calculateOverallRisk(risks),
            recommendations: this.generateRiskMitigation(risks)
        };
    }

    // Helper methods
    getGrade(score) {
        if (score >= 90) return 'A+';
        if (score >= 80) return 'A';
        if (score >= 70) return 'B+';
        if (score >= 60) return 'B';
        if (score >= 50) return 'C';
        return 'D';
    }

    getIntentLevel(score) {
        if (score >= 80) return 'Very High';
        if (score >= 60) return 'High';
        if (score >= 40) return 'Medium';
        if (score >= 20) return 'Low';
        return 'Very Low';
    }

    getEngagementLevel(score) {
        if (score >= 80) return 'Highly Engaged';
        if (score >= 60) return 'Engaged';
        if (score >= 40) return 'Moderately Engaged';
        if (score >= 20) return 'Low Engagement';
        return 'No Engagement';
    }

    getUrgencyLevel(score) {
        if (score >= 80) return 'Critical';
        if (score >= 60) return 'High';
        if (score >= 40) return 'Medium';
        if (score >= 20) return 'Low';
        return 'No Urgency';
    }

    calculateBudgetConfidence(lead) {
        let confidence = 50; // base confidence
        
        if (lead.interest) confidence += 20;
        if (lead.source === 'website_form') confidence += 15;
        if (lead.tags && lead.tags.includes('cancun')) confidence += 10;
        
        return Math.min(confidence, 95);
    }

    recommendApproach(style) {
        const approaches = {
            'analytical': 'Provide data, case studies, and detailed proposals',
            'social': 'Focus on relationships, testimonials, and social proof',
            'direct': 'Be straightforward, focus on results and timelines',
            'cautious': 'Provide guarantees, testimonials, and risk mitigation'
        };
        return approaches[style] || approaches['analytical'];
    }

    recommendTone(style) {
        const tones = {
            'formal': 'Professional and respectful',
            'casual': 'Friendly and conversational',
            'direct': 'Straightforward and efficient',
            'detailed': 'Comprehensive and thorough'
        };
        return tones[style] || tones['formal'];
    }

    assessPainPointImpact(interest) {
        const impacts = {
            'web_design': 'High - Directly affects customer acquisition',
            'seo': 'High - Critical for online visibility',
            'social_media': 'Medium - Affects brand awareness',
            'ecommerce': 'Critical - Directly impacts revenue'
        };
        return impacts[interest] || 'Medium - General business impact';
    }

    createAdvantageMessage(advantages) {
        const messages = {
            'local_expertise': 'We understand the Cancún market better than anyone',
            'proven_results': 'Our track record speaks for itself',
            'personal_service': 'You work directly with the owner',
            'competitive_pricing': 'Best value in the market',
            'fast_delivery': 'Quick turnaround, fast results',
            'comprehensive_service': 'One-stop solution for all your needs'
        };
        
        return advantages.map(adv => messages[adv]).join('. ');
    }

    calculateOverallRisk(risks) {
        if (risks.length === 0) return 'Low';
        
        const highRisks = risks.filter(r => r.severity === 'high').length;
        const mediumRisks = risks.filter(r => r.severity === 'medium').length;
        
        if (highRisks > 0) return 'High';
        if (mediumRisks > 1) return 'Medium';
        return 'Low';
    }

    generateRiskMitigation(risks) {
        return risks.map(risk => risk.mitigation);
    }

    // Additional analysis methods would go here...
    // (Pattern recognition, segmentation, scoring, recommendations, etc.)
}

module.exports = AILeadAnalyzer;


