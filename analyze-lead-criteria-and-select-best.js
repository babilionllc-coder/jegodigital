const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const fs = require('fs');

async function analyzeLeadCriteriaAndSelectBest() {
    try {
        console.log('🔍 ANALYZING LEAD CRITERIA AND SELECTING BEST QUALIFIED LEADS');
        console.log('================================================================');
        
        // Load service account credentials
        const serviceAccountConfig = JSON.parse(fs.readFileSync('google-service-account-config.json', 'utf8'));
        const serviceAccountAuth = new JWT({
            email: serviceAccountConfig.client_email,
            key: serviceAccountConfig.private_key,
            scopes: [
                'https://www.googleapis.com/auth/spreadsheets',
                'https://www.googleapis.com/auth/drive.file',
            ],
        });

        // Connect to spreadsheet
        const doc = new GoogleSpreadsheet('1nzknj5DlU_1oXeu_7VcMRD6_FRcSkgef2I0ObXxYoLg', serviceAccountAuth);
        await doc.loadInfo();
        console.log('✅ Connected to:', doc.title);

        // Get the leads sheet
        const leadsSheet = doc.sheetsByTitle['jegodigital-leads-template'];
        if (!leadsSheet) {
            console.log('❌ Could not find "Top 200 Qualified Leads" sheet');
            return;
        }

        console.log('📊 Loading all leads data...');
        await leadsSheet.loadHeaderRow();
        const rows = await leadsSheet.getRows();
        
        console.log('📋 Current sheet structure:');
        console.log('Headers:', leadsSheet.headerValues);
        console.log('Total leads:', rows.length);

        // Analyze existing lead scoring criteria
        console.log('\n🎯 ANALYZING CURRENT LEAD SCORING CRITERIA:');
        console.log('===========================================');
        
        const criteriaAnalysis = {
            businessTypes: {},
            locations: {},
            hasWebsite: { yes: 0, no: 0, partial: 0 },
            hasPhone: { yes: 0, no: 0 },
            hasEmail: { yes: 0, no: 0 },
            leadSources: {},
            scoringDistribution: { high: 0, medium: 0, low: 0 }
        };

        rows.forEach((row, index) => {
            // Analyze business types
            const businessType = row.get('Business Type') || 'Unknown';
            criteriaAnalysis.businessTypes[businessType] = (criteriaAnalysis.businessTypes[businessType] || 0) + 1;

            // Analyze locations
            const location = row.get('Location') || 'Unknown';
            criteriaAnalysis.locations[location] = (criteriaAnalysis.locations[location] || 0) + 1;

            // Analyze website presence
            const website = row.get('Website') || '';
            if (website.includes('http') && website.length > 10) {
                criteriaAnalysis.hasWebsite.yes++;
            } else if (website.length > 0) {
                criteriaAnalysis.hasWebsite.partial++;
            } else {
                criteriaAnalysis.hasWebsite.no++;
            }

            // Analyze contact info
            const phone = row.get('Phone Number') || '';
            const email = row.get('Email') || '';
            
            phone.length > 5 ? criteriaAnalysis.hasPhone.yes++ : criteriaAnalysis.hasPhone.no++;
            email.includes('@') ? criteriaAnalysis.hasEmail.yes++ : criteriaAnalysis.hasEmail.no++;

            // Analyze lead sources
            const source = row.get('Status') || 'Unknown';
            criteriaAnalysis.leadSources[source] = (criteriaAnalysis.leadSources[source] || 0) + 1;
        });

        // Display criteria analysis
        console.log('\n📊 LEAD CRITERIA ANALYSIS:');
        console.log('Business Types:', criteriaAnalysis.businessTypes);
        console.log('Locations:', criteriaAnalysis.locations);
        console.log('Website Status:', criteriaAnalysis.hasWebsite);
        console.log('Phone Status:', criteriaAnalysis.hasPhone);
        console.log('Email Status:', criteriaAnalysis.hasEmail);
        console.log('Lead Sources:', criteriaAnalysis.leadSources);

        // Define JegoDigital qualification criteria
        console.log('\n🎯 JEGODIGITAL QUALIFICATION CRITERIA:');
        console.log('====================================');
        
        const jegodigitalCriteria = {
            // High priority business types for Cancún
            highPriorityBusinesses: [
                'Hotel', 'Restaurant', 'Spa', 'Tour', 'Travel', 'Beach', 'Resort',
                'Dental', 'Medical', 'Clinic', 'Gym', 'Fitness', 'Beauty', 'Salon',
                'Real Estate', 'Property', 'Lawyer', 'Legal', 'Accounting', 'Finance'
            ],
            
            // Medium priority business types
            mediumPriorityBusinesses: [
                'Retail', 'Store', 'Shop', 'Boutique', 'Fashion', 'Electronics',
                'Automotive', 'Car', 'Motorcycle', 'Service', 'Repair', 'Maintenance'
            ],
            
            // Preferred locations
            preferredLocations: [
                'Cancún', 'Playa del Carmen', 'Tulum', 'Cozumel', 'Riviera Maya',
                'Hotel Zone', 'Centro', 'Downtown'
            ],
            
            // Website issues that indicate need for our services
            websiteIssues: [
                'No website', 'Outdated design', 'Not mobile responsive', 
                'Slow loading', 'Poor SEO', 'No Google Maps integration'
            ]
        };

        console.log('High Priority Businesses:', jegodigitalCriteria.highPriorityBusinesses);
        console.log('Medium Priority Businesses:', jegodigitalCriteria.mediumPriorityBusinesses);
        console.log('Preferred Locations:', jegodigitalCriteria.preferredLocations);

        // Score each lead based on JegoDigital criteria
        console.log('\n🏆 SCORING LEADS BASED ON JEGODIGITAL CRITERIA:');
        console.log('===============================================');

        const scoredLeads = rows.map((row, index) => {
            let score = 0;
            let reasons = [];

            const businessName = row.get('Business Name') || '';
            const businessType = row.get('Industry') || '';
            const location = 'Cancún'; // Based on your leads
            const website = row.get('Website') || '';
            const phone = row.get('Phone Number') || '';
            const email = row.get('Email') || '';

            // Business type scoring
            const businessTypeLower = businessType.toLowerCase();
            const businessNameLower = businessName.toLowerCase();
            
            if (jegodigitalCriteria.highPriorityBusinesses.some(type => 
                businessTypeLower.includes(type.toLowerCase()) || 
                businessNameLower.includes(type.toLowerCase())
            )) {
                score += 40;
                reasons.push('High priority business type');
            } else if (jegodigitalCriteria.mediumPriorityBusinesses.some(type => 
                businessTypeLower.includes(type.toLowerCase()) || 
                businessNameLower.includes(type.toLowerCase())
            )) {
                score += 25;
                reasons.push('Medium priority business type');
            }

            // Location scoring
            const locationLower = location.toLowerCase();
            if (jegodigitalCriteria.preferredLocations.some(loc => 
                locationLower.includes(loc.toLowerCase())
            )) {
                score += 30;
                reasons.push('Preferred location');
            }

            // Website issues scoring (higher score = more need for our services)
            if (!website || website.length < 5) {
                score += 35;
                reasons.push('No website - high need');
            } else if (website.length < 20) {
                score += 25;
                reasons.push('Basic website - improvement needed');
            } else {
                score += 10;
                reasons.push('Has website - may need optimization');
            }

            // Contact information scoring
            if (phone && phone.length > 5) {
                score += 15;
                reasons.push('Has phone number');
            }
            if (email && email.includes('@')) {
                score += 15;
                reasons.push('Has email');
            }

            // Additional scoring factors
            if (businessName.toLowerCase().includes('cancún') || businessName.toLowerCase().includes('cancun')) {
                score += 10;
                reasons.push('Local Cancún business');
            }

            return {
                index: index + 1,
                businessName,
                businessType,
                location,
                website,
                phone,
                email,
                score,
                reasons,
                row
            };
        });

        // Sort by score (highest first)
        scoredLeads.sort((a, b) => b.score - a.score);

        // Select top 50 leads
        const top50Leads = scoredLeads.slice(0, 50);

        console.log('\n🏆 TOP 50 QUALIFIED LEADS FOR JEGODIGITAL:');
        console.log('=========================================');
        
        top50Leads.forEach((lead, index) => {
            console.log(`\n${index + 1}. ${lead.businessName}`);
            console.log(`   Type: ${lead.businessType}`);
            console.log(`   Location: ${lead.location}`);
            console.log(`   Website: ${lead.website || 'No website'}`);
            console.log(`   Phone: ${lead.phone || 'No phone'}`);
            console.log(`   Email: ${lead.email || 'No email'}`);
            console.log(`   Score: ${lead.score}/100`);
            console.log(`   Reasons: ${lead.reasons.join(', ')}`);
        });

        // Create a new sheet with the best 50 leads
        console.log('\n📊 Creating "Best 50 Qualified Leads" sheet...');
        
        let bestLeadsSheet = doc.sheetsByTitle['Best 50 Qualified Leads'];
        if (!bestLeadsSheet) {
            bestLeadsSheet = await doc.addSheet({
                title: 'Best 50 Qualified Leads'
            });
        }

        // Set headers
        const headers = [
            'Rank', 'Business Name', 'Industry', 'Location', 'Website',
            'Phone Number', 'Email', 'Lead Score', 'Qualification Reasons', 'Priority Level'
        ];
        await bestLeadsSheet.setHeaderRow(headers);

        // Add the top 50 leads
        const leadData = top50Leads.map((lead, index) => [
            index + 1,
            lead.businessName,
            lead.businessType,
            lead.location,
            lead.website || '',
            lead.phone || '',
            lead.email || '',
            lead.score,
            lead.reasons.join('; '),
            lead.score >= 80 ? 'HIGH' : lead.score >= 60 ? 'MEDIUM' : 'LOW'
        ]);

        await bestLeadsSheet.addRows(leadData);

        console.log('✅ Best 50 qualified leads saved to Google Sheets!');
        
        // Summary statistics
        const highPriority = top50Leads.filter(l => l.score >= 80).length;
        const mediumPriority = top50Leads.filter(l => l.score >= 60 && l.score < 80).length;
        const lowPriority = top50Leads.filter(l => l.score < 60).length;

        console.log('\n📈 QUALIFICATION SUMMARY:');
        console.log(`High Priority (80+): ${highPriority} leads`);
        console.log(`Medium Priority (60-79): ${mediumPriority} leads`);
        console.log(`Low Priority (<60): ${lowPriority} leads`);
        console.log(`Average Score: ${Math.round(top50Leads.reduce((sum, l) => sum + l.score, 0) / 50)}`);

        return top50Leads;

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error.stack);
    }
}

analyzeLeadCriteriaAndSelectBest();
