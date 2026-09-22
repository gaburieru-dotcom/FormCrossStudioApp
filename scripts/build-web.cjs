const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'public');
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(path.join(output, 'vendor'), { recursive: true });

for (const file of ['assets.js', 'index.html', 'studio.css', 'studio.js', 'workflow.js']) {
  fs.copyFileSync(path.join(root, file), path.join(output, file));
}

const vendorFiles = [
  ['node_modules/html-to-image/dist/html-to-image.js', 'html-to-image.js'],
  ['node_modules/html2canvas/dist/html2canvas.min.js', 'html2canvas.min.js'],
  ['node_modules/dompurify/dist/purify.min.js', 'purify.min.js'],
  ['node_modules/jszip/dist/jszip.min.js', 'jszip.min.js'],
  ['node_modules/@phosphor-icons/web/src/regular/style.css', 'phosphor-regular.css'],
  ['node_modules/@phosphor-icons/web/src/fill/style.css', 'phosphor-fill.css']
];
for (const [source, target] of vendorFiles) fs.copyFileSync(path.join(root, source), path.join(output, 'vendor', target));

const indexPath = path.join(output, 'index.html');
let index = fs.readFileSync(indexPath, 'utf8');
const replacements = new Map([
  ['node_modules/html-to-image/dist/html-to-image.js', 'vendor/html-to-image.js'],
  ['node_modules/html2canvas/dist/html2canvas.min.js', 'vendor/html2canvas.min.js'],
  ['node_modules/dompurify/dist/purify.min.js', 'vendor/purify.min.js'],
  ['node_modules/jszip/dist/jszip.min.js', 'vendor/jszip.min.js'],
  ['node_modules/@phosphor-icons/web/src/regular/style.css', 'vendor/phosphor-regular.css'],
  ['node_modules/@phosphor-icons/web/src/fill/style.css', 'vendor/phosphor-fill.css']
]);
for (const [from, to] of replacements) index = index.replaceAll(from, to);
fs.writeFileSync(indexPath, index);
console.log(`Web build created: ${output}`);
