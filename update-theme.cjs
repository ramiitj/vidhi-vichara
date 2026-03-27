const fs = require('fs');
const path = require('path');

const files = ['components/Modal.tsx'];

files.forEach(file => {
  const filePath = path.join(__dirname, 'src', file);
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');

    content = content.replace(/bg-navy-light/g, 'bg-parchment-dark');
    content = content.replace(/bg-navy-border/g, 'bg-parchment-border');
    content = content.replace(/border-navy-border/g, 'border-parchment-border');
    content = content.replace(/bg-navy/g, 'bg-parchment');
    content = content.replace(/text-text-primary/g, 'text-ink');
    content = content.replace(/text-text-secondary/g, 'text-ink-light');
    content = content.replace(/text-white/g, 'text-ink');
    content = content.replace(/text-text-dim/g, 'text-ink-light/70');

    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`${file} updated`);
  }
});
