// Lead Scoring System Analyzer
class LeadScoringAnalyzer {
    constructor() {
        this.realQualificationCriteria = {
            businessValidation: {
                weight: 25,
                factors: [
                    'Has business website',
                    'Business phone number',
                    'Business email',
                    'Business address',
                    'Business description'
                ]
            },
            marketFit: {
                weight: 20,
                factors: [
                    'Industry type',
                    'Business size',
                    'Geographic location (Cancún)',
                    'Digital presence needs'
                ]
            },
            buyingIntent: {
                weight: 25,
                factors: [
                    'Specific service interest',
                    'Timeline mentioned',
                    'Budget indicators',
                    'Pain points identified'
                ]
            },
            contactQuality: {
                weight: 15,
                factors: [
                    'Complete contact information',
                    'Professional email domain',
                    'Valid phone number',
                    'Response history'
                ]
            },
            engagement: {
                weight: 15,
                factors: [
                    'Previous interactions',
                    'Response rate',
                    'Engagement level',
                    'Follow-up potential'
                ]
            }
        };
    }

    // Analyze current lead scoring for accuracy
    analyzeCurrentScoring(leads) {
        console.log('🔍 Analyzing current lead scoring system...');
        
        const analysis = {
            totalLeads: leads.length,
            scoringAccuracy: {},
            qualificationIssues: [],
            recommendations: {},
            realQualifiedLeads: [],
            fakeQualifiedLeads: []
        };

        leads.forEach(lead => {
            const realScore = this.calculateRealScore(lead);
            const currentScore = lead.score || 0;
            
            const scoreDifference = Math.abs(realScore - currentScore);
            
            if (scoreDifference > 20) {
                analysis.qualificationIssues.push({
                    leadId: lead.id,
                    name: lead.name,
                    currentScore: currentScore,
                    realScore: realScore,
                    difference: scoreDifference,
                    issue: currentScore > realScore ? 'Over-qualified' : 'Under-qualified'
                });
            }

            // Categorize leads
            if (realScore >= 70) {
                analysis.realQualifiedLeads.push({
                    ...lead,
                    realScore: realScore,
                    qualificationReason: this.getQualificationReason(lead, realScore)
                });
            } else {
                analysis.fakeQualifiedLeads.push({
                    ...lead,
                    realScore: realScore,
                    disqualificationReason: this.getDisqualificationReason(lead, realScore)
                });
            }
        });

        // Calculate accuracy metrics
        analysis.scoringAccuracy = {
            accuracyRate: ((leads.length - analysis.qualificationIssues.length) / leads.length * 100).toFixed(1),
            overQualifiedCount: analysis.qualificationIssues.filter(issue => issue.issue === 'Over-qualified').length,
            underQualifiedCount: analysis.qualificationIssues.filter(issue => issue.issue === 'Under-qualified').length,
            realQualifiedCount: analysis.realQualifiedLeads.length,
            fakeQualifiedCount: analysis.fakeQualifiedLeads.length
        };

        // Generate recommendations
        analysis.recommendations = this.generateRecommendations(analysis);

        console.log('✅ Lead scoring analysis complete!');
        return analysis;
    }

    // Calculate real qualification score
    calculateRealScore(lead) {
        let totalScore = 0;
        const scoreBreakdown = {};

        // Business Validation (25 points)
        const businessValidationScore = this.assessBusinessValidation(lead);
        totalScore += businessValidationScore;
        scoreBreakdown.businessValidation = businessValidationScore;

        // Market Fit (20 points)
        const marketFitScore = this.assessMarketFit(lead);
        totalScore += marketFitScore;
        scoreBreakdown.marketFit = marketFitScore;

        // Buying Intent (25 points)
        const buyingIntentScore = this.assessBuyingIntent(lead);
        totalScore += buyingIntentScore;
        scoreBreakdown.buyingIntent = buyingIntentScore;

        // Contact Quality (15 points)
        const contactQualityScore = this.assessContactQuality(lead);
        totalScore += contactQualityScore;
        scoreBreakdown.contactQuality = contactQualityScore;

        // Engagement (15 points)
        const engagementScore = this.assessEngagement(lead);
        totalScore += engagementScore;
        scoreBreakdown.engagement = engagementScore;

        return {
            total: Math.min(Math.round(totalScore), 100),
            breakdown: scoreBreakdown,
            grade: this.getGrade(totalScore)
        };
    }

    // Assess business validation
    assessBusinessValidation(lead) {
        let score = 0;
        
        // Business name validation
        if (lead.business_name && lead.business_name.length > 2) {
            score += 5;
        }
        
        // Business type validation
        if (lead.business_type && ['restaurant', 'hotel', 'retail', 'service', 'ecommerce'].includes(lead.business_type.toLowerCase())) {
            score += 5;
        }
        
        // Business size indicators
        if (lead.employees && parseInt(lead.employees) >= 1) {
            score += 5;
        }
        
        // Revenue indicators
        if (lead.monthly_revenue && parseInt(lead.monthly_revenue) >= 10000) {
            score += 5;
        }
        
        // Business description
        if (lead.business_description && lead.business_description.length > 20) {
            score += 5;
        }

        return Math.min(score, 25);
    }

    // Assess market fit
    assessMarketFit(lead) {
        let score = 0;
        
        // Geographic fit (Cancún)
        if (lead.location && (lead.location.toLowerCase().includes('cancun') || lead.location.toLowerCase().includes('cancún'))) {
            score += 8;
        }
        
        // Industry fit
        const highFitIndustries = ['restaurant', 'hotel', 'tourism', 'retail', 'beauty', 'fitness', 'healthcare'];
        if (lead.industry && highFitIndustries.some(industry => lead.industry.toLowerCase().includes(industry))) {
            score += 6;
        }
        
        // Digital presence needs
        if (lead.current_website && lead.current_website === 'none') {
            score += 6; // High need for website
        } else if (lead.current_website && lead.current_website === 'outdated') {
            score += 4; // Moderate need
        }

        return Math.min(score, 20);
    }

    // Assess buying intent
    assessBuyingIntent(lead) {
        let score = 0;
        
        // Specific service interest
        const services = ['website', 'web design', 'seo', 'social media', 'ecommerce', 'marketing'];
        if (lead.interest && services.some(service => lead.interest.toLowerCase().includes(service))) {
            score += 8;
        }
        
        // Timeline indicators
        if (lead.timeline && ['asap', 'immediately', 'this month', 'urgent'].some(timeframe => lead.timeline.toLowerCase().includes(timeframe))) {
            score += 8;
        }
        
        // Budget indicators
        if (lead.budget && parseInt(lead.budget) >= 5000) {
            score += 9;
        } else if (lead.budget && parseInt(lead.budget) >= 3000) {
            score += 6;
        } else if (lead.budget && parseInt(lead.budget) >= 1000) {
            score += 3;
        }

        return Math.min(score, 25);
    }

    // Assess contact quality
    assessContactQuality(lead) {
        let score = 0;
        
        // Complete contact info
        if (lead.phone && lead.email && lead.name) {
            score += 8;
        } else if (lead.phone && lead.email) {
            score += 6;
        } else if (lead.phone || lead.email) {
            score += 4;
        }
        
        // Professional email domain
        if (lead.email && !lead.email.includes('gmail.com') && !lead.email.includes('yahoo.com') && !lead.email.includes('hotmail.com')) {
            score += 4;
        } else if (lead.email) {
            score += 2;
        }
        
        // Valid phone format
        if (lead.phone && this.isValidPhone(lead.phone)) {
            score += 3;
        }

        return Math.min(score, 15);
    }

    // Assess engagement
    assessEngagement(lead) {
        let score = 0;
        
        // Previous interactions
        if (lead.interaction_count && parseInt(lead.interaction_count) > 0) {
            score += 5;
        }
        
        // Response rate
        if (lead.response_rate && parseFloat(lead.response_rate) > 0.5) {
            score += 5;
        }
        
        // Engagement level
        if (lead.engagement_level && ['high', 'medium-high'].includes(lead.engagement_level.toLowerCase())) {
            score += 5;
        }

        return Math.min(score, 15);
    }

    // Helper methods
    isValidPhone(phone) {
        const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
        return phoneRegex.test(phone.replace(/\s/g, ''));
    }

    getGrade(score) {
        if (score >= 90) return 'A+';
        if (score >= 80) return 'A';
        if (score >= 70) return 'B+';
        if (score >= 60) return 'B';
        if (score >= 50) return 'C';
        return 'D';
    }

    getQualificationReason(lead, score) {
        const reasons = [];
        
        if (score >= 80) {
            reasons.push('High-quality lead with strong business validation');
        }
        
        if (lead.location && lead.location.toLowerCase().includes('cancun')) {
            reasons.push('Local market fit');
        }
        
        if (lead.budget && parseInt(lead.budget) >= 5000) {
            reasons.push('Strong budget indicators');
        }
        
        if (lead.timeline && lead.timeline.toLowerCase().includes('urgent')) {
            reasons.push('High urgency/priority');
        }
        
        return reasons.join(', ');
    }

    getDisqualificationReason(lead, score) {
        const reasons = [];
        
        if (score < 50) {
            reasons.push('Insufficient business validation');
        }
        
        if (!lead.phone || !lead.email) {
            reasons.push('Incomplete contact information');
        }
        
        if (!lead.business_name || lead.business_name.length < 3) {
            reasons.push('Invalid business information');
        }
        
        if (lead.budget && parseInt(lead.budget) < 1000) {
            reasons.push('Budget too low');
        }
        
        return reasons.join(', ');
    }

    generateRecommendations(analysis) {
        const recommendations = {
            immediate: [],
            shortTerm: [],
            longTerm: []
        };

        // Immediate recommendations
        if (analysis.scoringAccuracy.overQualifiedCount > 0) {
            recommendations.immediate.push(
                `Review ${analysis.scoringAccuracy.overQualifiedCount} over-qualified leads - they may not be worth the effort`
            );
        }

        if (analysis.scoringAccuracy.underQualifiedCount > 0) {
            recommendations.immediate.push(
                `Re-qualify ${analysis.scoringAccuracy.underQualifiedCount} under-qualified leads - they may be hidden gems`
            );
        }

        // Short-term recommendations
        if (analysis.realQualifiedLeads.length < 50) {
            recommendations.shortTerm.push(
                'Focus on lead generation - need more qualified leads for effective outreach'
            );
        }

        // Long-term recommendations
        recommendations.longTerm.push(
            'Implement automated lead scoring system',
            'Create lead nurturing campaigns for B+ and C grade leads',
            'Develop qualification criteria documentation'
        );

        return recommendations;
    }
}

module.exports = LeadScoringAnalyzer;


