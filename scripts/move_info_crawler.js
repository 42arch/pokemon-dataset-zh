const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
const DATA_DIR = path.join(__dirname, '../data/moves');

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

function fetchPage(url) {
    try {
        console.log(`Fetching ${url}...`);
        const command = `curl -L -A "${USER_AGENT}" "${url}"`;
        return execSync(command, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
    } catch (error) {
        console.error(`Error fetching page: ${error.message}`);
        return null;
    }
}

function cleanText(text) {
    if (!text) return '';
    return text.replace(/\[\d+\]/g, '').trim();
}

function scrapeMoveDetail(moveNameOrFile) {
    let htmlContent;
    let moveName;

    if (fs.existsSync(moveNameOrFile)) {
        console.log(`Reading from local file: ${moveNameOrFile}`);
        htmlContent = fs.readFileSync(moveNameOrFile, 'utf8');
        moveName = path.basename(moveNameOrFile, '.html');
    } else {
        moveName = moveNameOrFile;
        const url = `https://wiki.52poke.com/wiki/${encodeURIComponent(moveName)}?variant=zh-hans`;
        htmlContent = fetchPage(url);
    }

    if (!htmlContent) return;

    const $ = cheerio.load(htmlContent);

    // 1. Names & Basic Info (from Infobox)
    let name_zh = moveName;
    let name_ja = '';
    let name_en = '';
    let type = '';
    let category = '';
    let pp = '';
    let power = '';
    let accuracy = '';
    let description = ''; // Intro description will be extracted later

    const infobox = $('table.roundy.a-r.at-c').first();
    if (infobox.length > 0) {
        const titleCell = infobox.find('th').first();
        const jaSpan = titleCell.find('span[lang="ja"]');
        const enSpan = titleCell.find('span[lang="en"]');
        
        if (jaSpan.length) name_ja = jaSpan.text().trim();
        if (enSpan.length) name_en = enSpan.text().trim();
        
        const bigSpan = titleCell.find('span[style*="font-size:1.5em"]');
        if (bigSpan.length) name_zh = bigSpan.text().trim();

        // Extract Attributes using safer logic
        const extractAttribute = (label) => {
            let val = '';
            infobox.find('tr').each((i, row) => {
                const $row = $(row);
                const $th = $row.find('th').first();
                if ($th.length > 0 && $th.text().trim() === label && !val) {
                    val = $row.find('td').first().text().trim();
                }
            });
            return val;
        };

        type = extractAttribute('属性');
        category = extractAttribute('分类');
        pp = extractAttribute('ＰＰ');
        power = extractAttribute('威力');
        accuracy = extractAttribute('命中');
    }

    // 2. Description (Intro)
    // Find description: usually <td class="roundy b-Type">...</td> inside the infobox second row (index 1)
    // Actually, looking at thunderbolt.html:
    // <tr><td class="roundy b-电" ...>向对手发出强力电击进行攻击...</td></tr>
    // It's in the infobox table, often the 2nd row.
    const descCell = infobox.find('td[style*="font-size:smaller"]');
    if (descCell.length > 0) {
        description = cleanText(descCell.text());
    } else {
        // Fallback to mw-parser-output first p
        const mwOutput = $('.mw-parser-output');
        mwOutput.children('p').each((i, el) => {
            const text = $(el).text().trim();
            if (text && !description && !text.includes('是') && !text.includes('引入的')) { // Avoid "is a move introduced in..." intro
                 description = cleanText(text);
            }
        });
    }
    
    // Also get the standard intro text (Generation intro)
    let intro = '';
    $('.mw-parser-output > p').each((i, el) => {
        const text = $(el).text().trim();
        if (text && (text.includes('是') || text.includes('引入的')) && !intro) {
            intro = cleanText(text);
        }
    });


    // 3. Effect (formerly Collapsed Effects)
    let effect = '';
    const collapsedDiv = $('#mw-customcollapsible-moveBoxMore');
    if (collapsedDiv.length > 0) {
        const listItems = collapsedDiv.find('li');
        const effects = [];
        listItems.each((i, li) => {
            effects.push($(li).text().trim());
        });
        effect = effects.join('\n');
    }

    // 4. Range (范围)
    let range = '';
    infobox.find('tr').each((i, row) => {
        const text = $(row).text().trim();
        if (text.includes('范围')) {
            // The range description is usually in a following row with specific class
            // or we can search for the next row that contains a link to Category:作用范围...
            // In thunderbolt.html it is in a td with class "roundy-5 bgwhite"
            
            // Try to find the range text in subsequent rows
            let nextRow = $(row).next();
            while (nextRow.length > 0) {
                const rangeCell = nextRow.find('td.roundy-5.bgwhite');
                if (rangeCell.length > 0) {
                    range = rangeCell.text().trim();
                    break;
                }
                nextRow = nextRow.next();
            }
        }
    });

    // 5. Additional Effects (招式附加效果)
    let additional_effect = '';
    const effectHeader = $('#招式附加效果').closest('h2');
    if (effectHeader.length > 0) {
        let next = effectHeader.next();
        while (next.length > 0 && !['h2', 'h3'].includes(next[0].name)) {
            if (next[0].name !== 'table' && (next[0].name !== 'figure' && !next.find('img').length)) {
                additional_effect += next.text().trim() + '\n';
            }
            next = next.next();
        }
    }
    additional_effect = cleanText(additional_effect);

    // 5. Game Descriptions (招式说明)
    const game_descriptions = [];
    const descHeader = $('#招式说明').closest('h2');
    if (descHeader.length > 0) {
        const table = descHeader.nextAll('table.rdlist').first();
        if (table.length > 0) {
            table.find('tr').each((i, row) => {
                const tds = $(row).find('td');
                if (tds.length >= 2) {
                    const games = $(tds[0]).text().trim().replace(/\s+/g, ' ');
                    const text = $(tds[1]).text().trim();
                    game_descriptions.push({ games, text });
                }
            });
        }
    }

    // 6. Details (细节)
    let details = '';
    const detailHeader = $('#细节').closest('h2');
    if (detailHeader.length > 0) {
        let next = detailHeader.next();
        while (next.length > 0 && !['h2', 'h3'].includes(next[0].name)) {
            // Skip tables and figures
            if (next[0].name !== 'table' && (next[0].name !== 'figure' && !next.find('img').length)) {
                details += next.text().trim() + '\n';
            }
            next = next.next();
        }
    }
    details = cleanText(details);

    // 7. Move Changes (招式变更)
    let move_changes = '';
    const changeHeader = $('#招式变更').closest('h2');
    if (changeHeader.length > 0) {
        let next = changeHeader.next();
        while (next.length > 0 && !['h2'].includes(next[0].name)) { // Keep h3
             if (next[0].name !== 'table' && (next[0].name !== 'figure' && !next.find('img').length)) {
                move_changes += next.text().trim() + '\n';
            }
            next = next.next();
        }
    }
    move_changes = cleanText(move_changes);

    // 8. Learn by Level Up (通过等级提升)
    const learn_by_level_up = [];
    const levelUpHeader = $('#通过等级提升').closest('h3');
    if (levelUpHeader.length > 0) {
        const table = levelUpHeader.nextAll('table').first();
        if (table.length > 0) {
            table.find('tr.bgwhite').each((i, row) => {
                const tds = $(row).children();
                if (tds.length < 3) return;

                const id = $(tds[0]).text().trim();
                
                const spriteSpan = $(tds[1]).find('span.sprite-icon');
                let sprite_class = '';
                if (spriteSpan.length > 0) {
                    const classes = spriteSpan.attr('class').split(/\s+/);
                    sprite_class = classes.find(c => c.startsWith('sprite-icon-') && c !== 'sprite-icon' && c !== 'sprite-icon-shiny') || '';
                }

                const nameCell = $(tds[2]);
                let name = nameCell.find('b > a').text().trim();
                if (!name) name = nameCell.find('a').first().text().trim(); // sometimes not bold?
                
                const formSmall = nameCell.find('small');
                if (formSmall.length > 0) {
                    const formText = formSmall.text().trim();
                    if (formText) {
                        name += `（${formText}）`;
                    }
                }

                // Types
                const types = [];
                // Types are usually in the next 1 or 2 cells (th or td)
                // In the example: <th colspan="2" ...><a...>电</a></th>
                // Or two separate ths.
                // We check tds[3] and tds[4] (if exists and matches type structure)
                
                // Helper to extract type from cell
                const extractType = (cell) => {
                    return $(cell).find('a[title$="（属性）"]').text().trim();
                };

                const type1 = extractType(tds[3]);
                if (type1) types.push(type1);

                // If tds[3] has colspan=2, there is no type2 in tds[4] (tds[4] would be next data)
                // But in cheerio, how are colspans handled in `children()`? 
                // `children()` returns elements as they are in DOM. 
                // If colspan=2, there is only one element for that index.
                
                // However, we need to know if we should check tds[4] for type 2.
                // If tds[3] does NOT have colspan attribute or colspan=1, then we check tds[4].
                
                const colspan = $(tds[3]).attr('colspan');
                if (!colspan || parseInt(colspan) === 1) {
                    const type2 = extractType(tds[4]);
                    if (type2) types.push(type2);
                }

                if (id && name) {
                    learn_by_level_up.push({
                        id,
                        name,
                        types,
                        sprite_class
                    });
                }
            });
        }
    }

    // 9. Learn by TM (通过招式学习器)
    const learn_by_tm = [];
    const tmHeader = $('#通过招式学习器').closest('h3');
    if (tmHeader.length > 0) {
        const table = tmHeader.nextAll('table').first();
        if (table.length > 0) {
            table.find('tr.bgwhite').each((i, row) => {
                const tds = $(row).children();
                if (tds.length < 3) return;

                const id = $(tds[0]).text().trim();
                
                const spriteSpan = $(tds[1]).find('span.sprite-icon');
                let sprite_class = '';
                if (spriteSpan.length > 0) {
                    const classes = spriteSpan.attr('class').split(/\s+/);
                    sprite_class = classes.find(c => c.startsWith('sprite-icon-') && c !== 'sprite-icon' && c !== 'sprite-icon-shiny') || '';
                }

                const nameCell = $(tds[2]);
                let name = nameCell.find('b > a').text().trim();
                if (!name) name = nameCell.find('a').first().text().trim();
                
                const formSmall = nameCell.find('small');
                if (formSmall.length > 0) {
                    const formText = formSmall.text().trim();
                    if (formText) {
                        name += `（${formText}）`;
                    }
                }

                const types = [];
                const extractType = (cell) => {
                    return $(cell).find('a[title$="（属性）"]').text().trim();
                };

                const type1 = extractType(tds[3]);
                if (type1) types.push(type1);

                const colspan = $(tds[3]).attr('colspan');
                if (!colspan || parseInt(colspan) === 1) {
                    const type2 = extractType(tds[4]);
                    if (type2) types.push(type2);
                }

                if (id && name) {
                    learn_by_tm.push({
                        id,
                        name,
                        types,
                        sprite_class
                    });
                }
            });
        }
    }

    // 10. Learn by Breeding (通过遺傳)
    const learn_by_breeding = [];
    const breedingHeader = $('#通过遺傳').closest('h3');
    if (breedingHeader.length > 0) {
        const table = breedingHeader.nextAll('table').first();
        if (table.length > 0) {
            table.find('tr.bgwhite').each((i, row) => {
                const tds = $(row).children();
                if (tds.length < 3) return;

                const id = $(tds[0]).text().trim();
                
                const spriteSpan = $(tds[1]).find('span.sprite-icon');
                let sprite_class = '';
                if (spriteSpan.length > 0) {
                    const classes = spriteSpan.attr('class').split(/\s+/);
                    sprite_class = classes.find(c => c.startsWith('sprite-icon-') && c !== 'sprite-icon' && c !== 'sprite-icon-shiny') || '';
                }

                const nameCell = $(tds[2]);
                let name = nameCell.find('b > a').text().trim();
                if (!name) name = nameCell.find('a').first().text().trim();
                
                const formSmall = nameCell.find('small');
                if (formSmall.length > 0) {
                    const formText = formSmall.text().trim();
                    if (formText) {
                        name += `（${formText}）`;
                    }
                }

                const types = [];
                const extractType = (cell) => {
                    return $(cell).find('a[title$="（属性）"]').text().trim();
                };

                const type1 = extractType(tds[3]);
                if (type1) types.push(type1);

                const colspan = $(tds[3]).attr('colspan');
                if (!colspan || parseInt(colspan) === 1) {
                    const type2 = extractType(tds[4]);
                    if (type2) types.push(type2);
                }

                if (id && name) {
                    learn_by_breeding.push({
                        id,
                        name,
                        types,
                        sprite_class
                    });
                }
            });
        }
    }

    // 11. Learn by Tutor (通过教授招式)
    const learn_by_tutor = [];
    const tutorHeader = $('#通过教授招式').closest('h3');
    if (tutorHeader.length > 0) {
        const table = tutorHeader.nextAll('table').first();
        if (table.length > 0) {
            table.find('tr.bgwhite').each((i, row) => {
                const tds = $(row).children();
                if (tds.length < 3) return;

                const id = $(tds[0]).text().trim();
                
                const spriteSpan = $(tds[1]).find('span.sprite-icon');
                let sprite_class = '';
                if (spriteSpan.length > 0) {
                    const classes = spriteSpan.attr('class').split(/\s+/);
                    sprite_class = classes.find(c => c.startsWith('sprite-icon-') && c !== 'sprite-icon' && c !== 'sprite-icon-shiny') || '';
                }

                const nameCell = $(tds[2]);
                let name = nameCell.find('b > a').text().trim();
                if (!name) name = nameCell.find('a').first().text().trim();
                
                const formSmall = nameCell.find('small');
                if (formSmall.length > 0) {
                    const formText = formSmall.text().trim();
                    if (formText) {
                        name += `（${formText}）`;
                    }
                }

                const types = [];
                const extractType = (cell) => {
                    return $(cell).find('a[title$="（属性）"]').text().trim();
                };

                const type1 = extractType(tds[3]);
                if (type1) types.push(type1);

                const colspan = $(tds[3]).attr('colspan');
                if (!colspan || parseInt(colspan) === 1) {
                    const type2 = extractType(tds[4]);
                    if (type2) types.push(type2);
                }

                if (id && name) {
                    learn_by_tutor.push({
                        id,
                        name,
                        types,
                        sprite_class
                    });
                }
            });
        }
    }

    const result = {
        name_zh,
        name_ja,
        name_en,
        type,
        category,
        pp,
        power,
        accuracy,
        range,
        description,
        intro,
        effect,
        additional_effect,
        game_descriptions,
        details,
        move_changes,
        learn_by_level_up,
        learn_by_tm,
        learn_by_breeding,
        learn_by_tutor
    };

    console.log("Extracted Data:", JSON.stringify(result, null, 2));

    const savePath = path.join(DATA_DIR, `${name_zh}.json`);
    fs.writeFileSync(savePath, JSON.stringify(result, null, 2), 'utf8');
    console.log(`Saved to ${savePath}`);
}

// CLI usage
if (require.main === module) {
    const arg = process.argv[2];
    if (arg) {
        scrapeMoveDetail(arg);
    } else {
        console.log("Usage: node move_info_crawler.js <MoveName|FilePath>");
    }
}

module.exports = { scrapeMoveDetail };