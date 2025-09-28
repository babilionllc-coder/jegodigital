const { 
  searchFacebookGroups,
  getGroupDetails,
  postToGroup,
  postToMultipleGroups,
  postBusinessTipsToGroups,
  testGroupsConnection,
  runFacebookGroupsAgent
} = require('./facebook-groups-agent.js');

// Test Facebook groups search
async function testGroupsSearch() {
  try {
    console.log('🧪 Testing Facebook groups search...');
    
    const cities = ['Cancún', 'Tulum', 'Playa del Carmen', 'Cozumel', 'Isla Mujeres'];
    const queries = ['negocios', 'emprendedores', 'comerciantes', 'business'];
    
    let totalGroups = 0;
    
    for (const city of cities) {
      for (const query of queries) {
        console.log(`\n🔍 Searching: ${query} in ${city}`);
        const groups = await searchFacebookGroups(query, city);
        
        if (groups.length > 0) {
          console.log(`✅ Found ${groups.length} groups`);
          totalGroups += groups.length;
          
          // Show first group details
          const firstGroup = groups[0];
          console.log(`📋 First group: ${firstGroup.name} (ID: ${firstGroup.id})`);
        } else {
          console.log(`❌ No groups found`);
        }
        
        // Wait 2 seconds between searches
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    console.log(`\n📊 Total groups found: ${totalGroups}`);
    return totalGroups > 0;
    
  } catch (error) {
    console.error('❌ Groups search test failed:', error.message);
    return false;
  }
}

// Test group details retrieval
async function testGroupDetails() {
  try {
    console.log('🧪 Testing group details retrieval...');
    
    // First, search for a group
    const groups = await searchFacebookGroups('negocios', 'Cancún');
    
    if (groups.length === 0) {
      console.log('❌ No groups found for details test');
      return false;
    }
    
    const groupId = groups[0].id;
    console.log(`📋 Testing with group: ${groups[0].name} (ID: ${groupId})`);
    
    const details = await getGroupDetails(groupId);
    
    if (details) {
      console.log('✅ Group details retrieved successfully');
      console.log(`📊 Group: ${details.name}`);
      console.log(`👥 Members: ${details.member_count || 'Unknown'}`);
      console.log(`🔒 Privacy: ${details.privacy || 'Unknown'}`);
      return true;
    } else {
      console.log('❌ Failed to retrieve group details');
      return false;
    }
    
  } catch (error) {
    console.error('❌ Group details test failed:', error.message);
    return false;
  }
}

// Test single group posting
async function testSingleGroupPost() {
  try {
    console.log('🧪 Testing single group post...');
    
    // First, search for a group
    const groups = await searchFacebookGroups('negocios', 'Cancún');
    
    if (groups.length === 0) {
      console.log('❌ No groups found for posting test');
      return false;
    }
    
    const groupId = groups[0].id;
    const groupName = groups[0].name;
    
    console.log(`📝 Testing post to group: ${groupName} (ID: ${groupId})`);
    
    const testMessage = `🧪 PRUEBA DE JEGODIGITAL

Este es un mensaje de prueba del sistema automatizado de marketing digital.

✅ Bot funcionando correctamente
✅ Listo para publicar contenido diario
✅ Configurado para Quintana Roo

¿Recibiste este mensaje en el grupo?

¡El bot está listo para automatizar tu presencia en redes sociales! 😊

- JegoDigital AI Agent
- Consulta GRATUITA: jegodigital.com

#MarketingDigital #QuintanaRoo #JegoDigital #Prueba`;

    const result = await postToGroup(groupId, testMessage, 'https://jegodigital.com');
    
    if (result) {
      console.log('✅ Single group post successful!');
      console.log(`📊 Post ID: ${result.id}`);
      console.log(`🔗 Check group ${groupName} for the test post`);
      return true;
    } else {
      console.log('❌ Single group post failed');
      return false;
    }
    
  } catch (error) {
    console.error('❌ Single group post test failed:', error.message);
    
    if (error.response?.data) {
      console.error('📊 Error details:', error.response.data);
    }
    
    return false;
  }
}

// Test business tips posting
async function testBusinessTipsPosting() {
  try {
    console.log('🧪 Testing business tips posting...');
    
    const result = await postBusinessTipsToGroups();
    
    if (result && result.successCount > 0) {
      console.log('✅ Business tips posting successful!');
      console.log(`📊 Success: ${result.successCount}`);
      console.log(`❌ Errors: ${result.errorCount}`);
      return true;
    } else {
      console.log('❌ Business tips posting failed');
      return false;
    }
    
  } catch (error) {
    console.error('❌ Business tips posting test failed:', error.message);
    return false;
  }
}

// Main test function
async function runFacebookGroupsTests() {
  try {
    console.log('🚀 Starting Facebook Groups tests...');
    
    // Test 1: Connection test
    console.log('\n🔍 Test 1: Connection test');
    const connectionTest = await testGroupsConnection();
    
    if (!connectionTest) {
      console.log('❌ Connection test failed. Please check your access token and permissions.');
      return;
    }
    
    console.log('✅ Connection test passed!');
    
    // Test 2: Groups search
    console.log('\n🔍 Test 2: Groups search');
    const searchTest = await testGroupsSearch();
    
    if (!searchTest) {
      console.log('❌ Groups search test failed');
      return;
    }
    
    console.log('✅ Groups search test passed!');
    
    // Test 3: Group details
    console.log('\n📋 Test 3: Group details');
    const detailsTest = await testGroupDetails();
    
    if (!detailsTest) {
      console.log('❌ Group details test failed');
      return;
    }
    
    console.log('✅ Group details test passed!');
    
    // Wait 2 minutes before posting tests
    console.log('\n⏰ Waiting 2 minutes before posting tests...');
    await new Promise(resolve => setTimeout(resolve, 120000));
    
    // Test 4: Single group post
    console.log('\n📝 Test 4: Single group post');
    const singlePostTest = await testSingleGroupPost();
    
    if (!singlePostTest) {
      console.log('❌ Single group post test failed');
      return;
    }
    
    console.log('✅ Single group post test passed!');
    
    // Wait 5 minutes before multiple posts
    console.log('\n⏰ Waiting 5 minutes before multiple posts test...');
    await new Promise(resolve => setTimeout(resolve, 300000));
    
    // Test 5: Business tips posting
    console.log('\n💡 Test 5: Business tips posting');
    const tipsTest = await testBusinessTipsPosting();
    
    if (!tipsTest) {
      console.log('❌ Business tips posting test failed');
      return;
    }
    
    console.log('✅ Business tips posting test passed!');
    
    console.log('\n🎉 All Facebook Groups tests completed!');
    console.log('📊 Check your Google Sheets for posting results');
    console.log('🚀 Facebook Groups posting is ready for production!');
    
  } catch (error) {
    console.error('❌ Error in Facebook Groups tests:', error.message);
  }
}

// Run tests if called directly
if (require.main === module) {
  runFacebookGroupsTests();
}

module.exports = {
  testGroupsSearch,
  testGroupDetails,
  testSingleGroupPost,
  testBusinessTipsPosting,
  runFacebookGroupsTests
};



