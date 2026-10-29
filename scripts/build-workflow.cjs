const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const file = path.join(root, 'workflows/greenhouse-to-sheets.validation-v0.3.json');
const w = JSON.parse(fs.readFileSync(file, 'utf8'));
w.nodes.find(n => n.type === 'n8n-nodes-base.code').parameters.jsCode =
  fs.readFileSync(path.join(root, 'src/normalization/greenhouse-airbnb.n8n.js'), 'utf8');
fs.writeFileSync(file, JSON.stringify(w, null, 2) + '\n');
console.log('Built validation workflow from source');
