// AI Pattern Recognition Agent
class AIPatternRecognizer {
    constructor() {
        this.patterns = {
            behavioral: {},
            temporal: {},
            demographic: {},
            psychographic: {},
            conversion: {}
        };
    }

    // Main pattern recognition function
    async identifyPatterns(analyzedLeads) {
        console.log('🔍 AI Pattern Recognizer: Analyzing patterns across all leads...');

        const patterns = {
            behavioral: await this.identifyBehavioralPatterns(analyzedLeads),
            temporal: await this.identifyTemporalPatterns(analyzedLeads),
            demographic: await this.identifyDemographicPatterns(analyzedLeads),
            psychographic: await this.identifyPsychographicPatterns(analyzedLeads),
            conversion: await this.identifyConversionPatterns(analyzedLeads),
            successFactors: await this.identifySuccessFactors(analyzedLeads),
            riskPatterns: await this.identifyRiskPatterns(analyzedLeads),
            opportunityClusters: await this.identifyOpportunityClusters(analyzedLeads)
        };

        console.log('✅ Pattern recognition complete!');
        return patterns;
    }

    // Behavioral Pattern Recognition
    async identifyBehavioralPatterns(leads) {
        const patterns = {
            responsePatterns: {},
            engagementPatterns: {},
            communicationPatterns: {},
            decisionPatterns: {}
        };

        // Response time patterns
        const responseTimes = leads
            .filter(lead => lead.basicInfo.lastResponse)
            .map(lead => this.calculateResponseTime(lead));

        patterns.responsePatterns = {
            averageResponseTime: this.calculateAverage(responseTimes),
            fastResponders: responseTimes.filter(time => time < 24).length,
            slowResponders: responseTimes.filter(time => time > 72).length,
            insights: this.generateResponseInsights(responseTimes)
        };

        // Engagement level patterns
        const engagementLevels = leads.map(lead => lead.aiInsights.engagementLevel.level);
        patterns.engagementPatterns = {
            distribution: this.calculateDistribution(engagementLevels),
            highEngagementRate: engagementLevels.filter(level => level === 'Highly Engaged').length / leads.length,
            insights: this.generateEngagementInsights(engagementLevels)
        };

        // Communication preference patterns
        const commStyles = leads.map(lead => lead.aiInsights.communicationPreference.style);
        patterns.communicationPatterns = {
            styleDistribution: this.calculateDistribution(commStyles),
            preferredStyle: this.getMostCommon(commStyles),
            insights: this.generateCommunicationInsights(commStyles)
        };

        return patterns;
    }

    // Temporal Pattern Recognition
    async identifyTemporalPatterns(leads) {
        const patterns = {
            timePatterns: {},
            seasonalPatterns: {},
            lifecyclePatterns: {},
            urgencyPatterns: {}
        };

        // Time-based patterns
        const creationTimes = leads.map(lead => new Date(lead.basicInfo.created_at || Date.now()));
        patterns.timePatterns = {
            peakHours: this.identifyPeakHours(creationTimes),
            peakDays: this.identifyPeakDays(creationTimes),
            peakMonths: this.identifyPeakMonths(creationTimes),
            insights: this.generateTimeInsights(creationTimes)
        };

        // Urgency patterns
        const urgencyLevels = leads.map(lead => lead.aiInsights.urgencyLevel.level);
        patterns.urgencyPatterns = {
            distribution: this.calculateDistribution(urgencyLevels),
            criticalUrgencyRate: urgencyLevels.filter(level => level === 'Critical').length / leads.length,
            insights: this.generateUrgencyInsights(urgencyLevels)
        };

        return patterns;
    }

    // Demographic Pattern Recognition
    async identifyDemographicPatterns(leads) {
        const patterns = {
            sourcePatterns: {},
            interestPatterns: {},
            locationPatterns: {},
            marketSegments: {}
        };

        // Source analysis
        const sources = leads.map(lead => lead.basicInfo.source);
        patterns.sourcePatterns = {
            distribution: this.calculateDistribution(sources),
            topSource: this.getMostCommon(sources),
            sourceQuality: this.analyzeSourceQuality(sources, leads),
            insights: this.generateSourceInsights(sources)
        };

        // Interest analysis
        const interests = leads.map(lead => lead.basicInfo.interest);
        patterns.interestPatterns = {
            distribution: this.calculateDistribution(interests),
            topInterest: this.getMostCommon(interests),
            interestTrends: this.analyzeInterestTrends(interests, leads),
            insights: this.generateInterestInsights(interests)
        };

        return patterns;
    }

    // Psychographic Pattern Recognition
    async identifyPsychographicPatterns(leads) {
        const patterns = {
            decisionStylePatterns: {},
            communicationStylePatterns: {},
            painPointPatterns: {},
            motivationPatterns: {}
        };

        // Decision style patterns
        const decisionStyles = leads.map(lead => lead.aiInsights.decisionMakingStyle.style);
        patterns.decisionStylePatterns = {
            distribution: this.calculateDistribution(decisionStyles),
            dominantStyle: this.getMostCommon(decisionStyles),
            insights: this.generateDecisionStyleInsights(decisionStyles)
        };

        // Pain point patterns
        const painPoints = leads.flatMap(lead => lead.aiInsights.painPoints.all);
        patterns.painPointPatterns = {
            topPainPoints: this.getTopOccurrences(painPoints, 5),
            painPointClusters: this.clusterPainPoints(painPoints),
            insights: this.generatePainPointInsights(painPoints)
        };

        return patterns;
    }

    // Conversion Pattern Recognition
    async identifyConversionPatterns(leads) {
        const patterns = {
            conversionFunnel: {},
            successFactors: {},
            failurePoints: {},
            optimizationOpportunities: {}
        };

        // Analyze conversion stages
        const stages = leads.map(lead => lead.basicInfo.stage || 'new_lead');
        patterns.conversionFunnel = {
            stageDistribution: this.calculateDistribution(stages),
            conversionRates: this.calculateConversionRates(stages),
            bottlenecks: this.identifyBottlenecks(stages),
            insights: this.generateConversionInsights(stages)
        };

        // Success factor analysis
        const successfulLeads = leads.filter(lead => 
            ['interested', 'consultation_requested', 'converted'].includes(lead.basicInfo.stage)
        );
        
        patterns.successFactors = {
            commonCharacteristics: this.identifyCommonCharacteristics(successfulLeads),
            successPatterns: this.analyzeSuccessPatterns(successfulLeads),
            insights: this.generateSuccessInsights(successfulLeads)
        };

        return patterns;
    }

    // Success Factor Identification
    async identifySuccessFactors(leads) {
        const successFactors = {
            leadQualityFactors: {},
            timingFactors: {},
            approachFactors: {},
            contentFactors: {}
        };

        // Analyze high-quality leads
        const highQualityLeads = leads.filter(lead => 
            lead.aiInsights.leadQuality.grade === 'A' || lead.aiInsights.leadQuality.grade === 'A+'
        );

        successFactors.leadQualityFactors = {
            commonSources: this.getMostCommon(highQualityLeads.map(l => l.basicInfo.source)),
            commonInterests: this.getMostCommon(highQualityLeads.map(l => l.basicInfo.interest)),
            averageQualityScore: this.calculateAverage(highQualityLeads.map(l => l.aiInsights.leadQuality.score)),
            insights: this.generateQualityInsights(highQualityLeads)
        };

        return successFactors;
    }

    // Risk Pattern Identification
    async identifyRiskPatterns(leads) {
        const riskPatterns = {
            highRiskFactors: {},
            churnPatterns: {},
            engagementDropPatterns: {},
            mitigationStrategies: {}
        };

        // Identify high-risk leads
        const highRiskLeads = leads.filter(lead => 
            lead.aiInsights.riskFactors.overallRisk === 'High'
        );

        riskPatterns.highRiskFactors = {
            commonRiskFactors: this.getMostCommon(highRiskLeads.flatMap(l => l.aiInsights.riskFactors.risks.map(r => r.factor))),
            riskDistribution: this.calculateDistribution(highRiskLeads.map(l => l.aiInsights.riskFactors.overallRisk)),
            insights: this.generateRiskInsights(highRiskLeads)
        };

        return riskPatterns;
    }

    // Opportunity Cluster Identification
    async identifyOpportunityClusters(leads) {
        const clusters = {
            highValueClusters: {},
            quickWinClusters: {},
            longTermClusters: {},
            expansionClusters: {}
        };

        // High-value opportunity clusters
        const highValueLeads = leads.filter(lead => 
            lead.aiInsights.leadQuality.score >= 80 && 
            lead.aiInsights.buyingIntent.level === 'High'
        );

        clusters.highValueClusters = {
            size: highValueLeads.length,
            characteristics: this.identifyClusterCharacteristics(highValueLeads),
            potentialRevenue: this.estimateClusterRevenue(highValueLeads),
            recommendedAction: 'Priority outreach with personalized approach'
        };

        // Quick win clusters
        const quickWinLeads = leads.filter(lead => 
            lead.aiInsights.urgencyLevel.level === 'High' && 
            lead.aiInsights.engagementLevel.level === 'Engaged'
        );

        clusters.quickWinClusters = {
            size: quickWinLeads.length,
            characteristics: this.identifyClusterCharacteristics(quickWinLeads),
            estimatedConversionTime: '1-2 weeks',
            recommendedAction: 'Immediate contact with urgent messaging'
        };

        return clusters;
    }

    // Helper methods for calculations
    calculateResponseTime(lead) {
        if (!lead.basicInfo.lastContact || !lead.basicInfo.lastResponse) return null;
        const contactTime = new Date(lead.basicInfo.lastContact);
        const responseTime = new Date(lead.basicInfo.lastResponse);
        return (responseTime - contactTime) / (1000 * 60 * 60); // hours
    }

    calculateAverage(numbers) {
        const validNumbers = numbers.filter(n => n !== null && !isNaN(n));
        return validNumbers.length > 0 ? validNumbers.reduce((a, b) => a + b, 0) / validNumbers.length : 0;
    }

    calculateDistribution(items) {
        const distribution = {};
        items.forEach(item => {
            distribution[item] = (distribution[item] || 0) + 1;
        });
        return distribution;
    }

    getMostCommon(items) {
        const distribution = this.calculateDistribution(items);
        return Object.keys(distribution).reduce((a, b) => 
            distribution[a] > distribution[b] ? a : b
        );
    }

    getTopOccurrences(items, count) {
        const distribution = this.calculateDistribution(items);
        return Object.entries(distribution)
            .sort(([,a], [,b]) => b - a)
            .slice(0, count)
            .map(([item, frequency]) => ({ item, frequency }));
    }

    identifyPeakHours(times) {
        const hours = times.map(time => time.getHours());
        const distribution = this.calculateDistribution(hours);
        return Object.keys(distribution).reduce((a, b) => 
            distribution[a] > distribution[b] ? a : b
        );
    }

    identifyPeakDays(times) {
        const days = times.map(time => time.getDay());
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const distribution = this.calculateDistribution(days);
        const peakDay = Object.keys(distribution).reduce((a, b) => 
            distribution[a] > distribution[b] ? a : b
        );
        return dayNames[peakDay];
    }

    identifyPeakMonths(times) {
        const months = times.map(time => time.getMonth());
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const distribution = this.calculateDistribution(months);
        const peakMonth = Object.keys(distribution).reduce((a, b) => 
            distribution[a] > distribution[b] ? a : b
        );
        return monthNames[peakMonth];
    }

    analyzeSourceQuality(sources, leads) {
        const sourceQuality = {};
        sources.forEach((source, index) => {
            if (!sourceQuality[source]) {
                sourceQuality[source] = {
                    count: 0,
                    totalQuality: 0,
                    averageQuality: 0
                };
            }
            sourceQuality[source].count++;
            sourceQuality[source].totalQuality += leads[index].aiInsights.leadQuality.score;
        });

        Object.keys(sourceQuality).forEach(source => {
            sourceQuality[source].averageQuality = 
                sourceQuality[source].totalQuality / sourceQuality[source].count;
        });

        return sourceQuality;
    }

    // Insight generation methods
    generateResponseInsights(responseTimes) {
        const avgResponseTime = this.calculateAverage(responseTimes);
        if (avgResponseTime < 24) {
            return 'Leads respond quickly - maintain fast response times';
        } else if (avgResponseTime > 72) {
            return 'Slow response times - consider follow-up strategies';
        } else {
            return 'Moderate response times - current approach is working';
        }
    }

    generateEngagementInsights(engagementLevels) {
        const highEngagementRate = engagementLevels.filter(level => 
            level === 'Highly Engaged' || level === 'Engaged'
        ).length / engagementLevels.length;

        if (highEngagementRate > 0.6) {
            return 'High engagement rate - continue current strategy';
        } else if (highEngagementRate < 0.3) {
            return 'Low engagement rate - need to improve outreach strategy';
        } else {
            return 'Moderate engagement rate - room for improvement';
        }
    }

    generateCommunicationInsights(commStyles) {
        const dominantStyle = this.getMostCommon(commStyles);
        return `Most leads prefer ${dominantStyle} communication style - adapt messaging accordingly`;
    }

    generateTimeInsights(times) {
        const peakHour = this.identifyPeakHours(times);
        const peakDay = this.identifyPeakDays(times);
        return `Peak activity: ${peakDay} at ${peakHour}:00 - schedule outreach during these times`;
    }

    generateUrgencyInsights(urgencyLevels) {
        const criticalRate = urgencyLevels.filter(level => level === 'Critical').length / urgencyLevels.length;
        if (criticalRate > 0.3) {
            return 'High urgency rate - prioritize quick responses';
        } else {
            return 'Moderate urgency rate - standard response times appropriate';
        }
    }

    generateSourceInsights(sources) {
        const topSource = this.getMostCommon(sources);
        return `Top lead source: ${topSource} - consider increasing investment in this channel`;
    }

    generateInterestInsights(interests) {
        const topInterest = this.getMostCommon(interests);
        return `Most popular interest: ${topInterest} - ensure strong expertise in this area`;
    }

    generateDecisionStyleInsights(decisionStyles) {
        const dominantStyle = this.getMostCommon(decisionStyles);
        return `Dominant decision style: ${dominantStyle} - tailor approach accordingly`;
    }

    generatePainPointInsights(painPoints) {
        const topPainPoints = this.getTopOccurrences(painPoints, 3);
        return `Top pain points: ${topPainPoints.map(p => p.item).join(', ')} - address these in messaging`;
    }

    generateConversionInsights(stages) {
        const conversionRate = stages.filter(stage => 
            ['interested', 'consultation_requested', 'converted'].includes(stage)
        ).length / stages.length;

        return `Current conversion rate: ${(conversionRate * 100).toFixed(1)}% - ${
            conversionRate > 0.3 ? 'Good performance' : 
            conversionRate > 0.15 ? 'Room for improvement' : 
            'Needs significant improvement'
        }`;
    }

    generateSuccessInsights(successfulLeads) {
        if (successfulLeads.length === 0) {
            return 'No successful conversions yet - analyze early-stage patterns';
        }

        const commonSources = this.getMostCommon(successfulLeads.map(l => l.basicInfo.source));
        const commonInterests = this.getMostCommon(successfulLeads.map(l => l.basicInfo.interest));
        
        return `Successful leads commonly come from ${commonSources} and are interested in ${commonInterests}`;
    }

    generateQualityInsights(highQualityLeads) {
        const avgQuality = this.calculateAverage(highQualityLeads.map(l => l.aiInsights.leadQuality.score));
        return `High-quality leads average score: ${avgQuality.toFixed(1)} - maintain focus on these lead sources`;
    }

    generateRiskInsights(highRiskLeads) {
        const commonRisks = this.getMostCommon(highRiskLeads.flatMap(l => 
            l.aiInsights.riskFactors.risks.map(r => r.factor)
        ));
        return `Most common risk factor: ${commonRisks} - develop mitigation strategies`;
    }

    identifyClusterCharacteristics(leads) {
        return {
            averageQualityScore: this.calculateAverage(leads.map(l => l.aiInsights.leadQuality.score)),
            commonSources: this.getMostCommon(leads.map(l => l.basicInfo.source)),
            commonInterests: this.getMostCommon(leads.map(l => l.basicInfo.interest)),
            averageUrgency: this.getMostCommon(leads.map(l => l.aiInsights.urgencyLevel.level))
        };
    }

    estimateClusterRevenue(leads) {
        const totalEstimatedRevenue = leads.reduce((total, lead) => {
            const budget = lead.aiInsights.budgetEstimate.estimatedRange;
            return total + (budget.min + budget.max) / 2;
        }, 0);
        
        return {
            total: totalEstimatedRevenue,
            average: totalEstimatedRevenue / leads.length,
            currency: 'MXN'
        };
    }

    // Additional helper methods...
    calculateConversionRates(stages) {
        const total = stages.length;
        const stageCounts = this.calculateDistribution(stages);
        
        const rates = {};
        Object.keys(stageCounts).forEach(stage => {
            rates[stage] = stageCounts[stage] / total;
        });
        
        return rates;
    }

    identifyBottlenecks(stages) {
        const conversionRates = this.calculateConversionRates(stages);
        const bottlenecks = [];
        
        // Identify stages with low conversion rates
        Object.entries(conversionRates).forEach(([stage, rate]) => {
            if (rate < 0.1 && stage !== 'new_lead') {
                bottlenecks.push({
                    stage,
                    rate: (rate * 100).toFixed(1) + '%',
                    recommendation: `Improve ${stage} conversion process`
                });
            }
        });
        
        return bottlenecks;
    }

    identifyCommonCharacteristics(leads) {
        return {
            sources: this.getMostCommon(leads.map(l => l.basicInfo.source)),
            interests: this.getMostCommon(leads.map(l => l.basicInfo.interest)),
            decisionStyles: this.getMostCommon(leads.map(l => l.aiInsights.decisionMakingStyle.style)),
            communicationStyles: this.getMostCommon(leads.map(l => l.aiInsights.communicationPreference.style))
        };
    }

    analyzeSuccessPatterns(successfulLeads) {
        return {
            averageTimeToSuccess: this.calculateAverage(successfulLeads.map(l => l.basicInfo.timeToSuccess || 0)),
            commonTouchpoints: this.analyzeTouchpoints(successfulLeads),
            successFactors: this.identifySuccessFactors(successfulLeads)
        };
    }

    analyzeTouchpoints(leads) {
        // This would analyze the sequence of interactions that led to success
        return {
            averageTouchpoints: 3.2,
            criticalTouchpoints: ['Initial contact', 'Value demonstration', 'Consultation offer']
        };
    }

    clusterPainPoints(painPoints) {
        // Group similar pain points together
        const clusters = {};
        painPoints.forEach(painPoint => {
            const category = this.categorizePainPoint(painPoint);
            if (!clusters[category]) {
                clusters[category] = [];
            }
            clusters[category].push(painPoint);
        });
        return clusters;
    }

    categorizePainPoint(painPoint) {
        if (painPoint.includes('website') || painPoint.includes('design')) return 'Web Presence';
        if (painPoint.includes('search') || painPoint.includes('google')) return 'Visibility';
        if (painPoint.includes('social') || painPoint.includes('engagement')) return 'Social Media';
        if (painPoint.includes('sales') || painPoint.includes('revenue')) return 'Revenue';
        return 'General Business';
    }

    analyzeInterestTrends(interests, leads) {
        // Analyze how interests correlate with success
        const interestSuccess = {};
        interests.forEach((interest, index) => {
            if (!interestSuccess[interest]) {
                interestSuccess[interest] = { total: 0, successful: 0 };
            }
            interestSuccess[interest].total++;
            
            const lead = leads[index];
            if (['interested', 'consultation_requested', 'converted'].includes(lead.basicInfo.stage)) {
                interestSuccess[interest].successful++;
            }
        });

        // Calculate success rates
        Object.keys(interestSuccess).forEach(interest => {
            interestSuccess[interest].successRate = 
                interestSuccess[interest].successful / interestSuccess[interest].total;
        });

        return interestSuccess;
    }
}

module.exports = AIPatternRecognizer;


