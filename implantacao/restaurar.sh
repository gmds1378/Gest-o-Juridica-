#!/usr/bin/env bash
#
# Restaura um backup gerado pelo backup.sh.
#
#   sudo /opt/gestao-juridica/implantacao/restaurar.sh /caminho/do/backup
#
# A pasta informada deve conter escritorio.db e, opcionalmente, uploads.tar.gz
# e aasp-brutos.tar.gz. Para trazer do Drive antes:
#
#   rclone lsd gdrive:BackupGestaoJuridica
#   rclone copy gdrive:BackupGestaoJuridica/2026-08-28_0300 /tmp/restauracao
#
# O que ja estiver na maquina e movido para um .antes-da-restauracao com
# carimbo de hora, em vez de sobrescrito: se a restauracao for a errada, da
# para voltar atras.

set -euo pipefail

ORIGEM="${1:-}"
PROJETO="${PROJETO:-/opt/gestao-juridica}"
SERVICO="gestao-juridica"
CARIMBO="$(date +%Y-%m-%d_%H%M%S)"

if [ -z "$ORIGEM" ] || [ ! -d "$ORIGEM" ]; then
	echo "Uso: $0 <pasta-do-backup>"
	exit 1
fi

if [ ! -f "$ORIGEM/escritorio.db" ]; then
	echo "ERRO: nao encontrei escritorio.db em $ORIGEM"
	exit 1
fi

echo "Verificando a integridade do backup antes de mexer no que esta no ar..."
INTEGRIDADE="$(sqlite3 "$ORIGEM/escritorio.db" 'PRAGMA integrity_check;')"
if [ "$INTEGRIDADE" != "ok" ]; then
	echo "ERRO: o backup esta corrompido ($INTEGRIDADE). Nada foi alterado."
	exit 1
fi
echo "  integridade: ok"

echo "Parando o servico..."
systemctl stop "$SERVICO" || true

echo "Guardando o estado atual..."
if [ -f "$PROJETO/dados/escritorio.db" ]; then
	mv "$PROJETO/dados/escritorio.db" "$PROJETO/dados/escritorio.db.antes-da-restauracao-$CARIMBO"
fi
# O modo WAL deixa arquivos auxiliares: se ficarem para tras, o SQLite tenta
# aplica-los sobre o banco restaurado e o resultado e imprevisivel.
rm -f "$PROJETO/dados/escritorio.db-wal" "$PROJETO/dados/escritorio.db-shm"

if [ -d "$PROJETO/uploads" ] && [ -f "$ORIGEM/uploads.tar.gz" ]; then
	mv "$PROJETO/uploads" "$PROJETO/uploads.antes-da-restauracao-$CARIMBO"
fi

echo "Restaurando o banco..."
cp "$ORIGEM/escritorio.db" "$PROJETO/dados/escritorio.db"

if [ -f "$ORIGEM/uploads.tar.gz" ]; then
	echo "Restaurando os arquivos enviados..."
	tar -xzf "$ORIGEM/uploads.tar.gz" -C "$PROJETO"
fi

if [ -f "$ORIGEM/aasp-brutos.tar.gz" ]; then
	echo "Restaurando as respostas cruas da AASP..."
	tar -xzf "$ORIGEM/aasp-brutos.tar.gz" -C "$PROJETO/dados"
fi

chown -R gestao:gestao "$PROJETO/dados" "$PROJETO/uploads"

echo "Subindo o servico..."
systemctl start "$SERVICO"
sleep 3

if curl -fsS http://localhost:3000/health >/dev/null; then
	echo
	echo "Restauracao concluida e sistema no ar."
	echo "O estado anterior ficou guardado com o sufixo .antes-da-restauracao-$CARIMBO"
	echo "Confira o sistema e apague essas copias quando tiver certeza."
else
	echo
	echo "ATENCAO: o servico nao respondeu no /health. Veja o log:"
	echo "  journalctl -u $SERVICO -n 50"
	exit 1
fi
