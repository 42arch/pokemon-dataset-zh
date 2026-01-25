const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const DATA_FILE = path.join(__dirname, '../data/simple_pokedex.json');
const OUTPUT_DIR = path.join(__dirname, '../data/pokemon');
const CRAWLER_SCRIPT = path.join(__dirname, 'pokemon_info_crawler.js');
const DELAY_MS = 2000; // 2 seconds delay between requests

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function runBatch() {
    // Read pokemon list
    if (!fs.existsSync(DATA_FILE)) {
        console.error(`Error: ${DATA_FILE} not found.`);
        return;
    }
    
    const pokemonList = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    
    // Parse arguments
    const args = process.argv.slice(2);
    let targetList = [];
    
    if (args.length === 0) {
        console.log("Usage: node batch_pokemon_crawler.js <start_id> [end_id]");
        console.log("       node batch_pokemon_crawler.js <pokemon_name>");
        console.log("       node batch_pokemon_crawler.js all");
        return;
    }
    
    if (args[0] === 'all') {
        targetList = pokemonList;
    } else if (isNaN(parseInt(args[0]))) {
        // Assume name
        const name = args[0];
        targetList = pokemonList.filter(p => p.name_zh === name || p.name_en === name || p.name_jp === name);
    } else {
        // ID range
        const startId = parseInt(args[0]);
        const endId = args[1] ? parseInt(args[1]) : startId;
        
        targetList = pokemonList.filter(p => {
            const pid = parseInt(p.index);
            return pid >= startId && pid <= endId;
        });
    }
    
    console.log(`Found ${targetList.length} Pokemon to process.`);
    
    // Ensure output dir exists
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }
    
    for (const p of targetList) {
        const filename = `${p.index}-${p.name_zh}.json`;
        const filePath = path.join(OUTPUT_DIR, filename);
        
        // Skip if already exists
        if (fs.existsSync(filePath)) {
            console.log(`[Skipping] ${p.name_zh} (${p.index}) - Already exists.`);
            continue;
        }
        
        console.log(`[Processing] ${p.name_zh} (${p.index})...`);
        
        try {
            // Call the crawler script
            // We use execSync to run it synchronously
            // Pass the Pokemon name as argument
            execSync(`node "${CRAWLER_SCRIPT}" "${p.name_zh}"`, { stdio: 'inherit' });
            
            // Wait a bit
            await sleep(DELAY_MS);
            
        } catch (e) {
            console.error(`[Error] Failed to crawl ${p.name_zh}: ${e.message}`);
        }
    }
    
    console.log("Batch processing complete.");
}

runBatch();