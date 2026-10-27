#!/bin/sh
# Выкладка обработчика брифа на Beget: ./_api/deploy.sh LOGIN [HOST]
# Код — в ~/api.snegur.space/{app,public_html}; data/ на сервере не трогаем.
set -eu

LOGIN="${1:?логин Beget первым аргументом}"
HOST="${2:-$LOGIN.beget.tech}"
KEY="$HOME/.ssh/beget_brief"
DIR="$(cd "$(dirname "$0")" && pwd)"
SITE="api.snegur.space"

[ -f "$DIR/app/config.php" ] || { echo "Нет _api/app/config.php — скопируйте config.example.php и заполните." >&2; exit 1; }

ssh -i "$KEY" "$LOGIN@$HOST" "mkdir -p ~/$SITE/app ~/$SITE/public_html ~/$SITE/data && chmod 700 ~/$SITE/data"
rsync -av -e "ssh -i $KEY" --exclude config.example.php "$DIR/app/" "$LOGIN@$HOST:$SITE/app/"
rsync -av -e "ssh -i $KEY" "$DIR/public_html/" "$LOGIN@$HOST:$SITE/public_html/"
ssh -i "$KEY" "$LOGIN@$HOST" "chmod 600 ~/$SITE/app/config.php"
echo "Готово: https://$SITE/submit.php"
