const fs = require('fs');
const path = require('path');

function searchDir(dir, query) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      if (file !== 'node_modules') {
        searchDir(filePath, query);
      }
    } else if (file.endsWith('.js')) {
      const content = fs.readFileSync(filePath, 'utf8');
      if (content.includes(query)) {
        console.log(`Found in: ${filePath}`);
      }
    }
  });
}

console.log('Searching for requireBoss in services...');
searchDir('c:/Beaver/services', 'requireBoss');
