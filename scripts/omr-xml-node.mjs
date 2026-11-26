import { execSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { DOMParser } from 'linkedom';
import { XMLSerializer } from '@xmldom/xmldom';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export function bootXmlDom(){
  if (!globalThis.DOMParser) globalThis.DOMParser = DOMParser;
  if (!globalThis.XMLSerializer) globalThis.XMLSerializer = XMLSerializer;
}

export async function readMusicXmlFile(filePath){
  if (filePath.endsWith('.mxl')) {
    const names = execSync(`unzip -Z1 ${JSON.stringify(filePath)}`, { encoding: 'utf8' })
      .split('\n')
      .filter(Boolean);
    const xmlName = names.find(n => n.endsWith('.xml') && !n.includes('META-INF')) || names.find(n => n.endsWith('.xml'));
    if (!xmlName) throw new Error('MXL 内に MusicXML がありません');
    return execSync(`unzip -p ${JSON.stringify(filePath)} ${JSON.stringify(xmlName)}`, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  }
  return readFile(filePath, 'utf8');
}

export function parseMusicXmlImport(xml){
  bootXmlDom();
  const base = '../app/web/src/';
  require(base + 'notation.js');
  require(base + 'instruments.js');
  require(base + 'percussion.js');
  require(base + 'samples.js');
  require(base + 'musicxml-import.js');
  return global.KanadeMusicXMLImport.parse(xml);
}

export function parseScoreFromMusicXml(xml){
  return parseMusicXmlImport(xml).score;
}