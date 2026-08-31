#!/usr/bin/env bash
#
# Instala o sistema numa VM Ubuntu limpa (testado no Ubuntu 22.04 e 24.04 da
# Oracle Cloud Always Free).
#
#   sudo bash implantacao/instalar.sh SEUNOME.duckdns.org seu-email@exemplo.com
#
# O que faz: instala Node/Caddy/sqlite3/rclone, cria o usuario de servico,
# copia o projeto para /opt/gestao-juridica, gera o arquivo de ambiente com um
# SESSION_SECRET aleatorio, abre as portas no iptables, registra o servico no
# systemd e agenda o backup diario.
#
# Rodar de novo e seguro: nao sobrescreve o arquivo de ambiente ja existente
# (e portanto nao troca o SESSION_SECRET nem desloga ninguem).

set -euo pipefail

DOMINIO="${1:-}"
EMAIL="${2:-}"
PROJETO=/opt/gestao-juridica
ARQUIVO_ENV=/etc/gestao-juridica.env
USUARIO=gestao
VERSAO_NODE=22

if [ "$EUID" -ne 0 ]; then
	echo "Rode com sudo: sudo bash implantacao/instalar.sh SEUNOME.duckdns.org seu-email@exemplo.com"
	exit 1
fi

if [ -z "$DOMINIO" ] || [ -z "$EMAIL" ]; then
	echo "Uso: sudo bash implantacao/instalar.sh <dominio> <email>"
	echo "Ex.:  sudo bash implantacao/instalar.sh escritoriosilva.duckdns.org silva@exemplo.com"
	exit 1
fi

ORIGEM="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> Instalando dependencias do sistema"
apt-get update -qq
apt-get install -y -qq curl ca-certificates gnupg sqlite3 rclone tzdata debian-keyring debian-archive-keyring apt-transport-https

echo "==> Node.js $VERSAO_NODE"
# O projeto usa node:sqlite, disponivel a partir do Node 22.5. A versao do
# repositorio padrao do Ubuntu e antiga demais.
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -c2- | cut -d. -f1)" -lt "$VERSAO_NODE" ]; then
	curl -fsSL "https://deb.nodesource.com/setup_${VERSAO_NODE}.x" | bash -
	apt-get install -y -qq nodejs
fi
echo "    $(node -v)"

echo "==> Caddy"
if ! command -v caddy >/dev/null 2>&1; then
	curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
	curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
	apt-get update -qq
	apt-get install -y -qq caddy
fi

echo "==> Fuso horario"
timedatectl set-timezone America/Sao_Paulo

echo "==> Usuario de servico ($USUARIO)"
# Sem shell e sem home: essa conta so existe para rodar o processo.
id -u "$USUARIO" >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin "$USUARIO"

echo "==> Copiando o projeto para $PROJETO"
mkdir -p "$PROJETO"
# Preserva dados/, uploads/ e backups/ de uma instalacao anterior.
rsync -a --delete \
	--exclude 'node_modules' --exclude '.git' \
	--exclude 'dados' --exclude 'uploads' --exclude 'backups' \
	"$ORIGEM/" "$PROJETO/"
mkdir -p "$PROJETO/dados" "$PROJETO/uploads/documentos" "$PROJETO/uploads/modelos" "$PROJETO/backups"

echo "==> Dependencias do projeto"
cd "$PROJETO"
npm ci --omit=dev --silent 2>/dev/null || npm install --omit=dev --silent

chown -R "$USUARIO:$USUARIO" "$PROJETO"
chmod +x "$PROJETO"/implantacao/*.sh

echo "==> Arquivo de ambiente ($ARQUIVO_ENV)"
if [ -f "$ARQUIVO_ENV" ]; then
	echo "    ja existe - preservado (o SESSION_SECRET atual continua valendo)"
else
	SEGREDO="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
	cat > "$ARQUIVO_ENV" <<EOF
NODE_ENV=production
PORTA=3000
TZ=America/Sao_Paulo
SESSION_SECRET=$SEGREDO

# Login com Google - preencha as tres linhas e reinicie o servico para ativar.
# GOOGLE_CLIENT_ID=
# GOOGLE_CLIENT_SECRET=
# GOOGLE_REDIRECT_URI=https://$DOMINIO/api/auth/google/callback

# Backup - configure o rclone antes (veja implantacao/README.md).
RCLONE_DESTINO=gdrive:BackupGestaoJuridica
BACKUP_RETENCAO_DIAS=30
EOF
	chmod 600 "$ARQUIVO_ENV"
	echo "    criado com SESSION_SECRET aleatorio"
fi

echo "==> Firewall (iptables)"
# A Oracle bloqueia em dois lugares: na Security List do painel web E no
# iptables da propria imagem Ubuntu. Esquecer o segundo e a causa mais comum
# de "abri a porta no painel mas o site nao carrega".
# Tem que entrar ANTES do REJECT padrao da imagem Oracle (senao a regra
# existe mas nunca e avaliada). Inserir na linha 6, como a versao anterior
# fazia, cai depois do REJECT e o Let's Encrypt nao consegue validar.
liberar_porta() {
	local porta="$1"
	iptables -C INPUT -p tcp --dport "$porta" -j ACCEPT 2>/dev/null && return 0
	local linha
	linha="$(iptables -L INPUT --line-numbers -n | awk '/REJECT|DROP/{print $1; exit}')"
	if [ -n "$linha" ]; then
		iptables -I INPUT "$linha" -p tcp --dport "$porta" -j ACCEPT
	else
		iptables -A INPUT -p tcp --dport "$porta" -j ACCEPT
	fi
}
liberar_porta 80
liberar_porta 443
if command -v netfilter-persistent >/dev/null 2>&1; then
	netfilter-persistent save >/dev/null
else
	apt-get install -y -qq iptables-persistent >/dev/null 2>&1 || true
	command -v netfilter-persistent >/dev/null 2>&1 && netfilter-persistent save >/dev/null
fi
echo "    portas 80 e 443 liberadas"

echo "==> Servico systemd"
cp "$PROJETO/implantacao/gestao-juridica.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable gestao-juridica >/dev/null
systemctl restart gestao-juridica

echo "==> Caddy ($DOMINIO)"
sed -e "s/SEUNOME.duckdns.org/$DOMINIO/" -e "s/SEU-EMAIL@exemplo.com/$EMAIL/" \
	"$PROJETO/implantacao/Caddyfile" > /etc/caddy/Caddyfile
mkdir -p /var/log/caddy && chown caddy:caddy /var/log/caddy
systemctl reload caddy 2>/dev/null || systemctl restart caddy

echo "==> Backup diario (cron, 03:00)"
cat > /etc/cron.d/gestao-juridica-backup <<EOF
# Backup diario do Sistema de Gestao Juridica
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
0 3 * * * $USUARIO $PROJETO/implantacao/backup.sh >> /var/log/gestao-juridica-backup.log 2>&1
EOF
touch /var/log/gestao-juridica-backup.log
chown "$USUARIO:$USUARIO" /var/log/gestao-juridica-backup.log

echo "==> Conferindo"
sleep 3
if curl -fsS http://localhost:3000/health >/dev/null; then
	echo "    aplicacao respondendo em /health"
else
	echo "    ATENCAO: a aplicacao nao respondeu. Veja: journalctl -u gestao-juridica -n 50"
fi

echo
echo "======================================================================"
echo "  Instalacao concluida"
echo "======================================================================"
echo "  Endereco:  https://$DOMINIO"
echo
echo "  Falta so criar o administrador (a senha aparece uma unica vez):"
echo "    cd $PROJETO && sudo -u $USUARIO npm run seed"
echo
echo "  Comandos uteis:"
echo "    sudo systemctl status gestao-juridica"
echo "    sudo journalctl -u gestao-juridica -f"
echo "    sudo -u $USUARIO $PROJETO/implantacao/backup.sh"
echo "======================================================================"
