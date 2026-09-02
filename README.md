# 🎫 Discord Ticket Bot

Bot de sistema de tickets para Discord com transcript automático em HTML, gerenciamento de usuários e cargos, desenvolvido em JavaScript com Node.js utilizando discord.js v14.

---

## 🚀 Funcionalidades

- **📩 Criação de tickets por setor** — painel com menu de seleção para RH, Financeiro, NOC, Estoque, Cobrança, Suporte, Agendamento, Comercial e Auditoria
- **🏪 Abertura comercial separada** — canal proprio para o comercial abrir ticket ao suporte com ID do cliente, relato, atendente, telefone e motivo obrigatório
- **🔒 Canais privados** — cada ticket abre um canal exclusivo visível apenas ao solicitante e ao setor responsável
- **🤝 Assumir ticket** — membros do setor podem assumir o atendimento, registrando o responsável
- **👥 Adicionar pessoas e cargos** — apenas o solicitante ou o responsável que assumiu pode incluir outros usuários ou cargos ao ticket
- **📄 Transcript automático em HTML** — o solicitante ou o responsável que assumiu pode fechar o ticket, gerando um arquivo `.html` estilizado com tema Discord contendo todo o histórico
- **🔗 Link direto do transcript** — opcionalmente o bot publica o HTML em uma pasta pública e envia um link de acesso no domínio configurado, sem precisar baixar anexo
- **📊 Relatório de atendimento** — comando `/relatorio` para administradores verem rankings por setor, solicitante e responsável
- **🖼️ Imagens e anexos embutidos** — fotos, PDFs, vídeos e arquivos são baixados e incorporados no transcript em base64, funcionando mesmo offline
- **🔍 Nomes reais nas menções** — menções de usuários, cargos e canais são resolvidas para os nomes reais no transcript
- **📬 Envio automático** — o transcript é enviado por DM ao solicitante, por DM ao responsável que assumiu e ao canal de fechados do setor correspondente

---

## 🛠️ Tecnologias utilizadas

- [Node.js](https://nodejs.org/)
- [discord.js v14](https://discord.js.org/)
- [dotenv](https://github.com/motdotla/dotenv)

---

## 📦 Instalação

Clone o repositório:

```bash
git clone https://github.com/Jvf76/discord-ticket-bot.git
```

Entre na pasta:

```bash
cd discord-ticket-bot
```

Instale as dependências:

```bash
npm install
```

---

## ⚙️ Configuração

Crie um arquivo `.env` baseado no `.env.example`:

```bash
cp .env.example .env
```

Preencha o `.env` com suas informações:

```env
TOKEN=seu_token_aqui
CLIENT_ID=id_da_aplicacao_do_bot

CANAL_ABERTURA_ID=id_do_canal_onde_o_painel_fica
CANAL_ABERTURA_TICKET_COMERCIAL=id_do_canal_comercial_para_abrir_ticket_ao_suporte
CANAL_RELATORIOS_TICKETS_ID=id_do_canal_de_relatorios
CANAL_RANKING_TICKETS_ID=id_do_canal_de_rankings

# Opcional: caminho do banco SQLite local
DATABASE_PATH=data/tickets.db

# Opcional: publicar transcripts em um dominio/pasta publica
TRANSCRIPT_BASE_URL=
TRANSCRIPT_PUBLIC_DIR=data/public/transcripts
TRANSCRIPT_ROUTE_PREFIX=/transcripts
TRANSCRIPT_HTTP_PORT=

# Opcional: hora em Sao Paulo para publicar o relatório diario
RELATORIO_DIARIO_HORA=8

# Opcional: canais de tickets fechados por setor
CANAL_FECHADOS_RH_ID=
CANAL_FECHADOS_FINANCEIRO_ID=
CANAL_FECHADOS_NOC_ID=
CANAL_FECHADOS_ESTOQUE_ID=
CANAL_FECHADOS_COBRANCA_ID=
CANAL_FECHADOS_SUPORTE_ID=
CANAL_FECHADOS_AGENDAMENTO_ID=
CANAL_FECHADOS_COMERCIAL_ID=
CANAL_FECHADOS_AUDITORIA_ID=

# Categorias de cada setor
CATEGORIA_RH_ID=
CATEGORIA_FINANCEIRO_ID=
CATEGORIA_NOC_ID=
CATEGORIA_ESTOQUE_ID=
CATEGORIA_COBRANCA_ID=
CATEGORIA_SUPORTE_ID=
CATEGORIA_AGENDAMENTO_ID=
CATEGORIA_COMERCIAL_ID=
CATEGORIA_AUDITORIA_ID=

# Cargos responsáveis por cada setor
CARGO_RH_ID=
CARGO_FINANCEIRO_ID=
CARGO_NOC_ID=
CARGO_ESTOQUE_ID=
CARGO_COBRANCA_ID=
CARGO_SUPORTE_ID=
CARGO_AGENDAMENTO_ID=
CARGO_COMERCIAL_ID=
CARGO_AUDITORIA_ID=
```

---

## ▶️ Como executar

```bash
node deploy-commands.js
node index.js
```

O deploy registra os comandos `/painel` e `/relatorio`. O bot iniciará e publicará automaticamente o painel de abertura de tickets no canal configurado em `CANAL_ABERTURA_ID`. Se `CANAL_ABERTURA_TICKET_COMERCIAL` estiver configurado, ele tambem publica um painel separado para o comercial abrir tickets diretamente para o suporte.

Também é possível usar os scripts:

```bash
npm run deploy
npm start
```

O relatório de tickets é salvo localmente no banco SQLite `data/tickets.db`. Os dados são atualizados imediatamente quando alguém abre ou assume um ticket. O comando `/relatorio` aceita filtros opcionais: use `tipo: respostas` para ver os setores com mais tickets respondidos e as pessoas que mais assumiram atendimentos, e use `mes`/`ano` para consultar um período específico, por exemplo o mês fechado.

O comando `/relatorio` orienta o uso do painel fixado em `CANAL_RELATORIOS_TICKETS_ID`; as consultas do menu aparecem de forma privada para quem executou. O ranking diário é atualizado apenas em `CANAL_RANKING_TICKETS_ID`, uma vez por dia, a partir da hora definida em `RELATORIO_DIARIO_HORA`, no horário de São Paulo. Ele guarda no banco a última data atualizada para não repetir caso reinicie no mesmo dia.

Se existir um relatório antigo em `data/relatorios.json`, o bot tenta importar esses dados para o SQLite na primeira inicialização com o banco vazio.

## 📄 Transcript

Ao fechar um ticket, o bot gera um arquivo `transcript-<usuario>-<data>.html` contendo:

- Cabeçalho com solicitante, setor, cargo responsável, responsável pelo fechamento e data
- Histórico completo de mensagens com avatares e timestamps
- Imagens exibidas inline com lightbox e botão de download
- PDFs com visualizador embutido e botão de download
- Outros arquivos (DOCX, ZIP, etc.) com botão de download

O transcript pode funcionar de duas formas:

- Sem configuração extra, o bot continua enviando o arquivo HTML como anexo por DM e no canal de fechados.
- Se `TRANSCRIPT_BASE_URL` estiver configurado, o bot salva o HTML em `TRANSCRIPT_PUBLIC_DIR` e envia um link direto para abrir no navegador.

Se quiser que o próprio processo do bot sirva esses arquivos, configure também `TRANSCRIPT_HTTP_PORT`. Nesse modo, o bot abre um servidor HTTP simples em `TRANSCRIPT_ROUTE_PREFIX` e você pode apontar seu domínio ou reverse proxy para essa porta.

Exemplo:

```env
TRANSCRIPT_BASE_URL=https://transcripts.seudominio.com.br
TRANSCRIPT_PUBLIC_DIR=data/public/transcripts
TRANSCRIPT_ROUTE_PREFIX=/transcripts
TRANSCRIPT_HTTP_PORT=8099
```

> **Importante:** os anexos são baixados antes do canal ser deletado e embutidos em base64 no HTML, garantindo que tudo continue funcionando mesmo após o ticket ser fechado.

---

## 📌 Permissões necessárias

Certifique-se de que o bot possui as seguintes permissões no servidor:

| Permissão | Motivo |
|---|---|
| Visualizar canais | Acessar categorias e canais |
| Gerenciar canais | Criar e deletar canais de ticket |
| Gerenciar permissões | Configurar permissões nos canais |
| Enviar mensagens | Postar o painel e mensagens nos tickets |
| Ler histórico de mensagens | Coletar mensagens para o transcript |
| Enviar mensagens privadas | Entregar o transcript ao solicitante e ao responsável |

---

## 📁 Estrutura do projeto

```
discord-ticket-bot/
├── index.js        # Código principal do bot
├── .env            # Variáveis de ambiente (não versionar)
├── .env.example    # Modelo de configuração
├── package.json
└── README.md
```

---

## 📄 Licença

Este projeto pode ser usado livremente para fins de estudo.

---

## 👨‍💻 Autor

Desenvolvido por **João Vítor**
