<?php
/* ---------------------------------------------------------------------------
   Ответы брифа — https://api.snegur.space/admin.php?key=…
   Без ключа из config.php — 404. Каждый черновик (человек в одном браузере) —
   блок; сверху последняя отправка целиком, прежние — свёрнуты. Записи
   играют прямо здесь: admin.php?key=…&f=<draft>/<send>/<файл>, с Range —
   без него Safari не проигрывает аудио.
   --------------------------------------------------------------------------- */

declare(strict_types=1);
require __DIR__ . '/../app/lib.php';

$key = (string) ($_GET['key'] ?? '');
if ($key === '' || !hash_equals(config()['admin_key'], $key)) {
    http_response_code(404);
    exit;
}
header('X-Robots-Tag: noindex, nofollow');
header('Referrer-Policy: no-referrer');

$root = data_dir();

/* --- отдача файла записи ------------------------------------------------- */
if (isset($_GET['f'])) {
    if (!preg_match('#^([a-z0-9-]{8,48})/([a-z0-9-]{8,48})/(\d\.\d\.\d-\d{1,2}\.(webm|mp4|aac|mp3|ogg|wav))$#', (string) $_GET['f'], $m)) {
        http_response_code(404);
        exit;
    }
    $path = "$root/$m[1]/$m[2]/$m[3]";
    if (!is_file($path)) {
        http_response_code(404);
        exit;
    }
    $types = ['webm' => 'audio/webm', 'mp4' => 'audio/mp4', 'aac' => 'audio/aac', 'mp3' => 'audio/mpeg', 'ogg' => 'audio/ogg', 'wav' => 'audio/wav'];
    $size = filesize($path);
    $start = 0;
    $end = $size - 1;
    if (preg_match('/bytes=(\d*)-(\d*)/', $_SERVER['HTTP_RANGE'] ?? '', $r)) {
        if ($r[1] !== '') {
            $start = (int) $r[1];
            $end = $r[2] !== '' ? min((int) $r[2], $size - 1) : $size - 1;
        } elseif ($r[2] !== '') {
            $start = max(0, $size - (int) $r[2]);
        }
        if ($start > $end) {
            http_response_code(416);
            header("Content-Range: bytes */$size");
            exit;
        }
        http_response_code(206);
        header("Content-Range: bytes $start-$end/$size");
    }
    header('Content-Type: ' . $types[$m[4]]);
    header('Accept-Ranges: bytes');
    header('Content-Length: ' . ($end - $start + 1));
    header('Content-Disposition: inline; filename="' . $m[3] . '"');
    header('Cache-Control: private, max-age=3600');
    $fh = fopen($path, 'rb');
    fseek($fh, $start);
    $left = $end - $start + 1;
    while ($left > 0 && !feof($fh)) {
        $chunk = fread($fh, (int) min(65536, $left));
        echo $chunk;
        $left -= strlen($chunk);
    }
    fclose($fh);
    exit;
}

/* --- список ответов ------------------------------------------------------ */
$drafts = [];
foreach (glob("$root/*/*/brief.json") ?: [] as $file) {
    $b = json_decode((string) file_get_contents($file), true);
    if (!is_array($b)) {
        continue;
    }
    $drafts[$b['draft']][] = $b;
}
foreach ($drafts as &$sends) {
    usort($sends, fn ($a, $b) => strcmp($b['at'], $a['at']));
}
unset($sends);
uasort($drafts, fn ($a, $b) => strcmp($b[0]['at'], $a[0]['at']));

$k = rawurlencode($key);
function when(string $iso): string {
    $t = strtotime($iso);
    return $t ? date('d.m.Y H:i', $t) : $iso;
}
function render_send(array $b, string $k): void {
    $byQ = [];
    foreach ($b['files'] ?? [] as $f) {
        $byQ[$f['q']][] = $f;
    }
    $complete = count($b['received'] ?? []) === (int) ($b['batches'] ?? 1);
    echo '<p class="meta">Отправлено ' . h(when($b['at'])) . ($complete ? '' : ' · <b>пришли не все пачки записей</b>') . '</p>';
    foreach ($b['answers'] ?? [] as $a) {
        $clips = $byQ[$a['id']] ?? [];
        $empty = trim($a['text']) === '' && !$clips;
        echo '<section class="q' . ($empty ? ' empty' : '') . '"><p class="label"><b>' . h($a['id']) . '</b> ' . h($a['label']) . '</p>';
        if (trim($a['text']) !== '') {
            echo '<p class="text">' . nl2br(h($a['text'])) . '</p>';
        }
        foreach ($clips as $c) {
            $src = 'admin.php?key=' . $k . '&f=' . rawurlencode($b['draft'] . '/' . $b['send'] . '/' . $c['file']);
            echo '<p class="clip"><audio controls preload="none" src="' . h($src) . '"></audio> <a href="' . h($src) . '" download>' . h($c['file']) . '</a> <span>' . round($c['bytes'] / 1024) . ' КБ</span></p>';
        }
        echo '</section>';
    }
}
?>
<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Ответы — бриф о витрине</title>
<style>
  body { margin: 0; font: 17px/1.35 -apple-system, "Source Sans 3", system-ui, sans-serif; color: #000; background: #fff; }
  main { max-width: 760px; margin: 0 auto; padding: 32px 16px 96px; }
  h1 { font-weight: 420; font-size: 32px; letter-spacing: -0.03em; margin: 0 0 24px; }
  h2 { font-weight: 420; font-size: 22px; margin: 48px 0 4px; }
  .meta, .label, .clip span, .none { color: #8a8a8a; font-size: 14px; }
  .label b { color: #000; font-weight: 500; }
  .q { padding: 14px 0; border-top: 1px solid #e6e6e6; }
  .q.empty { opacity: .45; }
  .text { margin: 6px 0 0; white-space: normal; }
  .clip { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 8px 0 0; }
  .clip audio { height: 36px; max-width: 100%; }
  details { margin-top: 16px; }
  summary { cursor: pointer; color: #555; }
</style>
</head>
<body>
<main>
<h1>Ответы на бриф</h1>
<?php if (!$drafts): ?>
  <p class="none">Пока никто не отправил.</p>
<?php endif; ?>
<?php foreach ($drafts as $draft => $sends): $last = $sends[0]; ?>
  <h2 id="<?= h($draft) ?>"><?= h(($last['respondent'] ?? '') ?: 'Без имени') ?></h2>
  <?php render_send($last, $k); ?>
  <?php foreach (array_slice($sends, 1) as $old): ?>
    <details><summary>Предыдущая отправка — <?= h(when($old['at'])) ?></summary><?php render_send($old, $k); ?></details>
  <?php endforeach; ?>
<?php endforeach; ?>
</main>
</body>
</html>
