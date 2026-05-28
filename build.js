import fs from 'fs';
import path from 'path';

const distDir = './dist';
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Copy build assets
const filesToCopy = [
  'index.html',
  'app.js',
  'style.css',
  'firebase-applet-config.json'
];

filesToCopy.forEach(file => {
  if (fs.existsSync(file)) {
    fs.copyFileSync(file, path.join(distDir, file));
    console.log(`Copied ${file} to dist/`);
  } else {
    console.warn(`Warning: ${file} not found; skipping copy.`);
  }
});

console.log('Build output prepared successfully inside dist/.');
