# 🔥 Rolês da Alcance

App para organizar os rolês dos jovens da igreja: página do evento com data, local e avisos, confirmação de presença, Pix copia e cola com QR Code e painel para a organização marcar quem já pagou.

**Stack:** React + Vite + TypeScript · Supabase (banco + login) · deploy na Vercel.

---

## 1. Abrir no Trae

1. Descompacte a pasta e abra no Trae (`File > Open Folder`).
2. No terminal do Trae:
   ```bash
   npm install
   ```

## 2. Configurar o Supabase

1. Crie um projeto em <https://supabase.com> (o plano gratuito basta).
2. Vá em **SQL Editor > New query**, cole todo o conteúdo de `supabase/schema.sql` e clique em **Run**.
3. Crie o login da organização:
   - **Authentication > Users > Add user > Create new user** (e-mail + senha, marque *Auto Confirm User*).
   - No SQL Editor, rode trocando o e-mail:
     ```sql
     insert into public.admins (user_id)
     select id from auth.users where email = 'organizacao@exemplo.com';
     ```
4. Em **Authentication > Sign In / Providers**, desative **Allow new users to sign up**, para que ninguém crie conta sozinho.
5. Em **Project Settings > API**, copie a *Project URL* e a *anon public key*.

## 3. Rodar localmente

```bash
cp .env.example .env      # no Windows: copy .env.example .env
```
Preencha o `.env` com a URL e a anon key, depois:
```bash
npm run dev
```
Abra <http://localhost:5173>. A área de admin fica em `/admin`.

## 4. Deploy na Vercel

1. Suba o projeto para um repositório no GitHub (o `.env` não vai junto, porque está no `.gitignore`).
2. Na Vercel: **Add New > Project**, importe o repositório. A Vercel detecta o Vite sozinha.
3. Em **Environment Variables**, adicione `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
4. Clique em **Deploy**. O `vercel.json` já cuida das rotas (`/evento/...`, `/admin`).

---

## Como funciona

| Quem | O que faz |
|---|---|
| Jovens (sem login) | Veem os rolês, respondem Vou / Talvez / Não vou (nome + WhatsApp), pegam o Pix, tocam em "Já paguei", marcam o que vão levar nas listas, veem quem vai |
| Organização (login) | Cria/edita rolês, manda o convite no WhatsApp (com descrição e avisos), confere pagamentos, cria listas ("Quem vai levar comida?"), recebe notificações |

**Notificações:** o sino 🔔 no topo da área da organização avisa quando alguém responde e quando alguém diz que pagou. Dá para desligar cada tipo ali mesmo. O aviso do navegador só aparece com o site aberto em alguma aba.

> **Atualizando de uma versão anterior?** Rode o `supabase/schema.sql` de novo no SQL Editor — ele só adiciona o que falta, sem apagar dados.

**Segurança (já configurada no SQL):**
- Visitantes nunca veem os telefones nem o status de pagamento (permissão por coluna no Postgres).
- Visitantes não conseguem marcar "pago" nem editar nada.
- Só dá para se inscrever em rolê com inscrições abertas.
- O mesmo telefone não se inscreve duas vezes no mesmo rolê.

**Pix:** a chave é conferida e formatada ao salvar o rolê (CPF/CNPJ sem pontuação, telefone com +55). O código copia e cola é gerado no navegador a partir da chave Pix cadastrada no rolê (padrão BR Code do Banco Central), sem taxa e sem API. Cada inscrição recebe um identificador (txid) no Pix, o que ajuda a conferir no extrato. A confirmação do pagamento é manual, no painel.

## Estrutura

```
src/
  lib/pix.ts            gera o Pix copia e cola (BR Code + CRC16)
  lib/supabase.ts       cliente do Supabase
  lib/auth.ts           hook que verifica se o usuário é admin
  lib/types.ts          tipos das tabelas
  lib/util.ts           datas, moeda, copiar, links
  components/           PixPagamento, RequireAdmin
  pages/                Home, EventoPage, Login, AdminEventos, AdminEvento
supabase/schema.sql     tabelas, permissões e RLS
```

## Próximos passos (ideias)

- **Mercado Pago:** criar o Pix por uma Supabase Edge Function e receber o webhook para marcar "pago" automaticamente.
- **Preview bonito no WhatsApp por evento:** precisa de renderização no servidor (ex.: migrar para Next.js ou criar uma função na Vercel que gere as meta tags).
- Caronas e divisão de gastos.
- Notificação no celular com o site fechado (Web Push com service worker + Edge Function).
