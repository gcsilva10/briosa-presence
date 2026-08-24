# Briosa Presence

Arquivo de jogos da Associação Académica de Coimbra, organizado por época desde 2011/12.

## Desenvolvimento

Requer Node.js 24 ou superior (a base de dados usa o módulo nativo `node:sqlite`).

```bash
npm install
npm run import:data
npm run import:clubs
npm run dev
```

O site fica disponível em `http://localhost:5173`.

## Dados

Os jogos e as presenças são guardados em `data/briosa.sqlite`. O importador consulta as páginas públicas de época do TheSportsDB e do Transfermarkt, filtra a Académica e atualiza os registos existentes sem criar duplicados. A importação cobre Primeira Liga, Segunda Liga, Liga 3, Taça de Portugal, Taça da Liga, Liga Europa e Supertaça desde 2011/12. Voltar a importar ou sincronizar jogos não apaga as presenças já marcadas.

Os clubes, aliases e referências aos emblemas também ficam guardados na base de dados. Os ficheiros são descarregados para `public/media/clubs` para o site não depender da API em cada visita. O importador é idempotente e respeita o limite da API gratuita:

```bash
npm run import:clubs
```

Use `npm run import:clubs -- --refresh` apenas quando quiser voltar a consultar todos os clubes. O modo `--rebuild` recria somente o catálogo de clubes, preservando jogos e presenças.

Sempre que o frontend é aberto, `POST /api/sync/current` verifica novamente a época atual. Novos jogos são inseridos e alterações de datas, estados ou resultados atualizam o registo existente. A mesma sincronização atualiza também as fichas relevantes: jogos novos, os três próximos jogos e jogos recentemente terminados cuja ficha ainda esteja incompleta. As fichas são atualizadas no máximo quatro de cada vez e respeitam uma cache de 12 horas. Pedidos simultâneos são agrupados e existe uma proteção de 60 segundos entre verificações do calendário.

```bash
npm run import:data
```

API local:

- `GET /api/seasons`
- `GET /api/matches?season=2026-2027`
- `GET /api/attendances`
- `PUT /api/matches/:id/attendance` com `{ "attended": true | false }`
- `GET /api/health`
- `POST /api/sync/current`

## Deploy recomendado: Railway

O servidor Node entrega o frontend compilado e a API no mesmo domínio. Para conservar o SQLite entre deploys, o projeto aceita `DATABASE_PATH`; quando o volume está vazio, copia automaticamente a base de dados incluída no repositório como ponto de partida.

1. Envie o repositório para o GitHub.
2. No Railway, crie um projeto com **Deploy from GitHub repo** e escolha este repositório.
3. No serviço, crie um volume e monte-o em `/data`.
4. Adicione a variável `DATABASE_PATH=/data/briosa.sqlite`.
5. Em **Settings → Networking**, escolha **Generate Domain**.
6. Confirme que o healthcheck `/api/health` fica saudável.

O `railway.json` já configura o build (`npm run build`) e o arranque (`npm start`). O Railpack instala as dependências antes de executar o build; não adicione outro `npm ci` ao Build Command. Use apenas uma réplica enquanto a aplicação usar SQLite.

Na Vercel, o frontend pode ser alojado normalmente, mas este backend não deve usar um ficheiro SQLite local porque o sistema de ficheiros das Functions não é armazenamento persistente. Para alojar tudo na Vercel, migre a base para Turso/libSQL ou Neon Postgres e transforme as rotas `/api` em Vercel Functions.

## Deploy dividido: Vercel + Railway

Esta é a configuração recomendada quando o frontend deve continuar na Vercel:

- **Vercel:** frontend React/Vite.
- **Railway:** servidor Node, sincronizações, API, SQLite e presenças.

Primeiro publique o Railway seguindo os passos acima e copie o domínio gerado, por exemplo `https://briosa-api-production.up.railway.app`. Confirme no browser que `<DOMINIO_RAILWAY>/api/health` devolve `{"status":"ok"}`.

Depois importe o mesmo repositório na Vercel. O ficheiro `vercel.json` configura o build Vite, a pasta `dist` e o fallback necessário para abrir diretamente páginas como `/presencas` e `/jogos/:id`. Em **Settings → Environment Variables**, crie em Production e Preview:

```text
VITE_API_URL=https://<DOMINIO_RAILWAY>
```

Não coloque uma barra `/` no fim. Faça redeploy e copie o domínio de produção da Vercel. Finalmente, volte ao Railway e crie:

```text
FRONTEND_URL=https://<DOMINIO_VERCEL>
```

Também sem barra no fim. Para autorizar mais de um domínio, separe-os por vírgulas. Depois do redeploy automático do Railway, o browser poderá consultar a API e guardar presenças. `VITE_API_URL` é uma configuração pública do frontend, não uma chave secreta.
