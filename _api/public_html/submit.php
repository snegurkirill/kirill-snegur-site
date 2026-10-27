<?php
/* ---------------------------------------------------------------------------
   Приём брифа — POST https://api.snegur.space/submit.php
   multipart: payload — JSON { draft, send, batch: { i, n }, respondent,
   answers: [{ id, label, text }] } (ответы — только в первой пачке),
   audio[q1_1_3][] — записи к вопросу 1.1.3, _gotcha — ловушка для ботов.
   diag=1 — проверка канала: тело принимается и выбрасывается.

   Хранение: data/<draft>/<send>/brief.json и файлы записей рядом.
   Каждая отправка — своя папка: если человек дополнил бриф и отправил
   снова, прежняя версия остаётся.
   --------------------------------------------------------------------------- */

declare(strict_types=1);
require __DIR__ . '/../app/lib.php';

cors();
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    fail(405, 'METHOD_NOT_ALLOWED');
}

$cfg = config();
$length = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
if ($length > $cfg['max_request_bytes']) {
    fail(413, 'TOO_LARGE', 'Запрос больше ' . round($cfg['max_request_bytes'] / 1048576) . ' МБ');
}
// PHP молча выбрасывает тело больше post_max_size — тогда и $_POST пуст.
if ($length > 0 && empty($_POST) && empty($_FILES)) {
    fail(413, 'TOO_LARGE', 'Запрос больше post_max_size на сервере');
}

if (($_POST['diag'] ?? '') === '1') {
    reply(200, ['success' => true, 'diag' => true, 'bytes' => $length, 'submission' => ['hashId' => 'diag']]);
}

if (!empty($_POST['_gotcha'])) {
    // Бот заполнил скрытое поле: делаем вид, что приняли, и ничего не храним.
    reply(200, ['success' => true, 'submission' => ['hashId' => 'ok']]);
}

$p = json_decode($_POST['payload'] ?? '', true);
if (!is_array($p)) {
    fail(400, 'BAD_PAYLOAD');
}
$draft = safe_id($p['draft'] ?? null);
$send = safe_id($p['send'] ?? null);
if (!$draft || !$send) {
    fail(400, 'BAD_ID');
}
$i = max(0, (int) ($p['batch']['i'] ?? 0));
$n = max(1, (int) ($p['batch']['n'] ?? 1));

$dir = data_dir() . "/$draft/$send";
if (!is_dir($dir) && !mkdir($dir, 0700, true) && !is_dir($dir)) {
    fail(500, 'STORAGE');
}

// Записи: имя поля audio[q1_1_3][] → вопрос 1.1.3; файл — 1.1.3-1.webm.
$EXT = [
    'audio/webm' => 'webm', 'video/webm' => 'webm',
    'audio/mp4' => 'mp4', 'video/mp4' => 'mp4', 'audio/x-m4a' => 'mp4', 'audio/aac' => 'aac',
    'audio/mpeg' => 'mp3', 'audio/ogg' => 'ogg', 'video/ogg' => 'ogg', 'audio/wav' => 'wav', 'audio/x-wav' => 'wav',
];
$finfo = new finfo(FILEINFO_MIME_TYPE);
$saved = [];
foreach (($_FILES['audio']['name'] ?? []) as $field => $names) {
    if (!preg_match('/^q(\d)_(\d)_(\d)$/', (string) $field, $m)) {
        continue;
    }
    $qid = "$m[1].$m[2].$m[3]";
    foreach ((array) $names as $k => $name) {
        if (($_FILES['audio']['error'][$field][$k] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            fail(400, 'UPLOAD_FAILED', "Запись к вопросу $qid не загрузилась");
        }
        $tmp = $_FILES['audio']['tmp_name'][$field][$k];
        $mime = $finfo->file($tmp) ?: '';
        if (!isset($EXT[$mime])) {
            fail(415, 'BAD_AUDIO', "Запись к вопросу $qid: неизвестный формат $mime");
        }
        // Номер записи берём из имени «1.1.3-2.webm», иначе — следующий свободный.
        $no = preg_match('/-(\d{1,2})\.\w+$/', (string) $name, $mm) ? (int) $mm[1] : $k + 1;
        $file = "$qid-$no.{$EXT[$mime]}";
        if (!move_uploaded_file($tmp, "$dir/$file")) {
            fail(500, 'STORAGE');
        }
        $saved[] = ['q' => $qid, 'file' => $file, 'bytes' => filesize("$dir/$file"), 'type' => $mime];
    }
}

$brief = update_json("$dir/brief.json", function (array $b) use ($p, $draft, $send, $i, $n, $saved) {
    $b += ['draft' => $draft, 'send' => $send, 'at' => date('c'), 'batches' => $n, 'received' => [], 'files' => []];
    if ($i === 0) {
        $b['respondent'] = mb_substr((string) ($p['respondent'] ?? ''), 0, 500);
        $b['answers'] = [];
        foreach ((array) ($p['answers'] ?? []) as $a) {
            if (!preg_match('/^\d\.\d\.\d$/', (string) ($a['id'] ?? ''))) {
                continue;
            }
            $b['answers'][] = [
                'id' => $a['id'],
                'label' => mb_substr((string) ($a['label'] ?? ''), 0, 1000),
                'text' => mb_substr((string) ($a['text'] ?? ''), 0, 50000),
            ];
        }
        $b['agent'] = mb_substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 300);
    }
    $b['received'] = array_values(array_unique(array_merge($b['received'], [$i])));
    $b['files'] = array_merge($b['files'], $saved);
    return $b;
});

// Письмо — когда пришли все пачки этой отправки.
if (count($brief['received']) === $brief['batches'] && empty($brief['notified'])) {
    update_json("$dir/brief.json", fn (array $b) => $b + ['notified' => date('c')]);
    $filled = count(array_filter($brief['answers'] ?? [], fn ($a) => trim($a['text']) !== ''));
    $link = 'https://' . ($_SERVER['HTTP_HOST'] ?? 'api.snegur.space') . '/admin.php?key=' . rawurlencode(config()['admin_key']) . '#' . $draft;
    mail_utf8(
        config()['notify_email'],
        'Бриф о витрине: ' . (($brief['respondent'] ?? '') ?: 'новый ответ'),
        "Заполнил: " . (($brief['respondent'] ?? '') ?: '—') . "\n" .
        "Ответов текстом: $filled\nЗаписей голоса: " . count($brief['files']) . "\n\n" .
        "Все ответы и записи: $link\n"
    );
}

reply(200, ['success' => true, 'submission' => ['hashId' => $send, 'date' => $brief['at']]]);
