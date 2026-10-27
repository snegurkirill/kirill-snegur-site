<?php
/* ---------------------------------------------------------------------------
   Приём брифа — общие функции. Лежит вне public_html: по сети недоступен.
   На хостинге: ~/api.snegur.space/app/lib.php, рядом config.php (не в git).
   --------------------------------------------------------------------------- */

declare(strict_types=1);

function config(): array {
    static $cfg = null;
    if ($cfg === null) {
        $cfg = require __DIR__ . '/config.php';
    }
    return $cfg;
}

/* Ответ формы — в том же виде, что у Forminit: { success, submission: { hashId } }
   или { success: false, error, message }. Так клиенту не важно, куда он шлёт. */
function reply(int $status, array $body): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($body, JSON_UNESCAPED_UNICODE);
    exit;
}

function fail(int $status, string $code, string $message = ''): void {
    reply($status, ['success' => false, 'error' => $code, 'code' => $status, 'message' => $message]);
}

/* Форма живёт на snegur.space, обработчик — на api.snegur.space: нужен CORS.
   Разрешены только адреса из config.php. Предзапрос OPTIONS отвечается сразу. */
function cors(): void {
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if (in_array($origin, config()['allowed_origins'], true)) {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Vary: Origin');
        header('Access-Control-Allow-Methods: POST, OPTIONS');
        header('Access-Control-Allow-Headers: Accept, Content-Type');
        header('Access-Control-Max-Age: 86400');
    }
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}

function data_dir(): string {
    $dir = config()['data_dir'];
    if (!is_dir($dir)) {
        mkdir($dir, 0700, true);
    }
    return rtrim($dir, '/');
}

/* id черновика и отправки приходят от браузера — пускаем только безопасные. */
function safe_id(?string $id): ?string {
    return ($id !== null && preg_match('/^[a-z0-9-]{8,48}$/', $id)) ? $id : null;
}

function h(?string $s): string {
    return htmlspecialchars((string) $s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

/* JSON с блокировкой: пачки одной отправки могут прийти почти одновременно. */
function update_json(string $path, callable $fn): array {
    $fh = fopen($path, 'c+');
    flock($fh, LOCK_EX);
    $raw = stream_get_contents($fh);
    $data = $raw ? (json_decode($raw, true) ?: []) : [];
    $data = $fn($data);
    ftruncate($fh, 0);
    rewind($fh);
    fwrite($fh, json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
    fflush($fh);
    flock($fh, LOCK_UN);
    fclose($fh);
    return $data;
}

function mail_utf8(string $to, string $subject, string $body): bool {
    $from = config()['mail_from'];
    $headers = implode("\r\n", [
        'From: =?UTF-8?B?' . base64_encode('Бриф о витрине') . '?= <' . $from . '>',
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: base64',
    ]);
    return mail($to, '=?UTF-8?B?' . base64_encode($subject) . '?=', chunk_split(base64_encode($body)), $headers);
}
