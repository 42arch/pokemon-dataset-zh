const fs = require('fs');
const path = require('path');
const { scrapeMoveDetail } = require('./move_info_crawler');

const DATA_FILE = path.join(__dirname, '../data/move_list.json');
const OUTPUT_DIR = path.join(__dirname, '../data/moves');

async function runBatch() {
    if (!fs.existsSync(DATA_FILE)) {
        console.error(`Data file not found: ${DATA_FILE}`);
        return;
    }

    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    const moves = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    console.log(`Found ${moves.length} moves to process.`);

    for (let i = 0; i < moves.length; i++) {
        const item = moves[i];
        const { id, name_zh, is_z } = item;
        const filename = `${name_zh}.json`;
        const filePath = path.join(OUTPUT_DIR, filename);

        // Optional: Skip if already exists to allow resuming
        if (fs.existsSync(filePath)) {
            console.log(`[${i + 1}/${moves.length}] Skipping ${name_zh} (already exists)`);
            continue;
        }

        console.log(`[${i + 1}/${moves.length}] Processing ${name_zh} (ID: ${id})...`);
        
        try {
            // scrapeMoveDetail is synchronous in its current implementation, 
            // but we can await it if it becomes async or just call it.
            // Since the original request mentioned "like batch_ability_crawler.js" which uses await,
            // and we might want to support async in future, we can treat it as such or just call it.
            // However, the imported function is currently sync.
            // To be safe and prevent blocking the event loop too much if we were doing async IO (though we are using execSync),
            // we'll just call it.
            
            const data = scrapeMoveDetail(name_zh, is_z);
            
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
