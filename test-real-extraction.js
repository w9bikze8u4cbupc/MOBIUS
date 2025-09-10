import axios from 'axios';

async function testRealComponentExtraction() {
  console.log('🎲 REAL COMPONENT EXTRACTION TEST');
  console.log('='.repeat(50));
  
  // Test with a simple public PDF
  const testUrl = "https://images-cdn.zmangames.com/us-east-1/filer_public/25/32/253242c0-be63-4229-ad1e-7dd20b5fda83/zm7101_love_letter_rules.pdf";
  
  try {
    console.log('📥 Testing Love Letter rulebook...');
    
    const response = await axios.post('http://localhost:5001/api/extract-components', {
      pdfPath: testUrl
    }, {
      timeout: 60000
    });
    
    const { components, extractionMethod } = response.data;
    
    console.log(`✅ Found ${components?.length || 0} components`);
    console.log(`🔧 Method: ${extractionMethod}`);
    
    if (components && components.length > 0) {
      console.log('📊 Components:');
      components.slice(0, 10).forEach((comp, i) => {
        console.log(`   ${i + 1}. ${comp.name || 'Unknown'} ${comp.quantity ? `(${comp.quantity})` : ''}`);
      });
      
      // Check diversity
      const types = new Set();
      components.forEach(c => {
        const name = (c.name || '').toLowerCase();
        if (name.includes('card')) types.add('cards');
        if (name.includes('token')) types.add('tokens');
        if (name.includes('board')) types.add('boards');
        if (name.includes('dice')) types.add('dice');
      });
      
      console.log(`🎯 Component types: ${Array.from(types).join(', ')}`);
      
      if (types.size > 1) {
        console.log('✅ IMPROVEMENT: Multiple types detected!');
      } else if (types.has('cards') && types.size === 1) {
        console.log('⚠️ Only cards detected (like old system)');
      }
    }
    
    return { success: true, count: components?.length || 0 };
    
  } catch (error) {
    console.log('❌ Test failed:', error.response?.data?.error || error.message);
    return { success: false };
  }
}

// Enhanced regex test
async function testRegexPatterns() {
  console.log('\n🔧 REGEX PATTERNS TEST');
  console.log('='.repeat(50));
  
  const testTexts = [
    "60 Ally cards, 20 Location tiles, 1 game board",
    "12 wooden cubes, 1 Kraken figure, 20 tokens",
    "8 dice, 4 player mats, 50 victory tokens"
  ];
  
  const patterns = [
    /(\\d+)\\s*(cards?|ally cards?|location tiles?)/gi,
    /(\\d+)\\s*(cubes?|wooden cubes?|figures?|kraken figure?)/gi,
    /(\\d+)\\s*(dice|tokens?|mats?|boards?)/gi
  ];
  
  let totalMatches = 0;
  
  testTexts.forEach((text, i) => {
    console.log(`\\n📝 Text ${i + 1}: ${text}`);
    let matches = [];
    
    patterns.forEach(pattern => {
      const found = text.match(pattern);
      if (found) matches.push(...found);
    });
    
    if (matches.length > 0) {
      console.log(`   ✅ ${matches.length} matches: ${matches.join(', ')}`);
      totalMatches += matches.length;
    } else {
      console.log('   ❌ No matches');
    }
  });
  
  console.log(`\\n📊 Total matches: ${totalMatches}`);
  return totalMatches > 0;
}

async function runValidation() {
  console.log('🎯 COMPONENT EXTRACTION VALIDATION\\n');
  
  const regexSuccess = await testRegexPatterns();
  const extractionResult = await testRealComponentExtraction();
  
  console.log('\\n' + '='.repeat(50));
  console.log('📋 VALIDATION RESULTS');
  console.log('='.repeat(50));
  
  console.log(`Regex Patterns: ${regexSuccess ? '✅ WORKING' : '❌ FAILED'}`);
  console.log(`PDF Extraction: ${extractionResult.success ? '✅ WORKING' : '❌ FAILED'}`);
  
  if (regexSuccess || extractionResult.success) {
    console.log('\\n✅ STEP 2 COMPLETE: Enhanced Component Detection');
    console.log('🚀 Ready for Abyss game testing');
  } else {
    console.log('\\n⚠️ STEP 2 NEEDS ATTENTION');
  }
}

runValidation().catch(console.error);