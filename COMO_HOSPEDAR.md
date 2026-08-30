# Como hospedar o painel Obras & Contratos

Este projeto é uma aplicação React (Vite) pronta para publicar como site
estático — não precisa de servidor próprio, banco de dados ou backend.

## O que mudou em relação à versão do chat

A única diferença de comportamento em relação à versão que rodava aqui no
Claude é **onde os dados ficam salvos**:

- **Antes** (dentro do Claude): usava um armazenamento próprio do Claude.
- **Agora** (hospedado): usa o `localStorage` do seu navegador, através do
  arquivo `src/storage-shim.js` — ele imita exatamente a mesma "forma" da
  API antiga, então o resto do código do painel não precisou ser alterado.

**Isso importa porque:** os dados ficam guardados só no navegador e
computador onde você usar o painel. Se você:
- trocar de navegador (Chrome → Firefox, por exemplo),
- usar uma aba anônima/privada,
- limpar os dados de navegação/cookies do site,
- ou acessar de outro computador,

os dados **não estarão lá** — é como começar do zero. Para uso por uma
pessoa só, num navegador principal (o seu caso), isso funciona bem. Só
recomendo gerar o relatório em PDF de vez em quando (usando o próprio botão
"Gerar relatório" do painel) como uma cópia de segurança do que está
cadastrado, já que não há um backup automático.

## 1. Testar localmente (opcional, mas recomendado antes de publicar)

Você vai precisar do [Node.js](https://nodejs.org) instalado (versão 18 ou
mais recente). Depois, no terminal, dentro da pasta do projeto:

```bash
npm install
npm run dev
```

Isso abre o painel em `http://localhost:5173` no seu navegador, rodando
localmente, pra você conferir que está tudo certo antes de publicar.

## 2. Gerar a versão de produção

```bash
npm run build
```

Isso cria uma pasta `dist/` com os arquivos finais (HTML, JS, CSS) prontos
para publicar em qualquer hospedagem de site estático.

## 3. Publicar — três opções, da mais simples à mais completa

### Opção A — Netlify Drop (a mais simples, sem precisar de conta)

1. Rode `npm run build` (passo 2 acima).
2. Acesse **https://app.netlify.com/drop** no navegador.
3. Arraste a pasta `dist` inteira para a área indicada na página.
4. Pronto — o Netlify te dá um link público (tipo
   `nome-aleatorio.netlify.app`) na hora.
5. Se quiser manter esse link funcionando e conseguir atualizar depois,
   crie uma conta gratuita no Netlify (o link do arrasta-e-solta some se
   você não salvar/reivindicar o site com uma conta).

### Opção B — Vercel (também simples, com conta gratuita)

1. Crie uma conta gratuita em **https://vercel.com**.
2. Instale a ferramenta de linha de comando: `npm install -g vercel`.
3. Dentro da pasta do projeto, rode `vercel` e siga as perguntas (aceite as
   opções padrão). Ele detecta automaticamente que é um projeto Vite.
4. Nas próximas atualizações, rode `vercel --prod` para publicar de novo.

### Opção C — GitHub Pages (se você já usa GitHub)

1. Suba este projeto para um repositório no GitHub.
2. Rode `npm run build` e publique o conteúdo da pasta `dist` na branch
   `gh-pages` (dá pra automatizar isso com a extensão `gh-pages` do npm, ou
   com uma GitHub Action — posso te ajudar a montar isso se preferir esse
   caminho).

**Recomendação para o seu caso** (uso individual, sem precisar de nada
elaborado): comece pela **Opção A**. Se depois quiser atualizar o painel
com frequência, vale migrar para a **Opção B**, que facilita reenviar
novas versões.

## Estrutura do projeto

```
├── index.html              # HTML base, carrega o Tailwind via CDN
├── package.json
├── vite.config.js
└── src/
    ├── main.jsx             # ponto de entrada — monta o painel na página
    ├── storage-shim.js      # substitui o armazenamento do Claude por localStorage
    └── DashboardConstrutora.jsx   # o painel inteiro (o mesmo código de sempre)
```

Qualquer melhoria que você quiser no painel depois de hospedado, é só voltar
aqui no chat e pedir — eu ajusto o `DashboardConstrutora.jsx` e te devolvo o
arquivo atualizado pra você substituir na pasta `src/`.
