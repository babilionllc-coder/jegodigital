const { Client } = require("@hubspot/api-client");
const functions = require("firebase-functions");

// Initialize Client (Lazy load or Singleton)
// We use a function to get the key to support both local .env and Firebase Config
const getClient = () => {
    const token = functions.config().hubspot?.token || process.env.HUBSPOT_ACCESS_TOKEN;
    if (!token) {
        console.error("❌ HubSpot Token Missing! Run: firebase functions:config:set hubspot.token='YOUR_TOKEN'");
        throw new Error("HubSpot Access Token not configured.");
    }
    return new Client({ accessToken: token });
};

/**
 * Creates or Updates a Contact in HubSpot
 * @param {Object} data - The lead data
 * @param {string} data.email - Required
 * @param {string} data.firstname
 * @param {string} data.lastname
 * @param {string} data.phone
 * @param {string} data.company
 * @param {string} data.website
 * @param {string} data.location
 * @param {string} data.message
 * @param {string} data.source
 * @param {string} data.goal
 */
const syncContact = async (data) => {
    if (!data.email) {
        console.warn("HubSpot Sync Skipped: No email provided.");
        return null;
    }

    try {
        const hubspotClient = getClient();

        const properties = {
            email: data.email,
            firstname: data.firstname || "",
            lastname: data.lastname || "",
            phone: data.phone || "",
            company: data.company || "",
            website: data.website || "",
            city: data.location || "",
            lifecyclestage: "lead",
            hs_lead_status: "OPEN", // Reset to OPEN on new interaction
            message: data.message || "",
        };

        // UPSERT LOGIC: Create, if exists -> Update
        try {
            const result = await hubspotClient.crm.contacts.basicApi.create({ properties });
            console.log(`✅ HubSpot: Contact Created (${data.email}) - ID: ${result.id}`);
            return result;
        } catch (err) {
            if (err.code === 409) {
                console.log(`ℹ️ HubSpot: Contact exists (${data.email}). Attempting Update...`);

                // 1. Search to get ID
                const searchResponse = await hubspotClient.crm.contacts.searchApi.doSearch({
                    filterGroups: [{
                        filters: [{ propertyName: 'email', operator: 'EQ', value: data.email }]
                    }],
                    properties: ['email'],
                    limit: 1
                });

                if (searchResponse.results.length > 0) {
                    const contactId = searchResponse.results[0].id;
                    // 2. Update
                    await hubspotClient.crm.contacts.basicApi.update(contactId, { properties });
                    console.log(`✅ HubSpot: Contact Updated (${data.email}) - ID: ${contactId}`);
                    return { status: "updated", id: contactId };
                } else {
                    console.warn(`⚠️ HubSpot: 409 received but Search found 0 results for ${data.email}`);
                }
            } else {
                throw err;
            }
        }

    } catch (error) {
        console.error("❌ HubSpot Sync Error:", error.message);
        return null;
    }
};

module.exports = {
    syncContact
};
