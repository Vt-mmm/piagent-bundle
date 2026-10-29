import fs from 'node:fs';
import path from 'node:path';
let bad = 0;
for (const file of fs.readdirSync('src').map(f => path.join('src', f))) {
  fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
    if (/\bvar\b/.test(line) || /console\.log/.test(line) || line.length > 100) { console.error(`${file}:${i + 1}: lint`); bad += 1; }
  });
}
process.exit(bad ? 1 : 0);
