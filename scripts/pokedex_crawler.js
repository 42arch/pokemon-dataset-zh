const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
const CSS_PATH = path.join(__dirname, '../data/raw/msp.css');

function fetchPage(url) {
    console.log(`Fetching ${url}...`);
    try {
        return execSync(`curl -L -A "${USER_AGENT}" "${url}"`, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
    } catch (e) {
        console.error("Fetch failed:", e.message);
        process.exit(1);
    }
}

function loadCssMap() {
    const map = {};
    if (fs.existsSync(CSS_PATH)) {
        const cssContent = fs.readFileSync(CSS_PATH, 'utf8');
        const rules = cssContent.split('}');
        rules.forEach(rule => {
            if (!rule.includes('{')) return;
            const [selectorsPart, stylesPart] = rule.split('{');
            const match = stylesPart.match(/background-position:([^;]+)/);
            if (match) {
                const position = match[1].trim();
                const selectors = selectorsPart.split(',');
                selectors.forEach(sel => {
                    const className = sel.trim().replace(/^\./, '');
                    map[className] = position;
                });
            }
        });
    }
    return map;
}

function scrapeRegion(url, filename, columnMap, tableSelector) {
    const fullUrl = url.includes('?') ? `${url}&variant=zh-hans` : `${url}?variant=zh-hans`;
    const html = fetchPage(fullUrl);
    const $ = cheerio.load(html);
    const cssMap = loadCssMap();
    const result = [];

    const selector = tableSelector || 'table.roundy.eplist';
    const tables = $(selector);

    if (tables.length === 0) {
        console.error(`Table not found for ${filename} using selector "${selector}"!`);
        return;
    }

    const map = columnMap || {
        regionId: 0,
        nationalId: 1,
        icon: 2,
        name: 3,
        type1: 4,
        type2: 5
    };

    const outputPath = path.join(__dirname, '../data/pokedex', filename);

    tables.each((tIdx, table) => {
        $(table).find('tr').each((i, row) => {
            const tds = $(row).children('td');
            const maxIndex = Math.max(...Object.values(map));
            if (tds.length <= maxIndex) return;

            const regionIdRaw = $(tds[map.regionId]).text().trim();
            if (!regionIdRaw.startsWith('#')) return;

            const id = regionIdRaw.replace('#', '');
            
            let nationalId = "";
            const nationalIdRaw = $(tds[map.nationalId]).text().trim();
            if (nationalIdRaw.startsWith('#')) {
                nationalId = nationalIdRaw.replace('#', '');
            }

            // Enhanced Name Extraction: handle form names in <small> tags
            const nameTd = $(tds[map.name]);
            let mainName = nameTd.find('a').first().text().trim();
            let formName = nameTd.find('small').first().text().trim();
            
            if (!mainName) mainName = nameTd.text().trim();
            
            let name = mainName;
            if (formName) {
                // Remove any brackets around form name
                formName = formName.replace(/[\(\)（）]/g, '').trim();
                name = `${mainName}-${formName}`;
            }

            const types = [];
            const type1 = $(tds[map.type1]).text().trim();
            if (type1) types.push(type1);
            
            if (tds.length > map.type2) {
                const type2Cell = $(tds[map.type2]);
                const type2 = type2Cell.text().trim();
                if (type2 && !type2Cell.hasClass('hide')) {
                    types.push(type2);
                }
            }

            let icon = "";
            const span = $(tds[map.icon]).find('span');
            if (span.length > 0) {
                const classes = (span.attr('class') || "").split(/\s+/);
                for (const cls of classes) {
                    if (cls.startsWith('sprite-icon-') && cssMap[cls]) {
                        icon = cssMap[cls];
                        break;
                    }
                }
            }

            result.push({
                id: id,
                national_id: nationalId,
                name: name,
                types: types,
                icon: icon
            });
        });
    });

    const outDir = path.dirname(outputPath);
    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }

    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf8');
    console.log(`Saved ${result.length} Pokemon to ${outputPath}`);
}

function scrapeKanto() {
    scrapeRegion(
        'https://wiki.52poke.com/wiki/%E5%AE%9D%E5%8F%AF%E6%A2%A6%E5%88%97%E8%A1%A8%EF%BC%88%E6%8C%89%E5%85%B3%E9%83%BD%E5%9B%BE%E9%89%B4%E7%BC%96%E5%8F%B7%EF%BC%89',
        '关都.json',
        { regionId: 0, nationalId: 1, icon: 2, name: 3, type1: 4, type2: 5 }
    );
}

function scrapeJohto() {
    scrapeRegion(
        'https://wiki.52poke.com/wiki/%E5%AE%9D%E5%8F%AF%E6%A2%A6%E5%88%97%E8%A1%A8%EF%BC%88%E6%8C%89%E5%9F%8E%E9%83%BD%E5%9B%BE%E9%89%B4%E7%BC%96%E5%8F%B7%EF%BC%89',
        '城都.json',
        { regionId: 1, nationalId: 2, icon: 3, name: 4, type1: 5, type2: 6 }
    );
}

function scrapeHoenn() {
    scrapeRegion(
        'https://wiki.52poke.com/wiki/%E5%AE%9D%E5%8F%AF%E6%A2%A6%E5%88%97%E8%A1%A8%EF%BC%88%E6%8C%89%E4%B8%B0%E7%BC%98%E5%9B%BE%E9%89%B4%E7%BC%96%E5%8F%B7%EF%BC%89',
        '丰缘.json',
        { regionId: 1, nationalId: 2, icon: 3, name: 4, type1: 5, type2: 6 }
    );
}

function scrapeSinnoh() {
    scrapeRegion(
        'https://wiki.52poke.com/wiki/%E5%AE%9D%E5%8F%AF%E6%A2%A6%E5%88%97%E8%A1%A8%EF%BC%88%E6%8C%89%E7%A5%9E%E5%A5%A5%E5%9B%BE%E9%89%B4%E7%BC%96%E5%8F%B7%EF%BC%89',
        '神奥.json',
        { regionId: 0, nationalId: 1, icon: 2, name: 3, type1: 4, type2: 5 }
    );
}

function scrapeUnova() {
    scrapeRegion(
        'https://wiki.52poke.com/wiki/%E5%AE%9D%E5%8F%AF%E6%A2%A6%E5%88%97%E8%A1%A8%EF%BC%88%E6%8C%89%E6%96%B0%E5%90%88%E4%BC%97%E5%9B%BE%E9%89%B4%E7%BC%96%E5%8F%B7%EF%BC%89',
        '合众.json',
        { regionId: 0, nationalId: 1, icon: 2, name: 3, type1: 4, type2: 5 }
    );
}

function scrapeKalos() {
    const url = 'https://wiki.52poke.com/wiki/%E5%AE%9D%E5%8F%AF%E6%A2%A6%E5%88%97%E8%A1%A8%EF%BC%88%E6%8C%89%E5%8D%A1%E6%B4%9B%E6%96%AF%E5%9B%BE%E9%89%B4%E7%BC%96%E5%8F%B7%EF%BC%89';
    const map = { regionId: 0, nationalId: 1, icon: 2, name: 3, type1: 4, type2: 5 };
    
    scrapeRegion(url, '卡洛斯-中央.json', map, 'table.roundy.eplist.bgl-卡洛斯');
    scrapeRegion(url, '卡洛斯-海岸.json', map, 'table.roundy.eplist.bgl-X');
    scrapeRegion(url, '卡洛斯-山岳.json', map, 'table.roundy.eplist.bgl-Y');
}

function scrapeAlola() {
    const url = 'https://wiki.52poke.com/wiki/%E5%AE%9D%E5%8F%AF%E6%A2%A6%E5%88%97%E8%A1%A8%EF%BC%88%E6%8C%89%E6%96%B0%E9%98%BF%E7%BD%97%E6%8B%89%E5%9B%BE%E9%89%B4%E7%BC%96%E5%8F%B7%EF%BC%89';
    const map = { regionId: 0, nationalId: 1, icon: 2, name: 3, type1: 4, type2: 5 };
    
    scrapeRegion(url, '阿罗拉-美乐美乐.json', map, 'table.roundy.eplist.bgl-电');
    scrapeRegion(url, '阿罗拉-阿卡拉.json', map, 'table.roundy.eplist.bgl-超能力');
    scrapeRegion(url, '阿罗拉-乌拉乌拉.json', map, 'table.roundy.eplist.bgl-火');
    scrapeRegion(url, '阿罗拉-波尼.json', map, 'table.roundy.eplist.bgl-幽灵');
}

function scrapeGalar() {
    const map = { regionId: 0, nationalId: 1, icon: 2, name: 3, type1: 4, type2: 5 };
    
    scrapeRegion(
        'https://wiki.52poke.com/wiki/%E5%AE%9D%E5%8F%AF%E6%A2%A6%E5%88%97%E8%A1%A8%EF%BC%88%E6%8C%89%E4%BC%BD%E5%8B%92%E5%B0%94%E5%9B%BE%E9%89%B4%E7%BC%96%E5%8F%B7%EF%BC%89',
        '伽勒尔.json',
        map
    );
    
    scrapeRegion(
        'https://wiki.52poke.com/wiki/%E5%AE%9D%E5%8F%AF%E6%A2%A6%E5%88%97%E8%A1%A8%EF%BC%88%E6%8C%89%E9%93%A0%E5%B2%9B%E5%9B%BE%E9%89%B4%E7%BC%96%E5%8F%B7%EF%BC%89',
        '伽勒尔-铠岛.json',
        map
    );
    
    scrapeRegion(
        'https://wiki.52poke.com/wiki/%E5%AE%9D%E5%8F%AF%E6%A2%A6%E5%88%97%E8%A1%A8%EF%BC%88%E6%8C%89%E7%8E%8B%E5%86%A0%E9%9B%AA%E5%8E%9F%E5%9B%BE%E9%89%B4%E7%BC%96%E5%8F%B7%EF%BC%89',
        '伽勒尔-王冠雪原.json',
        map
    );
}

function scrapeHisui() {
    scrapeRegion(
        'https://wiki.52poke.com/wiki/%E5%AE%9D%E5%8F%AF%E6%A2%A6%E5%88%97%E8%A1%A8%EF%BC%88%E6%8C%89%E6%B4%97%E7%BF%A0%E5%9B%BE%E9%89%B4%E7%BC%96%E5%8F%B7%EF%BC%89',
        '洗翠.json',
        { regionId: 0, nationalId: 1, icon: 2, name: 3, type1: 4, type2: 5 }
    );
}

function scrapePaldea() {
    const map = { regionId: 0, nationalId: 1, icon: 2, name: 3, type1: 4, type2: 5 };
    
    scrapeRegion(
        'https://wiki.52poke.com/wiki/%E5%AE%9D%E5%8F%AF%E6%A2%A6%E5%88%97%E8%A1%A8%EF%BC%88%E6%8C%89%E5%B8%95%E5%BA%95%E4%BA%9A%E5%9B%BE%E9%89%B4%E7%BC%96%E5%8F%B7%EF%BC%89',
        '帕底亚.json',
        map
    );
    
    scrapeRegion(
        'https://wiki.52poke.com/wiki/%E5%AE%9D%E5%8F%AF%E6%A2%A6%E5%88%97%E8%A1%A8%EF%BC%88%E6%8C%89%E5%8C%97%E4%B8%8A%E5%9B%BE%E9%89%B4%E7%BC%96%E5%8F%B7%EF%BC%89',
        '帕底亚-北上.json',
        map
    );
    
    scrapeRegion(
        'https://wiki.52poke.com/wiki/%E5%AE%9D%E5%8F%AF%E6%A2%A6%E5%88%97%E8%A1%A8%EF%BC%88%E6%8C%89%E8%93%9D%E8%8E%93%E5%9B%BE%E9%89%B4%E7%BC%96%E5%8F%B7%EF%BC%89',
        '帕底亚-蓝莓.json',
        map
    );
}

function scrapeMiare() {
    const map = { regionId: 0, nationalId: 1, icon: 2, name: 3, type1: 4, type2: 5 };
    
    scrapeRegion(
        'https://wiki.52poke.com/wiki/%E5%AE%9D%E5%8F%AF%E6%A2%A6%E5%88%97%E8%A1%A8%EF%BC%88%E6%8C%89%E5%AF%86%E9%98%BF%E9%9B%B7%E5%9B%BE%E9%89%B4%E7%BC%96%E5%8F%B7%EF%BC%89',
        '密阿雷.json',
        map
    );
    
    scrapeRegion(
        'https://wiki.52poke.com/wiki/%E5%AE%9D%E5%8F%AF%E6%A2%A6%E5%88%97%E8%A1%A8%EF%BC%88%E6%8C%89%E5%BC%82%E6%AC%A1%E5%85%83%E5%9B%BE%E9%89%B4%E7%BC%96%E5%8F%B7%EF%BC%89',
        '密阿雷-异次元.json',
        map
    );
    
    scrapeRegion(
        'https://wiki.52poke.com/wiki/%E8%B6%85%E7%BA%A7%E8%BF%9B%E5%8C%96%E5%9B%BE%E9%89%B4',
        '密阿雷-超级进化.json',
        map
    );
}

function main() {
    scrapeKanto();
    scrapeJohto();
    scrapeHoenn();
    scrapeSinnoh();
    scrapeUnova();
    scrapeKalos();
    scrapeAlola();
    scrapeGalar();
    scrapeHisui();
    scrapePaldea();
    scrapeMiare();
}

if (require.main === module) {
    main();
}

module.exports = { scrapeRegion, scrapeKanto, scrapeJohto, scrapeHoenn, scrapeSinnoh, scrapeUnova, scrapeKalos, scrapeAlola, scrapeGalar, scrapeHisui, scrapePaldea, scrapeMiare };
