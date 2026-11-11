const fs = require('node:fs');
const path = require('node:path');
const destination = path.resolve(__dirname, '../deliverables/approved-web-review-engine-v4/artex-review');
if (fs.existsSync(destination)) throw Error('Release destination already exists.');
fs.cpSync(__dirname, destination, { recursive: true, filter: source => {
  const relative = path.relative(__dirname, source);
  const parts = relative.split(path.sep);
  return !parts.some(p => ['.git', 'engine-runtime', 'reports', 'node_modules'].includes(p)) && !['.env'].includes(path.basename(source));
} });
console.log('Packaged source and launcher without runtime secrets, reports or Git metadata.');
