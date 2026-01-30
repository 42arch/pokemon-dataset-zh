const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const URL = 'https://wiki.52poke.com/wiki/%E7%89%B9%E6%80%A7%E5%88%97%E8%A1%A8';
const DATA_DIR = path.join(__dirname, '../data');
const RAW_DIR = path.join(DATA_DIR, 'raw');
const HTML_FILE = 'ability_page.html';
const OUTPUT_FILE = 'ability.json';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';

async function scrapeAbilities() {
  try {
    if (!fs.existsSync(RAW_DIR)) {
        fs.mkdirSync(RAW_DIR, { recursive: true });
    }

    const filePath = path.join(RAW_DIR, HTML_FILE);
    
    // Ensure HTML file exists
    if (!fs.existsSync(filePath)) {
        console.log(`Downloading data from ${URL}...`);
        try {
            execSync(`curl -L -A "${USER_AGENT}" "${URL}" -o "${filePath}"`);
        } catch (e) {
            console.error("Failed to download page via curl:", e.message);
            return;
        }
    } else {
        console.log(`Using cached ${HTML_FILE}...`);
    }

    console.log(`Parsing data from ${filePath}...`);
    const data = fs.readFileSync(filePath, 'utf8');
    const $ = cheerio.load(data);
    const abilityList = [];

    const genMap = {
      '第三': 3, '第四': 4, '第五': 5,
      '第六': 6, '第七': 7, '第八': 8, '第九': 9
    };
    
    let currentGeneration = 0;

    // Traverse headers and tables
    // The structure is <h2>Header</h2> <table class="eplist ...">
    
    // We select all h2 and table elements in order
    $('.mw-parser-output > h2, .mw-parser-output > table.eplist').each((i, el) => {
        const $el = $(el);
        
        if ($el.is('h2')) {
            const text = $el.text().trim();
            for (const [key, value] of Object.entries(genMap)) {
                if (text.includes(key + '世代')) {
                    currentGeneration = value;
                    break;
                }
            }
            return;
        }
        
        if ($el.is('table') && currentGeneration > 0) {
            $el.find('tr').each((j, tr) => {
                // Skip header rows
                if ($(tr).find('th').length > 0) return;
                
                const tds = $(tr).find('td');
                if (tds.length < 7) return;
                
                const idCell = $(tds[0]);
                const id = idCell.text().trim().replace(/\*/g, '');
                
                let caption = '';
                const explainSpan = idCell.find('.explain, [title]');
                if (explainSpan.length > 0) {
                    const title = explainSpan.attr('title');
                    if (title) {
                        caption = title;
                    }
                }

                const nameZh = $(tds[1]).text().trim();
                const nameJa = $(tds[2]).text().trim();
                const nameEn = $(tds[3]).text().trim();
                const description = $(tds[4]).text().trim();
                const commonCount = $(tds[5]).text().trim();
                const hiddenCount = $(tds[6]).text().trim();
                
                if (id && nameZh) {
                    abilityList.push({
                        id: id,
                        name_zh: nameZh,
                        name_ja: nameJa,
                        name_en: nameEn,
                        description: description,
                        common_count: parseInt(commonCount) || 0,
                        hidden_count: parseInt(hiddenCount) || 0,
                        generation: currentGeneration,
                        caption: caption
                    });
                }
            });
        }
    });

    console.log(`Scraped ${abilityList.length} abilities.`);
    
    const outputPath = path.join(DATA_DIR, OUTPUT_FILE);
    fs.writeFileSync(outputPath, JSON.stringify(abilityList, null, 2), 'utf8');
    console.log(`Saved to ${outputPath}`);

  } catch (error) {
    console.error('Error scraping data:', error);
  }
}

scrapeAbilities();
