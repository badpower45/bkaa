/**
 * Script to convert ES Modules to CommonJS for cPanel deployment
 * Run: node convert-to-commonjs.js
 */

const fs = require('fs');
const path = require('path');

const sourceDir = path.join(__dirname, '..'); // Original server folder
const targetDir = __dirname; // cpanel folder

const filesToConvert = [
    'routes/products.js',
    'routes/orders.js',
    'routes/cart.js',
    'routes/users.js',
    'routes/chat.js',
    'routes/branches.js',
    'routes/branchProducts.js',
    'routes/deliverySlots.js',
    'routes/distribution.js',
    'routes/delivery-fees.js',
    'routes/coupons.js',
    'routes/magazine.js',
    'routes/hotDeals.js',
    'scheduler.js'
];

function convertToCommonJS(content) {
    let result = content;
    
    // Convert default imports: import express from 'express' -> const express = require('express')
    result = result.replace(
        /import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g,
        "const $1 = require('$2')"
    );
    
    // Convert named imports: import { query } from '../database.js' -> const { query } = require('../database')
    result = result.replace(
        /import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/g,
        (match, imports, module) => {
            const cleanModule = module.replace('.js', '');
            return `const {${imports}} = require('${cleanModule}')`;
        }
    );
    
    // Convert: import * as xlsx from 'xlsx' -> const xlsx = require('xlsx')
    result = result.replace(
        /import\s+\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g,
        "const $1 = require('$2')"
    );
    
    // Convert: import pkg from 'pg'; const { Pool } = pkg; -> const { Pool } = require('pg')
    result = result.replace(
        /import\s+pkg\s+from\s+['"]pg['"];\s*\nconst\s+\{\s*Pool\s*\}\s*=\s*pkg;/g,
        "const { Pool } = require('pg');"
    );
    
    // Convert default export: export default router -> module.exports = router
    result = result.replace(
        /export\s+default\s+(\w+)/g,
        'module.exports = $1'
    );
    
    // Convert named exports: export { func1, func2 } -> module.exports = { func1, func2 }
    result = result.replace(
        /export\s+\{([^}]+)\}/g,
        'module.exports = {$1}'
    );
    
    // Convert export const: export const name = -> const name = ... (then add to module.exports)
    result = result.replace(
        /export\s+const\s+(\w+)\s*=/g,
        'const $1 ='
    );
    
    // Remove .js from relative requires
    result = result.replace(
        /require\(['"](\.[^'"]+)\.js['"]\)/g,
        "require('$1')"
    );
    
    // Fix ES module specific syntax for __dirname
    if (result.includes('import.meta.url') || result.includes('fileURLToPath')) {
        result = result.replace(
            /import\s+\{\s*fileURLToPath\s*\}\s+from\s+['"]url['"];?\s*/g,
            ''
        );
        result = result.replace(
            /const\s+__filename\s*=\s*fileURLToPath\(import\.meta\.url\);?\s*/g,
            ''
        );
        result = result.replace(
            /const\s+__dirname\s*=\s*path\.dirname\(__filename\);?\s*/g,
            ''
        );
    }
    
    return result;
}

function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function convertFile(relativePath) {
    const sourcePath = path.join(sourceDir, relativePath);
    const targetPath = path.join(targetDir, relativePath);
    
    if (!fs.existsSync(sourcePath)) {
        console.log(`⚠️  Source not found: ${relativePath}`);
        return false;
    }
    
    try {
        const content = fs.readFileSync(sourcePath, 'utf8');
        const converted = convertToCommonJS(content);
        
        ensureDir(path.dirname(targetPath));
        fs.writeFileSync(targetPath, converted, 'utf8');
        
        console.log(`✅ Converted: ${relativePath}`);
        return true;
    } catch (err) {
        console.error(`❌ Error converting ${relativePath}:`, err.message);
        return false;
    }
}

console.log('🔄 Converting ES Modules to CommonJS...\n');

let success = 0;
let failed = 0;

for (const file of filesToConvert) {
    if (convertFile(file)) {
        success++;
    } else {
        failed++;
    }
}

console.log(`\n📊 Conversion complete: ${success} succeeded, ${failed} failed`);
console.log('\n📝 Note: Please review converted files for any manual fixes needed.');
console.log('   - Check socket.js exports if using WebSockets');
console.log('   - Verify database imports are correct');
