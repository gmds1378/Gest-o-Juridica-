#!/usr/bin/env bash
#
# Backup diario: banco + arquivos enviados, com copia fora da maquina.
#
# Uso:
#   sudo -u gestao /opt/gestao-juridica/implantacao/backup.sh
#
# Instalado no cron pelo implantacao/instalar.sh. Registra tudo em
# /var/log/gestao-juridica-backup.log.

set -euo pipefail

PROJETO="${PROJETO:-/opt/gestao-juridica}"
PASTA_BACKUP="${PASTA_BACKUP:-$PROJETO/backups}"
ARQUIVO_ENV="${ARQUIVO_ENV:-/etc/gestao-juridica.env}"

# RCLONE_DESTINO e BACKUP_RETENCAO_DIAS vem do arquivo de ambiente.
if [ -f "$ARQUIVO_ENV" ]; then
	# shellcheck disable=SC1090
	set -a; source "$ARQUIVO_ENV"; set +a
fi

RETENCAO="${BACKUP_RETENCAO_DIAS:-30}"
DATA="$(date +%Y-%m-%d_%H%M)"
DESTINO="$PASTA_BACKUP/$DATA"

mkdir -p "$DESTINO"

echo "[$(date '+%F %T')] Iniciando backup em $DESTINO"

# --- Banco de dados -------------------------------------------------------
# VACUUM INTO, e nao "cp": o banco roda em modo WAL, entao copiar o arquivo .db
# cru enquanto o sistema esta no ar gera uma copia sem as transacoes que ainda
# estao no WAL - ou seja, um backup silenciosamente incompleto. O VACUUM INTO
# produz um arquivo consistente e ja compactado, com o servico no ar.
sqlite3 "$PROJETO/dados/escritorio.db" "VACUUM INTO '$DESTINO/escritorio.db'"
echo "  banco: $(du -h "$DESTINO/escritorio.db" | cut -f1)"

# Confere se o backup abre e passa na verificacao de integridade. Backup que
# nao restaura nao e backup, e e melhor descobrir isso agora.
INTEGRIDADE="$(sqlite3 "$DESTINO/escritorio.db" 'PRAGMA integrity_check;')"
if [ "$INTEGRIDADE" != "ok" ]; then
	echo "  ERRO: o backup do banco falhou na verificacao de integridade: $INTEGRIDADE"
	exit 1
fi
echo "  integridade: ok"

# --- Arquivos enviados ----------------------------------------------------
tar -czf "$DESTINO/uploads.tar.gz" -C "$PROJETO" uploads
echo "  uploads: $(du -h "$DESTINO/uploads.tar.gz" | cut -f1)"

# --- Respostas cruas da AASP ---------------------------------------------
# Sao a unica copia das intimacoes que a AASP ja marcou como baixadas.
if [ -d "$PROJETO/dados/aasp-brutos" ]; then
	tar -czf "$DESTINO/aasp-brutos.tar.gz" -C "$PROJETO/dados" aasp-brutos
	echo "  aasp-brutos: $(du -h "$DESTINO/aasp-brutos.tar.gz" | cut -f1)"
fi

# --- Envio para fora da maquina ------------------------------------------
# Um backup que so existe no mesmo disco nao protege contra a perda da VM,
# que e justamente o risco de uma conta gratuita.
if [ -n "${RCLONE_DESTINO:-}" ] && command -v rclone >/dev/null 2>&1; then
	rclone copy "$DESTINO" "$RCLONE_DESTINO/$DATA" --quiet
	echo "  enviado para $RCLONE_DESTINO/$DATA"

	rclone delete "$RCLONE_DESTINO" --min-age "${RETENCAO}d" --quiet || true
	rclone rmdirs "$RCLONE_DESTINO" --leave-root --quiet || true
	echo "  retencao remota aplicada (${RETENCAO} dias)"
else
	echo "  AVISO: rclone nao configurado - o backup existe apenas nesta maquina."
fi

# --- Limpeza local --------------------------------------------------------
# Localmente basta uma janela curta: a copia longa fica no Drive.
find "$PASTA_BACKUP" -maxdepth 1 -type d -name '20*' -mtime +7 -exec rm -rf {} + 2>/dev/null || true

echo "[$(date '+%F %T')] Backup concluido."
