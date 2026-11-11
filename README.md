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

## 5. Pix automático com Mercado Pago (opcional)

Com isso ligado, cada pessoa recebe um Pix gerado pelo Mercado Pago e **o app marca "pago" sozinho** assim que o dinheiro cai (o admin também recebe a notificação no sino). Sem isso, o app continua funcionando com a chave Pix comum e o "Já paguei".

> O Mercado Pago cobra uma taxa por Pix recebido — confira a tabela atual na sua conta. O dinheiro cai no saldo do Mercado Pago.

### 5.1 No Mercado Pago

1. Tenha uma conta no Mercado Pago (pode ser de pessoa física) **com uma chave Pix cadastrada** nela (app do Mercado Pago > Pix > Minhas chaves).
2. Entre em <https://www.mercadopago.com.br/developers/panel> > **Criar aplicação**. Em tipo de solução escolha **Pagamentos online** e, se perguntar, **Checkout Transparente / API**.
3. Na aplicação criada, abra **Credenciais de produção** e copie o **Access Token** (começa com `APP_USR-`). Ele é secreto: não coloque no `.env` nem no GitHub.

### 5.2 No Supabase (pelo terminal do Trae, na pasta do projeto)

O `SEU-PROJETO` é o código que aparece na sua URL do Supabase (`https://SEU-PROJETO.supabase.co`).

```bash
npx supabase login
npx supabase link --project-ref SEU-PROJETO

# Access Token do Mercado Pago + um e-mail da organização para aparecer como pagador
# (o MP exige um e-mail e o app não pede e-mail das pessoas; use um e-mail DIFERENTE do da conta MP)
npx supabase secrets set MP_ACCESS_TOKEN=APP_USR-xxxxxxxx MP_EMAIL_PAGADOR=juventude@exemplo.com

npx supabase functions deploy mp-pix
npx supabase functions deploy mp-webhook --no-verify-jwt
```

O `--no-verify-jwt` no `mp-webhook` é obrigatório: o Mercado Pago não manda login do Supabase. A função é segura mesmo assim, porque nunca confia no aviso — ela sempre consulta o pagamento direto na API do Mercado Pago antes de marcar "pago".

### 5.3 (Recomendado) Assinatura do webhook

Na sua aplicação do Mercado Pago > **Webhooks** > **Configurar notificações**:
- URL de produção: `https://SEU-PROJETO.supabase.co/functions/v1/mp-webhook`
- Evento: **Pagamentos**
- Salve e copie a **assinatura secreta**, depois rode:

```bash
npx supabase secrets set MP_WEBHOOK_SECRET=a-assinatura-secreta
```

### 5.4 Ligar no rolê

No painel do rolê, seção **Pix**, marque **Confirmar pagamento automaticamente (Mercado Pago)** e salve. A chave Pix comum vira "reserva": só aparece para quem abrir o link num celular diferente do que usou para responder.

**Teste antes de divulgar:** crie um rolê de R$ 1,00, responda "Vou" pelo celular, pague o Pix e veja o status virar "✓ pago ⚡ automático" no painel. Se não virar, veja os logs em Supabase > Edge Functions > mp-webhook / mp-pix > Logs.

## 6. Instalar como app no celular

O site já é um app instalável (PWA). Depois do deploy, quem abrir pelo celular vê a barra **"Instale o app dos Rolês"**:
- **Android (Chrome):** toca em **Instalar** e o ícone da Alcance vai para a tela inicial.
- **iPhone (Safari):** o app mostra o passo a passo — botão **Compartilhar** > **Adicionar à Tela de Início**.

Instalado, ele abre em tela cheia, sem a barra do navegador. Quem fechar a barra só a vê de novo depois de 14 dias.

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
supabase/functions/     Edge Functions do Mercado Pago (mp-pix, mp-webhook)
public/sw.js            service worker (app instalável)
public/manifest.webmanifest  nome, cores e ícones do app
```

## Próximos passos (ideias)

- **Preview bonito no WhatsApp por evento:** precisa de renderização no servidor (ex.: migrar para Next.js ou criar uma função na Vercel que gere as meta tags).
- Caronas e divisão de gastos.
- Notificação no celular com o site fechado (Web Push: o service worker já existe, falta a Edge Function que envia).
