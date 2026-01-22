const https = require('https');
const fs = require('fs');
const path = require('path');

const url = 'https://cdn.tailwindcss.com';
const dest = path.join(__dirname, '../dist/tailwind.js');

// Ensure dist exists
const distDir = path.dirname(dest);
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

console.log(`Downloading Tailwind CSS to ${dest}...`);
const file = fs.createWriteStream(dest);
https.get(url, function(response) {
  if (response.statusCode !== 200) {
      console.error(`Failed to download: ${response.statusCode}`);
      if (response.statusCode === 302 || response.statusCode === 301) {
          console.log(`Redirecting to ${response.headers.location}...`);
          https.get(response.headers.location, function(redirectResponse) {
              redirectResponse.pipe(file);
              file.on('finish', function() {
                  file.close(() => {
                      console.log('Download completed.');
                  });
              });
          });
      }
      return;
  }
  response.pipe(file);
  file.on('finish', function() {
    file.close(() => {
        console.log('Download completed.');
    });
  });
}).on('error', function(err) {
  fs.unlink(dest, () => {});
  console.error('Error downloading file:', err.message);
  process.exit(1);
});
