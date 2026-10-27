# brief.snegur.space — приём брифа на Beget

Свой обработчик формы `/ocean-brief` на российском хостинге. Зачем: из
российских сетей без VPN соединения с Forminit (AWS CloudFront) рвутся после
~16 КБ — текст брифа доходил, записи голоса нет (проверено `diag.html` с
iPhone: 2 КБ — да, 50 КБ и больше — обрыв). Forminit в форме оставлен
рабочим: откат — `TRANSPORT = 'forminit'` в `ocean-brief/brief.js`.

Папка начинается с `_`, поэтому GitHub Pages (Jekyll) её не публикует.

```
app/lib.php              общие функции            → ~/brief.snegur.space/app/
app/config.example.php   образец настроек
app/config.php           настройки, ключ admin     (не в git)
public_html/submit.php   приём: POST multipart    → ~/brief.snegur.space/public_html/
public_html/admin.php    ответы и записи по ключу
public_html/.htaccess    без листинга, без dot-файлов
                         данные                   → ~/brief.snegur.space/data/ (вне веба)
```

- **submit.php** — `payload` (JSON: draft, send, batch, respondent, answers с
  подписями вопросов) и `audio[q1_1_3][]`. Каждая отправка — своя папка
  `data/<draft>/<send>/`: дополненный и отправленный снова бриф не затирает
  прежний. Формат записи проверяется по содержимому (`finfo`). Когда пришли
  все пачки — письмо на `notify_email` со ссылкой на admin. `diag=1` —
  проверка канала, ничего не хранится.
- **admin.php?key=…** — все ответы, последняя отправка каждого человека
  целиком, прежние свёрнуты; записи играют на месте (с Range — для Safari).
  Пускают два ключа: `admin_key` (ваш, в письмах) и `view_key` (ссылка
  «посмотреть все ответы» на финале брифа — для заполняющих). Без них — 404.
- **CORS** — только `allowed_origins` из config.php.

## Выкладка

```bash
_api/deploy.sh LOGIN
```

rsync по SSH-ключу `~/.ssh/beget_brief` на `LOGIN@LOGIN.beget.tech`;
`config.php` уезжает, если лежит рядом, `data/` на сервере не трогается.
