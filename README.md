# Sonset

E-commerce com 3 perfis de usuário (admin, cliente, motoboy). Frontend em React (Vite),
backend em Rust (Axum), microserviço de WhatsApp em Node (whatsapp-web.js).

## Estrutura

```
frontend/            React + Vite + TS + Tailwind v4 + Framer Motion + Zustand + React Router
backend/              Rust + Axum + SQLx (SQLite local) — API na porta 8080
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

Por enquanto local (SQLite, `backend/dev.db`, criado e migrado automaticamente no primeiro
`cargo run`). Quando for migrar para Supabase/Postgres, será preciso adaptar
`backend/migrations/*.sql` para o dialeto Postgres e trocar a `DATABASE_URL` — as credenciais de
API do Supabase (anon/service_role) que você já tem **não** servem para conexão direta via
`sqlx` (é preciso a senha do Postgres, em Project Settings → Database).

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
**Admin:** `/admin/login`, `/admin/pedidos`, `/admin/produtos`, `/admin/motoboys`
**Motoboy:** `/motoboy/login`, `/motoboy`
