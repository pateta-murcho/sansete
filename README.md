# Sunset Tabas

E-commerce com 3 perfis de usuário (admin, cliente, motoboy). Frontend em React (Vite),
backend em Rust (Axum), microserviço de WhatsApp em Node (whatsapp-web.js).

## Estrutura

```
frontend/            React + Vite + TS + Tailwind v4 + Framer Motion + Zustand + React Router
backend/              Rust + Axum + SQLx (Postgres/Supabase) — API na porta 8080
whatsapp-gateway/     Node + Express + whatsapp-web.js — mensageria na porta 3001
```

## Rodando localmente

Precisa de 3 processos rodando ao mesmo tempo (em 3 terminais):

```bash
# 1. Backend (porta 8080)
cd backend
cargo run

# 2. WhatsApp gateway (porta 3001) — opcional para testar o resto do fluxo
cd whatsapp-gateway
npm install   # primeira vez
npm run dev

# 3. Frontend (porta 5173)
cd frontend
npm install   # primeira vez
npm run dev
```

Acesse `http://localhost:5173`.

## Banco de dados

Postgres do Supabase (projeto `zncpcsdpdkvjfknmmhpu`), configurado via `DATABASE_URL` em
`backend/.env`. As migrations (`backend/migrations/*.sql`) rodam automaticamente a cada
`cargo run` (via `sqlx::migrate!`), então subir o backend já deixa o schema em dia — não precisa
rodar nada manual no SQL Editor do Supabase.

Import: as credenciais de API do Supabase (anon/service_role) **não** servem pra conexão direta
via `sqlx` — é preciso a senha do Postgres (Project Settings → Database → Connection string).

## Credenciais de teste (seed automático)

- Admin: `admin@sonset.com` / `admin123` → `/admin/login`
- Motoboy: `motoboy@sonset.com` / `motoboy123` → `/motoboy/login`
- Cliente: não precisa de login, só WhatsApp na hora do checkout.

## Pagamento Pix (Mercado Pago)

Por padrão roda em **modo mock** (sem token configurado): gera um QR code de teste que nunca
confirma sozinho — há um botão "(ambiente de teste) simular pagamento aprovado" na tela de
pagamento para destravar o fluxo manualmente.

Para usar o sandbox real do Mercado Pago: crie uma aplicação em
https://www.mercadopago.com.br/developers/panel, pegue o **Access Token de teste** (`TEST-...`)
em "Credenciais de teste" e cole em `backend/.env` na variável `MP_ACCESS_TOKEN`.

## WhatsApp

O gateway sobe mesmo sem conexão (mensagens só ficam logadas no console). Para conectar de
verdade: rode `whatsapp-gateway`, acesse `GET http://localhost:3001/qr` (ou veja o QR ASCII no
terminal) e escaneie pelo WhatsApp do celular em Aparelhos conectados → Conectar um aparelho.

## Rotas

**Cliente:** `/`, `/catalogo`, `/produto/:id`, `/carrinho`, `/checkout`, `/pagamento/:orderId`, `/consultar`
**Admin:** `/admin/login`, `/admin/pedidos`, `/admin/produtos`, `/admin/motoboys`, `/admin/frete`, `/admin/financeiro`
**Motoboy:** `/motoboy/login`, `/motoboy`

## Deploy

**Banco (Supabase):** já em produção — o Postgres do Supabase é o único banco usado agora,
inclusive em desenvolvimento local (não tem mais SQLite).

**Frontend (Vercel):** já em produção em https://sunset-tabas.app (domínio próprio, configurado
manualmente no dashboard da Vercel — projeto chamado `sonset`, root directory `frontend`).
- Framework, build command e output directory são detectados automaticamente via
  `frontend/vercel.json` (Vite, `npm run build`, `dist/`, com rewrite de SPA pra rotas do
  React Router funcionarem em navegação direta).
- O backend já libera CORS por padrão pra `https://sunset-tabas.app` e
  `https://www.sunset-tabas.app` (variável `CORS_ORIGINS`, comma-separated, caso mude de novo).
- **Variável de ambiente:** `VITE_API_BASE_URL` apontando pra URL do backend no Railway. Sem
  essa variável, em produção o site entra automaticamente em **modo demonstração** (ver abaixo)
  em vez de tentar falar com `localhost:8080`.

**Backend (Railway) e WhatsApp gateway:** ainda não configurados — próximo passo.

## Modo demonstração (sem backend)

Enquanto o backend não está publicado (Railway pendente), o site em produção roda 100% no
navegador: todo o catálogo, pedidos, motoboys e financeiro ficam salvos no `localStorage` do
próprio visitante, com a mesma lógica de negócio do backend (fluxo de status, estoque, frete,
Pix mock) reimplementada em `frontend/src/lib/localApi.ts`. Isso ativa sozinho quando não há
`VITE_API_BASE_URL` configurada em build de produção (`import.meta.env.PROD`) — em dev local
(`npm run dev`) continua batendo no backend real em `localhost:8080` normalmente.

Implicações de ser só local:
- Cada navegador/aba tem seus próprios dados — não é compartilhado entre visitantes nem entre
  dispositivos, e reseta se o usuário limpar o site data do navegador.
- Login de motoboy/admin usa as mesmas credenciais de sempre (`admin@sonset.com`/`admin123`,
  `motoboy@sonset.com`/`motoboy123`), verificadas no próprio navegador.
- Pix fica sempre em modo mock (sem Mercado Pago de verdade) e o WhatsApp só loga no console do
  navegador (`[demo] WhatsApp para ...`) em vez de mandar mensagem de verdade.
- Para forçar esse modo mesmo com um backend configurado (ou forçar desligar), defina
  `VITE_USE_LOCAL_DB=true` (ou `false`) nas env vars do projeto.
- Quando o Railway estiver no ar, basta configurar `VITE_API_BASE_URL` na Vercel e fazer
  redeploy — o site volta a usar o backend real automaticamente, sem mexer em código.
