import fs from 'fs';
import path from 'path';

async function extractUnsplashImages(searchQuery) {
  const url = `https://unsplash.com/s/photos/${searchQuery}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  });
  const html = await res.text();
  const regex = /https:\/\/(?:images|plus)\.unsplash\.com\/(?:photo|premium_photo)-[a-zA-Z0-9-]+/g;
  const matches = [...new Set(html.match(regex) || [])];
  return matches;
}

async function download(url, filePath) {
  const res = await fetch(url + '?auto=format&fit=crop&w=800&q=80');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, buf);
  console.log(`Saved: ${filePath} (${(buf.length / 1024).toFixed(1)} KB)`);
}

async function main() {
  const femaleDoctors = await extractUnsplashImages('female-doctor-stethoscope');
  console.log('Female doctors:', femaleDoctors.slice(0, 5));

  const maleDoctors = await extractUnsplashImages('male-doctor-portrait');
  console.log('Male doctors:', maleDoctors.slice(0, 5));

  const hospitalCare = await extractUnsplashImages('hospital-patient-care');
  console.log('Hospital care:', hospitalCare.slice(0, 5));

  const seniorDoctors = await extractUnsplashImages('senior-doctor-portrait');
  console.log('Senior doctors:', seniorDoctors.slice(0, 5));

  // Let's download the best matched assets
  if (femaleDoctors[0]) await download(femaleDoctors[0], 'public/assets/images/hero-doctor.jpg');
  if (femaleDoctors[1]) await download(femaleDoctors[1], 'public/assets/images/about-doctor.jpg');
  if (femaleDoctors[2]) await download(femaleDoctors[2], 'public/assets/images/doctor-1.jpg');
  if (maleDoctors[0]) await download(maleDoctors[0], 'public/assets/images/doctor-2.jpg');
  if (maleDoctors[1]) await download(maleDoctors[1], 'public/assets/images/doctor-3.jpg');
  if (seniorDoctors[0]) await download(seniorDoctors[0], 'public/assets/images/doctor-4.jpg');
  if (hospitalCare[0]) await download(hospitalCare[0], 'public/assets/images/patient-care.jpg');

  console.log('All key assets downloaded successfully!');
}

main().catch(console.error);
