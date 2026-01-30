const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';

function scrapeFormImages(htmlFile) {
    const htmlContent = fs.readFileSync(htmlFile, 'utf8');
    const $ = cheerio.load(htmlContent);
    
    // We need to identify forms and their images.
    // The previous logic used 'formMap' based on togglers.
    // We should reuse that logic to find the scope for each form.
    
    // Reconstruct formMap
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
        formMap.set('form1', '一般');
    }
    
    const formsWithImages = [];
    
    // Sort forms
    const sortedFormIds = Array.from(formMap.keys()).sort();
    
    // For single form, the image is usually in the first table row with an image.
    // For multiple forms, the images are usually inside elements with the form class (e.g. .form1) OR they are separate but toggled.
    
    // In venusaur.html (multi-form), looking at lines 1021, 1421, 1819:
    // There are separate tables/rows for images?
    // <tr class="_toggle form1"> ... <img ... 003Venusaur.png ...> ... </tr>
    // <tr class="_toggle form2"> ... <img ... 003Venusaur-Mega.png ...> ... </tr>
    
    // Let's iterate forms and look for images inside their containers.
    
    // If no togglers found (single form fallback), we look at the main table.
    
    // Check if we have multiple form containers
    const hasToggles = $('.toggle-content').length > 0 || $('tr[class*="_toggle"]').length > 0;
    
    for (const formId of sortedFormIds) {
        const formName = formMap.get(formId);
        
        let imageFileName = null;
        let imageUrl = null;
        
        // Find container for this form
        // It could be `.formX` or `._toggle.formX`
        let container = $(`.${formId}`);
        
        // If container not found or empty, maybe it's the default view?
        // For single form, look at the whole infobox table.
        if (formMap.size === 1 && container.length === 0) {
             container = $('table.roundy.a-r.at-c').first();
        }
        
        // Find image inside container
        // Usually inside a span with typeof="mw:File"
        let img = container.find('img').first();
        
        // If not found in specific container, look for separate image container that might be toggled?
        // In Venusaur case, the image row has class `_toggle form1`.
        // Also, the main image is usually in a table with class "roundy bgwhite fulltable"
        
        // Refined selector for main image:
        // Look for img inside the container that has width around 200-300 or is the "official artwork"
        // And exclude images with "TCG" in title or alt.
        
        let targetImg = null;
        
        // Try to find image in the specific form container first
        container.find('img').each((i, el) => {
            const width = parseInt($(el).attr('width'));
            const alt = $(el).attr('alt') || '';
            const src = $(el).attr('src') || '';
            
            // Skip TCG images or small icons
            if (alt.includes('TCG') || src.includes('TCG') || (width && width < 150)) return;
            
            if (!targetImg) targetImg = $(el);
        });
        
        // If not found in form container, it might be in a shared area but toggled by class
        if (!targetImg && formMap.size > 1) {
             // Look for rows with class `_toggle` and `formX`
             // e.g. tr._toggle.form1
             const toggleRow = $(`.${formId}._toggle`);
             toggleRow.find('img').each((i, el) => {
                const width = parseInt($(el).attr('width'));
                const alt = $(el).attr('alt') || '';
                const src = $(el).attr('src') || '';
                if (alt.includes('TCG') || src.includes('TCG') || (width && width < 150)) return;
                if (!targetImg) targetImg = $(el);
             });
        }
        
        // Fallback for single form main image
        if (!targetImg && formMap.size === 1) {
             const mainImgTable = $('table.roundy.bgwhite.fulltable').first();
             mainImgTable.find('img').each((i, el) => {
                const width = parseInt($(el).attr('width'));
                if (width && width >= 200) {
                    targetImg = $(el);
                    return false; // break
                }
             });
        }

        if (targetImg) {
            const src = targetImg.attr('src');
            if (src) {
                const parts = src.split('/');
                const thumbIndex = parts.indexOf('thumb');
                if (thumbIndex !== -1 && parts.length > thumbIndex + 3) {
                    const hash1 = parts[thumbIndex + 1];
                    const hash2 = parts[thumbIndex + 2];
                    const filename = parts[thumbIndex + 3];
                    
                    imageFileName = filename;
                    imageUrl = `https://media.52poke.com/wiki/thumb/${hash1}/${hash2}/${filename}/300px-${filename}`;
                }
            }
        }
        
        formsWithImages.push({
            form: formName,
            image: imageFileName,
            imageUrl: imageUrl
        });
    }
    
    // Download images
    // Get ID and Name for directory
    // ID is usually in a th with "title" containing "全国图鉴编号"
    let pokedexId = '';
    const idLink = $('a[title="宝可梦列表（按全国图鉴编号）"]').first();
    if (idLink.length > 0) {
        pokedexId = idLink.text().replace('#', '').trim();
    } else {
        // Fallback or try finding the cell with text like #0003
        const idCell = $('th:contains("#")').filter((i, el) => /#\d+/.test($(el).text()));
        if (idCell.length > 0) {
            pokedexId = idCell.first().text().replace('#', '').trim();
        }
    }
    
    // Name is the H1 usually
    const name = $('#firstHeading').text().trim();
    
    if (pokedexId && name) {
        const dirName = `${pokedexId}-${name}`;
        const dirPath = path.join(__dirname, '../data/images', dirName);
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
        
        formsWithImages.forEach(item => {
            if (item.imageUrl && item.image) {
                const filePath = path.join(dirPath, item.image);
                if (!fs.existsSync(filePath)) {
                    console.log(`Downloading ${item.image} to ${filePath}...`);
                    try {
                        execSync(`curl -L -A "${USER_AGENT}" "${item.imageUrl}" -o "${filePath}"`, { stdio: 'inherit' });
                    } catch (e) {
                        console.error(`Failed to download ${item.imageUrl}:`, e.message);
                    }
                }
            }
        });
    }
    
    console.log(JSON.stringify(formsWithImages, null, 2));
    
    return formsWithImages;
}

scrapeFormImages('venusaur.html');
