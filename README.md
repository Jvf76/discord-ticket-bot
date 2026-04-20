# 🎫 Discord Ticket Bot

Bot de sistema de tickets para Discord com transcript automático em HTML, gerenciamento de usuários e cargos, desenvolvido em JavaScript com Node.js utilizando discord.js v14.

---

## 🚀 Funcionalidades

- **📩 Criação de tickets por setor** — painel com menu de seleção para RH, Financeiro, NOC, Estoque, Cobrança, Suporte, Agendamento e Comercial
- **🔒 Canais privados** — cada ticket abre um canal exclusivo visível apenas ao solicitante e ao setor responsável
- **🤝 Assumir ticket** — membros do setor podem assumir o atendimento, registrando o responsável
- **👥 Adicionar pessoas e cargos** — o responsável ou administrador pode incluir outros usuários ou cargos ao ticket
- **📄 Transcript automático em HTML** — ao fechar, gera um arquivo `.html` estilizado com tema Discord contendo todo o histórico
- **🖼️ Imagens e anexos embutidos** — fotos, PDFs, vídeos e arquivos são baixados e incorporados no transcript em base64, funcionando mesmo offline
- **🔍 Nomes reais nas menções** — menções de usuários, cargos e canais são resolvidas para os nomes reais no transcript
- **📬 Envio automático** — o transcript é enviado por DM ao solicitante, ao responsável que assumiu o ticket e registrado nos canais de logs/fechados

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

CANAL_ABERTURA_ID=id_do_canal_onde_o_painel_fica
CANAL_LOGS_TICKETS_ID=id_do_canal_de_logs

# Opcional: canais de tickets fechados por setor
CANAL_FECHADOS_RH_ID=
CANAL_FECHADOS_FINANCEIRO_ID=
CANAL_FECHADOS_NOC_ID=
CANAL_FECHADOS_ESTOQUE_ID=
CANAL_FECHADOS_COBRANCA_ID=
CANAL_FECHADOS_SUPORTE_ID=
CANAL_FECHADOS_AGENDAMENTO_ID=
CANAL_FECHADOS_COMERCIAL_ID=

# Categorias de cada setor
CATEGORIA_RH_ID=
CATEGORIA_FINANCEIRO_ID=
CATEGORIA_NOC_ID=
CATEGORIA_ESTOQUE_ID=
CATEGORIA_COBRANCA_ID=
CATEGORIA_SUPORTE_ID=
CATEGORIA_AGENDAMENTO_ID=
CATEGORIA_COMERCIAL_ID=

# Cargos responsáveis por cada setor
CARGO_RH_ID=
CARGO_FINANCEIRO_ID=
CARGO_NOC_ID=
CARGO_ESTOQUE_ID=
CARGO_COBRANCA_ID=
CARGO_SUPORTE_ID=
CARGO_AGENDAMENTO_ID=
CARGO_COMERCIAL_ID=
```

---

## ▶️ Como executar

```bash
node index.js
```

O bot iniciará e publicará automaticamente o painel de abertura de tickets no canal configurado em `CANAL_ABERTURA_ID`.

---

## 📄 Transcript

Ao fechar um ticket, o bot gera um arquivo `transcript-<usuario>-<data>.html` contendo:

- Cabeçalho com solicitante, setor, cargo responsável, responsável pelo fechamento e data
- Histórico completo de mensagens com avatares e timestamps
- Imagens exibidas inline com lightbox e botão de download
- PDFs com visualizador embutido e botão de download
- Outros arquivos (DOCX, ZIP, etc.) com botão de download

O arquivo é enviado por DM ao solicitante, por DM ao responsável que assumiu o ticket e postado no canal de logs. Se o canal de tickets fechados do setor estiver configurado no `.env`, ele também recebe uma cópia.

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
| Enviar mensagens privadas | Entregar o transcript ao solicitante |

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
