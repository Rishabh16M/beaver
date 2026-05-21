const fs = require('fs');

const content = fs.readFileSync('client/src/App.jsx', 'utf8');
const lines = content.split('\n');

lines.forEach((line, index) => {
  if (line.includes('setCurrentWorkspace')) {
    console.log(`${index + 1}: ${line.trim()}`);
  }
});
