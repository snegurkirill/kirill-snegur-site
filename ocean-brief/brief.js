/* ---------------------------------------------------------------------------
   Бриф — /ocean-brief
   Экраны строятся из data.js: приветствие, вопросы, заставки групп и финал.
   Виден один экран, переходы — классами is-past / is-on (brief.css). Ответы и
   записи голоса — черновик в IndexedDB этого браузера; на финале бриф
   уходит в Forminit одной отправкой по кнопке «Отправить».
   --------------------------------------------------------------------------- */

(() => {
  'use strict';

  /* Куда уходит бриф — по порядку, пока какой-то не примет. 'beget' — свой
     обработчик на российском хостинге (_api/ в репозитории): из российских
     сетей соединения с Forminit (AWS CloudFront) рвутся после ~16 КБ, и записи
     голоса не доходили. Всё — только на своём хостинге: Forminit не берёт записи
     с iPhone. Код для него оставлен: ['beget', 'forminit'] — запасной после
     своего, ['forminit'] — только он. */
  const TRANSPORTS = ['beget'];
  const ENDPOINTS = {
    beget: 'https://brief.snegur.space/submit.php',
    forminit: 'https://forminit.com/f/qa4fs1lrrc9'
  };

  // Forminit form: inputs are named fi-{type}-{name}. Rules: https://forminit.com/setup.md
  // Здесь полей в разметке нет: FormData собирает formOf(). Ответ — fi-text-q1_1_3,
  // записи к нему — fi-file-q1_1_3_audio[] (имя должно отличаться от текстового),
  // кто заполняет — fi-text-respondent (не fi-sender-fullName: запятая в «Анна, директор»
  // отклонила бы всю отправку).
  const FIELD_ERRORS = {
    audio: 'Сервис не принял одну из записей. Запишите её ещё раз или ответьте текстом.'
  };

  // На localhost и с ?test ничего не уходит: отправка подменяется, а в шапке
  // горит плашка. ?live на localhost шлёт по-настоящему — проверить обработчик.
  const QS = new URLSearchParams(location.search);
  const TEST = (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || QS.has('test')) && !QS.has('live');

  const MAX_CLIP_MS = 5 * 60 * 1000;          // одна запись — до 5 минут
  const MIN_CLIP_MS = 700;                    // короче — случайное нажатие
  // Пачка: Forminit — до 25 МБ и 20 файловых полей, 1 запрос в 5 с с одного IP;
  // PHP на хостинге — до 20 файлов (max_file_uploads) и post_max_size.
  const LIMITS = {
    beget: { bytes: 15 * 1024 * 1024, files: 18, fields: 99, gap: 0 },
    forminit: { bytes: 24 * 1024 * 1024, files: 999, fields: 20, gap: 6000 }
  };
  const TOUCH = matchMedia('(hover: none), (pointer: coarse)').matches;
  const CAN_RECORD = !!(window.isSecureContext && navigator.mediaDevices &&
                        navigator.mediaDevices.getUserMedia && window.MediaRecorder);

  const B = window.BRIEF;
  const $ = (sel, root = document) => root.querySelector(sel);

  /* --- иконки ------------------------------------------------------------ */

  const ICON = {
    mic: '<svg class="bf-ico-mic" width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><rect x="6" y="1.5" width="6" height="10" rx="3" fill="currentColor"/><path d="M3.5 8.5a5.5 5.5 0 0 0 11 0M9 14v2.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    stop: '<svg class="bf-ico-stop" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><rect x="1" y="1" width="12" height="12" rx="2" fill="currentColor"/></svg>',
    play: '<svg class="bf-ico-play" width="10" height="12" viewBox="0 0 10 12" aria-hidden="true"><path d="M1 1v10l8.5-5z" fill="currentColor"/></svg>',
    pause: '<svg class="bf-ico-pause" width="10" height="12" viewBox="0 0 10 12" aria-hidden="true"><path d="M1.5 1h2.5v10H1.5zM6 1h2.5v10H6z" fill="currentColor"/></svg>',
    del: '<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M1.5 1.5l7 7m0-7-7 7" stroke="currentColor" stroke-width="1.5"/></svg>',
    back: '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>'
  };

  /* --- черновик: IndexedDB, а без неё — только память вкладки -------------- */

  const store = (() => {
    let dbp = null;
    function open() {
      if (!dbp) {
        dbp = new Promise((resolve, reject) => {
          if (!('indexedDB' in window)) { reject(new Error('no indexedDB')); return; }
          const req = indexedDB.open('ocean-brief', 1);
          req.onupgradeneeded = () => {
            req.result.createObjectStore('kv');
            req.result.createObjectStore('clips', { keyPath: 'id' });
          };
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
      }
      return dbp;
    }
    async function run(name, mode, fn) {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(name, mode);
        const req = fn(tx.objectStore(name));
        let out;
        if (req) req.onsuccess = () => { out = req.result; };
        tx.oncomplete = () => resolve(out);
        tx.onerror = tx.onabort = () => reject(tx.error);
      });
    }
    return {
      get: (k) => run('kv', 'readonly', (s) => s.get(k)),
      set: (k, v) => run('kv', 'readwrite', (s) => s.put(v, k)),
      // Записи лежат байтами, не Blob: Safari на iOS отдаёт Blob из IndexedDB
      // пустым или нечитаемым, и отправка такой записи падает.
      clips: async () => (await run('clips', 'readonly', (s) => s.getAll()))
        .map((r) => r.blob ? r : Object.assign(r, { blob: new Blob([r.data], { type: r.type }) })),
      // Записи из первых версий лежат Blob'ом: пробуем прочитать и переложить
      // байтами; нечитаемые убираем — их всё равно нельзя отправить.
      migrate: async (rows) => {
        const out = [];
        for (const r of rows) {
          if (!r.data) {
            try {
              r.blob = new Blob([await r.blob.arrayBuffer()], { type: r.type });
              await store.putClip(r);
            } catch (err) {
              console.warn('Запись не читается, убрана:', r.id, err);
              await store.delClip(r.id).catch(() => {});
              lostClips.push(r.q);
              continue;
            }
          }
          out.push(r);
        }
        return out;
      },
      putClip: async (c) => {
        const data = await c.blob.arrayBuffer();
        return run('clips', 'readwrite', (s) => s.put({ id: c.id, q: c.q, type: c.type, ms: c.ms, at: c.at, data }));
      },
      delClip: (id) => run('clips', 'readwrite', (s) => s.delete(id))
    };
  })();

  const lostClips = [];   // вопросы, чьи старые записи не прочитались
  let persistent = true;
  function persist(promise) {
    promise.catch((err) => {
      if (persistent) console.warn('Черновик не сохраняется:', err);
      persistent = false;
      const n = $('#draft-note');
      if (n) n.hidden = false;
    });
  }

  const state = { answers: {}, clips: [], sent: null, pos: 0 };

  let saveTimer = 0;
  function saveAnswers() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => persist(store.set('answers', state.answers)), 300);
  }

  /* --- экраны ------------------------------------------------------------ */

  const questions = [];   // все вопросы по порядку, с разделом и группой
  const screens = [];     // { type, el, ... }

  for (const section of B.sections) {
    for (const group of section.groups) {
      for (const q of group.questions) questions.push(Object.assign({ section, group }, q));
    }
  }

  function el(tag, cls, html) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (html != null) node.innerHTML = html;
    return node;
  }
  function text(tag, cls, str) {
    const node = el(tag, cls);
    node.textContent = str;
    return node;
  }
  function button(label, cls, attrs = {}) {
    const b = el('button', cls);
    b.type = 'button';
    b.textContent = label;
    for (const [k, v] of Object.entries(attrs)) b.setAttribute(k, v);
    return b;
  }
  // «‹» — на экран назад: если Enter нажали случайно, ответ остаётся на месте.
  function backButton() {
    const b = el('button', 'bf-btn bf-btn--ghost bf-btn--back', ICON.back);
    b.type = 'button';
    b.dataset.back = '';
    b.setAttribute('aria-label', 'Назад');
    return b;
  }
  function okButton(label = 'Далее') {
    const wrap = el('div', 'bf-actions');
    const b = el('button', 'bf-btn', `${label} <small>↵</small>`);
    b.type = 'button';
    b.dataset.next = '';
    wrap.append(backButton(), b);
    return wrap;
  }

  function screen(type, extra = {}) {
    const node = el('section', 'bf-screen');
    node.inert = true;
    const card = el('div', 'bf-card');
    card.tabIndex = -1;
    node.append(card);
    $('#stage').append(node);
    const s = Object.assign({ type, el: node, card }, extra);
    screens.push(s);
    return s;
  }

  function buildWelcome() {
    const s = screen('welcome');
    s.card.append(text('h1', 'bf-h', B.title));
    // Подсказка — только там, где кнопки микрофона не будет.
    if (!CAN_RECORD) {
      const why = !window.isSecureContext ? 'страница открыта не по защищённому соединению'
        : !(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) ? 'браузер не даёт доступа к микрофону'
        : 'браузер не умеет записывать звук';
      s.card.append(text('p', 'bf-text bf-text--aux', `Запись голоса недоступна: ${why}. Ответить можно текстом.`));
    }

    const note = text('p', 'bf-text bf-text--aux', 'Черновик в этом браузере не сохраняется, например в приватном режиме. Лучше заполнить бриф за один раз.');
    note.id = 'draft-note';
    note.hidden = true;
    s.card.append(note);

    // «Начать», а у вернувшегося — «Продолжить» и рядом, куда она ведёт.
    const actions = el('div', 'bf-actions');
    const start = el('button', 'bf-btn', 'Начать <small>↵</small>');
    start.type = 'button';
    start.dataset.next = '';
    start.id = 'start';
    const where = text('p', 'bf-label', '');
    where.id = 'resume-at';
    where.hidden = true;
    actions.append(start, where);
    s.card.append(actions);
  }

  // Куда ведёт «Продолжить»: вопрос целиком, заставка группы или отправка.
  function describe(s) {
    if (s.type === 'q') return (s.q.label ? s.q.label + '. ' : '') + s.q.text;
    if (s.type === 'cover') return s.card.querySelector('.bf-h').textContent;
    if (s.type === 'done') return 'К отправке';
    return '';
  }

  // Заставка перед каждой группой — «Открытая витрина: Предназначение»;
  // у раздела без групп — его название.
  function buildCover(section, group) {
    const s = screen('cover', { section });
    s.card.append(text('h2', 'bf-h', group && group.title ? `${section.title}: ${group.title}` : section.title));
    s.card.append(okButton('Начать'));
  }

  function buildQuestion(q) {
    const s = screen('q', { q });
    const meta = el('p', 'bf-meta bf-label');
    meta.append(text('b', '', q.id));
    // Номер — только у вопроса; раздел и группа — названиями.
    const where = [q.section.title];
    if (q.group.title) where.push(q.group.title);
    if (q.kind !== 'name') meta.append(text('span', '', where.join(' · ')));
    s.card.append(meta);

    if (q.lead) {
      const lead = el('ul', 'bf-lead');
      for (const [term, def] of q.lead) {
        const li = el('li');
        li.append(text('b', '', term), document.createTextNode(' — ' + def));
        lead.append(li);
      }
      s.card.append(lead);
    }

    const h = el('h2', 'bf-q');
    h.id = 'q-' + q.id;
    if (q.label) h.append(text('span', 'bf-q__label', q.label + '. '));
    h.append(document.createTextNode(q.text));
    s.card.append(h);

    const field = el('div', 'bf-field');
    const input = el('textarea', 'bf-input');
    input.rows = 1;
    input.maxLength = 5000;                       // лимит поля fi-text-* в Forminit
    input.placeholder = q.kind === 'name' ? 'Имя и роль' : 'Написать';
    input.setAttribute('aria-labelledby', h.id);
    input.dataset.q = q.id;
    field.append(input);

    if (q.kind !== 'name' && CAN_RECORD) {
      const live = el('p', 'bf-rec');
      live.append(document.createTextNode('Запись · '), text('span', 'bf-rec__time', '0:00'), document.createTextNode(' из 5:00'));
      const mic = el('button', 'bf-mic', ICON.mic + ICON.stop);
      mic.type = 'button';
      mic.dataset.mic = q.id;
      mic.setAttribute('aria-label', 'Записать ответ голосом');
      mic.setAttribute('aria-pressed', 'false');
      field.append(live, el('div', 'bf-clips'), mic);
      field.classList.add('has-mic');
    } else {
      field.style.paddingRight = '14px';
    }
    s.card.append(field);

    const note = el('p', 'bf-note bf-label');
    note.setAttribute('role', 'status');
    s.card.append(note);

    s.card.append(okButton());

    Object.assign(s, { field, input, note });
    byQ[q.id] = s;
  }

  // Финал: сводка и кнопка «Отправить». После ошибки рядом появляется
  // «Отправить без записей» — чтобы текст дошёл, даже если записи не уходят.
  function buildDone() {
    const s = screen('done');
    const h = text('h2', 'bf-h', '');
    const lead = text('p', 'bf-text', '');
    const status = el('p', 'bf-note bf-label bf-status');
    status.setAttribute('role', 'status');
    const actions = el('div', 'bf-actions');
    const send = button('Отправить', 'bf-btn', { 'data-send': '1' });
    const sendText = button('Отправить без записей', 'bf-btn bf-btn--ghost', { 'data-send-text': '1' });
    sendText.hidden = true;
    actions.append(backButton(), send, sendText);
    s.card.append(h, lead, actions, status);
    s.sendText = sendText;
    Object.assign(s, { h, lead, send, status });
  }

  const byQ = {};
  buildWelcome();
  for (const section of B.sections) {
    const titled = section.groups.some((g) => g.title);
    if (section.cover && !titled) buildCover(section);
    for (const group of section.groups) {
      if (section.cover && group.title) buildCover(section, group);
      for (const q of group.questions) buildQuestion(questions.find((x) => x.id === q.id));
    }
  }
  buildDone();

  /* --- переходы ---------------------------------------------------------- */

  const progress = $('#progress');

  function go(i, opts = {}) {
    i = Math.max(0, Math.min(screens.length - 1, i));
    menu.close();
    if (recorder.active) recorder.stop();
    player.stop();
    state.pos = i;
    screens.forEach((s, k) => {
      s.el.classList.toggle('is-on', k === i);
      s.el.classList.toggle('is-past', k < i);
      s.el.inert = k !== i;
    });
    const s = screens[i];
    s.el.scrollTop = 0;
    progress.style.width = (i / (screens.length - 1) * 100) + '%';
    document.body.classList.toggle('is-welcome', s.type === 'welcome');
    if (s.type === 'done') onDone();
    if (s.type === 'q') autosize(s.input);
    if (!opts.silent) persist(store.set('pos', i));
    // На телефоне фокус на поле сразу открыл бы клавиатуру: фокусируем карточку.
    setTimeout(() => {
      if (state.pos !== i) return;
      if (s.input && !TOUCH) s.input.focus({ preventScroll: true });
      else s.card.focus({ preventScroll: true });
    }, opts.instant ? 0 : 350);
  }

  /* Меню: кнопка с двумя чертами открывает список всех вопросов по группам.
     Заголовок группы — с номером, вопрос — без: блок зелёный, если на него
     есть ответ текстом или записью, иначе чёрный. Клик по блоку открывает
     вопрос. Открытое меню закрывает та же кнопка — она становится крестиком. */
  const menu = (() => {
    const box = $('#menu');
    const list = $('#menu-list');
    const btn = $('#menu-btn');
    const blocks = {};
    let group = null;
    for (const q of questions) {
      if (q.group !== group) {
        group = q.group;
        const title = q.group.title ? `${q.section.title}: ${q.group.title}` : q.section.title;
        const no = q.group.no || q.section.no;
        const h = el('p', 'bf-menu__group');
        h.append(text('span', 'bf-label', no), document.createTextNode(' ' + title));
        list.append(h);
      }
      const b = el('button', 'bf-menu__q');
      b.type = 'button';
      b.dataset.jump = q.id;
      b.textContent = (q.label ? q.label + '. ' : '') + q.text;
      list.append(b);
      blocks[q.id] = b;
    }
    const answered = (qid) => !!((state.answers[qid] || '').trim() || state.clips.some((c) => c.q === qid));
    function open() {
      const cur = screens[state.pos];
      for (const [qid, b] of Object.entries(blocks)) {
        b.classList.toggle('is-done', answered(qid));
        b.classList.toggle('is-current', cur.type === 'q' && cur.q.id === qid);
        b.setAttribute('aria-label', b.textContent + (answered(qid) ? ' — есть ответ' : ' — без ответа'));
      }
      box.hidden = false;
      $('#stage').inert = true;
      btn.setAttribute('aria-expanded', 'true');
      btn.setAttribute('aria-label', 'Закрыть список');
      document.body.classList.add('is-menu');
      const target = list.querySelector('.is-current') || list.querySelector('.bf-menu__q');
      target.scrollIntoView({ block: 'center' });
      target.focus({ preventScroll: true });
    }
    function close() {
      if (box.hidden) return;
      box.hidden = true;
      $('#stage').inert = false;
      btn.setAttribute('aria-expanded', 'false');
      btn.setAttribute('aria-label', 'Все вопросы');
      document.body.classList.remove('is-menu');
    }
    btn.addEventListener('click', () => (box.hidden ? open() : close()));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    return { close, isOpen: () => !box.hidden };
  })();

  document.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if ('next' in t.dataset) go(state.pos + 1);
    else if ('back' in t.dataset) go(state.pos - 1);
    else if (t.dataset.jump) go(screens.indexOf(byQ[t.dataset.jump]));
    else if (t.dataset.go) go(Number(t.dataset.go));
    else if (t.dataset.mic) recorder.toggle(t.dataset.mic);
    else if (t.dataset.sendText) sendAll({ noAudio: true });
    else if (t.dataset.send) sendAll();
    else if (t.dataset.play) player.toggle(t.dataset.play, t);
    else if (t.dataset.del) removeClip(t.dataset.del);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing || e.altKey || e.metaKey || e.ctrlKey) return;
    if (menu.isOpen()) return;
    const t = e.target;
    if (t.matches && t.matches('textarea')) {
      if (TOUCH) return;                       // на телефоне Enter — перенос строки
      e.preventDefault();
      go(state.pos + 1);
    } else if (!(t.closest && t.closest('button, a'))) {
      // Enter вне поля — главная кнопка экрана: OK, «Начать», «Продолжить».
      const primary = screens[state.pos].card.querySelector('.bf-btn:not(.bf-btn--ghost):not([hidden]):not([disabled])');
      if (primary) { e.preventDefault(); primary.click(); }
    }
  });

  /* --- поле ответа ------------------------------------------------------- */

  function autosize(input) {
    input.style.height = 'auto';
    input.style.height = input.scrollHeight + 'px';
  }

  document.addEventListener('input', (e) => {
    const t = e.target;
    if (!t.dataset || !t.dataset.q) return;
    state.answers[t.dataset.q] = t.value;
    autosize(t);
    saveAnswers();
  });

  function note(qid, msg, isError) {
    const s = byQ[qid];
    if (!s) return;
    s.note.textContent = msg || '';
    s.note.classList.toggle('is-error', !!isError);
  }

  /* --- записи голоса ----------------------------------------------------- */

  function fmt(ms) {
    const sec = Math.round(ms / 1000);
    return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
  }
  function mb(bytes) {
    return (bytes / 1024 / 1024).toLocaleString('ru-RU', { maximumFractionDigits: 1, minimumFractionDigits: 1 }) + ' МБ';
  }
  function plural(n, one, few, many) {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
    return many;
  }

  function pickMime() {
    const list = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4'];
    return list.find((t) => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) || '';
  }

  const recorder = {
    active: null,   // { q, mr, stream, chunks, t0, tick, limit, done }

    async toggle(qid) {
      if (this.active) {
        const same = this.active.q === qid;
        await this.stop();
        if (same) return;
      }
      await this.start(qid);
    },

    async start(qid) {
      const s = byQ[qid];
      note(qid, '');
      player.stop();
      let stream;
      try {
        // Шумоподавление и эхоподавление браузера дают «подводный», рваный голос,
        // а эха нет: во время записи ничего не звучит. Автоусиление оставлено —
        // оно выравнивает тихий голос.
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: true }
        });
      } catch (err) {
        console.warn('Микрофон:', err);
        note(qid, err && err.name === 'NotAllowedError'
          ? 'Нет доступа к микрофону. Разрешите его в настройках браузера и нажмите ещё раз.'
          : 'Не удалось включить микрофон. Можно ответить текстом.', true);
        return;
      }
      if (state.pos !== screens.indexOf(s)) { stream.getTracks().forEach((t) => t.stop()); return; }

      const mime = pickMime();
      let mr;
      try {
        // Opus звучит чисто с 64 кбит/с, AAC (Safari) на тех же битах хуже — ему 96.
        const bits = /mp4/.test(mime) ? 96000 : 64000;
        mr = new MediaRecorder(stream, Object.assign({ audioBitsPerSecond: bits }, mime ? { mimeType: mime } : {}));
      } catch (err) {
        stream.getTracks().forEach((t) => t.stop());
        note(qid, 'Запись в этом браузере не работает. Можно ответить текстом.', true);
        return;
      }
      const rec = { q: qid, mr, stream, chunks: [], t0: Date.now(), mime };
      rec.done = new Promise((resolve) => { mr.onstop = () => resolve(); });
      mr.ondataavailable = (e) => { if (e.data && e.data.size) rec.chunks.push(e.data); };
      mr.start(1000);
      this.active = rec;

      const time = $('.bf-rec__time', s.field);
      const mic = $('.bf-mic', s.field);
      s.field.classList.add('is-rec');
      s.input.readOnly = true;
      mic.setAttribute('aria-pressed', 'true');
      mic.setAttribute('aria-label', 'Остановить запись');
      s.field.querySelectorAll('.bf-clip button').forEach((b) => { b.disabled = true; });
      time.textContent = '0:00';
      rec.tick = setInterval(() => { time.textContent = fmt(Date.now() - rec.t0); }, 250);
      rec.limit = setTimeout(() => {
        this.stop();
        note(qid, 'Запись остановлена на 5 минутах. Нажмите микрофон, чтобы продолжить второй записью.');
      }, MAX_CLIP_MS);
    },

    async stop() {
      const rec = this.active;
      if (!rec) return;
      this.active = null;
      clearInterval(rec.tick);
      clearTimeout(rec.limit);
      const ms = Date.now() - rec.t0;
      if (rec.mr.state !== 'inactive') rec.mr.stop();
      await rec.done;
      rec.stream.getTracks().forEach((t) => t.stop());

      const s = byQ[rec.q];
      const mic = $('.bf-mic', s.field);
      s.field.classList.remove('is-rec');
      s.input.readOnly = false;
      mic.setAttribute('aria-pressed', 'false');
      mic.setAttribute('aria-label', 'Записать ответ голосом');

      if (ms < MIN_CLIP_MS || !rec.chunks.length) {
        renderClips(rec.q);
        note(rec.q, 'Запись слишком короткая: нажмите микрофон, говорите, затем нажмите стоп.');
        return;
      }
      const type = rec.mr.mimeType || rec.mime || 'audio/webm';
      const clip = { id: rec.q + '-' + Date.now(), q: rec.q, blob: new Blob(rec.chunks, { type }), type, ms, at: Date.now() };
      state.clips.push(clip);
      persist(store.putClip(clip));
      renderClips(rec.q);
    }
  };

  const player = {
    audio: null, url: '', id: '', btn: null,
    toggle(id, btn) {
      if (this.id === id) { this.stop(); return; }
      this.stop();
      const clip = state.clips.find((c) => c.id === id);
      if (!clip) return;
      this.url = URL.createObjectURL(clip.blob);
      this.audio = new Audio(this.url);
      this.id = id;
      this.btn = btn;
      btn.closest('.bf-clip').classList.add('is-playing');
      this.audio.addEventListener('ended', () => this.stop());
      this.audio.play().catch(() => this.stop());
    },
    stop() {
      if (this.audio) this.audio.pause();
      if (this.url) URL.revokeObjectURL(this.url);
      if (this.btn) this.btn.closest('.bf-clip').classList.remove('is-playing');
      this.audio = null; this.url = ''; this.id = ''; this.btn = null;
    }
  };

  function clipsOf(qid) {
    return state.clips.filter((c) => c.q === qid).sort((a, b) => a.at - b.at);
  }

  function renderClips(qid) {
    const s = byQ[qid];
    const box = s && $('.bf-clips', s.field);
    if (!box) return;
    box.textContent = '';
    clipsOf(qid).forEach((c, k) => {
      const chip = el('span', 'bf-clip');
      const play = el('button', 'bf-clip__play', ICON.play + ICON.pause);
      play.type = 'button';
      play.dataset.play = c.id;
      play.setAttribute('aria-label', `Прослушать запись ${k + 1}, ${fmt(c.ms)}`);
      play.append(text('span', '', fmt(c.ms)));
      const del = el('button', 'bf-clip__del', ICON.del);
      del.type = 'button';
      del.dataset.del = c.id;
      del.setAttribute('aria-label', `Удалить запись ${k + 1}`);
      chip.append(play, del);
      box.append(chip);
    });
  }

  function removeClip(id) {
    const clip = state.clips.find((c) => c.id === id);
    if (!clip || !confirm('Удалить эту запись?')) return;
    if (player.id === id) player.stop();
    state.clips = state.clips.filter((c) => c.id !== id);
    persist(store.delClip(id));
    renderClips(clip.q);
  }

  /* --- отправка ----------------------------------------------------------
     Бриф уходит одной отправкой по кнопке «Отправить» на финале. Ответ —
     fi-text-q1_1_3, записи к нему — сразу под ним, fi-file-q1_1_3_audio[]: в
     кабинете Forminit файл стоит под своим вопросом (имя файла сервис меняет
     на своё). Больше 24 МБ или 20 вопросов с записями — несколько пачек.

     Отправляем сами, XMLHttpRequest'ом: SDK Forminit — тот же POST через fetch.
     Для 'beget' поля свои (submit.php): payload — JSON с ответами и подписями
     вопросов, audio[q1_1_3][] — записи. Ответ у обоих — { success, submission }. */

  const trap = $('#trap');
  let sending = false;
  let draftId = '';   // один на браузер: связывает отправки одного человека
  const lastSendAt = {};   // по сервису: у Forminit без ключа — 1 запрос в 5 с

  const fieldOf = (qid) => 'q' + qid.replace(/\./g, '_');

  function briefData() {
    const qs = questions.filter((q) => q.kind !== 'name');
    const clips = qs.flatMap((q) => clipsOf(q.id));
    const answered = qs.filter((q) => (state.answers[q.id] || '').trim() || clips.some((c) => c.q === q.id)).length;
    const bytes = clips.reduce((n, c) => n + c.blob.size, 0);
    const texts = [state.answers['0.0.0'] || '', qs.map((q) => state.answers[q.id] || '')];
    return { qs, clips, answered, bytes, sig: JSON.stringify([texts, clips.map((c) => c.id)]), textSig: JSON.stringify(texts) };
  }

  // empty — нечего отправлять; sent — отправлено как есть; textonly — ушёл
  // только текст; changed — после отправки что-то поменяли; new — не отправляли.
  function doneKey(d) {
    if (!d.answered) return 'empty';
    if (state.sent && state.sent.sig === d.sig) return 'sent';
    if (state.sent && state.sent.noAudio && state.sent.textSig === d.textSig) return 'textonly';
    return state.sent ? 'changed' : 'new';
  }

  // Записи идут по порядку вопросов; пачка — до 24 МБ и до 20 вопросов с файлами.
  function batchesOf(clips, lim) {
    const batches = [{ clips: [], fields: new Set(), bytes: 0 }];
    for (const c of clips) {
      let b = batches[batches.length - 1];
      const full = b.bytes + c.blob.size > lim.bytes || b.clips.length >= lim.files ||
        (!b.fields.has(c.q) && b.fields.size >= lim.fields);
      if (b.clips.length && full) { b = { clips: [], fields: new Set(), bytes: 0 }; batches.push(b); }
      b.clips.push(c);
      b.fields.add(c.q);
      b.bytes += c.blob.size;
    }
    return batches;
  }

  const labelOf = (q) => [q.section.title, q.group.title, (q.label ? q.label + '. ' : '') + q.text].filter(Boolean).join(' · ');

  function formOf(d, batch, i, n, sendId, t) {
    if (t === 'beget') {
      const fd = new FormData();
      fd.append('payload', JSON.stringify({
        draft: draftId, send: sendId, batch: { i, n },
        respondent: (state.answers['0.0.0'] || '').trim(),
        answers: i === 0 ? d.qs.map((q) => ({ id: q.id, label: labelOf(q), text: state.answers[q.id] || '' })) : []
      }));
      for (const c of batch.clips) fd.append(`audio[${fieldOf(c.q)}][]`, fileOf(c, clipsOf(c.q).indexOf(c) + 1));
      fd.append('_gotcha', trap.value);
      return fd;
    }
    const fd = new FormData();
    fd.append('fi-text-respondent', (state.answers['0.0.0'] || '').trim());
    if (n > 1) fd.append('fi-text-batch', `${i + 1} из ${n}`);
    for (const q of d.qs) {
      if (i === 0) fd.append('fi-text-' + fieldOf(q.id), state.answers[q.id] || '');
      const all = clipsOf(q.id);
      for (const c of batch.clips) if (c.q === q.id) fd.append(`fi-file-${fieldOf(q.id)}_audio[]`, fileOf(c, all.indexOf(c) + 1));
    }
    fd.append('_gotcha', trap.value);   // ловушка Forminit для ботов
    return fd;
  }

  function summary(d) {
    return `Ответов: ${d.answered} из ${d.qs.length}` +
      (d.clips.length ? ` · ${d.clips.length} ${plural(d.clips.length, 'запись', 'записи', 'записей')}, ${mb(d.bytes)}` : '');
  }

  const when = (t) => new Date(t).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

  // phase: 'sending' | 'error' | undefined — тогда по состоянию черновика.
  function renderDone(phase, msg, code) {
    const s = screens[screens.length - 1];
    const d = briefData();
    const key = doneKey(d);
    let h, lead, status = '', send = '', sendText = false;
    if (phase === 'sending') {
      h = 'Отправляем бриф…'; lead = summary(d); status = msg || '';
    } else if (phase === 'error') {
      h = 'Не получилось отправить'; lead = msg; status = code ? 'Код ошибки: ' + code : '';
      send = 'Отправить ещё раз'; sendText = d.clips.length > 0;
    } else if (key === 'empty') {
      h = 'Ответов пока нет'; lead = 'Вернитесь к вопросам и ответьте хотя бы на один.';
    } else if (key === 'sent') {
      h = 'Спасибо!'; lead = 'Бриф отправлен. Если захотите что-то дополнить — вернитесь к вопросам и отправьте снова.';
      status = 'Отправлено ' + when(state.sent.at);
    } else if (key === 'textonly') {
      h = 'Текст отправлен'; lead = 'Ответы текстом дошли, записи голоса — нет. Можно попробовать отправить всё ещё раз.';
      status = 'Отправлено ' + when(state.sent.at); send = 'Отправить с записями';
    } else {
      h = key === 'changed' ? 'Ответы изменились' : 'Бриф готов';
      lead = summary(d); send = key === 'changed' ? 'Отправить снова' : 'Отправить';
    }
    s.h.textContent = h;
    s.lead.textContent = lead;
    s.send.hidden = !send;
    if (send) s.send.textContent = send;
    s.sendText.hidden = !sendText;
    setStatus(s.status, status, (key === 'sent' || key === 'textonly') && !phase ? 'sent' : '');
  }

  function onDone() {
    if (!sending) renderDone();
  }

  function setStatus(node, msg, key) {
    node.textContent = msg || '';
    node.classList.toggle('is-sent', key === 'sent');
    node.classList.toggle('is-error', key === 'error');
  }

  // Forminit names the failing field in error.fieldName or, today, as the first quoted word of error.message
  function errorText(error) {
    const field = (error && error.fieldName) || ((/['"]([^'"]+)['"]/.exec((error && error.message) || '') || [])[1]);
    if (field && FIELD_ERRORS[field]) return FIELD_ERRORS[field];
    if (field && /_audio$/.test(field)) return FIELD_ERRORS.audio;
    if (error && error.error === 'TOO_MANY_REQUESTS') return 'Подождите несколько секунд и отправьте ещё раз.';
    // С некоторыми VPN сервер брифа недоступен совсем; ответы при этом целы.
    return 'Ответы сохранены в этом браузере. Если включён VPN — выключите его и отправьте ещё раз. Если нет — проверьте интернет.';
  }

  function fileOf(clip, k) {
    // Forminit принимает audio/webm и video/mp4; запись Safari (audio/mp4) уходит как mp4.
    const mp4 = /mp4/.test(clip.type);
    return new File([clip.blob], `${clip.q}-${k}.${mp4 ? 'mp4' : 'webm'}`, { type: mp4 ? 'video/mp4' : 'audio/webm' });
  }

  // Тот же ответ, что у SDK: { data } с hashId при успехе, иначе { error } с кодом.
  // error.transport — сервис не ответил по-человечески (обрыв, таймаут, 5xx,
  // страница вместо JSON): тогда стоит попробовать следующий из TRANSPORTS.
  function post(fd, onProgress, t) {
    if (TEST) {
      if (QS.get('fail') === t) return Promise.resolve({ error: { error: 'NETWORK_ERROR', code: 0, message: '', sent: 0, ms: 0, transport: true } });
      console.info('[тест] отправка', ENDPOINTS[t], [...fd.entries()]
        .map(([k, v]) => [k, v instanceof File ? `${v.name} (${v.type}, ${v.size} Б)` : v]));
      return new Promise((r) => setTimeout(() => r({ data: { hashId: 'test' } }), 700));
    }
    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      const t0 = Date.now();
      let sent = 0;   // доля тела, ушедшая на сервер, — для диагностики обрыва
      const fail = (code) => resolve({ error: { error: code, code: 0, message: '', sent, ms: Date.now() - t0, transport: true } });
      xhr.open('POST', ENDPOINTS[t]);
      xhr.setRequestHeader('Accept', 'application/json');
      xhr.timeout = 5 * 60 * 1000;
      xhr.upload.onprogress = (e) => {
        if (!e.lengthComputable) return;
        sent = e.loaded / e.total;
        if (onProgress) onProgress(sent);
      };
      xhr.onload = () => {
        let body = null;
        try { body = JSON.parse(xhr.responseText); } catch (err) { /* не JSON — заглушка хостинга, VPN или прокси */ }
        if (!body || typeof body !== 'object') { fail(`BAD_RESPONSE_${xhr.status}`); return; }
        if (xhr.status >= 200 && xhr.status < 300 && body.success !== false) { resolve({ data: body.submission }); return; }
        resolve({ error: {
          error: body.error || 'HTTP_ERROR', code: body.code || xhr.status, message: body.message || '', fieldName: body.fieldName,
          transport: xhr.status >= 500 || xhr.status === 429
        } });
      };
      xhr.onerror = () => fail('NETWORK_ERROR');
      xhr.ontimeout = () => fail('TIMEOUT');
      xhr.send(fd);
    });
  }

  // Одна попытка через сервис t; null — всё дошло, иначе { error, code }.
  async function sendVia(t, d, clips, s) {
    const lim = LIMITS[t];
    const batches = batchesOf(clips, lim);
    const sendId = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    for (let i = 0; i < batches.length; i++) {
      const fd = formOf(d, batches[i], i, batches.length, sendId, t);
      const step = batches.length > 1 ? `Пачка ${i + 1} из ${batches.length}` : '';
      const wait = (lastSendAt[t] || 0) + lim.gap - Date.now();
      if (wait > 0) { renderDone('sending', step); await new Promise((r) => setTimeout(r, wait)); }
      renderDone('sending', step);
      lastSendAt[t] = Date.now();
      const { data, error } = await post(fd, (p) => {
        if (batches[i].clips.length) setStatus(s.status, (step ? step + ' · ' : '') + Math.round(p * 100) + '%');
      }, t);
      if (!error && typeof (data && data.hashId) === 'string') continue;
      // Обрыв без ответа сервера: что уходило и докуда дошло — по этой строке
      // со скриншота видно, где ломается (формат, размер, сеть).
      let code = `${t}: ${error ? error.error || error.code : 'NO_ID'}`;
      if (error && 'sent' in error) {
        const b = batches[i];
        const types = [...new Set(b.clips.map((c) => c.type || '?'))].join(', ') || 'без записей';
        code += ` · ${types} · ${b.clips.length} шт., ${mb(b.bytes)} · ушло ${Math.round(error.sent * 100)}% за ${(error.ms / 1000).toFixed(1)} с`;
      }
      return { error: error || { error: 'NO_ID' }, code };
    }
    return null;
  }

  async function sendAll(opts = {}) {
    if (sending) return;
    if (recorder.active) await recorder.stop();
    const d = briefData();
    if (!d.answered) { renderDone(); return; }
    const s = screens[screens.length - 1];
    const clips = opts.noAudio ? [] : d.clips;

    renderDone('sending', '');               // до флага: ничего, что может бросить, между флагом и try
    sending = true;
    s.send.disabled = s.sendText.disabled = true;
    try {
      // Каждую запись читаем заново в память: нечитаемую лучше назвать по
      // вопросу, чем получить обрыв всей отправки.
      for (const c of clips) {
        try {
          c.blob = new Blob([await c.blob.arrayBuffer()], { type: c.type });
        } catch (err) {
          console.error('Запись не читается:', c.id, err);
          renderDone('error', `Запись к вопросу ${c.q} не читается. Удалите её крестиком и запишите заново.`, 'CLIP_UNREADABLE');
          return;
        }
      }
      // По очереди: свой сервер, потом Forminit. Дальше идём, только если
      // сервис не ответил (обрыв, заглушка, 5xx); отказ по существу — ошибка.
      let fault = null;
      const codes = [];
      for (const t of TRANSPORTS) {
        if (fault) renderDone('sending', 'Пробую другой сервер…');
        fault = await sendVia(t, d, clips, s);
        if (!fault) break;
        console.error('Отправка через', t, 'не прошла:', fault.error);
        codes.push(fault.code);
        if (!fault.error || !fault.error.transport) break;
      }
      if (fault) { renderDone('error', errorText(fault.error), codes.join(' | ')); return; }
      const noAudio = !!opts.noAudio && d.clips.length > 0;
      state.sent = { sig: noAudio ? null : d.sig, textSig: d.textSig, noAudio, at: Date.now() };
      persist(store.set('sent', state.sent));
      renderDone();
    } catch (err) {
      console.error('Forminit:', err);
      renderDone('error', errorText(null), err && (err.name + (err.message ? ': ' + err.message : '')));
    } finally {
      sending = false;
      s.send.disabled = s.sendText.disabled = false;
    }
  }

  window.addEventListener('beforeunload', (e) => {
    if (recorder.active || sending) { e.preventDefault(); e.returnValue = ''; }
  });

  /* --- старт: черновик → экраны ------------------------------------------ */

  if (TEST) $('#test-mode').hidden = false;

  (async () => {
    try {
      const [answers, sent, pos, clips, draft] = await Promise.all([store.get('answers'), store.get('sent'), store.get('pos'), store.clips(), store.get('draft')]);
      draftId = draft || '';
      state.answers = answers || {};
      state.sent = sent && sent.sig ? sent : null;
      state.clips = await store.migrate(clips || []);
      state.pos = Number(pos) || 0;
    } catch (err) {
      persist(Promise.reject(err));
    }
    if (!draftId) {
      draftId = 'd' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
      persist(store.set('draft', draftId));
    }
    for (const s of screens) if (s.type === 'q') s.input.value = state.answers[s.q.id] || '';
    for (const q of questions) renderClips(q.id);
    for (const qid of new Set(lostClips)) note(qid, 'Старая запись к этому вопросу не сохранилась — запишите её заново.', true);
    // Вернувшийся видит приветствие с «Продолжить» — к экрану, где остановился.
    // Сохранённая позиция не затирается, пока он не нажал кнопку.
    const resumeAt = state.pos > 0 && state.pos < screens.length ? state.pos : 0;
    if (resumeAt) {
      const start = $('#start');
      start.innerHTML = 'Продолжить <small>↵</small>';
      delete start.dataset.next;
      start.dataset.go = resumeAt;
      const where = $('#resume-at');
      where.textContent = describe(screens[resumeAt]);
      where.hidden = !where.textContent;
    }
    go(0, { silent: true, instant: true });
  })();
})();
