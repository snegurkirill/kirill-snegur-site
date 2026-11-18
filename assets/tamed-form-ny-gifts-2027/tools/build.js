// Photos for /tamed-form-ny-gifts-2027 → webp next to this folder.
// usage: NODE_PATH=<dir with sharp> node build.js "<source folder>"
// Source: «Tamed form/Подарки на новый год», one subfolder per gift.
// Names keep the slide number: sNN-K.webp is photo K on slide NN.
const sharp = require('sharp');
const path = require('path');
const src = process.argv[2];
const out = path.join(__dirname, '..');

const P = 'Ароматическая пирамида с фигурой внутри/';
const jobs = {
  's06-1': P + '1.png',            // sketches on white: keep them crisp
  's06-2': P + '2.png',
  's07-1': P + 'Цветок.png',
  's09-1': 'Призма/IMG_3366.PNG',
  's09-2': 'Призма/IMG_3367.PNG',
  's09-3': 'Призма/IMG_3368.PNG',
  's11-1': 'Слайды-отрытки/587796529_18439919983110129_696020311063631469_n.jpg',
  's11-2': 'Слайды-отрытки/589842659_18439920028110129_8842346394870069468_n.jpg',
  's12-1': 'Слайды-отрытки/Широкие/802899220_18488387179110129_1222477905714467674_n.jpg',
  's12-2': 'Слайды-отрытки/Широкие/802435298_18488387143110129_997837024891918326_n.jpg',
  's14-1': 'Календарь/902586293_18501203149110129_7821112685900664059_n.jpg',
  's14-2': 'Календарь/902586125_18501203005110129_6557286685542337782_n.jpg',
  's14-3': 'Календарь/902586268_18501203020110129_1264735138931317146_n.jpg',
};
const sketch = new Set(['s06-1', 's06-2', 's07-1']);

(async () => {
  for (const [id, rel] of Object.entries(jobs)) {
    const f = path.join(src, rel);
    const img = sharp(f).rotate().flatten({ background: '#fff' })
      .resize(2000, 2000, { fit: 'inside', withoutEnlargement: true });
    const info = await img.webp({ quality: sketch.has(id) ? 88 : 80, smartSubsample: true })
      .toFile(path.join(out, id + '.webp'));
    console.log(id, info.width + 'x' + info.height, Math.round(info.size / 1024) + 'KB');
  }
})();
