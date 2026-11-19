#!/usr/bin/env python3
"""Собирает статичные страницы /tamed-form-site из данных ниже.

Запуск из корня репозитория:  python3 tamed-form-site/tools/build.py
Фото и схемы лежат в assets/tamed-form-site/ (webp, собраны из Dropbox бюро):
  <slug>-N.webp / <slug>-N-sm.webp — фото (1600 / 800 px), N=1 — обложка;
  <slug>-plan-N.webp, <slug>-scheme-N.webp — чертежи и схемы из презентаций.
Тексты — лид и первые решения из Notion «Проекты Tamed form» → «Тексты для сайта».
Проекты под NDA (GAFA, ПРАВДА) сюда не входят.
"""
import glob, html, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))          # tamed-form-site/
ASSETS = os.path.join(os.path.dirname(ROOT), 'assets', 'tamed-form-site')

CATS = [
    ('landscape', 'ландшафт', ['stankolit', 'stankolit-north', 'pogodinskaya', 'kuzminki', 'cherry']),
    ('gardens',   'сады',     ['lumin', 'nikolina', 'puchkovo', 'razdory']),
    ('culture',   'культура', ['palisadnik-2025', 'palisadnik-2026', 'chaumont']),
]

# slug: (название, короткое имя для списка, тип в ленте, год, параметры, [лид, решения...])
P = {
 'stankolit': ('станколит', 'станколит', 'ревитализация', '2022',
   'Москва · 5 га · АО «Группа компаний Станколит»', [
   'С 2022 года мы работаем над обликом общественных пространств бывшего завода «Станколит». В первую очередь реализации вошла аллея на Южной площади: на месте парковки появилось зелёное общественное пространство, возвращающее память о советской липовой роще.',
   'Структура нового ландшафта состоит из «комнат» — камерных островков из плитки в окружении лесного контура из лиственниц, клёнов Гиннала, рябин и сосен. Контур деревьев отделяет аллею от парковки и работает с 12-метровой чугунной колонной на площади.',
   'Отсыпка из гравия вокруг островков создаёт ощущение «парящего» ландшафта, а сиденья-камушки благородных бежевых оттенков задают неочевидные места для отдыха.']),
 'stankolit-north': ('северная площадь', 'северная площадь', 'станколит', '2026',
   'Москва · АО «Группа компаний Станколит»', [
   'Северная площадь — часть общественных пространств бывшего чугунолитейного завода «Станколит», реализованных по мастерплану tamed.form. Посадки связывают парковку и тротуары вдоль ритейла, формируют её контур и сопровождают пешеходные маршруты.',
   'Из-за подземных сетей деревья здесь почти не высадить, поэтому главным акцентом стал взрослый шестиметровый клён Виери. Под ним — цветник из вейника ‘Karl Foerster’, дербенника ‘Robin’ и анафалиса, высаженных крупными массивами.',
   'Осенью выразительность держат золотистые метёлки и серебристая листва, зимой — красные, зелёные и салатовые ветви дёрена.']),
 'pogodinskaya': ('погодинская', 'погодинская', 'жилой дом', '2023',
   'Москва · концепция · с Planting Strategies', [
   'Регулярность, камерные пространства, разнообразные места для сидения, природный ландшафт и натуральные покрытия — пять принципов сада жилого дома на Погодинской: двора, главного фасада и зелёных террас на 2 и 11 этажах.',
   'По схеме инсоляции двор разделён на тенистый, стародачный и солнечный сады, а детская площадка на склоне получает солнце в дневные часы.',
   'На крыше — сообщества степных сибирских растений: они выдерживают до −50 °C и не вымерзают в условиях сада на крыше.']),
 'kuzminki': ('парк кузьминки', 'парк кузьминки', 'парк', '2015',
   'Москва · 375 га · «Мосгорпарк» · в составе Alphabet City', [
   'Концепция объединяет четыре разрозненные части парка — ПКиО, музейный комплекс усадьбы Голицыных, исторический пейзажный парк вокруг прудов и лес — с помощью ландшафтных решений вокруг прудов и реки Пономарки.',
   'Пейзажный маршрут вдоль прудов — система незаметных точечных интервенций: спуски к воде, скамейки на видовых точках, площадка на воде на Верхнем Кузьминском пруду.',
   'Центральная ось нанизывает три «сердца парка» — места с видами на воду, павильонами кафе, прокатом и детскими площадками.']),
 'cherry': ('вишнёвый сад', 'вишнёвый сад', 'жилой комплекс', '2022',
   'Москва · концепция · с Planting Strategies', [
   'Природные формы холмов, теневые и солнечные зоны, разнообразные места для отдыха, вода и места для спонтанной игры — двор жилого комплекса как цельный сад.',
   'Зелёные холмы высотой 70–100 см несут ярус черёмухи и боярышника, вокруг них проходят дренажные каналы из морской гальки.',
   'Площадка для малышей встроена в рельеф: горка на холме, пеньки и сиденья-гальки как элемент неочевидной игры.']),
 'lumin': ('lumin house', 'lumin house', 'резиденция', '2024',
   'Москва · 350 м² · Hutton Development', [
   'Терраса клубного дома Lumin House у Славянской площади тесно окружена городской застройкой. Сад отвечает архитектуре дома: стеклянный фасад делает свет главным, а интерьеры держатся на серой гамме с фиолетовыми акцентами.',
   'Технологичная белая мебель и мягкий фон из растений с веточками дёрена и многолетниками фиолетовых оттенков. Основа посадок — клён Гиннала и дёрен ‘Сибирика’, устойчивые к вымерзанию корней в кашпо.',
   'Сад в бетонных кадках разного размера поддерживает структуру мебели и открывает виды на панораму Китай-города сквозь зелень.']),
 'nikolina': ('николина гора', 'николина гора', 'сад', '2026',
   'Николина Гора · 30 соток · реализация 2026', [
   'Сад в сосновом лесу стародачного посёлка «РАНИС», где десятилетиями жили художники, учёные и писатели. Наша задача — вписать новую жизнь в этот ландшафт, не нарушив его покоя.',
   'Вековые сосны — главные герои: нижний ярус подчёркивает их вертикаль, а массивы гортензии и спиреи дают «светящиеся» акценты в лесной тени. Пруд — сердце сада — продолжает линию террасы и создаёт место для тихой паузы.',
   'На втором участке сад постепенно растворяется в лесу: террасы из кортена на существующем рельефе, открытая солнечная поляна и минимальное вмешательство за её пределами.']),
 'puchkovo': ('пучково', 'пучково', 'сад', '2021',
   'Пучково · 800 м² · частный сад', [
   'Участок в тихой деревне Пучково рядом с Троицком. Ландшафт строится на плавном переходе от парадного входа к оврагу: тенистый сад у дома сменяется каменистым участком, сухим лугом и влажным берегом ручья.',
   'Глухой фасад дома закрывает улицу, а со стороны сада вмещает окружающий пейзаж. Мы раскрыли новые ракурсы на берег и создали места для отдыха, чтения и созерцания — среди них пирс над оврагом с местом для костра.',
   'Выбор растений вдохновлён аборигенной флорой: сад поддерживает естественный ландшафт в его художественном переосмыслении.']),
 'razdory': ('раздоры', 'раздоры', 'сад', '2021',
   'Раздоры · 8 соток · частный сад', [
   'Заказчик видел классический регулярный сад, но жизнь в закрытом посёлке — это прежде всего поиск тишины. Сад работает на контрасте строгой геометрии и мягких форм цветников.',
   'Регулярный каркас — прямые дорожки, чёткие границы мощения, изгороди из туи — задаёт ритм. Поверх него лежит «мягкий слой» злаков, многолетников и живописных деревьев.',
   'Сад декоративен в каждом сезоне: весной цветут клён красный и яблоня ‘Evereste’, зимой графику дают ивы и стриженый дёрен.']),
 'palisadnik-2025': ('палисадник 2025', 'палисадник 2025', 'гэс-2', '2025',
   'Москва · 120 м² · Дом культуры «ГЭС-2» · сезонный проект', [
   'Тропический оазис на площади у «ГЭС-2», посвящённый наследию бразильского архитектора Лины Бо Барди и её выставке «Если бы стены стали водой». Мы будто раскрываем окно из Москвы в Сан-Паулу.',
   'Формы цветников повторяют знаменитые «пещерные отверстия» центра Sesc Pompéia. От северного фрагмента рощи композиция уходит в цветную, почти тропическую волну.',
   'Растения подобраны так, чтобы пик красоты наступал постепенно: от светлого фона манжетки в мае до канн, георгин и гелениума в июле.']),
 'palisadnik-2026': ('палисадник 2026', 'палисадник 2026', 'гэс-2', '2026',
   'Москва · Дом культуры «ГЭС-2» · сезонный проект', [
   'Палисадник — ежегодный ландшафтный проект Дома культуры «ГЭС-2» — в этом году был посвящён двору как общему пространству и садам у подъездов детства, собранным из растений, которыми делились соседи.',
   'Северный палисадник, где декоративное и съедобное растут рядом: георгины, космея и душистый табак — с земляникой, мятой и томатами. Его можно узнавать на ощупь, по запаху и на вкус.',
   'В конце сезона на встрече «(Не)забытые растения» мы раздали растения желающим — и сад продолжился на дачах и у жилых домов.']),
 'chaumont': ('шомон', 'шомон', 'фестиваль', '2016',
   'Шомон-сюр-Луар, Франция · 120 м² · с Alphabet City и 8 Lines', [
   'Le Jardin Comestible — «Съедобный сад» на международном фестивале садов в Шомон-сюр-Луар: ностальгическое воспоминание о советских дачах, где садоводство было способом выжить в годы дефицита.',
   'Пять оранжерей наполовину заняты овощами, наполовину — разнотравьем из сообществ арт-парка Никола-Ленивец: молинией, коровяком, шалфеем, репешком и космеей.',
   'Дачный быт — бочка для полива, эмалированная посуда, чехословацкие стулья — и звуковая инсталляция Владислава Сорокина из звуков старой дачи.']),
}

# асcеты в папке называются по слагу Dropbox; stankolit = Южная аллея
FILES = {'stankolit': 'stankolit-south', 'cherry': 'cherry'}

e = html.escape

def files(slug):
    key = FILES.get(slug, slug)
    def pick(pat):
        out = []
        for f in glob.glob(os.path.join(ASSETS, pat)):
            n = os.path.basename(f)
            if n.endswith('-sm.webp'): continue
            out.append(n)
        return sorted(out, key=lambda n: int(n.rsplit('-', 1)[1].split('.')[0]))
    photos = [n for n in pick(f'{key}-[0-9]*.webp')]
    plans = pick(f'{key}-plan-*.webp') + pick(f'{key}-scheme-*.webp')
    return photos, plans

def head(title, depth, desc='tamed.form — бюро ландшафтной архитектуры: общественные пространства и камерные сады.'):
    up = '../' * depth
    return f'''<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{e(title)}</title>
<meta name="description" content="{e(desc)}">
<meta name="theme-color" content="#ffffff">
<meta name="robots" content="noindex, nofollow">
<meta property="og:type" content="website">
<meta property="og:title" content="{e(title)}">
<meta property="og:description" content="{e(desc)}">
<link rel="preload" href="{up}../deck/fonts/abc-diatype-cyrillic-regular.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="{up}site.css?v=1">
</head>
'''

def logo(depth, href='index.html'):
    up = '../' * depth
    return f'<a class="logo" href="{up}{href}"><img src="{up}../assets/tamed-form-site/logo.svg" alt="tamed form" width="144" height="43"></a>'

def bar_main(depth, current):
    up = '../' * depth
    def cur(k): return ' aria-current="page"' if k == current else ''
    return f'''<nav class="bar" aria-label="Разделы">
  <div class="bar__in">
    <a class="bar__side" href="{up}about.html#bureau"{cur('bureau')}>бюро</a>
    <a class="bar__mid" href="{up}index.html"{cur('projects')}>проекты</a>
    <a class="bar__side" href="{up}about.html#contacts"{cur('contacts')}>контакты</a>
  </div>
</nav>'''

def write(rel, s):
    path = os.path.join(ROOT, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f: f.write(s)

A = '../assets/tamed-form-site/'

# ── 01 + 02 · заставка и проекты по категориям ──────────────
sprouts = ''.join(f'<img class="sprout" src="{A}sprout.svg" alt="">' for _ in range(8))
cats = []
for cid, title, slugs in CATS:
    names = ''.join(f'<li><a href="{s}/">{e(P[s][1])}</a></li>' for s in slugs)
    cards = ''
    for s in slugs[:3]:
        ph, _ = files(s)
        img = ph[0].replace('.webp', '-sm.webp') if ph else ''
        cards += f'<span class="stack__card"><img src="{A}{img}" alt=""></span>'
    cats.append(f'''  <section class="cat">
    <h2 class="cat__title"><a href="projects.html#{cid}">{title}</a></h2>
    <ul class="cat__names">{names}</ul>
    <a class="stack" href="projects.html#{cid}" aria-label="{title}: все проекты">{cards}</a>
  </section>''')
write('index.html', head('tamed form — проекты', 0) + f'''<body>
<div class="splash" aria-hidden="true">
  <div class="splash__field">{sprouts}<img class="splash__logo" src="{A}logo.svg" alt=""></div>
</div>
<main class="page cats">
  <h1 class="visually-hidden">tamed form — бюро ландшафтной архитектуры</h1>
  {logo(0)}
{chr(10).join(cats)}
</main>
{bar_main(0, 'projects')}
<script src="site.js?v=1"></script>
</body>
</html>
''')

# ── 03 · лента ─────────────────────────────────────────────
groups = []
for cid, title, slugs in CATS:
    items = ''
    for s in slugs:
        name, short, kind, year = P[s][:4]
        ph, _ = files(s)
        img = ph[0] if ph else ''
        sm = img.replace('.webp', '-sm.webp')
        items += f'''    <a class="item" id="{s}" href="{s}/">
      <img class="item__img" src="{A}{sm}" srcset="{A}{sm} 800w, {A}{img} 1600w" sizes="(min-width: 560px) 560px, 100vw" alt="" loading="lazy">
      <span class="item__cap"><span class="item__name">{e(name)}</span><span class="item__meta"><span>{e(kind)}</span><span>{year}</span></span></span>
    </a>
'''
    groups.append(f'  <section class="feed__group" id="{cid}" aria-label="{title}">\n{items}  </section>')
catlinks = ''.join(f'<a href="#{cid}">{t}</a>' for cid, t, _ in CATS)
write('projects.html', head('tamed form — все проекты', 0) + f'''<body>
<header class="top">{logo(0)}</header>
<main class="page feed">
  <h1 class="visually-hidden">Проекты</h1>
{chr(10).join(groups)}
</main>
<nav class="bar" aria-label="Разделы">
  <div class="bar__in">
    <a class="bar__side" href="about.html#bureau">бюро</a>
    <span class="bar__cats">{catlinks}</span>
    <a class="bar__side" href="about.html#contacts">контакты</a>
  </div>
</nav>
<script src="site.js?v=1"></script>
</body>
</html>
''')

# ── 04 · проекты ───────────────────────────────────────────
for cid, ctitle, slugs in CATS:
    for s in slugs:
        name, short, kind, year, params, text = P[s]
        ph, plans = files(s)
        up = '../'
        hero = f'<img class="project__hero" src="{up}{A}{ph[0]}" alt="{e(name)}" width="1600" height="1600">' if ph else ''
        paras = ''.join(f'<p>{e(t)}</p>' for t in text)
        gal = ''.join(f'<img class="ph" src="{up}{A}{p}" alt="" loading="lazy">' for p in ph[1:])
        drw = ''.join(f'<img class="dr" src="{up}{A}{p}" alt="Чертёж" loading="lazy">' for p in plans)
        label = '<p class="gallery__label">чертежи и схемы</p>' if plans else ''
        write(f'{s}/index.html', head(f'{name} — tamed form', 1, text[0][:160]) + f'''<body>
<header class="top">{logo(1)}</header>
<main class="page project">
  {hero}
  <div class="project__text">
    <h1 class="visually-hidden">{e(name)}</h1>
    {paras}
    <p class="project__meta">{e(kind)} · {year}<br>{e(params)}</p>
  </div>
  <div class="gallery">{gal}</div>
  {label}<div class="gallery">{drw}</div>
</main>
<nav class="bar bar--project" aria-label="Навигация">
  <div class="bar__in">
    <a class="bar__back" href="../projects.html#{s}" aria-label="Назад к проектам">←</a>
    <span class="bar__title">{e(name)}</span>
    <span></span>
  </div>
</nav>
</body>
</html>
''')

# ── бюро и контакты ────────────────────────────────────────
write('about.html', head('tamed form — бюро', 0) + f'''<body>
<main class="page about">
  {logo(0)}
  <h2 id="bureau">бюро</h2>
  <p>tamed.form — бюро ландшафтной архитектуры, проектирует общественные городские пространства и камерные загородные сады. В основе работы — создание устойчивых и гибких пространств, где природный ландшафт принимает «прирученную» человеком форму, не теряя способности жить и меняться.</p>
  <p>Мария Ашкова — ландшафтный архитектор, основательница бюро tamed.form. Автор ландшафтной концепции «Палисадника», занималась озеленением территорий Парка Горького и Музея «Гараж», участвовала в восстановлении исторического огорода Дома Мельникова.</p>
  <h2 id="contacts">контакты</h2>
  <p class="contacts"><a href="mailto:mashashkova@gmail.com">mashashkova@gmail.com</a><br><a href="tel:+79060923910">+7 906 092-39-10</a></p>
</main>
{bar_main(0, 'bureau')}
</body>
</html>
''')
print('ok')
