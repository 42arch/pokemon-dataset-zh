const fs = require('fs');
const path = require('path');
const { scrapeAbilityDetail } = require('./ability_info_crawler');

const DATA_FILE = path.join(__dirname, '../data/ability.json');
const OUTPUT_DIR = path.join(__dirname, '../data/ability');

async function runBatch() {
    if (!fs.existsSync(DATA_FILE)) {
        console.error(`Data file not found: ${DATA_FILE}`);
        return;
    }

    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    const abilities = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    console.log(`Found ${abilities.length} abilities to process.`);

    for (let i = 0; i < abilities.length; i++) {
        const item = abilities[i];
        const { id, name_zh } = item;
        const filename = `${name_zh}.json`;
        const filePath = path.join(OUTPUT_DIR, filename);

        // Optional: Skip if already exists to allow resuming
        if (fs.existsSync(filePath)) {
            console.log(`[${i + 1}/${abilities.length}] Skipping ${name_zh} (already exists)`);
            continue;
        }

        console.log(`[${i + 1}/${abilities.length}] Processing ${name_zh} (ID: ${id})...`);
        
        try {
            const data = await scrapeAbilityDetail(name_zh);
            if (data) {
                // Ensure ID from list is used if crawler missed it or to be consistent
                data.id = id; 
                
                fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
                console.log(`  -> Saved to ${filename}`);
            } else {
                console.error(`  -> Failed to scrape data for ${name_zh}`);
            }
        } catch (err) {
            console.error(`  -> Error processing ${name_zh}:`, err.message);
        }

        // Add a small delay to be polite
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log('Batch processing complete.');
}

runBatch();
