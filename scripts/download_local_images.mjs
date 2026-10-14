import fs from 'fs';
import path from 'path';

const ASSETS_DIR = path.join(process.cwd(), 'assets', 'images');
fs.mkdirSync(ASSETS_DIR, { recursive: true });

const imagesToDownload = [
  {
    name: 'hero-doctor.jpg',
    url: 'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&q=85&w=1200'
  },
  {
    name: 'about-doctor.jpg',
    url: 'https://images.unsplash.com/photo-1594824813689-535359a3c907?auto=format&fit=crop&q=85&w=900'
  },
  {
    name: 'doctor-emily.jpg',
    url: 'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&q=85&w=600'
  },
  {
    name: 'doctor-christopher.jpg',
    url: 'https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&q=85&w=600'
  },
  {
    name: 'doctor-michael.jpg',
    url: 'https://images.unsplash.com/photo-1537368910025-700350fe46c7?auto=format&fit=crop&q=85&w=600'
  },
  {
    name: 'doctor-frank.jpg',
    url: 'https://images.unsplash.com/photo-1582592910328-6ed84d453cbe?auto=format&fit=crop&q=85&w=600'
  },
  {
    name: 'patient-recovery.jpg',
    url: 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&q=85&w=1200'
  },
  {
    name: 'clinic-care.jpg',
    url: 'https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&q=85&w=1200'
  }
];

async function download(item) {
  const filePath = path.join(ASSETS_DIR, item.name);
  try {
    const res = await fetch(item.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    if (!res.ok) {
      console.error(`Failed ${item.name}: ${res.status}`);
      return false;
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(filePath, buffer);
    console.log(`✓ Downloaded ${item.name} (${(buffer.length / 1024).toFixed(1)} KB)`);
    return true;
  } catch (err) {
    console.error(`Error downloading ${item.name}:`, err.message);
    return false;
  }
}

async function run() {
  console.log(`Downloading ${imagesToDownload.length} images to ${ASSETS_DIR}...`);
  for (const item of imagesToDownload) {
    await download(item);
  }
  console.log('Finished downloading assets.');
}

run();
