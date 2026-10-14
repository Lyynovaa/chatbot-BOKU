import fs from 'fs';
import path from 'path';

async function searchPixabay(query) {
  const url = `https://pixabay.com/api/?key=44275153-f7243c39aaef19fcebceca0bd&q=${encodeURIComponent(query)}&image_type=photo&orientation=horizontal&category=health&per_page=10`;
  try {
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      return data.hits || [];
    }
  } catch (e) {}
  return [];
}

async function searchWikimedia(query) {
  const url = `https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrnamespace=6&gsrlimit=10&prop=imageinfo&iiprop=url|mime|size`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'MedicalBotRS/1.0 (contact@hospital.id)' } });
    if (res.ok) {
      const data = await res.json();
      const pages = data.query ? Object.values(data.query.pages) : [];
      return pages.map(p => ({
        title: p.title,
        url: p.imageinfo?.[0]?.url,
        mime: p.imageinfo?.[0]?.mime
      })).filter(x => x.url && (x.url.endsWith('.jpg') || x.url.endsWith('.png') || x.url.endsWith('.jpeg')));
    }
  } catch (e) {}
  return [];
}

async function main() {
  console.log('Testing Pixabay...');
  const px = await searchPixabay('female doctor');
  console.log('Pixabay results:', px.length);
  if (px.length > 0) {
    console.log('Pixabay hit:', px[0].webformatURL);
  }

  console.log('Testing Wikimedia...');
  const wm = await searchWikimedia('female doctor stethoscope portrait');
  console.log('Wikimedia results:', wm.length);
  if (wm.length > 0) {
    console.log('Wikimedia hit:', wm[0].url);
  }
}

main();
