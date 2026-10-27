/* ---------------------------------------------------------------------------
   Проверка отправки — /ocean-brief/diag.html
   Шлёт на сервер брифа пакеты растущего размера и записи из черновика
   (IndexedDB «ocean-brief» того же сайта). Ничего не сохраняется: свой
   обработчик (brief.snegur.space) получает diag=1 и выбрасывает тело, Forminit
   (?target=forminit) — неверное поле fi-sender-name и отвечает 400.
   Ответ сервера с любым кодом — «дошло»; обрыв без ответа — «не дошло»,
   с долей тела, которая успела уйти.
   --------------------------------------------------------------------------- */

(() => {
  'use strict';

  const TARGET = new URLSearchParams(location.search).get('target') === 'forminit' ? 'forminit' : 'beget';
  const URL_ = TARGET === 'forminit' ? 'https://forminit.com/f/qa4fs1lrrc9' : 'https://brief.snegur.space/submit.php';
  const GAP_MS = TARGET === 'forminit' ? 6000 : 500;   // Forminit без ключа — 1 запрос в 5 с с IP
  const $ = (s) => document.querySelector(s);
  const KB = 1024;

  function post(fd) {
    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      const t0 = Date.now();
      let sent = 0;
      const done = (status, text) => resolve({ status, text, sent, ms: Date.now() - t0 });
      xhr.open('POST', URL_);
      xhr.setRequestHeader('Accept', 'application/json');
      xhr.timeout = 120000;
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) sent = e.loaded / e.total; };
      xhr.onload = () => done(xhr.status, xhr.responseText.slice(0, 160));
      xhr.onerror = () => done(0, 'NETWORK_ERROR');
      xhr.ontimeout = () => done(0, 'TIMEOUT');
      xhr.send(fd);
    });
  }

  function junk(bytes) {
    const a = new Uint8Array(bytes);
    for (let i = 0; i < bytes; i += 65536) crypto.getRandomValues(a.subarray(i, Math.min(bytes, i + 65536)));
    return a;
  }

  function form(file, extra) {
    const fd = new FormData();
    if (TARGET === 'beget') {
      fd.append('diag', '1');                       // обработчик примет и выбросит
      fd.append('note', extra || 'проверка');
      if (file) fd.append('audio[q1_1_1][]', file);
      return fd;
    }
    fd.append('fi-sender-name', 'diag');          // неверное поле: сервер отклонит, не сохранит
    fd.append('fi-text-diag', extra || 'проверка');
    if (file) fd.append('fi-file-q1_1_1_audio[]', file);
    return fd;
  }

  async function clips() {
    try {
      const db = await new Promise((res, rej) => {
        const r = indexedDB.open('ocean-brief', 1);
        r.onupgradeneeded = () => { r.transaction.abort(); };   // черновика нет — базу не создаём
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      const rows = await new Promise((res, rej) => {
        const g = db.transaction('clips').objectStore('clips').getAll();
        g.onsuccess = () => res(g.result);
        g.onerror = () => rej(g.error);
      });
      return rows.map((r) => ({ q: r.q, type: r.type || '', blob: r.data ? new Blob([r.data], { type: r.type }) : r.blob }));
    } catch (err) {
      return [];
    }
  }

  const fmt = (b) => b < KB * KB ? Math.round(b / KB) + ' КБ' : (b / KB / KB).toFixed(1).replace('.', ',') + ' МБ';

  function row(title) {
    const li = document.createElement('li');
    li.textContent = title;
    const small = document.createElement('small');
    small.textContent = 'ждёт';
    li.append(small);
    $('#list').append(li);
    return { li, small };
  }

  async function run() {
    $('#run').disabled = true;
    $('#list').textContent = '';

    const tests = [
      ['Только текст, 2 КБ', () => form(null, 'x'.repeat(2000))],
      ['Файл 50 КБ', () => form(new File([junk(50 * KB)], 'diag-50.webm', { type: 'audio/webm' }))],
      ['Файл 300 КБ', () => form(new File([junk(300 * KB)], 'diag-300.webm', { type: 'audio/webm' }))],
      ['Файл 1 МБ', () => form(new File([junk(KB * KB)], 'diag-1m.webm', { type: 'audio/webm' }))]
    ];
    const mine = (await clips()).slice(0, 3);
    for (const c of mine) {
      let size = 0;
      try { size = (await c.blob.arrayBuffer()).byteLength; } catch (err) { size = -1; }
      if (size < 0) { tests.push([`Ваша запись ${c.q} — не читается из хранилища`, null]); continue; }
      const mp4 = /mp4/.test(c.type);
      const name = `${c.q}.${mp4 ? 'mp4' : 'webm'}`;
      tests.push([`Ваша запись ${c.q} (${c.type || 'тип неизвестен'}, ${fmt(size)}) как ${mp4 ? 'video/mp4' : 'audio/webm'}`,
        async () => form(new File([await c.blob.arrayBuffer()], name, { type: mp4 ? 'video/mp4' : 'audio/webm' }))]);
      tests.push([`Та же запись как application/octet-stream`,
        async () => form(new File([await c.blob.arrayBuffer()], name, { type: 'application/octet-stream' }))]);
    }
    if (!mine.length) row('Записей в черновике нет — запишите пару ответов в брифе и вернитесь сюда').small.textContent = '';

    for (let i = 0; i < tests.length; i++) {
      const [title, make] = tests[i];
      const r = row(title);
      if (!make) { r.li.className = 'is-fail'; r.small.textContent = 'запись повреждена'; continue; }
      if (i && GAP_MS > 1000) { r.small.textContent = 'пауза 6 с…'; await new Promise((res) => setTimeout(res, GAP_MS)); }
      r.small.textContent = 'отправляю…';
      const res = await post(await make());
      const ok = res.status > 0;
      r.li.className = ok ? 'is-ok' : 'is-fail';
      r.small.textContent = ok
        ? `дошло: сервер ответил ${res.status} за ${(res.ms / 1000).toFixed(1)} с`
        : `не дошло: ${res.text}, ушло ${Math.round(res.sent * 100)}% за ${(res.ms / 1000).toFixed(1)} с`;
    }
    $('#run').disabled = false;
    $('#run').textContent = 'Проверить ещё раз';
  }

  const mr = window.MediaRecorder && MediaRecorder.isTypeSupported;
  $('#env').textContent = [
    'сервер: ' + (TARGET === 'forminit' ? 'Forminit' : 'brief.snegur.space'),
    navigator.userAgent,
    'webm/opus: ' + (mr ? MediaRecorder.isTypeSupported('audio/webm;codecs=opus') : 'нет MediaRecorder'),
    'mp4: ' + (mr ? MediaRecorder.isTypeSupported('audio/mp4') : '—')
  ].join(' · ');
  $('#run').addEventListener('click', run);
})();
