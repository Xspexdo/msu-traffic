const fs = require('fs');
const path = require('path');

const targetUrlPattern = /https:\/\/images\.unsplash\.com\/photo-1535713875002-d1d0cf377fde[^\s"'`)]*/g;
const replacementUrl = 'https://ui-avatars.com/api/?name=MSU&background=2563EB&color=fff';

function walkDir(dir) {
  const files = fs.readdirSync(dir);
  for (const f of files) {
    if (f === 'node_modules' || f === '.git') continue;
    const full = path.join(dir, f);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      walkDir(full);
    } else if (stat.isFile() && (f.endsWith('.js') || f.endsWith('.json') || f.endsWith('.html') || f.endsWith('.css'))) {
      let content = fs.readFileSync(full, 'utf8');
      if (targetUrlPattern.test(content)) {
        console.log('Replacing in:', full);
        content = content.replace(targetUrlPattern, replacementUrl);
        fs.writeFileSync(full, content, 'utf8');
      }
    }
  }
}

walkDir(path.join(__dirname, '..'));
console.log('Done replacement across all project files!');
