const cheerio = require('cheerio');
const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

const URL = "https://wiki.52poke.com/wiki/%E6%8B%9B%E5%BC%8F%E5%88%97%E8%A1%A8";
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
const DATA_DIR = path.join(__dirname, '../data');
const OUTPUT_FILE = path.join(DATA_DIR, 'move_list.json');
const HTML_FILE = 'move_list.html';

function fetchPage(url) {
    // Check if local file exists first (for development/caching)
    // The previous turn downloaded 'move_list.html' to the root.
    // The script is in 'scripts/', so root is '../'.
    const localPath = path.join(__dirname, '../move_list.html');
    
    if (fs.existsSync(localPath)) {
        console.log(`Reading local file: ${localPath}`);
        return fs.readFileSync(localPath, 'utf8');
    }

    try {
        console.log(`Fetching ${url}...`);
        const command = `curl -L -A "${USER_AGENT}" "${url}"`;
        return execSync(command, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
    } catch (error) {
        console.error(`Error fetching page: ${error.message}`);
        process.exit(1);
    }
}

function scrape() {
    // Ensure data directory exists
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    const html = fetchPage(URL);
    const $ = cheerio.load(html);
    const moveList = [];

    // Iterate over H2 headers to find generations
    $('h2').each((i, header) => {
        const $header = $(header);
        const headline = $header.find('.mw-headline');
        const generation = headline.text().trim();

        // Check if this header is a Generation header (First Generation, etc.)
        if (generation.includes('世代')) {
            // Find the next table
            const $table = $header.nextAll('table.hvlist').first();
            
            if ($table.length > 0) {
                $table.find('tr').each((j, row) => {
                    // Skip header row
                    if ($(row).find('th').length > 0) return;

                    const tds = $(row).find('td');
                    if (tds.length >= 9) {
                        const id = $(tds[0]).text().trim();
                        const nameZh = $(tds[1]).text().trim();
                        const nameJp = $(tds[2]).text().trim();
                        const nameEn = $(tds[3]).text().trim();
                        const type = $(tds[4]).text().trim();
                        const category = $(tds[5]).text().trim();
                        const power = $(tds[6]).text().trim();
                        const accuracy = $(tds[7]).text().trim();
                        const pp = $(tds[8]).text().trim();
                        const description = $(tds[9]).text().trim();

                        moveList.push({
                            id,
                            name_zh: nameZh,
                            name_jp: nameJp,
                            name_en: nameEn,
                            type,
                            category,
                            power,
                            accuracy,
                            pp,
                            description,
                            generation
                        });
                    }
                });
            }
        }
    });

    console.log(`Scraped ${moveList.length} Moves.`);

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(moveList, null, 2), 'utf8');
    console.log(`Saved data to ${OUTPUT_FILE}`);
}

scrape();
