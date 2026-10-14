const url = `https://commons.wikimedia.org/w/api.php?action=query&list=categorymembers&cmtitle=Category:Physicians_with_stethoscopes&cmtype=file&cmlimit=20&prop=imageinfo&iiprop=url&format=json`;

const res = await fetch(url, {
  headers: {
    'User-Agent': 'HospitalApp/1.0 (info@hospital.org)'
  }
});
const data = await res.json();
console.log('Category members:', data.query?.categorymembers);
