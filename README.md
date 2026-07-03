# Sonset

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

**Frontend (Vercel):** conecte este repositório, com:
- **Root Directory:** `frontend`
- Framework, build command e output directory são detectados automaticamente via
  `frontend/vercel.json` (Vite, `npm run build`, `dist/`, com rewrite de SPA pra rotas do
  React Router funcionarem em navegação direta).
- **Nome do projeto:** escolha `sonset` ou `sonset-tabacaria` na criação — é isso que define o
  subdomínio (`sonset.vercel.app` / `sonset-tabacaria.vercel.app`). O backend já libera CORS pros
  dois por padrão.
- **Variável de ambiente:** `VITE_API_BASE_URL` apontando pra URL do backend no Railway. Sem
  essa variável, o frontend tenta falar com `localhost:8080` e nada funciona em produção — só
  configure depois que o backend estiver no ar.

**Backend (Railway) e WhatsApp gateway:** ainda não configurados — próximo passo.
