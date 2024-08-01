import * as fs from 'fs';
import axios from 'axios';
import { match } from 'assert';
import {SerializeOptions, DeserializeOptions, parse, stringify} from 'hjson';
import beautify from 'cssbeautify';
import * as path from 'path';

const BASE_URL: string = 'https://jackbox.tv/';
const BUNDLE_URL: string = 'https://bundles.jackbox.tv/';

async function fetchData(): Promise<void> {
    try {
        const response = await axios.get(BASE_URL);
        const site: string = response.data;

        const mainScriptMatch = site.match(/<script type="module" crossorigin src="(.*?\.js)"/);
        const mainScript: string | null = mainScriptMatch ? mainScriptMatch[1].replace(/^\/+/, '') : null;

        if (mainScript) {
            console.log(mainScript);

            if (!fs.existsSync('out')) {
                fs.mkdirSync('out');
            }

            const scriptResponse = await axios.get(`${BASE_URL}${mainScript}`);
            const { webcrack } = await import('webcrack'); // Dynamic import
            const scriptClean = await webcrack(scriptResponse.data);
            fs.writeFileSync(`out/${mainScript}`, scriptClean.code, 'utf-8');
            fs.writeFileSync('out/index.html', site, 'utf-8');
            
            //TODO: cleanup the regex
            const regex = /{\n.*main: {\n.*sha:.*,\n.*lastUpdated:.*,\n.*version:.*,\n.*type:.*,\n.*\n.*"@connect":[\s\S]*}\n.*}/g;
            const matches = [...scriptClean.code.matchAll(regex)];
            let gameInfo = parse(matches[0][0]);

            const fetchBundleData = async (key: string) => {

                let js = gameInfo['main']['bundles'][key]['file'];
                let css = gameInfo['main']['bundles'][key]['css'][0];
                let base = gameInfo['main']['bundles'][key]['base'];
                
                console.log(`${BUNDLE_URL}${base}/${css}`);

                const cssResp = await axios.get(`${BUNDLE_URL}${base}/${css}`);
                
                

                // Create directory for CSS file if it doesn't exist
                
                const cssDir = `out/bundles/${base}/assets`;
                if (!fs.existsSync(cssDir)) {
                    fs.mkdirSync(cssDir, { recursive: true });
                }
                const cssClean = beautify(cssResp.data);
                fs.writeFileSync(`${cssDir}/${css.replace('assets/', '')}`, cssResp.data, 'utf-8');

                const jsResp = await axios.get(`${BUNDLE_URL}${base}/${js}`);
                const jsClean = await webcrack(jsResp.data);
                
                // Create directory for JS file if it doesn't exist
                const jsDir = `out/bundles/${base}`;
                if (!fs.existsSync(jsDir)) {
                    fs.mkdirSync(jsDir, { recursive: true });
                }
                fs.writeFileSync(`${jsDir}/${js}`, jsClean.code, 'utf-8');
                let linkRegex = /(https:\/\/bundles\.jackbox\.tv\/main\/[^\/]+\/assets\/[a-z0-9]+\.(eot|png|jpg|gif|mp3|wav|js|css))/g;
                let links = Array.from(jsClean.code.match(linkRegex) || []);
                let links2 = Array.from(cssResp.data.match(linkRegex) || []);
                
                async function downloadAndSaveFiles(urls: string[]): Promise<void> {
                    // Updated regex to match file extensions more accurately
                    const extensionRegex = /\.([a-zA-Z0-9]+)(?:[?#]|$)/;
                  
                    for (const url of urls) {
                      const match = url.match(extensionRegex);
                      if (match) {
                        try {
                          const response = await axios.get(url, { responseType: 'arraybuffer' });
                          
                          // Extract the pathname and remove query parameters
                          const urlPath = new URL(url).pathname.split('?')[0];
                          const localPath = path.join('out', 'bundles', urlPath);
                  
                          // Create directories recursively
                          await fs.mkdirSync(path.dirname(localPath), { recursive: true });
                  
                          // Write file
                          await fs.writeFileSync(localPath, response.data);
                        } catch (error) {
                          console.error(`Error downloading ${url}:`, error);
                        }
                      } else {
                      }
                    }
                }
                await downloadAndSaveFiles(links as string[]);
                await downloadAndSaveFiles(links2 as string[]);
            };
            Object.keys(gameInfo['main']['bundles']).forEach(async (key: string) => {
                await fetchBundleData(key);
            });
            
        }
    
    } catch (error) {
        console.error('Error fetching data:', error);
    }
}

fetchData();
