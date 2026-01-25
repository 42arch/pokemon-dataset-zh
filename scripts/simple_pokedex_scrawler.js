const cheerio = require('cheerio');
const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

const URL = "https://wiki.52poke.com/wiki/%E5%AE%9D%E5%8F%AF%E6%A2%A6%E5%88%97%E8%A1%A8%EF%BC%88%E6%8C%89%E5%85%A8%E5%9B%BD%E5%9B%BE%E9%89%B4%E7%BC%96%E5%8F%B7%EF%BC%89/%E7%AE%80%E5%8D%95%E7%89%88";
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
const DATA_DIR = path.join(__dirname, '../data');
const OUTPUT_FILE = path.join(DATA_DIR, 'simple_pokedex.json');

function fetchPage(url) {
    try {
        console.log(`Fetching ${url}...`);
        const command = `curl -L -A "${USER_AGENT}" "${url}"`;
        // Increase maxBuffer to handle large HTML
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
    const pokemonList = [];

    // The main table usually has the class 'eplist'
    const table = $('table.eplist');

    if (table.length === 0) {
        console.error("Could not find the pokedex table (.eplist).");
        return;
    }

    table.find('tr').each((i, row) => {
        const tds = $(row).find('td');
        
        // Data rows have 4 cells
        if (tds.length === 4) {
            const idRaw = $(tds[0]).text().trim();
            
            // Ensure it's a valid ID row (starts with #)
            if (idRaw.startsWith('#')) {
                const id = idRaw.replace('#', '');
                const nameZh = $(tds[1]).text().trim();
                const nameJp = $(tds[2]).text().trim();
                const nameEn = $(tds[3]).text().trim();

                pokemonList.push({
                    index: id,
                    name_zh: nameZh,
                    name_jp: nameJp,
                    name_en: nameEn
                });
            }
        }
    });

    console.log(`Scraped ${pokemonList.length} Pokemon.`);

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(pokemonList, null, 2), 'utf8');
    console.log(`Saved data to ${OUTPUT_FILE}`);
}

scrape();
