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
    const tryUrls = [
        name.includes('（特性）') ? name : `${name}（特性）`,
        name.replace('（特性）', '')
    ];

    let htmlContent = "";
    let $ = null;

    for (const urlName of tryUrls) {
        const url = `https://wiki.52poke.com/wiki/${encodeURIComponent(urlName)}?variant=zh-hans`;
        console.error(`Fetching data for ability from: ${url}...`);
        try {
            const rawHtml = execSync(`curl -L -A "${USER_AGENT}" "${url}"`, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
            $ = cheerio.load(rawHtml);
            // Check if page actually exists
            if ($('.noarticletext').length === 0) {
                htmlContent = rawHtml;
                break;
            }
        } catch (e) {
            console.error(`Failed to download page for ${urlName}:`, e.message);
        }
    }

    if (!htmlContent) return null;

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
    // Remove citation markers [1], [2], [注 1], * and zero-width spaces
    result.introduction = intro.replace(/\[(\d+|注\s*\d+)\]/g, '').replace(/\*/g, '').replace(/\u200b/g, '').trim();

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
        const skipHeaders = ['信长的野望', '不可思议的迷宫', '卡牌游戏', '旁支系列', '动画中', '漫画中', '名字来源'];
        
        while (next.length > 0 && next[0].name !== 'h2') {
            const node = next[0];
            const tagName = node.name;
            const $node = $(node);
            const text = $node.text().trim();

            // Stop if we hit a sub-header for side games or unrelated sections
            if (['h3', 'h4'].includes(tagName)) {
                if (skipHeaders.some(h => text.includes(h))) {
                    break; 
                }
                next = $node.next();
                continue;
            }

            // Skip dl tags (usually "Main article" links)
            if (tagName === 'dl') {
                next = $node.next();
                continue;
            }

            // Handle content tags
            if (['p', 'ul', 'ol', 'div'].includes(tagName)) {
                if (tagName === 'ul' || tagName === 'ol') {
                    $node.find('li').each((j, li) => {
                        const liText = $(li).text().trim();
                        // Filter out citations and duplicates
                        const cleanLi = liText.replace(/\[(\d+|注\s*\d+)\]/g, '').replace(/\*/g, '').trim();
                        if (cleanLi && !effect.includes(cleanLi)) {
                            effect += '- ' + cleanLi + '\n';
                        }
                    });
                } else if (tagName === 'p') {
                    const cleanP = text.replace(/\[(\d+|注\s*\d+)\]/g, '').replace(/\*/g, '').trim();
                    if (cleanP && !effect.includes(cleanP)) {
                        effect += cleanP + '\n';
                    }
                } else if (tagName === 'div') {
                    // For divs, we look for nested paragraphs or lists but avoid bulk text()
                    $node.find('p, li').each((j, child) => {
                        const cText = $(child).text().trim().replace(/\[(\d+|注\s*\d+)\]/g, '').replace(/\*/g, '').trim();
                        if (cText && !effect.includes(cText)) {
                            effect += (child.name === 'li' ? '- ' : '') + cText + '\n';
                        }
                    });
                }
            }
            next = $node.next();
        }
    }
    result.effect = effect.replace(/\u200b/g, '').trim();

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
        // Collect all tables in this section
        const tables = [];
        let next = pokeHeader.next();
        while (next.length > 0 && next[0].name !== 'h2') {
            if (next[0].name === 'table') {
                tables.push(next);
            } else if (next.hasClass('tabber')) {
                next.find('.tabbertab table').each((j, t) => tables.push($(t)));
            } else if (next.find('table').length > 0) {
                // Handle cases where table might be wrapped in a div or p
                next.find('table').each((j, t) => tables.push($(t)));
            }
            next = next.next();
        }

        tables.forEach(table => {
            table.find('tr').each((i, row) => {
                const visibleCells = $(row).children().not('.hide');
                if (visibleCells.length < 3) return;

                // Skip header row
                const firstCellText = visibleCells.first().text().trim();
                if (firstCellText.includes('#') || firstCellText === '宝可梦' || firstCellText === '寶可夢') return;

                // Map visible cells to logical columns considering colspan
                const rowData = [];
                let currentLogCol = 0;
                const maxCols = 8; // ID, Icon, Name, Type1, Type2, Ab1, Ab2, HiddenAb

                visibleCells.each((idx, cell) => {
                    const $cell = $(cell);
                    const colspan = parseInt($cell.attr('colspan')) || 1;
                    const text = $cell.text().trim();
                    
                    for (let c = 0; c < colspan && currentLogCol < maxCols; c++) {
                        rowData[currentLogCol] = { text, $cell };
                        currentLogCol++;
                    }
                });

                if (rowData.length < 6) return;

                const id = rowData[0].text;
                // Basic numeric check for ID
                if (!id || isNaN(parseInt(id.replace(/[^\d]/g, '')))) return;

                const iconCell = rowData[1].$cell;
                const nameCell = rowData[2].$cell;
                
                // Extract icon
                let iconPosition = "";
                const spriteSpan = iconCell.find('span.sprite-icon, span.sprite-pm');
                if (spriteSpan.length > 0) {
                    const classes = (spriteSpan.attr('class') || "").split(/\s+/);
                    const iconClass = classes.find(c => (c.startsWith('sprite-icon-') || c.startsWith('sprite-pm-')) && !['sprite-icon', 'sprite-pm'].includes(c));
                    if (iconClass && spriteMap[iconClass]) {
                        iconPosition = spriteMap[iconClass];
                    }
                }

                // Name and Form
                // Note: nameCell might be rowData[2].$cell. If name is merged with ID? No, unlikely.
                let name = nameCell.find('a').first().text().trim();
                let form = nameCell.find('small').text().trim();
                if (!name) name = nameCell.text().trim();

                if (!form) {
                    const fullText = nameCell.text().trim();
                    if (fullText.startsWith(name) && fullText.length > name.length) {
                        form = fullText.substring(name.length).trim();
                    }
                }

                // Types
                const types = [];
                if (rowData[3].text) types.push(rowData[3].text);
                if (rowData[4] && rowData[4].text && rowData[4].text !== rowData[3].text) {
                    types.push(rowData[4].text);
                }

                // Abilities
                const cleanAb = (val) => (val === "无" || val === "無") ? "" : val;
                const ab1 = rowData[5] ? cleanAb(rowData[5].text) : "";
                let ab2 = rowData[6] ? cleanAb(rowData[6].text) : "";
                if (ab2 === ab1) ab2 = "";
                const hiddenAb = rowData[7] ? cleanAb(rowData[7].text) : "";

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
        });
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
                const fileName = `${res.name_zh}.json`;
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