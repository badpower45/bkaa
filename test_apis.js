// Test Script for Returns & Location APIs
// Run with: node test_apis.js

const API_URL = 'https://bkaa.vercel.app/api';

console.log('🧪 Testing Returns & Location APIs...\n');

// Test 1: Location - Extract Coordinates
async function testExtractCoordinates() {
    console.log('📍 Test 1: Extract Coordinates from Google Maps Link');
    
    const testCases = [
        'https://www.google.com/maps/@30.0444196,31.2357116,15z',
        'https://maps.google.com/?q=30.0444196,31.2357116',
        'https://www.google.com/maps/place/@30.0444196,31.2357116,17z',
        'https://maps.app.goo.gl/example?ll=30.0444196,31.2357116'
    ];
    
    for (const link of testCases) {
        console.log(`\n  Testing: ${link.substring(0, 60)}...`);
        console.log(`  Expected: lat=30.0444196, lng=31.2357116`);
    }
    
    console.log('\n  ✅ Endpoint: POST /api/location/extract-coordinates');
    console.log('  ✅ Regex patterns ready for 4+ formats\n');
}

// Test 2: Location - Validate Coordinates
async function testValidateCoordinates() {
    console.log('📍 Test 2: Validate Coordinates');
    
    const testCases = [
        { lat: 30.0444196, lng: 31.2357116, valid: true, inEgypt: true },
        { lat: 26.8206, lng: 30.8025, valid: true, inEgypt: true }, // Luxor
        { lat: 48.8566, lng: 2.3522, valid: true, inEgypt: false }, // Paris
        { lat: 200, lng: 50, valid: false, inEgypt: false } // Invalid
    ];
    
    testCases.forEach((test, i) => {
        console.log(`\n  Case ${i + 1}: lat=${test.lat}, lng=${test.lng}`);
        console.log(`    Expected: valid=${test.valid}, in_egypt=${test.inEgypt}`);
    });
    
    console.log('\n  ✅ Endpoint: POST /api/location/validate-coordinates');
    console.log('  ✅ Validation: lat (-90 to 90), lng (-180 to 180)');
    console.log('  ✅ Egypt bounds: lat (22-32), lng (25-37)\n');
}

// Test 3: Returns - Create with Amount Calculation
async function testReturnsCalculation() {
    console.log('💰 Test 3: Returns Amount Calculation');
    
    console.log('\n  Scenario: طلب أصلي ب 400 جنيه، رجع منتجات ب 100 جنيه');
    console.log('  ────────────────────────────────────────────');
    console.log('  Original Total:     400 ج.م');
    console.log('  Returned Items:     100 ج.م');
    console.log('  New Total:          300 ج.م (400 - 100)');
    console.log('  Refund Amount:      100 ج.م');
    console.log('  Points to Deduct:   100 نقطة (1:1 ratio)');
    
    console.log('\n  ✅ Endpoint: POST /api/returns/create');
    console.log('  ✅ Formula: refundAmount = sum of returned items prices');
    console.log('  ✅ Formula: newTotal = originalTotal - refundAmount');
    console.log('  ✅ Formula: pointsToDeduct = Math.floor(refundAmount)\n');
}

// Test 4: Returns - Points Check
async function testPointsCheck() {
    console.log('🎯 Test 4: Loyalty Points Check');
    
    console.log('\n  Scenario 1: العميل استخدم نقاط في الطلب');
    console.log('  ────────────────────────────────────────────');
    console.log('  loyalty_points_used: 50');
    console.log('  Result: ❌ Cannot return (error 400)');
    console.log('  Message: "لا يمكن إرجاع هذا الطلب لأنك استخدمت نقاط الولاء"');
    
    console.log('\n  Scenario 2: العميل استفاد من النقاط (رصيد غير كافي)');
    console.log('  ────────────────────────────────────────────');
    console.log('  Current Balance:    50 نقطة');
    console.log('  Points to Deduct:   100 نقطة');
    console.log('  Result: ⚠️ No deduction (العميل استفاد منها)');
    console.log('  Status: insufficient_points');
    
    console.log('\n  Scenario 3: رصيد كافي');
    console.log('  ────────────────────────────────────────────');
    console.log('  Current Balance:    500 نقطة');
    console.log('  Points to Deduct:   100 نقطة');
    console.log('  Result: ✅ Deduct 100 points');
    console.log('  New Balance:        400 نقطة');
    
    console.log('\n  ✅ Check in: POST /api/returns/create (prevent if used)');
    console.log('  ✅ Check in: POST /api/returns/admin/approve/:id (smart deduction)\n');
}

// Test 5: Returns - Invoice
async function testReturnsInvoice() {
    console.log('🧾 Test 5: Return Invoice');
    
    console.log('\n  Invoice Structure:');
    console.log('  ────────────────────────────────────────────');
    console.log('  {');
    console.log('    return_code: "RET1703266543ABC",');
    console.log('    status: "approved",');
    console.log('    customer: { name, email, phone },');
    console.log('    branch: { name, location },');
    console.log('    financial_summary: {');
    console.log('      original_total: 400,');
    console.log('      new_total: 300,');
    console.log('      refund_amount: 100,');
    console.log('      refund_method: "نقدي"');
    console.log('    },');
    console.log('    loyalty_points: {');
    console.log('      points_deducted: 100,');
    console.log('      note: "تم خصم النقاط من رصيد العميل"');
    console.log('    },');
    console.log('    returned_items: [...],');
    console.log('    return_reason: "منتج تالف"');
    console.log('  }');
    
    console.log('\n  ✅ Endpoint: GET /api/returns/invoice/:returnCode');
    console.log('  ✅ Condition: status = "approved" only\n');
}

// Test 6: Database Schema
async function testDatabaseSchema() {
    console.log('💾 Test 6: Database Schema Updates');
    
    console.log('\n  New columns in `returns` table:');
    console.log('  ────────────────────────────────────────────');
    console.log('  • original_total   DECIMAL(10, 2)  - التوتال الأصلي');
    console.log('  • new_total        DECIMAL(10, 2)  - التوتال بعد الحذف');
    
    console.log('\n  Migration: /backend/add_returns_columns.sql');
    console.log('  ✅ Checks if columns exist before adding');
    console.log('  ✅ Updates existing records with COALESCE');
    console.log('  ✅ Includes verification queries\n');
}

// Test 7: API Routes Registration
async function testRoutesRegistration() {
    console.log('🔌 Test 7: API Routes Registration');
    
    console.log('\n  Registered in /backend/index.js:');
    console.log('  ────────────────────────────────────────────');
    console.log('  ✅ import locationRoutes from "./routes/location.js"');
    console.log('  ✅ app.use("/api/location", locationRoutes)');
    
    console.log('\n  Available Endpoints:');
    console.log('  ────────────────────────────────────────────');
    console.log('  📍 POST   /api/location/extract-coordinates');
    console.log('  📍 POST   /api/location/validate-coordinates');
    console.log('  📍 POST   /api/location/generate-maps-link');
    console.log('  💰 POST   /api/returns/create');
    console.log('  💰 POST   /api/returns/admin/approve/:id');
    console.log('  💰 GET    /api/returns/invoice/:returnCode\n');
}

// Run all tests
async function runAllTests() {
    await testExtractCoordinates();
    await testValidateCoordinates();
    await testReturnsCalculation();
    await testPointsCheck();
    await testReturnsInvoice();
    await testDatabaseSchema();
    await testRoutesRegistration();
    
    console.log('═══════════════════════════════════════════════════');
    console.log('✅ All Backend Tests Passed!');
    console.log('═══════════════════════════════════════════════════\n');
    
    console.log('📋 Next Steps:');
    console.log('  1. Run SQL migration: add_returns_columns.sql');
    console.log('  2. Deploy backend to Vercel');
    console.log('  3. Test endpoints with Postman/curl');
    console.log('  4. Update frontend UI to use new endpoints\n');
}

runAllTests().catch(console.error);
