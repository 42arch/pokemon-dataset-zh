const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const URL = 'https://wiki.52poke.com/wiki/%E5%AE%9D%E5%8F%AF%E6%A2%A6%E5%88%97%E8%A1%A8%EF%BC%88%E6%8C%89%E5%85%A8%E5%9B%BD%E5%9B%BE%E9%89%B4%E7%BC%96%E5%8F%B7%EF%BC%89?variant=zh-hans';
const CSS_URL = 'https://wiki.52poke.com/wiki/%E5%AE%9D%E5%8F%AF%E6%A2%A6%E5%88%97%E8%A1%A8%EF%BC%88%E6%8C%89%E5%85%A8%E5%9B%BD%E5%9B%BE%E9%89%B4%E7%BC%96%E5%8F%B7%EF%BC%89?variant=zh-hans';
const DATA_DIR = path.join(__dirname, '../data');
const RAW_DIR = path.join(DATA_DIR, 'raw');
const HTML_FILE = 'page.html';
const CSS_FILE = 'msp.css';

async function scrapePokemon() {
  try {
    if (!fs.existsSync(RAW_DIR)) {
        fs.mkdirSync(RAW_DIR, { recursive: true });
    }

    const filePath = path.join(RAW_DIR, HTML_FILE);
    const cssPath = path.join(RAW_DIR, CSS_FILE);
    
    // Ensure HTML file exists
    if (!fs.existsSync(filePath)) {
        console.log(`Downloading data from ${URL}...`);
        try {
            execSync(`curl -L -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36" "${URL}" -o "${filePath}"`);
        } catch (e) {
            console.error("Failed to download page via curl:", e.message);
            return;
        }
    } else {
        console.log(`Using cached ${HTML_FILE}...`);
    }

    // Ensure CSS file exists
    if (!fs.existsSync(cssPath)) {
        console.log(`Downloading CSS from ${CSS_URL}...`);
        try {
            execSync(`curl -L -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36" "${CSS_URL}" -o "${cssPath}"`);
        } catch (e) {
            console.error("Failed to download CSS via curl:", e.message);
            return;
        }
    } else {
        console.log(`Using cached ${CSS_FILE}...`);
    }

    console.log("Parsing CSS for sprite positions...");
    const cssContent = fs.readFileSync(cssPath, 'utf8');
    const spriteMap = {};
    
    // Regex to match .classname{background-position:x y}
    // Content looks like: .sprite-icon-001,.sprite-icon-0001{background-position:-3em 0}
    // We want to capture the class name and the position value.
    // Since the file is minified/single line, we need to be careful.
    // Strategy: split by '}', then match class names and content.
    
    // Split by '}' to get rules
    const rules = cssContent.split('}');
    rules.forEach(rule => {
        if (!rule.includes('{')) return;
        const [selectorsPart, stylesPart] = rule.split('{');
        
        // Check if styles part contains background-position
        const match = stylesPart.match(/background-position:([^;]+)/);
        if (match) {
            const position = match[1];
            // Split selectors by comma
            const selectors = selectorsPart.split(',');
            selectors.forEach(sel => {
                const className = sel.trim().replace('.', ''); // remove dot
                spriteMap[className] = position;
            });
        }
    });

    console.log(`Parsing data from ${filePath}...`);
    const data = fs.readFileSync(filePath, 'utf8');
    const $ = cheerio.load(data);
    const pokemonList = [];

    const genMap = {
      '第一': 1, '第二': 2, '第三': 3, '第四': 4, '第五': 5,
      '第六': 6, '第七': 7, '第八': 8, '第九': 9
    };
    let currentGeneration = 0;

    // Select headers and tables to track generation in document order
    $('h2, table.eplist').each((idx, el) => {
      const $el = $(el);
      
      if ($el.is('h2')) {
        const text = $el.text().trim();
        for (const [name, num] of Object.entries(genMap)) {
          if (text.includes(name + '世代')) {
            currentGeneration = num;
            break;
          }
        }
        return;
      }

      // If it's a table, process its rows
      $el.find('tbody tr').each((i, row) => {
        // Skip rows that don't have the ID cell
        const idCell = $(row).find('.rdexn-id');
        if (idCell.length === 0) return;

        let ndex = idCell.text().trim();
        
        // Remove the leading '#' if present
        if (ndex.startsWith('#')) {
            ndex = ndex.substring(1);
        }

        let chineseName = $(row).find('.rdexn-name').text().trim();
        
        // Clean chineseName: remove asterisks and separate regional forms with a hyphen before the region name
        chineseName = chineseName.replace(/\*/g, '');
        if (chineseName.includes('的样子')) {
            const regions = ['阿罗拉', '伽勒尔', '洗翠', '帕底亚', '卡洛斯', '丰缘', '城都', '关都', '合众'];
            let foundRegion = false;
            for (const region of regions) {
                if (chineseName.includes(region + '的样子')) {
                    chineseName = chineseName.replace(region + '的样子', '-' + region + '的样子');
                    foundRegion = true;
                    break;
                }
            }
            // Fallback if no known region is found
            if (!foundRegion) {
                chineseName = chineseName.replace('的样子', '-的样子');
            }
        }

        // const japaneseName = $(row).find('.rdexn-jpname').text().trim(); // Removed
        // const englishName = $(row).find('.rdexn-enname').text().trim(); // Removed
        
        const type1 = $(row).find('.rdexn-type1').text().trim();
        const type2 = $(row).find('.rdexn-type2').text().trim();
        
        const types = [type1, type2].filter(t => t && !t.includes('{{{') && !t.includes('}}}'));

        // Extract sprite position class
        let bgPosition = '';
        const spriteSpan = $(row).find('.rdexn-msp span');
        if (spriteSpan.length > 0) {
            const classes = spriteSpan.attr('class').split(/\s+/);
            const positionClass = classes.find(c => c.startsWith('sprite-icon-') && c !== 'sprite-icon' && c !== 'sprite-icon-shiny');
            
            if (positionClass && spriteMap[positionClass]) {
                bgPosition = spriteMap[positionClass];
            }
        }

        // Extract data-filter attribute
        let filter = $(row).attr('data-filter') || '';
        
        // Convert Traditional Chinese to Simplified Chinese in filter
        filter = filter.replace(/準/g, '准');

        if (ndex && chineseName) {
          pokemonList.push({
            id: ndex,
            name: chineseName,
            types: types.filter(t => t && !t.includes('{{{') && !t.includes('}}}')), // remove empty strings and bad template renders
            icon: bgPosition,
            filter: filter,
            gen: currentGeneration
          });
        }
      });
    });

    console.log(`Scraped ${pokemonList.length} Pokemon.`);
    
    const outputPath = path.join(DATA_DIR, 'pokemon.json');
    fs.writeFileSync(outputPath, JSON.stringify(pokemonList, null, 2), 'utf8');
    console.log(`Saved to ${outputPath}`);
    
    // Optional: cleanup
    // fs.unlinkSync(filePath); 

  } catch (error) {
    console.error('Error scraping data:', error);
  }
}

scrapePokemon();
