# Sistema de Gestão Jurídica

Aplicação web para escritório pequeno (até ~8 pessoas). Backend **Node.js + Express**, banco **SQLite**, frontend **HTML/CSS/JS** (sem build).

**Produção:** [https://roseniadv.duckdns.org](https://roseniadv.duckdns.org) — VM Ubuntu na Oracle Cloud (São Paulo), HTTPS pelo Caddy, fuso `America/Sao_Paulo`.

Não é mais um sistema “100% local”. Integrações externas:

| Integração | Obrigatória? | O que sai do escritório |
|---|---|---|
| API de Intimações da AASP | Só se a chave estiver configurada | Metadados e texto das intimações, para importar |
| API pública DataJud (CNJ) | Só se `DATAJUD_API_KEY` (ou chave no banco) estiver configurada | Número CNJ consultado; recebe metadados e movimentações públicas |
| Groq (resumo com IA) | Não | Texto da publicação, para gerar o resumo |
| Login com Google | Não (código pronto, credenciais ainda não) | E-mail da conta Google na autenticação |
| Backup no Google Drive | Sim (rclone + cron 03:00) | Cópia do banco e dos modelos na pasta `BackupGestaoJuridica` |
| Acervo de documentos | Sim (rclone) | Arquivo original na pasta `AcervoDocumentos` (lixeira 60 dias se excluir no site) |

Sem essas chaves, o restante do sistema funciona só com login e senha.

## 1. Produção (já no ar)

- Endereço: `https://roseniadv.duckdns.org`
- Conta só quem o administrador cria (menu **Usuários**). Não há cadastro público.
- Monitoramento: UptimeRobot em `https://roseniadv.duckdns.org/health`
- Máquina: Oracle Always Free, formato `VM.Standard.E2.1.Micro` (Ampere estava sem vaga em São Paulo)
- Serviço: `systemd` (`gestao-juridica`), arquivos em `/opt/gestao-juridica`, ambiente em `/etc/gestao-juridica.env`
- Reinstalação numa VM Ubuntu: `sudo bash implantacao/instalar.sh <dominio> <email>`

O seed cria **um** administrador (`admin`) com senha aleatória, exibida **uma vez** no terminal, e marcada como provisória (troca obrigatória no primeiro acesso). Não use senha `1234`.

Feriados 2026–2027 já entram no seed: nacionais, Carnaval/Paixão/Corpus (foro), **20 de setembro (RS)** e **11 de fevereiro — Nossa Senhora de Lourdes (Veranópolis)**. O aniversário da cidade (15/01) não entra como feriado legal; cadastre na Agenda se o fórum fechar nesse dia.

## 2. Desenvolvimento local

Node.js **22.5 ou superior** (`node:sqlite`).

```
npm install
npm run seed
npm start
```

Abre em `http://localhost:3000`. Em desenvolvimento o `SESSION_SECRET` é gerado a cada restart (todo mundo desloga). Em produção ele vem de `/etc/gestao-juridica.env` e é obrigatório.

Scripts: `npm run resetar-senha -- <login>`, `npm run reimportar-aasp` (se um dia da AASP gravou o JSON bruto mas falhou no banco).

Os `.bat` (`instalar.bat`, `iniciar.bat`) ainda servem para uso em Windows na rede local.

## 3. Banco e arquivos

Arquivo `dados/escritorio.db` (WAL). Tabelas principais: `usuarios`, `sessoes`, `auditoria`, `clientes`, `processos`, `etiquetas`, `modelos`, `documentos`, `prazos`, `anotacoes`, `feriados`, `publicacoes`, `movimentacoes`, `configuracoes`. Definição em [db/schema.sql](db/schema.sql).

Modelos e documentos são arquivos em `uploads/` (Word etc.), sem editor embutido. JSON bruto da AASP, quando houver busca, fica em `dados/aasp-brutos/`.

## 4. Publicações (AASP)

A cada 4 horas (e no botão **Buscar agora**) o servidor consulta a API da AASP e coloca as intimações numa fila. **Nunca cria prazo sozinho.**

A busca usa `diferencial=true`: o que foi baixado **não volta** numa consulta futura. O código grava o JSON do dia em disco antes de parsear, usa transação, lock contra duas buscas ao mesmo tempo, e timeout na rede. Se a gravação falhar, `npm run reimportar-aasp`.

Primeira sincronização em produção (ago/2026): chave válida, **0** intimações pendentes nos últimos 30 dias (fila da AASP já vazia ou sem publicação nova).

## 5. Andamento processual (DataJud / CNJ)

Consulta periódica à [API pública do DataJud](https://www.cnj.jus.br/sistemas/datajud/api-publica/) para acompanhar **movimentações** dos processos cadastrados. Não mistura com a AASP:

| Fonte | Para quê |
|---|---|
| AASP | Intimações/publicações (fila em Publicações) |
| DataJud | Andamento/movimentações do processo (aba Andamento) |

O aplicativo **não** usa a chave no JavaScript público: o admin cola no modal (como a AASP); a API só devolve a chave mascarada. Consultas ao DataJud saem só do backend.

**Limitação:** o DataJud é fonte de metadados e movimentações, **não é tempo real**. Uma movimentação pode existir no tribunal antes de aparecer no DataJud.

### Configuração

- **Publicações → Configurações** (só administrador): cole a chave pública do DataJud, teste e salve. Fica no banco (`configuracoes.datajud_chave`), no mesmo lugar da AASP e da Groq.
- Opcional: `DATAJUD_API_KEY` no ambiente, usada só se ainda não houver chave no banco.
- Rate limit oficial do termo de uso: no máximo **120 req/min**. O sistema usa `DATAJUD_MAX_REQ_POR_MINUTO` (padrão 60) e espera entre processos do lote.

### Job

- Frequência: cerca de **1 vez por dia** (`DATAJUD_INTERVALO_MS`, padrão 24h).
- Primeira execução **1 hora após o processo subir** (não no deploy/boot), depois o intervalo.
- Só processos **ativos** com número CNJ. Lote (`DATAJUD_LOTE`, padrão 20). Falha em um processo não para os demais.
- Tribunal sai do próprio número CNJ (segmentos J.TR) → alias `api_publica_tjsp`, `api_publica_tjrs`, `api_publica_trf4`, etc. Estaduais, TRFs, TRTs, TREs, superiores e TJMs mapeados em `servicos/datajudTribunais.js`.

### Sync manual

No detalhe do processo: **Atualizar andamento**. Ou `POST /api/processos/:id/sincronizar-movimentacoes` (usuário logado). Mesma rotina do cron.

### Deduplicação e primeira sync

Fingerprint SHA-256 de código + data/hora + nome + complementos, único por `(processo_id, origem, fingerprint)`. `INSERT OR IGNORE` + UNIQUE no SQLite.

A **primeira** sincronização importa o histórico (`historico_inicial`) e **não** dispara o sino. Só movimentação **nova** depois disso vira alerta (“Nova movimentação no processo …”).

### Arquitetura (provedor)

`servicos/movimentacoes.js` depende de um provedor (`consultarProcesso`), hoje só o DataJud (`servicos/datajudProvedor.js`). Troca futura: `MOVIMENTACAO_PROVEDOR=tribunal_direto` quando esse módulo existir. Pipeline: provedor → DTO → fingerprint → banco → sino.

Testes (API mockada, sem chamar o CNJ): `npm test`.

## 6. Resumo com IA (Groq)

Opcional, chave em Publicações → Configurações ([console.groq.com/keys](https://console.groq.com/keys)). O texto vai para a Groq. Modelos `openai/gpt-oss-120b` e reserva `openai/gpt-oss-20b`. Sem chave, as publicações funcionam sem resumo.

## 7. O que o sistema faz

Processos e clientes, modelos, documentos, agenda/prazos (calculadora em dias úteis com feriados), anotações, painel reorganizável, busca, alertas (prazos e movimentações novas), publicações AASP, andamento DataJud, usuários (só admin), auditoria (só admin), perfil próprio.

## 8. Ainda falta (produção)

- Testar **restauração** de um backup completo (`restaurar.sh`).
- Credenciais **Google OAuth** (o botão só aparece com `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` e `GOOGLE_REDIRECT_URI` no env).
- Cadastrar as demais pessoas no menu Usuários.
- Groq, se quiserem resumo automático.

### [BACKLOG] Captura direta de movimentações nos tribunais

Implementar um novo provedor (`ProcessMovementProvider` / `consultarProcesso`) capaz de consultar diretamente PJe, e-SAJ, eproc, Projudi e demais fontes oficiais, permitindo atualização mais rápida do que a sincronização via DataJud. A implementação deverá ser modular por sistema/tribunal e reutilizar o pipeline existente de normalização, deduplicação, persistência e notificações.

Motivação: o DataJud depende do envio dos tribunais e pode atrasar. Captura direta (APIs oficiais, certificado, credenciais — **sem scraping agora**) se pareceria mais com Astrea/Escavador. Não implementar nesta versão.

Troca futura do DuckDNS pelo domínio do escritório: apontar o DNS, uma linha no Caddyfile, atualizar o redirect URI do Google; as sessões caem porque o cookie é do domínio.

## 9. Estrutura

```
server.js                 Express, sessão, helmet, /health, jobs AASP e DataJud
db/                       schema, conexão (exige TZ America/Sao_Paulo), seed
middleware/               login, admin, upload, store de sessão no SQLite
servicos/                 AASP, DataJud/movimentações, Groq, auditoria
rotas/                    API REST em /api/...
testes/                   node --test (DataJud mockado)
implantacao/              instalar.sh, Caddyfile, systemd, backup.sh, restaurar.sh
public/                   frontend estático
dados/                    banco (não vai para o git)
uploads/                  arquivos enviados (não vão para o git)
```
