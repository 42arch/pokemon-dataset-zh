const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { EVOLUTION_CHAINS } = require('./fix_data.js');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';

async function scrapePokemonDetail(inputNameOrUrl) {
    let htmlContent;
    let url;
    let name;

    // Determine if input is a local file or a name/URL
    if (fs.existsSync(inputNameOrUrl)) {
        console.log(`Reading from local file: ${inputNameOrUrl}`);
        htmlContent = fs.readFileSync(inputNameOrUrl, 'utf8');
        name = path.basename(inputNameOrUrl, '.html'); // Fallback name
    } else {
        // Assume it's a Pokemon name to fetch from wiki
        name = inputNameOrUrl;
        url = `https://wiki.52poke.com/wiki/${encodeURIComponent(name)}?variant=zh-hans`;
        console.log(`Fetching data for ${name} from ${url}...`);
        
        try {
            // Using curl for reliability as per previous experience
             htmlContent = execSync(`curl -L -A "${USER_AGENT}" "${url}"`, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
        } catch (e) {
            console.error("Failed to download page:", e.message);
            return;
        }
    }

    const $ = cheerio.load(htmlContent);

    // 1. Basic Info & Names
    // Names are usually in the first row of the infobox
    // Structure: <b>Zh Name</b><br><b><span lang="ja">Ja Name</span></b> <b>En Name</b>
    
    // We look for the "infobox" which is often a table with class 'roundy' and 'a-r' near the start.
    // Or we can verify the structure we saw: table.roundy.a-r.at-c
    
    // A more robust way might be to look for the ID #0003 and traverse up.
    // But let's try to find the specific cell containing the names.
    // It contains <span lang="ja">
    
    let nameZh = '', nameJa = '', nameEn = '', pokedexId = '';
    
    // Find the cell with the Japanese name
    const jaSpan = $('span[lang="ja"]').first();
    if (jaSpan.length > 0) {
        nameJa = jaSpan.text().trim();
        const parentTd = jaSpan.closest('td');
        
        // Zh name is usually the first <b> text in this td
        nameZh = parentTd.find('b').first().text().trim();
        
        // En name is usually the last <b> text
        nameEn = parentTd.find('b').last().text().trim();
        
        // ID is in the sibling/next cell or nearby
        // In the HTML: 
        // <td>Names...</td> <td>Image...</td> <th>#0003</th>
        // So it's in a th sibling of the td's parent tr's parent table's parent... wait.
        
        // Let's re-examine the structure.
        // Names are in a nested table.
        // <table class="roundy bg-Type fulltable"> ... <td>Names</td> <td>Img</td> <th>ID</th>
        
        const infoTable = parentTd.closest('table');
        const idHeader = infoTable.find('th').filter((i, el) => $(el).text().includes('#'));
        if (idHeader.length > 0) {
            pokedexId = idHeader.text().trim().replace('#', '');
        }
    } else {
        // Fallback or verify if page is valid
        console.error("Could not find Japanese name span. Structure might differ.");
    }
    
    // 2. Description & Profile
    // First <p> after .mw-parser-output that is not empty
    let description = '';
    $('.mw-parser-output > p').each((i, el) => {
        const text = $(el).text().trim();
        if (text && !description) {
            description = text;
        }
    });

    // Profile from "概述" or "基本介绍"
    let profile = '';
    const profileHeader = $('#概述, #基本介绍').closest('h2');
    if (profileHeader.length > 0) {
        let next = profileHeader.next();
        while (next.length > 0 && !['h2', 'h3'].includes(next[0].name)) {
            if (next[0].name === 'p') {
                const pText = next.text().trim();
                if (pText) {
                    profile += pText + '\n';
                }
            }
            next = next.next();
        }
    }
    profile = profile.trim();
    // Clean up profile text: remove references like [1], [2] and asterisks
    profile = profile.replace(/\[\d+\]/g, '').replace(/\*/g, '');

    // 3. Forms
    // Find togglers to identify form names
    // Selector: elements with class starting with _toggler_show-form
    
    const forms = [];
    const formMap = new Map(); // formClass -> formName
    
    // Heuristic: Find elements that control visibility
    // The specific classes are like `_toggler_show-form2`
    
    // Let's find all headers that act as tabs.
    // They usually have `_toggler_show-formX` classes.
    
    const togglerHeaders = $('[class*="_toggler_show-form"]');
    
    if (togglerHeaders.length > 0) {
        togglerHeaders.each((i, el) => {
            const className = $(el).attr('class');
            // Extract form ID (e.g., form1, form2) from class
            const matches = className.match(/_toggler_show-(form\d+)/);
            if (matches) {
                const formId = matches[1];
                const formName = $(el).text().trim();
                // Avoid duplicates (multiple buttons might show same form)
                if (!formMap.has(formId) && formName) {
                    formMap.set(formId, formName);
                }
            }
        });
    }
    
    // If no togglers found, assume default form
    if (formMap.size === 0) {
        formMap.set('form1', '一般'); // Default name
    }

    // Iterate over identified forms and extract data
    // Data is in rows with class `_toggle formX` (or just `formX` combined with `_toggle`)
    
    // If we only found "form1" by default, we look for `_toggle` combined with `form1` 
    // OR if the page doesn't use toggles, we just look for the tables directly.
    // However, 52poke usually wraps the main info in these toggles even for single forms? 
    // Let's check. Venusaur has `tr class="_toggle form1"`.
    
    // Sort forms by ID to maintain order
    const sortedFormIds = Array.from(formMap.keys()).sort();
    
    for (const formId of sortedFormIds) {
        const formName = formMap.get(formId);
        const container = $(`.${formId}._toggle`); // Select elements with both classes
        
        if (container.length === 0) continue;
        
        // Helper to extract value based on Label
        const extractField = (label) => {
            // Find a bold tag with the label
            // The structure is usually: <td><b><a...>Label</a></b> ... <table>...<td>Value</td>...</table></td>
            // So we look for <b> containing label inside the container
            
            // We search inside `container`. 
            // Note: `container` might be multiple `tr` elements.
            
            let value = null;
            
            container.find('b').each((i, el) => {
                if ($(el).text().includes(label)) {
                    // Found the label. Look for the value table nearby.
                    // usually sibling table
                    const parentTd = $(el).closest('td');
                    const valueTd = parentTd.find('table td').not('.hide').first();
                    
                    if (label === '特性') {
                        // Abilities can be multiple
                        const abilities = [];
                        parentTd.find('table td').each((j, td) => {
                           const cellText = $(td).text().trim();
                           const isHidden = cellText.includes('隱藏特性') || cellText.includes('隐藏特性');
                           
                           $(td).find('a').each((k, link) => {
                               const abName = $(link).text().trim();
                               if (abName) {
                                   abilities.push({
                                       name: abName,
                                       is_hidden: isHidden
                                   });
                               }
                           });
                        });
                        value = abilities;
                    } else if (label === '属性') {
                         // Types
                         const types = [];
                         parentTd.find('.type-box-9-text').each((j, sp) => {
                             types.push($(sp).text().trim());
                         });
                         value = types;
                    } else if (label === '蛋群' || label === '培育') {
                        // Egg groups are often under "培育" (Breeding) in the first cell
                        const text = valueTd.text().trim();
                        // Split by " 与 ", "、", or just space
                        value = text.split(/ 与 |、|\s+/).map(s => s.trim()).filter(s => s && s !== '与');
                    } else {
                        // Standard single value
                         value = valueTd.text().trim();
                    }
                }
            });
            return value;
        };

        const types = extractField('属性');
        const category = extractField('分类');
        const abilities = extractField('特性');
        const height = extractField('身高');
        const weight = extractField('体重');
        // Color often labelled "图鉴颜色"
        const color = extractField('图鉴颜色'); 
        const catchRate = extractField('捕获率');
        // Egg groups might be under '培育' or '蛋群'
        const eggGroups = extractField('蛋群') || extractField('培育');
        
        const experience100 = extractField('100级时经验值');
        
        // Gender Ratio Parsing
        let genderRatioRaw = extractField('性别比例');
        // If extractField returned empty string or didn't find keywords, try harder
        if (!genderRatioRaw || (!genderRatioRaw.includes('雄性') && !genderRatioRaw.includes('雌性') && !genderRatioRaw.includes('无性别') && !genderRatioRaw.includes('未知'))) {
             container.find('b').each((i, el) => {
                 if ($(el).text().includes('性别比例')) {
                     genderRatioRaw = $(el).closest('td').text().trim();
                 }
             });
        }

        // Debug log
        if (genderRatioRaw) console.log(`[Debug] Raw Gender Ratio: ${genderRatioRaw.replace(/\s+/g, ' ')}`);

        let genderRatio = { male: 0, female: 0 };
        if (genderRatioRaw) {
            const maleMatch = genderRatioRaw.match(/雄性\s*([\d.]+)%/);
            const femaleMatch = genderRatioRaw.match(/雌性\s*([\d.]+)%/);
            
            if (maleMatch || femaleMatch) {
                if (maleMatch) genderRatio.male = parseFloat(maleMatch[1]);
                if (femaleMatch) genderRatio.female = parseFloat(femaleMatch[1]);
            } else if (genderRatioRaw.includes('无性别') || genderRatioRaw.includes('未知')) {
                genderRatio = { male: 0, female: 0 };
            }
        }

        // Egg Cycles Parsing
        // Sometimes it's labeled "孵化周期" in a link title
        let eggCycles = extractField('孵化周期');
        if (!eggCycles) {
             // Try finding by title attribute in the container
             container.find('[title="孵化周期"]').each((i, el) => {
                 const parentTd = $(el).closest('td');
                 // The value is usually in the next cell or the same cell's sibling
                 // Structure: <td><b><a title="孵化周期">孵化周期</a></b>...</td> <td>20...</td>
                 
                 // If extractField failed, it means it didn't find the bold label text match.
                 // Let's try to find the cell with the label, then get the value.
                 
                 // Check if this element is inside a header-like structure
                 const headerCell = $(el).closest('td');
                 // Value cell is usually next to it in a nested table or sibling
                 
                 // Case 1: Sibling TD
                 let valueCell = headerCell.next('td');
                 if (valueCell.length === 0) {
                     // Case 2: Nested table structure like standard fields
                     // <td><b>Label</b> <table><tr><td>Value</td></tr></table> </td>
                     const valueTable = headerCell.find('table td').not('.hide').first();
                     if (valueTable.length > 0) {
                         eggCycles = valueTable.text().trim();
                     } else {
                         // Case 3: Same cell (e.g. "20 孵化周期")
                         eggCycles = headerCell.text().trim();
                     }
                 } else {
                     eggCycles = valueCell.text().trim();
                 }
             });
        }
        // Clean eggCycles text (e.g., "20 (5140步)") -> keep full string or parse?
        // User asked to "extract", usually full string is fine, but cleaning newlines is good.
        if (eggCycles) eggCycles = eggCycles.replace(/\s+/g, ' ').trim();

        // Helper to extract image filenames (e.g. Shape, Footprint)
        const extractImageField = (label) => {
            let filename = null;
            container.find('b').each((i, el) => {
                if ($(el).text().includes(label) && !filename) {
                    const parentTd = $(el).closest('td');
                    const valueTd = parentTd.find('table td').not('.hide').first();
                    const img = valueTd.find('img').first();
                    if (img.length > 0) {
                        const src = img.attr('src');
                        if (src) {
                            // Try to extract filename from thumb path
                            // e.g. .../Body06.png/32px-Body06.png -> Body06.png
                            // or .../F006.png -> F006.png
                            const match = src.match(/\/([^\/]+\.(png|jpg|jpeg|gif|webp))/i);
                            if (match) {
                                filename = decodeURIComponent(match[1]);
                            }
                        }
                    }
                }
            });
            return filename;
        };

        const shape = extractImageField('体形');
        const footprint = extractImageField('脚印');

        // Only add if we found something meaningful
        if (types || height) {
            forms.push({
                name: formName,
                types,
                category,
                abilities,
                height,
                weight,
                color,
                catch_rate: catchRate,
                egg_groups: eggGroups,
                experience_100: experience100,
                gender_ratio: genderRatio,
                egg_cycles: eggCycles,
                shape: shape,
                footprint: footprint,
                image: null // Will be populated later
            });
        }
    }

    // If no togglers found, check if there's a main infobox table that can be treated as a single form
    if (forms.length === 0) {
        const mainInfobox = $('table.roundy.a-r.at-c').first();
        if (mainInfobox.length > 0) {
            const extractFromTable = (table, label) => {
                let value = null;
                table.find('b').each((i, el) => {
                    const bText = $(el).text().trim();
                                        if (bText === label || bText.includes(label)) {
                                            const parentTd = $(el).closest('td');
                                            const valueTd = parentTd.find('table td').not('.hide').first();
                                            if (label === '特性') {
                            const abilities = [];
                            parentTd.find('table td').each((j, td) => {
                                const cellText = $(td).text().trim();
                                const isHidden = cellText.includes('隱藏特性') || cellText.includes('隐藏特性');
                                
                                $(td).find('a').each((k, link) => {
                                    const abName = $(link).text().trim();
                                    if (abName) {
                                        abilities.push({
                                            name: abName,
                                            is_hidden: isHidden
                                        });
                                    }
                                });
                            });
                            value = abilities;
                        } else if (label === '属性') {
                            const types = [];
                            parentTd.find('.type-box-9-text').each((j, sp) => {
                                types.push($(sp).text().trim());
                            });
                            value = types;
                        } else if (label === '蛋群' || label === '培育') {
                            const text = valueTd.text().trim();
                            value = text.split(/ 与 |、|\s+/).map(s => s.trim()).filter(s => s && s !== '与');
                        } else {
                            value = valueTd.text().trim();
                        }
                    }
                });
                return value;
            };

            const types = extractFromTable(mainInfobox, '属性');
            const category = extractFromTable(mainInfobox, '分类');
            const abilities = extractFromTable(mainInfobox, '特性');
            const height = extractFromTable(mainInfobox, '身高');
            const weight = extractFromTable(mainInfobox, '体重');
            const color = extractFromTable(mainInfobox, '图鉴颜色');
            const catchRate = extractFromTable(mainInfobox, '捕获率');
            const eggGroups = extractFromTable(mainInfobox, '蛋群') || extractFromTable(mainInfobox, '培育');
            const experience100 = extractFromTable(mainInfobox, '100级时经验值');
            
            let genderRatioRaw = extractFromTable(mainInfobox, '性别比例');
            // Fallback for single form
            if (!genderRatioRaw || (!genderRatioRaw.includes('雄性') && !genderRatioRaw.includes('雌性') && !genderRatioRaw.includes('无性别') && !genderRatioRaw.includes('未知'))) {
                 mainInfobox.find('b').each((i, el) => {
                     if ($(el).text().includes('性别比例')) {
                         genderRatioRaw = $(el).closest('td').text().trim();
                     }
                 });
            }

            if (genderRatioRaw) console.log(`[Debug] Raw Gender Ratio (Single): ${genderRatioRaw.replace(/\s+/g, ' ')}`);

            let genderRatio = { male: 0, female: 0 };
            if (genderRatioRaw) {
                const maleMatch = genderRatioRaw.match(/雄性\s*([\d.]+)%/);
                const femaleMatch = genderRatioRaw.match(/雌性\s*([\d.]+)%/);
                
                if (maleMatch || femaleMatch) {
                    if (maleMatch) genderRatio.male = parseFloat(maleMatch[1]);
                    if (femaleMatch) genderRatio.female = parseFloat(femaleMatch[1]);
                } else if (genderRatioRaw.includes('无性别') || genderRatioRaw.includes('未知')) {
                    genderRatio = { male: 0, female: 0 };
                }
            }

            let eggCycles = extractFromTable(mainInfobox, '孵化周期');
            if (!eggCycles) {
                 mainInfobox.find('[title="孵化周期"]').each((i, el) => {
                     const headerCell = $(el).closest('td');
                     let valueCell = headerCell.next('td');
                     if (valueCell.length === 0) {
                         const valueTable = headerCell.find('table td').not('.hide').first();
                         if (valueTable.length > 0) {
                             eggCycles = valueTable.text().trim();
                         } else {
                             // Case 3: Same cell
                             eggCycles = headerCell.text().trim();
                         }
                     } else {
                         eggCycles = valueCell.text().trim();
                     }
                 });
            }
            if (eggCycles) eggCycles = eggCycles.replace(/\s+/g, ' ').trim();

            // Image extraction helper for single form
            const extractImageFromTable = (label) => {
                let filename = null;
                mainInfobox.find('b').each((i, el) => {
                    if ($(el).text().includes(label) && !filename) {
                        const parentTd = $(el).closest('td');
                        const valueTd = parentTd.find('table td').not('.hide').first();
                        const img = valueTd.find('img').first();
                        if (img.length > 0) {
                            const src = img.attr('src');
                            if (src) {
                                const match = src.match(/\/([^\/]+\.(png|jpg|jpeg|gif|webp))/i);
                                if (match) {
                                    filename = decodeURIComponent(match[1]);
                                }
                            }
                        }
                    }
                });
                return filename;
            };

            const shape = extractImageFromTable('体形');
            const footprint = extractImageFromTable('脚印');

            if (types || height) {
                forms.push({
                    name: nameZh, // Use main name for single form
                    types,
                    category,
                    abilities,
                    height,
                    weight,
                    color,
                    catch_rate: catchRate,
                    egg_groups: eggGroups,
                    experience_100: experience100,
                    gender_ratio: genderRatio,
                    egg_cycles: eggCycles,
                    shape: shape,
                    footprint: footprint,
                    image: null
                });
            }
        }
    }

    // 4. Game Pokedex Entries
    const pokedexEntries = [];
    const gameDexHeaderSpan = $('#图鉴介绍').filter((i, el) => $(el).closest('h3').length > 0);
    const gameDexHeader = gameDexHeaderSpan.closest('h3');

    if (gameDexHeader.length > 0) {
        const mainTable = gameDexHeader.next('table');
        
        mainTable.find('th.roundytop-5').each((i, genHeader) => {
            const genName = $(genHeader).text().trim();
            const parentRow = $(genHeader).closest('tr');
            const contentRow = parentRow.next('tr');
            const contentCell = contentRow.find('td');
            
            const versions = [];
            
            contentCell.find('table').each((j, versionTable) => {
                if ($(versionTable).find('th[class*="bg-"]').length === 0) return;
                
                let bufferedVersions = [];
                
                $(versionTable).find('tr').each((k, row) => {
                    const ths = $(row).find('th');
                    const textTd = $(row).find('td.at-l');
                    
                    ths.each((l, th) => {
                        const verName = $(th).text().trim();
                        const title = $(th).find('a').attr('title');
                        if (verName) {
                            bufferedVersions.push({
                                name: verName,
                                group: title || verName
                            });
                        }
                    });
                    
                    if (textTd.length > 0) {
                        let text = textTd.text().trim();
                        // Clean text: remove references and asterisks
                        text = text.replace(/\[\d+\]/g, '').replace(/\*/g, '').trim();
                        
                        // Filter out template placeholders and empty text
                        if (text && !text.startsWith('{{{') && !text.endsWith('}}}')) {
                             bufferedVersions.forEach(ver => {
                                versions.push({
                                    name: ver.name,
                                    group: ver.group,
                                    text: text
                                });
                            });
                        }
                        bufferedVersions = [];
                    }
                });
            });
            
            if (versions.length > 0) {
                pokedexEntries.push({
                    name: genName,
                    versions: versions
                });
            }
        });
    }

    // 5. Stats
    const stats = [];
    const statsHeaderSpan = $('#种族值').filter((i, el) => $(el).closest('h3').length > 0);
    const statsHeader = statsHeaderSpan.closest('h3');
    
    if (statsHeader.length > 0) {
        const tabsContainer = statsHeader.nextAll('table.at-c').first();
        const hasTabs = tabsContainer.find('.toggle-lbase').length > 0;
        
        if (hasTabs) {
            const formMap = new Map();
            tabsContainer.find('.toggle-lbase').each((i, el) => {
                const classes = $(el).attr('class');
                const match = classes.match(/toggle-l-(\d+)base/);
                if (match) {
                    const id = match[1];
                    const name = $(el).text().trim();
                    formMap.set(id, name);
                }
            });
            
            formMap.forEach((formName, id) => {
                const contentDiv = $(`.toggle-content.toggle-${id}base`);
                if (contentDiv.length > 0) {
                    const statData = extractStatsFromTable($, contentDiv.find('table'));
                    if (statData) {
                        stats.push({
                            form: formName,
                            data: statData
                        });
                    }
                }
            });
        } else {
            const statTable = statsHeader.nextAll('table.roundy').first();
            if (statTable.length > 0) {
                 const statData = extractStatsFromTable($, statTable);
                 if (statData) {
                     stats.push({
                         form: '一般',
                         data: statData
                     });
                 }
            }
        }
    }

    // Prepare image directory for evolution chain (centralized 'dream' folder)
    const dirPath = path.join(__dirname, '../data/images/dream');
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }

    // 6. Evolution Chain
    let evolutionChains = [];
    if (EVOLUTION_CHAINS[nameZh]) {
        console.log(`Using fixed evolution data for ${nameZh}`);
        evolutionChains = EVOLUTION_CHAINS[nameZh];
    } else {
        evolutionChains = extractEvolutionChain($, dirPath);
    }

    // 7. Form Images
    const formImages = extractFormImages($, pokedexId, nameZh);
    
    // Merge images into forms
    forms.forEach(form => {
        const imgData = formImages.find(img => img.form === form.name);
        if (imgData) {
            form.image = imgData.image;
        } else {
            form.image = null;
        }
    });

    // 8. Learnable Moves
    const learnableMoves = extractLearnableMoves($);

    // 9. Machine Moves
    const machineMoves = extractMachineMoves($);

    // 10. Egg Moves
    const eggMoves = extractEggMoves($);

    // 11. Names
    const names = extractNames($);

    // 12. Home Images
    const homeImages = extractHomeImages($, pokedexId, nameZh);

    // 13. Prototype
    const prototype = extractPrototype($);

    // 14. Details
    const detail = extractDetails($);

    // 15. Type Effectiveness
    const type_effectiveness = extractTypeEffectiveness($);

    const { mega_evolution, gigantamax_evolution } = extractSpecialForms($, nameZh);

    const result = {
        name_zh: nameZh,
        name_ja: nameJa,
        name_en: nameEn,
        pokedex_id: pokedexId,
        description,
        profile,
        prototype,
        detail,
        names,
        forms,
        stats,
        type_effectiveness,
        pokedex_entries: pokedexEntries,
        evolution_chains: evolutionChains,
        mega_evolution: mega_evolution,
        gigantamax_evolution: gigantamax_evolution,
        learnable_moves: learnableMoves,
        machine_moves: machineMoves,
        egg_moves: eggMoves,
        home_images: homeImages
    };

    // Save to file
    if (nameZh && pokedexId) {
        const filename = `${pokedexId}-${nameZh}.json`;
        const savePath = path.join(__dirname, '../data/pokemon', filename);
        // Ensure directory exists
        if (!fs.existsSync(path.dirname(savePath))) {
            fs.mkdirSync(path.dirname(savePath), { recursive: true });
        }
        fs.writeFileSync(savePath, JSON.stringify(result, null, 2), 'utf8');
        console.log(`Saved to ${savePath}`);
        return result; // Return the object for caller use
    } else {
        console.error("Failed to extract essential data (Name/ID).");
        return null;
    }
}

function extractEggMoves($) {
    let eggHeader = null;
    $('h3, h4, h5').each((i, el) => {
        const text = $(el).text().trim();
        if (text === '蛋招式') {
            eggHeader = $(el);
            return false;
        }
    });
    
    if (!eggHeader) return [];
    
    const moveTable = eggHeader.nextAll('table.roundy').first();
    if (moveTable.length === 0) return [];
    
    const moves = [];
    
    moveTable.find('tr').each((i, row) => {
        const tds = $(row).find('td');
        if (tds.length === 0) return;
        
        // Col 0: Parents
        // Parents are usually links with title OR elements with data-msp
        const parents = [];
        const seenParents = new Set();

        // Helper to add parent
        const addParent = (id, name) => {
            const key = `${id}|${name}`;
            if (!seenParents.has(key)) {
                parents.push({ id, name });
                seenParents.add(key);
            }
        };

        // Check data-msp attributes on spans (often used for icons)
        // Format seems to be "ID\Name,ID\Name"
        $(tds[0]).find('[data-msp]').each((j, el) => {
            const msp = $(el).attr('data-msp');
            if (msp) {
                // Split by comma first to get individual entries
                const entries = msp.split(',');
                entries.forEach(entry => {
                    const parts = entry.split('\\');
                    if (parts.length >= 2) {
                        addParent(parts[0], parts[1]);
                    } else {
                        // Fallback if no ID or different format
                        addParent(null, entry);
                    }
                });
            }
        });

        // Try links if data-msp didn't cover it (or as fallback)
        $(tds[0]).find('a').each((j, link) => {
            const title = $(link).attr('title');
            if (title) {
                // Check if we already have this name
                let exists = false;
                for (const p of parents) {
                    if (p.name === title) {
                        exists = true;
                        break;
                    }
                }
                if (!exists) {
                    addParent(null, title);
                }
            }
        });
        
        let moveName = $(tds[1]).text().trim();
        moveName = moveName.replace('[详]', '').trim();
        
        if (moveName) {
            moves.push({
                parents: parents,
                name: moveName,
                type: $(tds[2]).text().trim(),
                category: $(tds[3]).text().trim(),
                power: $(tds[4]).text().trim(),
                accuracy: $(tds[5]).text().trim(),
                pp: $(tds[6]).text().trim()
            });
        }
    });
    
    return moves;
}

function extractMachineMoves($) {
    let tmHeader = null;
    $('h3, h4, h5').each((i, el) => {
        const text = $(el).text().trim();
        if (text.includes('能使用的招式学习器')) {
            tmHeader = $(el);
            return false;
        }
    });
    
    if (!tmHeader) return [];
    
    const moveTable = tmHeader.nextAll('table.roundy').first();
    if (moveTable.length === 0) return [];
    
    const moves = [];
    
    moveTable.find('tr').each((i, row) => {
        const tds = $(row).find('td');
        if (tds.length === 0) return;
        
        let machine = $(tds[1]).text().trim();
        let moveName = $(tds[2]).text().trim();
        moveName = moveName.replace('[详]', '').trim();
        
        if (moveName) {
            moves.push({
                machine: machine,
                name: moveName,
                type: $(tds[3]).text().trim(),
                category: $(tds[4]).text().trim(),
                power: $(tds[5]).text().trim(),
                accuracy: $(tds[6]).text().trim(),
                pp: $(tds[7]).text().trim()
            });
        }
    });
    
    return moves;
}

function extractLearnableMoves($) {
    let levelUpHeader = null;
    $('h3, h4, h5').each((i, el) => {
        const text = $(el).text().trim();
        if (text.includes('能通过升级学会的招式') || text === '可学会的招式') {
            levelUpHeader = $(el);
            return false;
        }
    });
    
    if (!levelUpHeader) return [];
    
    const moveTable = levelUpHeader.nextAll('table.roundy').first();
    if (moveTable.length === 0) return [];
    
    const moves = [];
    
    moveTable.find('tr').each((i, row) => {
        const tds = $(row).find('td');
        if (tds.length === 0) return;
        
        const level = $(tds[0]).text().trim();
        let moveName = $(tds[2]).text().trim();
        moveName = moveName.replace('[详]', '').trim();
        
        if (moveName) {
            moves.push({
                level: level,
                name: moveName,
                type: $(tds[3]).text().trim(),
                category: $(tds[4]).text().trim(),
                power: $(tds[5]).text().trim(),
                accuracy: $(tds[6]).text().trim(),
                pp: $(tds[7]).text().trim()
            });
        }
    });
    
    return moves;
}

function extractFormImages($, pokedexId, name) {
    const formMap = new Map();
    const togglerHeaders = $('[class*="_toggler_show-form"]');
    
    if (togglerHeaders.length > 0) {
        togglerHeaders.each((i, el) => {
            const className = $(el).attr('class');
            const matches = className.match(/_toggler_show-(form\d+)/);
            if (matches) {
                const formId = matches[1];
                const formName = $(el).text().trim();
                if (!formMap.has(formId) && formName) {
                    formMap.set(formId, formName);
                }
            }
        });
    }
    
    if (formMap.size === 0) {
        // Use the pokemon name as the default form name to match the forms extraction logic
        formMap.set('form1', name || '一般');
    }
    
    const formsWithImages = [];
    const sortedFormIds = Array.from(formMap.keys()).sort();
    
    for (const formId of sortedFormIds) {
        const formName = formMap.get(formId);
        let imageFileName = null;
        let imageUrl = null;
        
        let container = $(`.${formId}`);
        
        if (formMap.size === 1 && container.length === 0) {
             container = $('table.roundy.a-r.at-c').first();
        }
        
        let targetImg = null;
        
        container.find('img').each((i, el) => {
            const width = parseInt($(el).attr('width'));
            const alt = $(el).attr('alt') || '';
            const src = $(el).attr('src') || '';
            
            if (alt.includes('TCG') || src.includes('TCG') || (width && width < 150)) return;
            
            if (!targetImg) targetImg = $(el);
        });
        
        if (!targetImg && formMap.size > 1) {
             const toggleRow = $(`.${formId}._toggle`);
             toggleRow.find('img').each((i, el) => {
                const width = parseInt($(el).attr('width'));
                const alt = $(el).attr('alt') || '';
                const src = $(el).attr('src') || '';
                if (alt.includes('TCG') || src.includes('TCG') || (width && width < 150)) return;
                if (!targetImg) targetImg = $(el);
             });
        }
        
        if (!targetImg && formMap.size === 1) {
             const mainImgTable = $('table.roundy.bgwhite.fulltable').first();
             mainImgTable.find('img').each((i, el) => {
                const width = parseInt($(el).attr('width'));
                if (width && width >= 200) {
                    targetImg = $(el);
                    return false; 
                }
             });
        }

        if (targetImg) {
            let src = targetImg.attr('src');
            if (src && src.startsWith('//')) src = 'https:' + src;

            if (src) {
                const parts = src.split('/');
                const thumbIndex = parts.indexOf('thumb');
                if (thumbIndex !== -1 && parts.length > thumbIndex + 3) {
                    const hash1 = parts[thumbIndex + 1];
                    const hash2 = parts[thumbIndex + 2];
                    const filename = parts[thumbIndex + 3];
                    
                    imageFileName = filename;
                    imageUrl = `https://media.52poke.com/wiki/thumb/${hash1}/${hash2}/${filename}/300px-${filename}`;
                } else {
                    imageFileName = src.split('/').pop();
                    imageUrl = src;
                }
            }
        }
        
        formsWithImages.push({
            form: formName,
            image: imageFileName,
            imageUrl: imageUrl
        });
    }
    
    // Download logic
    if (pokedexId && name) {
        // Save to centralized 'official' folder
        const dirPath = path.join(__dirname, '../data/images/official');
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
        
        formsWithImages.forEach(item => {
            if (item.imageUrl && item.image) {
                // Construct new filename: id-name-form.ext
                const ext = path.extname(item.image);
                const safeName = name.replace(/[\\/:*?"<>|]/g, '');
                const safeForm = item.form.replace(/[\\/:*?"<>|]/g, '');
                
                let newFileName;
                // If form name matches pokemon name, or is generic '一般'/'普通', omit it
                if (safeForm === safeName || safeForm === '一般' || safeForm === '普通') {
                    newFileName = `${pokedexId}-${safeName}${ext}`;
                } else {
                    newFileName = `${pokedexId}-${safeName}-${safeForm}${ext}`;
                }

                const filePath = path.join(dirPath, newFileName);
                
                // Update the image property to the new filename
                item.image = newFileName;

                if (!fs.existsSync(filePath)) {
                    console.log(`Downloading ${newFileName} to ${filePath}...`);
                    try {
                        execSync(`curl -L -A "${USER_AGENT}" "${item.imageUrl}" -o "${filePath}"`, { stdio: 'inherit' });
                    } catch (e) {
                        console.error(`Failed to download ${item.imageUrl}:`, e.message);
                    }
                } else {
                    console.log(`Skipping ${newFileName}, already exists.`);
                }
            }
        });
    }
    
    return formsWithImages;
}

function extractEvolutionChain($) {
    const evoHeaderSpan = $('#进化').filter((i, el) => $(el).closest('h3').length > 0);
    const evoHeader = evoHeaderSpan.closest('h3');
    
    if (evoHeader.length === 0) return [];
    
    const evoTable = evoHeader.nextAll('table').first();
    if (evoTable.length === 0) return [];
    
    const grid = [];
    evoTable.find('> tbody > tr').each((r, tr) => {
        const rowData = [];
        $(tr).children('td').each((c, td) => {
            const cell = $(td);
            const rowspan = parseInt(cell.attr('rowspan')) || 1;
            const colspan = parseInt(cell.attr('colspan')) || 1;
            
            if (!grid[r]) grid[r] = [];
            let colIndex = 0;
            while (grid[r][colIndex]) colIndex++;
            
            for (let i = 0; i < rowspan; i++) {
                for (let j = 0; j < colspan; j++) {
                    if (!grid[r + i]) grid[r + i] = [];
                    grid[r + i][colIndex + j] = {
                        el: cell,
                        isOrigin: (i === 0 && j === 0)
                    };
                }
            }
        });
    });
    
    const nodes = [];
    
    for (let r = 0; r < grid.length; r++) {
        if (!grid[r]) continue;
        for (let c = 0; c < grid[r].length; c++) {
            const cell = grid[r][c];
            if (!cell || !cell.isOrigin) continue;
            
            const el = cell.el;
            const pokemonData = extractPokemonData(el);
            
            if (pokemonData) {
                const node = {
                    ...pokemonData,
                    r,
                    c,
                    text: null,
                    from: null,
                    back_text: ""
                };
                nodes.push(node);
            } else {
                let condText = el.text().trim();
                condText = condText.replace(/→/g, '').trim();
                cell.condition = condText;
            }
        }
    }
    
    nodes.forEach(node => {
        const cell = grid[node.r][node.c];
        cell.node = node;
    });
    
    nodes.forEach(node => {
        if (node.c > 1) {
            const condCell = grid[node.r][node.c - 1];
            const sourceCell = grid[node.r][node.c - 2];
            
            if (condCell && sourceCell && sourceCell.node) {
                node.from = sourceCell.node.name;
                if (condCell.condition) {
                    node.text = condCell.condition;
                }
            }
        }
    });
    
    const finalNodes = nodes.map(n => ({
        name: n.name,
        stage: n.stage,
        text: n.text,
        image: n.image,
        back_text: n.back_text,
        from: n.from,
        form_name: null 
    }));
    
    // Download evolution images
    // Note: We need pokedexId and nameZh here, but they are not passed to this function.
    // However, we can extract them from the global scope or context if available, 
    // OR we can pass them as arguments.
    // Since 'extractEvolutionChain' is called from 'scrapePokemonDetail', let's pass them.
    
    // Refactoring call site first? 
    // Actually, let's just return the nodes with imageUrls and handle downloading in the main function or pass args.
    // To minimize changes, I'll pass the directory path to this function or handle download here if I can get the path.
    
    // Let's modify the function signature to accept dirPath.
    return [finalNodes];
}

function extractEvolutionChain($, downloadDir) {
    const evoHeaderSpan = $('#进化, #進化');
    if (evoHeaderSpan.length === 0) return [];
    
    const evoHeader = evoHeaderSpan.closest('h3'); // h3 usually
    
    // Find the correct table
    let evolutionTable = evoHeader.nextAll('table').first();
    // If it's the fulltable container (sometimes used for layout), go inside or next
    if (evolutionTable.hasClass('fulltable') || evolutionTable.find('table').length > 0) {
        // If it contains nested tables, we might be looking at the container.
        // But usually the structure is: Header -> Table(class="roundy")
        // Check if this table has the evolution rows directly
        if (evolutionTable.find('tr').first().find('td').length === 0) {
             // Maybe it's a wrapper.
             // Python logic: form_table = tag_h1.find_next('table'); if 'fulltable' in class: form_table = form_table.find_next('table')
             evolutionTable = evolutionTable.nextAll('table').first();
        }
    }
    
    if (evolutionTable.length === 0) return [];

    // Check if multiple forms
    const hasMultipleForms = (table) => {
        let count = 0;
        table.find('small').each((i, el) => {
            const text = $(el).text().trim();
            if (text === '未进化' || text === '幼年') count++;
        });
        return count > 1;
    };

    const rows = evolutionTable.find('> tbody > tr').not('.hide');
    const trList = [];
    rows.each((i, el) => trList.push($(el)));

    let formTrLists = [];
    if (hasMultipleForms(evolutionTable)) {
        const middle = Math.floor(trList.length / 2);
        let rightStart = middle;
        if (trList.length % 2 !== 0) {
            rightStart = middle + 1;
        }
        formTrLists.push(trList.slice(0, middle));
        formTrLists.push(trList.slice(rightStart));
    } else {
        formTrLists.push(trList);
    }

    const chains = [];

    for (const currentTrList of formTrLists) {
        const allTdList = [];
        
        // Flatten TDs
        for (const $tr of currentTrList) {
            $tr.children('td').each((i, td) => {
                const $td = $(td);
                if ($td.hasClass('hide')) return;
                const text = $td.text().trim();
                if (text === '进化时，如果……' || text === '進化時，如果……') return;
                allTdList.push($td);
            });
        }

        const nodes = [];
        
        for (let index = 0; index < allTdList.length; index++) {
            const $td = allTdList[index];
            const node = {
                name: null, stage: null, text: null, image: null, back_text: null, from: null, form_name: null, imageUrl: null
            };

            if (index === 0) {
                // First Pokemon
                const res = extractPokemonData($, $td);
                if (res) {
                    Object.assign(node, res);
                    nodes.push(node);
                }
            } else {
                if (index % 2 === 0) {
                    // Pokemon Node
                    // index-1: Condition
                    // index-2: Previous Pokemon
                    
                    if (index - 2 < 0) continue; // Should not happen if structure matches

                    const $conTd = allTdList[index - 1];
                    const $fromTd = allTdList[index - 2];
                    
                    const condition = getCondition($conTd);
                    const res = extractPokemonData($, $td);
                    const fromRes = extractPokemonData($, $fromTd);
                    
                    if (res) {
                        Object.assign(node, res);
                        node.text = condition.text;
                        node.back_text = condition.back_text;

                        if (fromRes) {
                            if (fromRes.stage !== res.stage) {
                                node.from = fromRes.name;
                            }
                            // Branching logic: Same stage means sibling
                            if (fromRes.stage === res.stage && node.stage !== '未进化' && node.stage !== '幼年') {
                                // Inherit parent from previous node
                                // Find the last added node (which should be the sibling)
                                if (nodes.length > 0) {
                                    node.from = nodes[nodes.length - 1].from;
                                }
                            }
                        }
                        
                        nodes.push(node);
                    }
                }
            }
        }
        
        // Download images
        if (downloadDir) {
            for (const n of nodes) {
                if (n.image && n.imageUrl) {
                    const filePath = path.join(downloadDir, n.image);
                    if (!fs.existsSync(filePath)) {
                        console.log(`Downloading evolution image ${n.image} to ${filePath}...`);
                        try {
                            execSync(`curl -L -A "${USER_AGENT}" "${n.imageUrl}" -o "${filePath}"`, { stdio: 'inherit' });
                        } catch (e) {
                            console.error(`Failed to download ${n.imageUrl}:`, e.message);
                        }
                    }
                }
            }
        }
        
        // Add valid nodes to chain
        // Filter out temporary fields if needed, but keeping them is fine
        chains.push(nodes.map(n => ({
            name: n.name,
            stage: n.stage,
            text: n.text,
            image: n.image,
            back_text: n.back_text,
            from: n.from,
            form_name: n.form_name
        })));
    }
    
    return chains;
}

function getCondition($td) {
    const text = $td.text().trim();
    let evoText = text;
    let backText = '';
    
    if (text.includes('←')) {
        const parts = text.split('←');
        if (parts.length > 1) backText = parts[1].trim();
    }
    if (text.includes('→')) {
        evoText = text.split('→')[0].trim();
    }
    
    return { text: evoText, back_text: backText };
}

function extractPokemonData($, cell) {
    const $cell = $(cell);
    const innerTable = $cell.find('table').first();
    if (innerTable.length === 0) return null;
    
    const nameEl = innerTable.find('.textblack a').first();
    let name = nameEl.text().trim();
    if (!name) return null;
    
    // Stage extraction
    let stage = '';
    // Try finding small tag in rows above the name
    const nameRow = nameEl.closest('tr');
    const prevRows = nameRow.prevAll('tr');
    
    // prevAll returns elements in reverse order (closest first)
    prevRows.each((i, row) => {
        const small = $(row).find('small');
        if (small.length > 0) {
            stage = small.text().trim();
            return false;
        }
    });

    // Fallback: look for small tag anywhere in table
    if (!stage) {
        const anySmall = innerTable.find('small').first();
        if (anySmall.length > 0) stage = anySmall.text().trim();
    }
    
    const imgEl = innerTable.find('img').first();
    let image = '';
    let imageUrl = '';
    if (imgEl.length > 0) {
        let src = imgEl.attr('src');
        if (src && src.startsWith('//')) src = 'https:' + src;
        if (src) {
            const parts = src.split('/');
            const thumbIndex = parts.indexOf('thumb');
            if (thumbIndex !== -1 && parts.length > thumbIndex + 3) {
                const hash1 = parts[thumbIndex + 1];
                const hash2 = parts[thumbIndex + 2];
                const filename = parts[thumbIndex + 3];
                image = filename;
                imageUrl = `https://media.52poke.com/wiki/thumb/${hash1}/${hash2}/${filename}/300px-${filename}`;
            } else {
                 image = parts[parts.length - 1]; 
                 if (image.includes('px-')) {
                     image = image.replace(/^\d+px-/, '');
                 }
                 imageUrl = src;
            }
        }
    }

    // Form Name
    let form_name = null;
    const regionLink = $cell.find('a[title="地区形态"], a[title="形态变化"]');
    if (regionLink.length > 0) {
        form_name = regionLink.text().trim();
    }
    
    return {
        name,
        stage,
        image,
        imageUrl,
        form_name
    };
}

function extractStatsFromTable($, table) {
    const data = {};
    const map = {
        'HP': 'hp',
        'ＨＰ': 'hp',
        '攻击': 'attack',
        '防御': 'defense',
        '特攻': 'sp_attack',
        '特防': 'sp_defense',
        '速度': 'speed'
    };
    
    table.find('tr').each((i, row) => {
        const th = $(row).find('th').first();
        const headerText = th.text().trim();
        
        for (const [key, field] of Object.entries(map)) {
            if (headerText.includes(key)) {
                const parts = headerText.split(/：|:/);
                if (parts.length > 1) {
                    data[field] = parts[1].trim();
                }
            }
        }
    });
    
    if (Object.keys(data).length >= 6) {
        return data;
    }
    return null;
}

module.exports = { scrapePokemonDetail };

// Argument handling only if run directly
if (require.main === module) {
    const arg = process.argv[2];
    if (arg) {
        scrapePokemonDetail(arg);
    } else {
        console.log("Usage: node detail_crawler.js <PokemonName|FilePath>");
    }
}


function extractNames($) {
    let namesHeader = null;
    $('h2, h3, h4, h5').each((i, el) => {
        const text = $(el).text().trim();
        if (text === '名字') {
            namesHeader = $(el);
            return false;
        }
    });
    
    if (!namesHeader) return [];
    
    const namesTable = namesHeader.nextAll('table.roundy').first();
    if (namesTable.length === 0) return [];
    
    const names = [];
    const languageMap = {
        '日文': '日文',
        '中文': {
            '任天堂': '中文-任天堂',
            '大陆': '中文-大陆',
            '台湾': '中文-台湾',
            '香港': '中文-香港'
        },
        '英文': '英文',
        '法文': '法文',
        '德文': '德文',
        '意大利文': '意大利文',
        '西班牙文': '西班牙文',
        '韩文': '韩文'
    };
    
    let currentLang = null;
    
    namesTable.find('tr').each((i, row) => {
        const tds = $(row).find('td');
        if (tds.length === 0) return;
        
        const firstText = $(tds[0]).text().trim();
        
        if (languageMap[firstText] && typeof languageMap[firstText] === 'string') {
            currentLang = firstText;
            let nameIdx = 2;
            let originIdx = 3;
            
            if (tds.length > nameIdx) {
                const name = $(tds[nameIdx]).text().trim();
                const origin = $(tds[originIdx]).text().trim();
                names.push({
                    language: languageMap[firstText],
                    name: name,
                    origin: origin
                });
            }
        }
        else if (firstText === '中文') {
            currentLang = '中文';
            const subRegion = $(tds[1]).text().trim();
            const name = $(tds[2]).text().trim();
            const origin = $(tds[3]).text().trim();
            
            let langCode = '中文-' + subRegion;
            if (languageMap['中文'][subRegion]) {
                langCode = languageMap['中文'][subRegion];
            }
            
            names.push({
                language: langCode,
                name: name,
                origin: origin
            });
        }
        else if (currentLang === '中文' && languageMap['中文'][firstText]) {
            const subRegion = firstText;
            const name = $(tds[1]).text().trim();
            const origin = $(tds[2]).text().trim();
            
            let langCode = languageMap['中文'][subRegion];
            
            names.push({
                language: langCode,
                name: name,
                origin: origin
            });
        }
    });
    
    return names;
}

function extractHomeImages($, pokedexId, nameZh) {
    const homeImages = [];
    const appearanceHeader = $('#形象').closest('h3');
    if (appearanceHeader.length === 0) return [];

    const container = appearanceHeader.next('div');
    if (container.length === 0) return [];

    let homeTable = null;
    container.find('table').each((i, table) => {
        if ($(table).find('a[title="Pokémon HOME"]').length > 0) {
            homeTable = $(table);
            return false;
        }
    });

    if (!homeTable) return [];

    const dirPath = path.join(__dirname, '../data/images/home');
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }

    homeTable.find('tr.bgwhite').each((i, tr) => {
        $(tr).find('td').each((j, td) => {
            const $td = $(td);
            
            const isShiny = $td.find('img[src*="ShinyHOMEStar"], img[alt*="ShinyHOMEStar"]').length > 0;
            
            let formName = $td.text().trim();
            formName = formName.replace(/\?/g, '？');
            
            let extraName = '';
            $td.find('img').each((k, img) => {
                const alt = $(img).attr('alt') || '';
                if (alt.includes('糖饰')) {
                    extraName = `-${alt}`;
                }
            });

            let itemName = nameZh;
            if (formName) {
                itemName = `${nameZh}-${formName}${extraName}`;
            } else if (extraName) {
                itemName = `${nameZh}${extraName}`;
            }

            let imgUrl = null;
            $td.find('img').each((k, img) => {
                const src = $(img).attr('src') || '';
                const width = $(img).attr('width');
                
                if (src.includes('HOME') && !src.includes('Star') && !src.includes('糖饰') && (!width || parseInt(width) > 50)) {
                    imgUrl = src;
                    return false;
                }
            });

            if (imgUrl) {
                if (imgUrl.startsWith('//')) {
                    imgUrl = 'https:' + imgUrl;
                }
                
                const parts = imgUrl.split('/');
                const thumbIdx = parts.indexOf('thumb');
                if (thumbIdx !== -1 && parts.length > thumbIdx + 3) {
                     const hash1 = parts[thumbIdx + 1];
                     const hash2 = parts[thumbIdx + 2];
                     const filename = parts[thumbIdx + 3];
                     const baseUrl = parts.slice(0, thumbIdx).join('/');
                     imgUrl = `${baseUrl}/${hash1}/${hash2}/${filename}`;
                }

                let fileName = '';
                let baseNamePart = formName ? `${nameZh}-${formName}${extraName}` : `${nameZh}${extraName}`;
                
                if (isShiny) {
                    fileName = `${pokedexId}-${baseNamePart}-shiny.png`;
                } else {
                    fileName = `${pokedexId}-${baseNamePart}.png`;
                }

                const filePath = path.join(dirPath, fileName);
                 if (!fs.existsSync(filePath)) {
                    console.log(`Downloading HOME image ${fileName}...`);
                    try {
                        execSync(`curl -L -A "${USER_AGENT}" "${imgUrl}" -o "${filePath}"`, { stdio: 'inherit' });
                    } catch (e) {
                        console.error(`Failed to download ${imgUrl}:`, e.message);
                    }
                } else {
                    console.log(`Skipping ${fileName}, already exists.`);
                }

                let existingItem = homeImages.find(item => item.name === itemName);
                if (!existingItem) {
                    existingItem = { name: itemName };
                    homeImages.push(existingItem);
                }

                if (isShiny) {
                    existingItem.shiny = fileName;
                } else {
                    existingItem.image = fileName;
                }
            }
        });
    });

    return homeImages;
}

function extractPrototype($) {
    let prototype = '';
    const header = $('#原型剖析').closest('h2');
    if (header.length > 0) {
        let next = header.next();
        while (next.length > 0 && !['h2', 'h3'].includes(next[0].name)) {
            prototype += next.text().trim() + '\n';
            next = next.next();
        }
    }
    
    // Clean text: remove special characters like [1], [2], etc. and excessive whitespace
    prototype = prototype.replace(/\[\d+\]/g, '');
    // You can add more special character removal here if needed.
    // Let's also trim each line and remove empty lines.
    return prototype.split('\n').map(line => line.trim()).filter(line => line).join('\n');
}

function extractDetails($) {
    let detail = '';
    const header = $('#细节').closest('h2');
    if (header.length > 0) {
        let next = header.next();
        while (next.length > 0 && !['h2', 'h3'].includes(next[0].name)) {
            // Skip figures/images
            if (next[0].name !== 'figure' && !next.find('img').length || next[0].name === 'ul' || next[0].name === 'p') {
                detail += next.text().trim() + '\n';
            }
            next = next.next();
        }
    }
    
    // Clean text: remove [1], [2], etc.
    detail = detail.replace(/\[\d+\]/g, '');
    return detail.split('\n').map(line => line.trim()).filter(line => line).join('\n');
}

function extractTypeEffectiveness($) {
    let table = null;
    
    // Try finding tab "一般" first (for multi-form Pokemon)
    const tab = $('.tabbertab[title="一般"]').first();
    if (tab.length > 0) {
        table = tab.find('table').first();
    }
    
    // If no tab found, or no table in tab, look for table after "属性相性" header
    if (!table || table.length === 0) {
        const header = $('#属性相性').closest('h3');
        if (header.length > 0) {
            table = header.nextAll('table').first();
        }
    }

    if (!table || table.length === 0) return [];

    const headers = [];
    // Header row is the first row
    const headerRow = table.find('tr').first();
    headerRow.find('td').each((i, td) => {
        // Skip "进攻招式属性" cell (colspan=3)
        const text = $(td).text().trim();
        if (text !== '进攻招式属性') {
            headers.push(text);
        }
    });

    // If headers were not found in tds (sometimes they are th?), let's look for specific type classes or just iterate children
    if (headers.length === 0) {
        headerRow.children().each((i, el) => {
             const text = $(el).text().trim();
             if (text !== '进攻招式属性') {
                 headers.push(text);
             }
        });
    }

    // Now find the target row (Default form)
    // We look for a row where the "variation" cell is empty
    let targetRow = null;
    
    table.find('tr').each((i, tr) => {
        if (i === 0) return; // Skip header
        
        const $tr = $(tr);
        const variationCell = $tr.find('td.bd-变化');
        
        // If there is no variation cell (maybe single form table?), or it's empty
        if (variationCell.length > 0) {
            const text = variationCell.text().trim();
            if (!text) {
                targetRow = $tr;
                return false; // Found it
            }
        } else {
            // No variation cell found? 
            // In Corviknight html, the variation cell EXISTS but is empty. 
            // If it didn't exist, we might be in a different table structure.
        }
    });

    // Fallback: If no empty variation cell found, maybe it's a single form pokemon where parsing failed
    // or simply the first data row is what we want.
    if (!targetRow) {
        table.find('tr').each((i, tr) => {
            if (i === 0) return;
            const $tr = $(tr);
            
            // Check if it looks like a data row.
            // It should have damage values.
            // Corviknight: 2 type cells + 1 var cell + 18 damage cells = 21 cells.
            
            if ($tr.find('td').length >= headers.length) {
                targetRow = $tr;
                return false;
            }
        });
    }

    if (!targetRow) return [];

    const result = [];
    
    // Extract data cells.
    const cells = targetRow.find('td');
    
    // Calculate start index.
    // The cells array includes Type cells (1 or 2), Variation cell (1), and Damage cells (18).
    // The headers array has 18 types.
    // So we want the last 18 cells.
    
    const startIdx = cells.length - headers.length;
    
    if (startIdx < 0) return []; // Something is wrong

    for (let i = 0; i < headers.length; i++) {
        const cell = cells.eq(startIdx + i);
        let damageText = cell.text().trim();
        
        // Parse damage
        if (damageText.includes('1⁄2') || damageText.includes('1/2')) {
            damageText = '0.5';
        } else if (damageText.includes('1⁄4') || damageText.includes('1/4')) {
            damageText = '0.25';
        } else if (damageText.includes('1⁄8') || damageText.includes('1/8')) {
            damageText = '0.125';
        }
        
        result.push({
            type: headers[i],
            damage: damageText
        });
    }

    return result;
}


function extractSpecialForms($, nameZh) {
    const mega_evolution = [];
    const gigantamax_evolution = [];
    const dreamDir = path.join(__dirname, '../data/images/dream');
    
    if (!fs.existsSync(dreamDir)) {
        fs.mkdirSync(dreamDir, { recursive: true });
    }

    const processTable = (table, keywords, targetArray) => {
        // Iterate over cells in the main table
        table.find('td').each((i, td) => {
            const $td = $(td);
            
            // Check for nested table (common in 52poke for layout)
            const nestedTable = $td.find('table');
            
            if (nestedTable.length > 0) {
                // Process nested table
                nestedTable.each((j, nt) => {
                    const $nt = $(nt);
                    let imageFound = null;
                    let nameFound = null;

                    // Find row with large image
                    $nt.find('tr').each((k, tr) => {
                        const $tr = $(tr);
                        const img = $tr.find('img').first();
                        const width = parseInt(img.attr('width'));
                        
                        if (img.length > 0 && width && width >= 60) {
                            // This is likely the pokemon image
                            const src = img.attr('src');
                            if (src) {
                                // Extract high-res URL
                                let imageUrl = null;
                                let imageFileName = null;
                                const parts = src.split('/');
                                const thumbIndex = parts.indexOf('thumb');
                                if (thumbIndex !== -1 && parts.length > thumbIndex + 3) {
                                    const hash1 = parts[thumbIndex + 1];
                                    const hash2 = parts[thumbIndex + 2];
                                    const filename = decodeURIComponent(parts[thumbIndex + 3]);
                                    imageUrl = `https://media.52poke.com/wiki/thumb/${hash1}/${hash2}/${filename}/300px-${filename}`;
                                    imageFileName = filename;
                                } else {
                                    imageUrl = src;
                                    if (imageUrl.startsWith('//')) imageUrl = 'https:' + imageUrl;
                                    imageFileName = decodeURIComponent(imageUrl.split('/').pop());
                                }
                                
                                imageFound = { imageUrl, imageFileName };
                                
                                // Look for name in the NEXT row
                                const nextRow = $tr.next('tr');
                                if (nextRow.length > 0) {
                                    nameFound = nextRow.text().trim();
                                }
                            }
                        }
                    });

                    if (imageFound && nameFound) {
                        let formName = nameFound.replace(/\(.*?\)/, '').trim();
                        // Normalize names
                        if (keywords.some(kw => kw.includes('超级'))) {
                            if (formName === 'X' || formName === 'Y') {
                                formName = `超级${nameZh}${formName}`;
                            } else if (!formName.includes('超级')) {
                                if (formName === nameZh) return; 
                                formName = `超级${formName}`;
                            }
                        } else if (keywords.some(kw => kw.includes('超极巨'))) {
                            if (!formName.includes('超极巨')) {
                                if (formName === nameZh || !formName) {
                                    formName = `超极巨化${nameZh}`;
                                } else {
                                    formName = `超极巨化${formName}`;
                                }
                            }
                        }

                        // Add to array
                        if (!targetArray.find(item => item.form_name === formName)) {
                            targetArray.push({
                                name: nameZh,
                                form_name: formName,
                                image: imageFound.imageFileName,
                                imageUrl: imageFound.imageUrl
                            });
                        }
                    }
                });
            } else {
                // Fallback for simple tables (no nested structure)
                const img = $td.find('img').first();
                const width = parseInt(img.attr('width'));
                if (width && width >= 60) {
                     // Try to find name in same cell
                     let formName = $td.text().trim();
                     if (!formName) {
                         const title = $td.find('a').attr('title');
                         if (title) formName = title;
                     }
                     
                     if (formName) {
                        formName = formName.replace(/\(.*?\)/, '').trim();
                        // Normalize names logic (repeated)
                        if (keywords.some(kw => kw.includes('超级'))) {
                            if (formName === 'X' || formName === 'Y') {
                                formName = `超级${nameZh}${formName}`;
                            } else if (!formName.includes('超级')) {
                                if (formName === nameZh) return;
                                formName = `超级${formName}`;
                            }
                        } else if (keywords.some(kw => kw.includes('超极巨'))) {
                            if (!formName.includes('超极巨')) {
                                if (formName === nameZh) {
                                    formName = `超极巨化${nameZh}`;
                                } else {
                                    formName = `超极巨化${formName}`;
                                }
                            }
                        }

                        const src = img.attr('src');
                        let imageUrl = null;
                        let imageFileName = null;
                        if (src) {
                            const parts = src.split('/');
                            const thumbIndex = parts.indexOf('thumb');
                            if (thumbIndex !== -1 && parts.length > thumbIndex + 3) {
                                const hash1 = parts[thumbIndex + 1];
                                const hash2 = parts[thumbIndex + 2];
                                const filename = decodeURIComponent(parts[thumbIndex + 3]);
                                imageUrl = `https://media.52poke.com/wiki/thumb/${hash1}/${hash2}/${filename}/300px-${filename}`;
                                imageFileName = filename;
                            } else {
                                imageUrl = src;
                                if (imageUrl.startsWith('//')) imageUrl = 'https:' + imageUrl;
                                imageFileName = decodeURIComponent(imageUrl.split('/').pop());
                            }
                        }

                        if (imageUrl && imageFileName && !targetArray.find(item => item.form_name === formName)) {
                            targetArray.push({
                                name: nameZh,
                                form_name: formName,
                                image: imageFileName,
                                imageUrl: imageUrl
                            });
                        }
                     }
                }
            }
        });
    };

    const extractFromSection = (keywords, targetArray) => {
        let header = null;
        
        // 1. Try finding specific header
        $('h3, h4').each((i, el) => {
            const text = $(el).text().trim();
            if (keywords.some(kw => text === kw || text.startsWith(kw + ' ') || text.startsWith(kw + '（') || text.startsWith(kw + '('))) {
                header = $(el);
                return false;
            }
        });

        if (header) {
            // Process all tables until next header
            let next = header.next();
            while (next.length > 0 && !['h2', 'h3', 'h4'].includes(next[0].name)) {
                if (next[0].name === 'table') {
                    processTable(next, keywords, targetArray);
                } else if (next.find('table').length > 0) {
                     next.find('table').each((i, tbl) => processTable($(tbl), keywords, targetArray));
                }
                next = next.next();
            }
        } else if (keywords.some(kw => kw.includes('超级'))) {
            // Fallback for Mega: Check under "Evolution" (进化) header
            let evoHeader = null;
            $('h3').each((i, el) => {
                if ($(el).text().trim() === '进化') {
                    evoHeader = $(el);
                    return false;
                }
            });

            if (evoHeader) {
                let next = evoHeader.next();
                while (next.length > 0 && !['h2', 'h3'].includes(next[0].name)) {
                    // Check if table contains "超级"
                     if (next[0].name === 'table' || next.find('table').length > 0) {
                         const txt = next.text();
                         if (txt.includes('超级') || txt.includes('進化石') || txt.includes('进化石')) {
                             if (next[0].name === 'table') processTable(next, keywords, targetArray);
                             else next.find('table').each((i, tbl) => processTable($(tbl), keywords, targetArray));
                         }
                     }
                    next = next.next();
                }
            }
        }
    };

    extractFromSection(['超级进化', '超級進化'], mega_evolution);
    extractFromSection(['超极巨化', '超極巨化', '极巨化'], gigantamax_evolution);

    // Download images
    const downloadImage = (item) => {
        if (item.imageUrl && item.image) {
            const filePath = path.join(dreamDir, item.image);
            if (!fs.existsSync(filePath)) {
                console.log(`Downloading special form image ${item.image} to ${filePath}...`);
                try {
                    execSync(`curl -L -A "${USER_AGENT}" "${item.imageUrl}" -o "${filePath}"`, { stdio: 'inherit' });
                } catch (e) {
                    console.error(`Failed to download ${item.imageUrl}:`, e.message);
                }
            }
        }
        delete item.imageUrl;
    };

    mega_evolution.forEach(downloadImage);
    gigantamax_evolution.forEach(downloadImage);
    
    return { mega_evolution, gigantamax_evolution };
}