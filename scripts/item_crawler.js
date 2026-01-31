const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
const URL = 'https://wiki.52poke.com/wiki/%E9%81%93%E5%85%B7%E5%88%97%E8%A1%A8';
const IMAGE_DIR = path.join(__dirname, '../data/images/items');
const OUTPUT_FILE = path.join(__dirname, '../data/item.json');

// Ensure image directory exists
if (!fs.existsSync(IMAGE_DIR)) {
    fs.mkdirSync(IMAGE_DIR, { recursive: true });
}

function downloadImage(url, filename) {
    const filePath = path.join(IMAGE_DIR, filename);
    if (fs.existsSync(filePath)) {
        return;
    }
    
    // Fix protocol-relative URLs
    if (url.startsWith('//')) {
        url = 'https:' + url;
    }

    try {
        console.log(`Downloading ${filename}...`);
        execSync(`curl -L -A "${USER_AGENT}" "${url}" -o "${filePath}"`, { stdio: 'ignore' });
    } catch (e) {
        console.error(`Failed to download image: ${url}`, e.message);
    }
}

function cleanText(text) {
    if (!text) return '';
    return text.replace(/\[\d+\]/g, '').trim(); // Remove reference markers like [1]
}

async function scrapeItems() {
    console.log(`Fetching ${URL}...`);
    let htmlContent;
    try {
        htmlContent = execSync(`curl -L -A "${USER_AGENT}" "${URL}"`, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
    } catch (e) {
        console.error("Failed to download page:", e.message);
        return;
    }

    const $ = cheerio.load(htmlContent);
    const root = [];
    
    // Logic to handle H2 -> H3 -> Table structure
    // We iterate over the children of .mw-parser-output
    const content = $('.mw-parser-output').children();
    
    let currentH2 = null;
    let currentH3 = null;

    content.each((i, el) => {
        const tagName = el.name;
        const $el = $(el);

        if (tagName === 'h2') {
            const name = cleanText($el.find('.mw-headline').text());
            if (name && name !== '目录') { // Skip TOC or other non-content H2
                // Push previous H2
                if (currentH2) {
                    root.push(currentH2);
                }
                
                currentH2 = {
                    type: 'category',
                    name: name,
                    children: []
                };
                currentH3 = null; // Reset H3 when new H2 starts
            }
        } else if (tagName === 'h3') {
            const name = cleanText($el.find('.mw-headline').text());
            if (name && currentH2) {
                currentH3 = {
                    type: 'category',
                    name: name,
                    children: []
                };
                currentH2.children.push(currentH3);
            }
        } else if (tagName === 'table') {
            if ($el.hasClass('hvlist') || $el.hasClass('roundy')) {
                const items = parseTable($, $el);
                if (items.length > 0) {
                    // Add items to the most specific current category
                    if (currentH3) {
                        currentH3.children.push(...items);
                    } else if (currentH2) {
                        currentH2.children.push(...items);
                    } else {
                        // Orphan table (before any H2?), maybe ignore or add to a "Misc" category
                        // Usually specific tables are under headers.
                    }
                }
            }
        }
    });

    // Push the last H2
    if (currentH2) {
        root.push(currentH2);
    }

    // Filter out empty categories or unwanted sections like "参考资料"
    let result = root.filter(cat => {
        return cat.name !== '参考资料' && cat.name !== '延伸阅读' && cat.name !== '外部链接' && (cat.children.length > 0);
    });

    // Ensure 3-level structure (Root -> Sub -> Items) OR flatten if only 1 sub
    result.forEach(cat => {
        const directItems = [];
        const subCategories = [];

        cat.children.forEach(child => {
            if (child.type === 'item') {
                directItems.push(child);
            } else if (child.type === 'category') {
                subCategories.push(child);
            }
        });

        // If there are direct items, wrap them in a subcategory with the same name
        if (directItems.length > 0) {
            const wrapperCategory = {
                type: 'category',
                name: cat.name,
                children: directItems
            };
            subCategories.unshift(wrapperCategory);
        }

        // Flatten if only one subcategory
        if (subCategories.length === 1) {
            cat.children = subCategories[0].children;
        } else {
            cat.children = subCategories;
        }
    });

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2), 'utf8');
    console.log(`Saved ${result.length} root categories to ${OUTPUT_FILE}`);
}

function parseTable($, table) {
    const items = [];
    let currentItem = null;
    let sharedIconUrls = null;
    let sharedDescriptions = null;
    let rowspanCounter = 0;

    table.find('tr').each((i, row) => {
        const $row = $(row);
        const tds = $row.children('td');
        
        if (tds.length === 0) return;

        // Helper to extract icons
        const extractIcons = (td) => {
            let urls = [];
            td.find('img').each((j, el) => {
                const src = $(el).attr('src');
                if (src) {
                     const parts = src.split('/');
                     const thumbIndex = parts.indexOf('thumb');
                     let finalUrl = src;
                     if (thumbIndex !== -1 && parts.length > thumbIndex + 3) {
                         const hash1 = parts[thumbIndex + 1];
                         const hash2 = parts[thumbIndex + 2];
                         const filename = parts[thumbIndex + 3];
                         finalUrl = `https://media.52poke.com/wiki/${hash1}/${hash2}/${filename}`;
                     }
                     urls.push(finalUrl);
                }
            });
            return urls;
        };

        // Helper to extract descriptions
        const extractDescriptions = (td) => {
            let descs = [];
            const descHtml = td.html();
            if (descHtml) {
                const textWithSep = descHtml.replace(/<br\s*\/?>/gi, '#####');
                const cleanStr = cheerio.load(textWithSep).text(); 
                descs = cleanStr.split('#####').map(s => cleanText(s)).filter(s => s);
            }
            if (descs.length === 0) {
                const txt = cleanText(td.text());
                if (txt) descs.push(txt);
            }
            return descs;
        };

        if (tds.length >= 5) {
            const iconTd = $(tds[0]);
            const nameZhTd = $(tds[1]);
            const nameJaTd = $(tds[2]);
            const nameEnTd = $(tds[3]);
            const descTd = $(tds[4]);

            const name_zh = cleanText(nameZhTd.text());
            if (!name_zh) return;

            const name_ja = cleanText(nameJaTd.text());
            const name_en = cleanText(nameEnTd.text());
            
            const icons = extractIcons(iconTd);
            const descs = extractDescriptions(descTd);

            // Rowspan handling
            const iconRowspan = parseInt(iconTd.attr('rowspan')) || 1;
            const descRowspan = parseInt(descTd.attr('rowspan')) || 1;
            
            if (iconRowspan > 1 || descRowspan > 1) {
                rowspanCounter = Math.max(iconRowspan, descRowspan) - 1;
                sharedIconUrls = (iconRowspan > 1) ? icons : null;
                sharedDescriptions = (descRowspan > 1) ? descs : null;
            } else {
                rowspanCounter = 0;
                sharedIconUrls = null;
                sharedDescriptions = null;
            }

            currentItem = {
                type: 'item',
                name_zh: name_zh,
                name_ja: name_ja,
                name_en: name_en,
                _descriptions: descs,
                _iconUrls: icons
            };
            items.push(currentItem);

        } else if (tds.length === 4 && rowspanCounter > 0) {
            // Case: Shared Icon OR Shared Description
            if (sharedIconUrls) {
                // Missing Icon column: ZH, JA, EN, Desc
                const nameZhTd = $(tds[0]);
                const nameJaTd = $(tds[1]);
                const nameEnTd = $(tds[2]);
                const descTd = $(tds[3]);

                const name_zh = cleanText(nameZhTd.text());
                const name_ja = cleanText(nameJaTd.text());
                const name_en = cleanText(nameEnTd.text());
                const descs = extractDescriptions(descTd);

                if (name_zh) {
                    currentItem = {
                        type: 'item',
                        name_zh: name_zh,
                        name_ja: name_ja,
                        name_en: name_en,
                        _descriptions: descs,
                        _iconUrls: [...sharedIconUrls]
                    };
                    items.push(currentItem);
                    rowspanCounter--;
                }
            } else if (sharedDescriptions) {
                // Missing Desc column: Icon, ZH, JA, EN
                const iconTd = $(tds[0]);
                const nameZhTd = $(tds[1]);
                const nameJaTd = $(tds[2]);
                const nameEnTd = $(tds[3]);
                
                const name_zh = cleanText(nameZhTd.text());
                const name_ja = cleanText(nameJaTd.text());
                const name_en = cleanText(nameEnTd.text());
                const icons = extractIcons(iconTd);
                
                if (name_zh) {
                    currentItem = {
                        type: 'item',
                        name_zh: name_zh,
                        name_ja: name_ja,
                        name_en: name_en,
                        _descriptions: [...sharedDescriptions],
                        _iconUrls: icons
                    };
                    items.push(currentItem);
                    rowspanCounter--;
                }
            }
        } else if (tds.length === 3 && rowspanCounter > 0) {
            // Shared Icon/Desc Item
            const nameZhTd = $(tds[0]);
            const nameJaTd = $(tds[1]);
            const nameEnTd = $(tds[2]);
            
            const name_zh = cleanText(nameZhTd.text());
            const name_ja = cleanText(nameJaTd.text());
            const name_en = cleanText(nameEnTd.text());
            
            if (name_zh) {
                const icons = sharedIconUrls ? [...sharedIconUrls] : [];
                const descs = sharedDescriptions ? [...sharedDescriptions] : [];
                
                currentItem = {
                    type: 'item',
                    name_zh: name_zh,
                    name_ja: name_ja,
                    name_en: name_en,
                    _descriptions: descs,
                    _iconUrls: icons
                };
                items.push(currentItem);
                rowspanCounter--;
            }

        } else if (tds.length === 2 && currentItem) {
            const iconTd = $(tds[0]);
            const descTd = $(tds[1]);

            const icons = extractIcons(iconTd);
            const descs = extractDescriptions(descTd);

            if (icons.length > 0) currentItem._iconUrls.push(...icons);
            if (descs.length > 0) currentItem._descriptions.push(...descs);
        }
    });

    // Post-processing
    items.forEach(item => {
        if (item._descriptions.length === 1) {
            item.description = item._descriptions[0];
        } else {
            item.description = item._descriptions;
        }
        delete item._descriptions;

        if (item._iconUrls.length > 0) {
            const icons = [];
            item._iconUrls.forEach((url, idx) => {
                let ext = path.extname(url.split('?')[0]) || '.png';
                if (ext === '.php') ext = '.png';
                
                let localFilename;
                if (item._iconUrls.length === 1) {
                    localFilename = `${item.name_zh}${ext}`;
                } else {
                    localFilename = `${item.name_zh}-${idx + 1}${ext}`;
                }
                                    icons.push(localFilename);
                                    downloadImage(url, localFilename);
                                });            
            if (icons.length === 1) {
                item.icon = icons[0];
            } else {
                item.icon = icons;
            }
        }
        delete item._iconUrls;
    });

    return items;
}

if (require.main === module) {
    scrapeItems();
}

module.exports = { scrapeItems };
