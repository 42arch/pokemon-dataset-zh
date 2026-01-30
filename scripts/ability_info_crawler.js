const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';

/**
 * Scrape detailed information for a single Pokemon ability.
 * @param {string} name Ability name (e.g., "恶臭")
 */
async function scrapeAbilityDetail(name) {
    if (!name) return null;

    // Load CSS for icons
    const cssPath = path.join(__dirname, '../data/raw/msp.css');
    const spriteMap = {};
    if (fs.existsSync(cssPath)) {
        const cssContent = fs.readFileSync(cssPath, 'utf8');
        const rules = cssContent.split('}');
        rules.forEach(rule => {
            if (!rule.includes('{')) return;
            const [selectorsPart, stylesPart] = rule.split('{');
            const match = stylesPart.match(/background-position:([^;]+)/);
            if (match) {
                const position = match[1];
                const selectors = selectorsPart.split(',');
                selectors.forEach(sel => {
                    const className = sel.trim().replace('.', '');
                    spriteMap[className] = position;
                });
            }
        });
    }

    // 52Poke Wiki usually uses "Name（特性）" for URLs to distinguish from moves or items.
    const urlName = name.includes('（特性）') ? name : `${name}（特性）`;
    const url = `https://wiki.52poke.com/wiki/${encodeURIComponent(urlName)}?variant=zh-hans`;

    console.error(`Fetching data for ability: ${name}...`);
    let htmlContent;
    try {
        htmlContent = execSync(`curl -L -A "${USER_AGENT}" "${url}"`, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
    } catch (e) {
        console.error(`Failed to download page for ${name}:`, e.message);
        return null;
    }

    const $ = cheerio.load(htmlContent);
    const result = {};

    // 1. Basic Info (Infobox)
    const infobox = $('table.roundy.a-r.at-c').first();
    
    // Names
    result.name_zh = infobox.find('strong').first().text().trim() || name;
    result.name_ja = infobox.find('span[lang="ja"]').first().text().trim();
    result.name_en = infobox.find('span[lang="en"]').first().text().trim();

    // ID and Infobox fields
    const basicInfo = [];
    let infoboxIntro = "";
    
    infobox.find('tr').each((i, row) => {
        const fullRowText = $(row).text().trim();
        
        if (fullRowText === '文字介绍') {
            infoboxIntro = $(row).next('tr').find('td').text().trim();
        }

        if (fullRowText === '基本信息') {
            $(row).next('tr').find('li').each((j, li) => {
                basicInfo.push($(li).text().trim());
            });
        }

        // Search for potential ID row
        if (fullRowText.includes('编号')) {
            const td = $(row).find('td').last();
            if (td.length > 0) {
                result.id = td.text().trim().replace('#', '');
            }
        }
    });
    result.basic_info = basicInfo;

    // 2. Introduction (文字介绍)
    let intro = infoboxIntro;
    if (!intro) {
        $('.mw-parser-output > p').each((i, el) => {
            const text = $(el).text().trim();
            // Filter out disambiguation headers
            if (text && !text.includes('这篇文章讲述的是') && !intro) {
                intro = text;
            }
        });
    }
    // Remove citation markers [1], [2], *
    result.introduction = intro.replace(/\[\d+\]/g, '').replace(/\*/g, '').trim();

    // 3. Effect (特性效果)
    let effect = '';
    let effectHeader = $('#特性效果, #对战中, #效果').closest('h2, h3');
    
    if (effectHeader.length === 0) {
        $('h2, h3').each((i, el) => {
            const hText = $(el).text().trim();
            if (hText.includes('特性效果') || hText.includes('对战中')) {
                effectHeader = $(el);
                return false; 
            }
        });
    }

    if (effectHeader.length > 0) {
        let next = effectHeader.next();
        // Stop only at the next major section (h2), allowing h3 subsections
        while (next.length > 0 && next[0].name !== 'h2') {
            const tagName = next[0].name;
            if (['p', 'ul', 'ol', 'dl', 'div'].includes(tagName)) {
                if (tagName === 'ul' || tagName === 'ol') {
                    next.find('li').each((j, li) => {
                        effect += '- ' + $(li).text().trim() + '\n';
                    });
                } else {
                    const text = next.text().trim();
                    if (text) effect += text + '\n';
                }
            }
            next = next.next();
        }
    }
    // Clean citation markers
    result.effect = effect.replace(/\[\d+\]/g, '').replace(/\*/g, '').trim();

    // 4. Pokemon List (具有该特性的宝可梦)
    const pokemonList = [];
    let pokeHeader = $('#具有该特性的宝可梦').closest('h2');
    
    if (pokeHeader.length === 0) {
        $('h2').each((i, el) => {
            if ($(el).text().trim().includes('具有该特性的宝可梦')) {
                pokeHeader = $(el);
                return false;
            }
        });
    }

    if (pokeHeader.length > 0) {
        const table = pokeHeader.next('table');
        if (table.length > 0) {
            table.find('tr').each((i, row) => {
                // Skip header row
                const firstCell = $(row).find('th').first();
                if (firstCell.length > 0 && firstCell.text().includes('#')) return;
                
                const cells = $(row).children();
                // Expected columns: ID, Icon, Name, Type1, Type2, Ab1, Ab2, HiddenAb
                // Check cell count to avoid malformed rows
                if (cells.length < 6) return;

                const id = cells.eq(0).text().trim();
                const iconCell = cells.eq(1);
                const nameCell = cells.eq(2);
                
                // Extract icon background position
                let iconPosition = "";
                const spriteSpan = iconCell.find('span.sprite-icon');
                if (spriteSpan.length > 0) {
                    const classes = spriteSpan.attr('class').split(/\s+/);
                    const iconClass = classes.find(c => c.startsWith('sprite-icon-') && c !== 'sprite-icon');
                    if (iconClass && spriteMap[iconClass]) {
                        iconPosition = spriteMap[iconClass];
                    }
                }

                let name = nameCell.find('a').first().text().trim();
                let form = nameCell.find('small').text().trim();
                
                if (!name) name = nameCell.text().trim(); // Fallback

                // If form is not in small tag, try to extract from text
                if (!form) {
                    // Remove name from full text to find form
                    // e.g. "Raichu Alola Form" -> "Alola Form"
                    const fullText = nameCell.text().trim();
                    if (fullText.startsWith(name)) {
                        form = fullText.substring(name.length).trim();
                    }
                }

                // Types
                const types = [];
                const type1 = cells.eq(3).text().trim();
                const type2 = cells.eq(4).text().trim();
                if (type1) types.push(type1);
                if (type2 && !cells.eq(4).hasClass('hide') && type2 !== type1) types.push(type2);

                const ab1 = cells.eq(5).text().trim();
                const ab2 = cells.eq(6).text().trim();
                const hiddenAb = cells.eq(7).text().trim();

                pokemonList.push({
                    id: id,
                    name: name,
                    form: form,
                    icon: iconPosition,
                    types: types,
                    first_ability: ab1,
                    second_ability: ab2,
                    hidden_ability: hiddenAb
                });
            });
        }
    }
    result.pokemon_list = pokemonList;

    return result;
}

// CLI handler
if (require.main === module) {
    const arg = process.argv[2];
    if (arg) {
        scrapeAbilityDetail(arg).then(res => {
            if (res) {
                console.log(JSON.stringify(res, null, 2));
                
                // Save to data/ability
                const saveDir = path.join(__dirname, '../data/ability');
                if (!fs.existsSync(saveDir)) {
                    fs.mkdirSync(saveDir, { recursive: true });
                }
                const fileName = `${res.id || '000'}-${res.name_zh}.json`;
                const filePath = path.join(saveDir, fileName);
                fs.writeFileSync(filePath, JSON.stringify(res, null, 2), 'utf8');
                console.error(`\nSaved to ${filePath}`);
            }
        });
    } else {
        console.log("Usage: node ability_info_crawler.js <AbilityName>");
    }
}

module.exports = { scrapeAbilityDetail };