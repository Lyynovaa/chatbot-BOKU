const res = await fetch('https://unsplash.com/s/photos/doctor', {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  }
});
const text = await res.text();
console.log('Status:', res.status, 'Length:', text.length);
const matches = text.match(/https:\/\/[^"'\s>]+unsplash\.com\/[^"'\s>]+/g) || [];
console.log('Matches:', matches.length);
const photos = matches.filter(m => m.includes('photo-') || m.includes('premium_photo'));
console.log('Photos:', photos.slice(0, 10));
