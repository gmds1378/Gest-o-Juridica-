# Backlog de ideias

Lista viva do que dá para testar neste projeto. O site em
`https://roseniadv.duckdns.org` é o laboratório; o escritório (até ~8 pessoas)
continua o critério de “vale a pena agora”.

**Hoje não existe CI/CD.** Não há `.github/workflows`, Docker nem deploy
automático: o `main` no GitHub **não** atualiza a VM. O que está no ar foi
copiado na mão (scp / `implantacao/instalar.sh`).

---

## Agora / próximo (barato e útil)

- [ ] **GitHub Actions no `main`** — só conferir o código (Node 22, `node --check`
      nos `.js`, `npm ci`). Sem deploy no começo. É o “pipeline” mínimo.
- [ ] **Deploy pela Actions** — depois do check, SSH na Oracle e `git pull` +
      `systemctl restart` (ou rerodar o instalador sem apagar `dados/`).
      Segredo: chave SSH e host nos Secrets do GitHub. Assim commit na `main`
      vira o site.
- [ ] **Domínio próprio** — apontar um subdomínio (ex. `sistema.seudominio.com.br`)
      para `147.15.66.219`, uma linha no Caddyfile, o Caddy emite o certificado.
      Atualizar o redirect URI do Google. Sessões caem (cookie do domínio).
- [ ] **Backup no Drive** — rclone + teste de `restaurar.sh` (já no plano de publicação).
- [ ] **Dependabot** — PRs automáticos de `npm` (express, multer, groq-sdk).

## Infra e “coisas que sempre quis testar”

- [ ] **Cloudflare na frente** — DNS + proxy laranja, SSL, menos exposição do IP
      da Oracle. DuckDNS deixa de ser o endereço público.
- [ ] **Infra como código** — OpenTofu/Terraform da VCN, Security List e instância
      Oracle (aprender cloud sem clicar no console).
- [ ] **Docker** — imagem da app + volume para `dados/` e `uploads/`. Útil se um
      dia sair da Oracle. Não é obrigatório com 8 usuários.
- [ ] **Segundo ambiente (staging)** — `staging.seudominio` ou outra VM micro.
      Actions: `main` → produção, PRs → staging. Custa tempo e um pouco de RAM.
- [ ] **Swap/monitor de disco** — a Micro tem 1 GB; alerta se `dados/` ou disco
      encherem (UptimeRobot não vê isso).
- [ ] **unattended-upgrades** na Ubuntu — patches de segurança sozinhos.
- [ ] **Fail2ban** no SSH — o 22 está aberto para `0.0.0.0/0`.

## Qualidade e operação

- [ ] **Smoke test** — Playwright ou um `curl` autenticado em `/health` + login
      após o deploy.
- [ ] **Logs** — já tem `journalctl` e Caddy; dá para mandar para um Grafana Cloud
      free ou só um painel simples.
- [ ] **README de operação** — o que fazer se a VM cair, como renovar DNS, onde
      estão os secrets (`/etc/gestao-juridica.env`).

## Produto (quando o laboratório não estiver no caminho)

- [ ] Groq ligado (resumo de publicações).
- [ ] Cadastrar o resto da equipe.
- [ ] DataJud / outras integrações já esboçadas no código, com calma.

## De propósito não fazer agora

Alta disponibilidade, Kubernetes, Postgres “porque é o certo”, CDN global,
fila Redis. Para 8 pessoas e um MVP, isso é custo e complexidade sem ganho.

---

Ordem sugerida se o objetivo é **aprender de verdade**: Actions de check →
domínio próprio → deploy por SSH na Actions → Drive → Cloudflare.