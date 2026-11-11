const fs = require('node:fs');
const path = require('node:path');
const source = path.join(__dirname, 'run.bat');
const text = fs.readFileSync(source, 'utf8').replace(/\r?\n/g, '\r\n');
fs.writeFileSync(source, text, 'ascii');
console.log('Launcher saved as ASCII with Windows CRLF.');
