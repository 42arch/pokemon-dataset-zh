const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const URL = 'https://wiki.52poke.com/wiki/%E5%AE%9D%E5%8F%AF%E6%A2%A6%E5%88%97%E8%A1%A8%EF%BC%88%E6%8C%89%E5%85%A8%E5%9B%BD%E5%9B%BE%E9%89%B4%E7%BC%96%E5%8F%B7%EF%BC%89?variant=zh-hans';
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

    // Select rows from the specific tables
    $('table.eplist tbody tr').each((i, el) => {
      // Skip rows that don't have the ID cell
      const idCell = $(el).find('.rdexn-id');
      if (idCell.length === 0) return;

      let ndex = idCell.text().trim();
      
      // Remove the leading '#' if present
      if (ndex.startsWith('#')) {
          ndex = ndex.substring(1);
      }

      const chineseName = $(el).find('.rdexn-name').text().trim();
      const japaneseName = $(el).find('.rdexn-jpname').text().trim();
      const englishName = $(el).find('.rdexn-enname').text().trim();
      
      const type1 = $(el).find('.rdexn-type1').text().trim();
      const type2 = $(el).find('.rdexn-type2').text().trim();
      
      const types = [type1, type2].filter(t => t && !t.includes('{{{') && !t.includes('}}}'));

      // Extract sprite position class
      let bgPosition = '';
      const spriteSpan = $(el).find('.rdexn-msp span');
      if (spriteSpan.length > 0) {
          const classes = spriteSpan.attr('class').split(/\s+/);
          const positionClass = classes.find(c => c.startsWith('sprite-icon-') && c !== 'sprite-icon' && c !== 'sprite-icon-shiny');
          
          if (positionClass && spriteMap[positionClass]) {
              bgPosition = spriteMap[positionClass];
          }
      }

      // Extract data-filter attribute
      const filter = $(el).attr('data-filter') || '';

      if (ndex && chineseName) {
        pokemonList.push({
          id: ndex,
          name_zh: chineseName,
          name_ja: japaneseName,
          name_en: englishName,
          types: types.filter(t => t && !t.includes('{{{') && !t.includes('}}}')), // remove empty strings and bad template renders
          sprite_position: bgPosition,
          filter: filter
        });
      }
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
