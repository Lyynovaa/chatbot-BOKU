import fs from 'fs';
import path from 'path';

const ASSETS_DIR = path.join(process.cwd(), 'assets', 'images');
fs.mkdirSync(ASSETS_DIR, { recursive: true });

async function searchWikimedia(query) {
  const url = `https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrnamespace=6&gsrlimit=20&prop=imageinfo&iiprop=url|mime|size|extmetadata`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'RSMargonoBot/1.0 (admin@rsmargono.id)' } });
    if (res.ok) {
      const data = await res.json();
      const pages = data.query ? Object.values(data.query.pages) : [];
      return pages.map(p => ({
        title: p.title,
        url: p.imageinfo?.[0]?.url,
        mime: p.imageinfo?.[0]?.mime,
        width: p.imageinfo?.[0]?.width,
        height: p.imageinfo?.[0]?.height,
        description: p.imageinfo?.[0]?.extmetadata?.ObjectName?.value || p.title
      })).filter(x => x.url);
    }
  } catch (e) {
    console.error('Search error:', e.message);
  }
  return [];
}

async function download(url, filename) {
  const dest = path.join(ASSETS_DIR, filename);
  console.log(`Downloading ${filename} from ${url}...`);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    if (!res.ok) {
      console.error(`Failed: ${res.status} ${res.statusText}`);
      return false;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(dest, buf);
    console.log(`✓ Saved ${filename} (${(buf.length / 1024).toFixed(1)} KB)`);
    return true;
  } catch (e) {
    console.error(`Error saving ${filename}:`, e.message);
    return false;
  }
}

async function main() {
  const images = [
    {
      url: 'https://upload.wikimedia.org/wikipedia/commons/5/50/RSUD_Prof._Dr._Margono_Soekarjo_%282026%29_01.jpg',
      name: 'rsud-margono-main.jpg'
    },
    {
      url: 'https://upload.wikimedia.org/wikipedia/commons/4/48/RSUD_Prof._Dr._Margono_Soekarjo_%282026%29_02.jpg',
      name: 'rsud-margono-building.jpg'
    },
    {
      url: 'https://upload.wikimedia.org/wikipedia/commons/2/28/Gedung_baru_RSU_dr._Margono_2012_-_panoramio.jpg',
      name: 'rsud-margono-facade.jpg'
    },
    {
      url: 'https://upload.wikimedia.org/wikipedia/commons/0/03/RSU_dr._Margono_Purwokerto_-_panoramio.jpg',
      name: 'rsud-margono-entrance.jpg'
    }
  ];

  for (const img of images) {
    if (fs.existsSync(path.join(ASSETS_DIR, img.name))) {
      console.log(`Skipping existing ${img.name}`);
      continue;
    }
    await new Promise(r => setTimeout(r, 3000));
    await download(img.url, img.name);
  }
}

main();
