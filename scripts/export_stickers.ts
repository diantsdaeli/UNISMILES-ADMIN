import fs from 'fs';
import path from 'path';
import { STICKER_DEFINITIONS } from '../src/lib/scrapbookStickers';

const targetDir = path.resolve(process.cwd(), 'public/stickers');
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

let generatedCount = 0;
for (const item of STICKER_DEFINITIONS) {
  const filePath = path.join(targetDir, `${item.id}.svg`);
  fs.writeFileSync(filePath, item.svg.trim(), 'utf-8');
  generatedCount++;
}

console.log(`Successfully generated ${generatedCount} SVG sticker files in ${targetDir}`);
