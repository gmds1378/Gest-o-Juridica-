# Sistema de Gestão Jurídica (uso local / rede do escritório)

Aplicação web para um escritório pequeno (3 usuários), 100% local — não envia
dados para nenhum serviço externo. Backend em **Node.js + Express**, banco de
dados **SQLite** (arquivo único, persistente), frontend em **HTML/CSS/JS puro**
(sem build, sem framework).

## 1. Pré-requisitos

Instale o **Node.js versão 22.5 ou superior** (o sistema foi testado com a
versão 24) no computador que vai funcionar como servidor (pode ser qualquer
um dos 3 computadores, ou um computador dedicado):

- Baixe em: https://nodejs.org
- O banco de dados usa o módulo `node:sqlite`, embutido no próprio Node.js a
  partir da versão 22.5 — não é necessário instalar Python, Visual Studio
  Build Tools nem nenhuma ferramenta de compilação nativa. `npm install` só
  baixa pacotes 100% em JavaScript.
- Após instalar, confirme abrindo um terminal (PowerShell) e rodando:
  ```
  node -v
  npm -v
  ```

## 2. Instalação (rodar uma única vez)

**Forma fácil:** dê dois cliques em [instalar.bat](instalar.bat). Uma janela
preta abre, instala tudo e cria o banco de dados sozinha.

**Forma manual (terminal):**

```powershell
npm install
npm run seed
```

- `npm install` baixa as dependências (Express, multer, etc.) — tudo pacotes
  100% em JavaScript, sem compilação nativa.
- `npm run seed` cria o banco de dados em `dados/escritorio.db` e os 3
  usuários iniciais:

| Usuário       | Login      | Senha inicial | Perfil        |
|---------------|------------|----------------|---------------|
| Gabriel       | `gabriel`  | `1234`         | Administrador |
| Roseni        | `roseni`   | `1234`         | Usuária       |
| Bruna         | `bruna`    | `1234`         | Usuária       |

> Qualquer usuário pode trocar seu próprio nome, login e senha a qualquer
> momento pelo próprio sistema: clique no seu nome no canto inferior esquerdo
> do menu → "Meu perfil". Não precisa editar nada por fora.

## 3. Rodando o servidor

**Forma fácil:** dê dois cliques em [iniciar.bat](iniciar.bat). Ele abre uma
janela do servidor (que precisa ficar aberta) e, depois de alguns segundos,
abre o navegador sozinho em `http://localhost:3000`.

**Forma manual (terminal):**

```powershell
npm start
```

Você verá algo como:

```
Sistema de Gestao Juridica rodando.
- Neste computador:  http://localhost:3000
- Na rede local:     http://<IP-DESTE-PC>:3000
```

Deixe esse terminal aberto — é ele quem mantém o servidor (e o banco de
dados) rodando. Se fechar a janela, o sistema para de responder para todo
mundo na rede.

### Acessando dos outros 2 computadores

1. No computador que está rodando o servidor, descubra o IP local (PowerShell: `ipconfig`, veja "Endereço IPv4", algo como `192.168.0.15`).
2. Nos outros computadores (mesma rede Wi-Fi/cabo), abra o navegador em:
   `http://192.168.0.15:3000` (troque pelo IP real).
3. Dica: no Windows, se o navegador não conectar, confirme que o Firewall do
   Windows não está bloqueando a porta 3000 (ele geralmente pergunta na
   primeira vez que o Node roda — escolha "Permitir acesso" em redes privadas).

### Deixar sempre ligado

Para não precisar abrir o terminal manualmente toda vez, o mais simples é
deixar o computador-servidor ligado com o terminal rodando `npm start` em
segundo plano, ou (mais avançado) instalar o pacote `pm2` /  configurar como
serviço do Windows — posso ajudar com isso depois se fizer sentido para o
escritório.

## 4. Estrutura do banco de dados (SQLite)

Arquivo único em `dados/escritorio.db` (criado automaticamente). Tabelas
principais (ver definição completa comentada em [db/schema.sql](db/schema.sql)):

- **usuarios** — login e senha (com hash) dos 3 usuários, perfil (admin/usuario).
- **clientes** — cadastro de clientes do escritório.
- **processos** — número CNJ, vara/comarca, parte contrária, área do direito,
  status, link do tribunal, link da pasta no Drive; vinculado a um cliente.
- **etiquetas** / **processos_etiquetas** — etiquetas coloridas (N:N com processos).
- **categorias_modelos** — categorias customizáveis da biblioteca de modelos.
- **modelos** — peças padrão (procuração, petição inicial, etc.): guarda o
  *arquivo enviado* (nome original, tamanho, tipo) — o conteúdo em si fica em
  `uploads/modelos/`, não no banco.
- **documentos** — arquivos vinculados a um processo/cliente (podem nascer de
  um modelo, que é copiado como ponto de partida). Arquivo em si fica em
  `uploads/documentos/`. O compartilhamento entre os 3 computadores é feito
  pelo próprio envio/download no sistema — não depende de link do Drive.
- **prazos** — prazos/compromissos da agenda, com responsável, prioridade e status.
- **anotacoes** — anotações rápidas, avulsas ou vinculadas a processo/cliente.
- **feriados** — usados pela calculadora de prazos em dias úteis.

Todas as tabelas são criadas automaticamente na primeira execução (`db/conexao.js`
executa `db/schema.sql`), então não é preciso rodar nada manualmente além do `seed`.

### Sobre os arquivos de Modelos e Documentos

O sistema **não tem editor de texto embutido**. Em vez disso, você envia um
arquivo já pronto (ex.: `.docx` feito no Word), o sistema guarda esse arquivo
em `uploads/`, e qualquer um dos 3 computadores pode baixá-lo, editar no Word
(inclusive offline) e depois enviar a versão atualizada de volta (substituindo
o arquivo). Isso vale tanto para a biblioteca de **Modelos** quanto para
**Documentos** — e ao criar um Documento a partir de um Modelo, o arquivo do
modelo é copiado como ponto de partida.

## 5. Estrutura do projeto

```
app/
├── instalar.bat            Clique duplo: instala tudo (1a vez)
├── iniciar.bat              Clique duplo: liga o sistema e abre o navegador
├── server.js               Ponto de entrada do backend (Express + sessão)
├── db/
│   ├── schema.sql           Definição de todas as tabelas
│   ├── conexao.js           Abre o banco e garante que as tabelas existem
│   └── seed.js              Cria os 3 usuários e categorias padrão
├── middleware/
│   ├── autenticacao.js      Middlewares exigirLogin / exigirAdmin
│   └── upload.js            Configuração do multer (upload de arquivos)
├── servicos/
│   └── aaspIntimacoes.js    Integração com a API de Intimações da AASP
├── rotas/                   Uma rota Express por entidade (API REST em /api/...)
├── dados/
│   └── escritorio.db        Banco SQLite (gerado automaticamente)
├── uploads/
│   ├── modelos/              Arquivos enviados na biblioteca de Modelos
│   └── documentos/           Arquivos enviados em Documentos
└── public/                  Frontend (servido como arquivos estáticos)
    ├── login.html
    ├── index.html            Shell do app (sidebar, busca, sino de alertas)
    ├── css/estilo.css         Tema claro/escuro, todos os estilos
    └── js/
        ├── api.js             Wrapper fetch (envia cookies de sessão)
        ├── roteador.js         Router simples baseado em #/hash
        ├── app.js              Bootstrap: login, tema, sino, busca global
        └── paineis/             Uma tela por arquivo (painel, processos, modelos, agenda, documentos, anotacoes)
```

## 6. O que já está pronto nesta primeira entrega

- Backend completo (autenticação por sessão, todas as rotas REST, upload/download de arquivos).
- Tela **Processos e Clientes**: lista com busca/filtro, cadastro de cliente,
  cadastro de processo (com etiquetas coloridas, link do tribunal e link do
  Drive), e a tela de detalhe com as 4 abas (Detalhes, Documentos, Prazos,
  Anotações).
- Tela **Modelos**: categorias customizáveis, upload de arquivo (ex.: .docx),
  download, substituição do arquivo, "criar documento a partir deste modelo"
  (copia o arquivo como ponto de partida).
- Tela **Agenda e Prazos**: calendário mensal, cadastro de prazo com
  responsável/prioridade, calculadora de prazos (dias úteis/corridos,
  considerando feriados cadastrados), gestão de feriados.
- Telas **Painel**, **Documentos** e **Anotações** também implementadas e
  funcionais (cards de prazos, upload/download de arquivos vinculados a
  processo, bloco de notas com fixar/buscar), para o sistema já funcionar de
  ponta a ponta.
- Busca global, sino de alertas (prazos em até 3 dias) e modo escuro no topo,
  válidos em todas as telas.
- **Painel**: blocos reorganizáveis — estatísticas, prazos próximos, prazos
  por responsável, anotações recentes e **Tribunais e links úteis** (com
  edição dos links, não só adicionar/remover). Cada bloco pode ser arrastado
  pela alcinha (⠿) para reordenar e redimensionado (metade/largura total)
  pelo botão no canto. O arranjo escolhido fica salvo para o escritório todo.
- **Publicações**: importação automática de intimações via API da AASP (ver
  seção 8), numa fila de revisão — nunca cria prazo sozinho, sempre com
  confirmação humana.
- **Meu perfil**: qualquer usuário troca seu próprio nome, login e senha
  direto pelo sistema (clique no nome, no canto inferior esquerdo do menu).

## 7. Integração com a API de Intimações da AASP

O sistema busca automaticamente, a cada 4 horas, publicações novas na API de
Intimações da AASP (associação de advogados) e coloca numa fila de revisão em
**Publicações**. Ninguém precisa ficar checando o Diário de Justiça manualmente.

- **Configurar**: somente o administrador vê o botão "⚙ Configurar API" na tela
  Publicações. A chave fica em `intimacaoapi.aasp.org.br`, na área de
  Intimações do cadastro AASP do escritório.
- **Como funciona**: o servidor consulta a API, traz as publicações novas, e
  tenta vincular automaticamente a um processo já cadastrado (pelo número
  CNJ). O texto da publicação fica disponível para leitura, mas **o sistema
  nunca calcula ou cria um prazo sozinho** — alguém do escritório revisa e
  clica em "Criar prazo" (que já abre com o vencimento pronto para usar a
  calculadora de prazos).
- **Importante**: cada consulta à API marca as publicações como "baixadas" do
  lado da AASP — ou seja, não aparecem de novo numa consulta futura. Uma vez
  importadas, elas ficam guardadas com segurança no banco de dados local.
- Botão "🔄 Buscar agora" na tela Publicações força uma busca imediata, sem
  esperar pelo próximo ciclo automático.
- Quando uma publicação chega sem processo vinculado (número CNJ novo, ainda
  não cadastrado), o botão **"📎 Cadastrar processo"** cria o processo e o
  cliente direto a partir dos dados da intimação — o nome do cliente vem
  pré-preenchido (quando identificável no texto), mas sempre editável antes
  de confirmar. O sistema verifica duplicidade automaticamente: se já existir
  um processo com aquele número CNJ ou um cliente com aquele nome, reaproveita
  em vez de cadastrar de novo.
- Filtros de **tribunal/jornal** e **ordenação por data** (mais recentes ou
  mais antigas primeiro), acima da lista.

## 8. Resumo automático com IA (Groq)

Opcional: se o administrador configurar uma chave gratuita da Groq (tela
Publicações → ⚙ Configurações), toda publicação nova importada ganha
automaticamente um resumo curto gerado por IA — cobrindo teor da publicação,
quem está sendo intimado e prazo/data, quando identificáveis — sem precisar
ler o texto completo. Publicações antigas (sem resumo) têm um botão
**"🤖 Resumir com IA"** para gerar sob demanda, e um resumo já existente pode
ser refeito a qualquer momento com **"🔄 Gerar novamente"**.

- Chave gratuita, sem cartão de crédito, em **console.groq.com/keys**.
- A Groq roda modelos abertos (Llama, GPT-OSS) em hardware próprio de alta
  velocidade — não é a mesma empresa do Grok (xAI). O texto da publicação é
  enviado para a Groq processar (diferente da AASP, aqui é conteúdo do
  processo, não só metadado — por isso essa integração é totalmente opcional).
- Sem chave configurada, tudo funciona normalmente, só sem os resumos.
- Usa o modelo `openai/gpt-oss-120b` (melhor qualidade), dentro do plano
  gratuito: 1.000 requisições e 200 mil tokens por dia. Se a cota de tokens
  do dia acabar (acontece em dias de importação pesada), o sistema cai
  automaticamente para o `openai/gpt-oss-20b` como reserva — cota separada,
  então dobra a margem do dia sem precisar trocar nada manualmente.

## 9. Próximos passos sugeridos

- Trocar as senhas iniciais (ou usar "Meu perfil" para isso).
- Cadastrar os feriados estaduais/municipais relevantes na Agenda (⚙ Configurar
  feriados) para a calculadora de prazos ficar precisa.
- Se quiser, posso automatizar o backup da pasta `dados/` (banco de dados) e
  `uploads/` (arquivos de Modelos e Documentos) — ex.: copiar para o Google
  Drive local todo fim de dia.
