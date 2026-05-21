const fs = require('fs');
const content = fs.readFileSync('c:/Beaver/services/workspace-service/server.js', 'utf8');
const lines = content.split('\n');

console.log('--- Occurrences of audits / audit in workspace server.js ---');
lines.forEach((line, idx) => {
  if (line.toLowerCase().includes('audit')) {
    console.log(`${idx + 1}: ${line.trim()}`);
  }
});
