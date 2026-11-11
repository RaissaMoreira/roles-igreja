-- =====================================================================
-- Rolês da Alcance — schema do Supabase
-- Cole tudo no Supabase > SQL Editor > New query > Run
-- Pode rodar de novo quando o arquivo mudar: ele só cria/ajusta o que falta.
-- =====================================================================

-- ---------- Tabelas ----------

create table if not exists public.eventos (
  id               uuid primary key default gen_random_uuid(),
  titulo           text not null,
  descricao        text,
  data_hora        timestamptz not null,
  local            text,
  maps_url         text,
  valor            numeric(10,2),          -- null ou 0 = gratuito
  chave_pix        text,
  recebedor_nome   text,                   -- nome que aparece no Pix (máx. 25 caracteres)
  recebedor_cidade text,                   -- cidade do recebedor (máx. 15 caracteres)
  avisos           text,
  status           text not null default 'aberto' check (status in ('aberto', 'fechado')),
  criado_em        timestamptz not null default now()
);

create table if not exists public.inscricoes (
  id         uuid primary key default gen_random_uuid(),
  evento_id  uuid not null references public.eventos(id) on delete cascade,
  nome       text not null check (char_length(nome) between 2 and 80),
  telefone   text not null check (char_length(telefone) between 8 and 20),
  presenca   text not null default 'confirmado',
  pagamento  text not null default 'pendente',
  criado_em  timestamptz not null default now(),
  unique (evento_id, telefone)             -- a mesma pessoa não se inscreve 2x no mesmo rolê
);

-- token: segredo que fica só no navegador de quem se inscreveu (para "Já paguei" e listas)
alter table public.inscricoes add column if not exists token uuid not null default gen_random_uuid();

alter table public.inscricoes drop constraint if exists inscricoes_presenca_check;
alter table public.inscricoes add constraint inscricoes_presenca_check
  check (presenca in ('confirmado', 'talvez', 'nao_vou'));

-- informado = a pessoa disse que pagou; pago = a organização conferiu
alter table public.inscricoes drop constraint if exists inscricoes_pagamento_check;
alter table public.inscricoes add constraint inscricoes_pagamento_check
  check (pagamento in ('pendente', 'informado', 'pago'));

create index if not exists inscricoes_evento_idx on public.inscricoes (evento_id);

-- Pix automático pelo Mercado Pago (o pagamento é confirmado sozinho)
alter table public.eventos    add column if not exists pix_automatico boolean not null default false;
alter table public.inscricoes add column if not exists mp_payment_id text;          -- id do pagamento no Mercado Pago
alter table public.inscricoes add column if not exists mp_qr_code    text;          -- Pix copia e cola gerado pelo MP
alter table public.inscricoes add column if not exists mp_qr_base64  text;          -- imagem do QR Code
alter table public.inscricoes add column if not exists mp_expira_em  timestamptz;
alter table public.inscricoes add column if not exists pago_em       timestamptz;

-- Quem pode administrar (organização)
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

alter table public.admins add column if not exists notificar_respostas  boolean not null default true;
alter table public.admins add column if not exists notificar_pagamentos boolean not null default true;

-- Listas do tipo "Quem vai levar comida?" -> itens (Salgado, Refrigerante...) -> quem marcou
create table if not exists public.listas (
  id         uuid primary key default gen_random_uuid(),
  evento_id  uuid not null references public.eventos(id) on delete cascade,
  titulo     text not null check (char_length(titulo) between 1 and 120),
  criado_em  timestamptz not null default now()
);

create table if not exists public.lista_itens (
  id        uuid primary key default gen_random_uuid(),
  lista_id  uuid not null references public.listas(id) on delete cascade,
  texto     text not null check (char_length(texto) between 1 and 80),
  criado_em timestamptz not null default now()
);

create table if not exists public.lista_marcacoes (
  item_id      uuid not null references public.lista_itens(id) on delete cascade,
  inscricao_id uuid not null references public.inscricoes(id) on delete cascade,
  criado_em    timestamptz not null default now(),
  primary key (item_id, inscricao_id)
);

create index if not exists listas_evento_idx on public.listas (evento_id);
create index if not exists lista_itens_lista_idx on public.lista_itens (lista_id);

-- Avisos para a organização (alguém respondeu / alguém disse que pagou)
create table if not exists public.notificacoes (
  id         uuid primary key default gen_random_uuid(),
  evento_id  uuid references public.eventos(id) on delete cascade,
  tipo       text not null check (tipo in ('resposta', 'pagamento')),
  mensagem   text not null,
  lida       boolean not null default false,
  criado_em  timestamptz not null default now()
);

create index if not exists notificacoes_criado_idx on public.notificacoes (criado_em desc);

-- ---------- Funções ----------

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- Quem se inscreveu avisa que pagou o Pix (precisa do token salvo no navegador)
create or replace function public.informar_pagamento(p_inscricao uuid, p_token uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from inscricoes where id = p_inscricao and token = p_token) then
    raise exception 'inscrição inválida' using errcode = '42501';
  end if;
  update inscricoes set pagamento = 'informado'
   where id = p_inscricao and pagamento = 'pendente';
end;
$$;

-- Marca/desmarca um item de lista ("eu levo salgado")
create or replace function public.marcar_item(p_inscricao uuid, p_token uuid, p_item uuid, p_marcar boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
      from inscricoes i
      join listas l on l.evento_id = i.evento_id
      join lista_itens it on it.lista_id = l.id
     where i.id = p_inscricao and i.token = p_token and i.presenca <> 'nao_vou' and it.id = p_item
  ) then
    raise exception 'não permitido' using errcode = '42501';
  end if;

  if p_marcar then
    insert into lista_marcacoes (item_id, inscricao_id) values (p_item, p_inscricao)
    on conflict do nothing;
  else
    delete from lista_marcacoes where item_id = p_item and inscricao_id = p_inscricao;
  end if;
end;
$$;

-- Quem se inscreveu muda a própria resposta (Vou / Talvez / Não vou)
create or replace function public.alterar_presenca(p_inscricao uuid, p_token uuid, p_presenca text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  select e.status into v_status
    from inscricoes i
    join eventos e on e.id = i.evento_id
   where i.id = p_inscricao and i.token = p_token;

  if v_status is null then
    raise exception 'inscrição inválida' using errcode = '42501';
  end if;
  if v_status <> 'aberto' then
    raise exception 'inscrições fechadas' using errcode = 'P0001', hint = 'fechado';
  end if;
  if p_presenca not in ('confirmado', 'talvez', 'nao_vou') then
    raise exception 'resposta inválida' using errcode = '22023';
  end if;

  update inscricoes set presenca = p_presenca where id = p_inscricao;

  -- quem não vai mais sai das listas de "quem leva o quê"
  if p_presenca = 'nao_vou' then
    delete from lista_marcacoes where inscricao_id = p_inscricao;
  end if;
end;
$$;

-- Cria as notificações automaticamente
create or replace function public.notificar_inscricao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_titulo text;
begin
  select titulo into v_titulo from eventos where id = new.evento_id;

  if tg_op = 'INSERT' then
    insert into notificacoes (evento_id, tipo, mensagem)
    values (
      new.evento_id,
      'resposta',
      new.nome || case new.presenca
                    when 'confirmado' then ' vai'
                    when 'talvez' then ' talvez vá'
                    else ' não vai'
                  end || ' — ' || v_titulo
    );
  elsif new.presenca is distinct from old.presenca and not public.is_admin() then
    insert into notificacoes (evento_id, tipo, mensagem)
    values (
      new.evento_id,
      'resposta',
      new.nome || ' mudou a resposta para ' || case new.presenca
                    when 'confirmado' then '"Vou"'
                    when 'talvez' then '"Talvez"'
                    else '"Não vou"'
                  end || ' — ' || v_titulo
    );
  elsif new.pagamento = 'pago' and old.pagamento is distinct from 'pago' and not public.is_admin() then
    -- só o Mercado Pago (via Edge Function) marca "pago" sem ser admin
    insert into notificacoes (evento_id, tipo, mensagem)
    values (new.evento_id, 'pagamento', new.nome || ' pagou o Pix ✓ (confirmado pelo Mercado Pago) — ' || v_titulo);
  elsif new.pagamento = 'informado' and old.pagamento is distinct from 'informado' then
    insert into notificacoes (evento_id, tipo, mensagem)
    values (new.evento_id, 'pagamento', new.nome || ' disse que pagou o Pix — ' || v_titulo);
  end if;
  return new;
end;
$$;

drop trigger if exists inscricoes_notificar on public.inscricoes;
create trigger inscricoes_notificar
  after insert or update of pagamento, presenca on public.inscricoes
  for each row execute function public.notificar_inscricao();

revoke execute on function public.informar_pagamento(uuid, uuid) from public;
revoke execute on function public.marcar_item(uuid, uuid, uuid, boolean) from public;
revoke execute on function public.alterar_presenca(uuid, uuid, text) from public;
revoke execute on function public.notificar_inscricao() from public;
grant execute on function public.alterar_presenca(uuid, uuid, text) to anon, authenticated;
grant execute on function public.informar_pagamento(uuid, uuid) to anon, authenticated;
grant execute on function public.marcar_item(uuid, uuid, uuid, boolean) to anon, authenticated;

-- ---------- Permissões por coluna ----------
-- Visitantes (anon) NUNCA veem telefone, token nem status de pagamento.

revoke all on public.eventos, public.inscricoes, public.admins,
              public.listas, public.lista_itens, public.lista_marcacoes, public.notificacoes
  from anon;

grant select on public.eventos to anon;
grant select (id, evento_id, nome, presenca, criado_em) on public.inscricoes to anon;
grant insert (id, evento_id, nome, telefone, presenca, token) on public.inscricoes to anon;
grant select on public.listas, public.lista_itens, public.lista_marcacoes to anon;

-- ---------- Row Level Security ----------

alter table public.eventos         enable row level security;
alter table public.inscricoes      enable row level security;
alter table public.admins          enable row level security;
alter table public.listas          enable row level security;
alter table public.lista_itens     enable row level security;
alter table public.lista_marcacoes enable row level security;
alter table public.notificacoes    enable row level security;

-- eventos
drop policy if exists "eventos: leitura publica" on public.eventos;
create policy "eventos: leitura publica" on public.eventos
  for select to anon, authenticated using (true);

drop policy if exists "eventos: admin gerencia" on public.eventos;
create policy "eventos: admin gerencia" on public.eventos
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- inscricoes
drop policy if exists "inscricoes: leitura publica" on public.inscricoes;
create policy "inscricoes: leitura publica" on public.inscricoes
  for select to anon using (true);

drop policy if exists "inscricoes: inscricao em evento aberto" on public.inscricoes;
create policy "inscricoes: inscricao em evento aberto" on public.inscricoes
  for insert to anon, authenticated
  with check (
    pagamento = 'pendente'
    and exists (select 1 from public.eventos e where e.id = evento_id and e.status = 'aberto')
  );

drop policy if exists "inscricoes: admin gerencia" on public.inscricoes;
create policy "inscricoes: admin gerencia" on public.inscricoes
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- admins (cada usuário logado só vê e altera a própria linha — usado nas preferências de notificação)
drop policy if exists "admins: ver a si mesmo" on public.admins;
create policy "admins: ver a si mesmo" on public.admins
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "admins: editar a si mesmo" on public.admins;
create policy "admins: editar a si mesmo" on public.admins
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- listas, itens e marcações: todo mundo vê; só admin cria/edita (marcar é pela função marcar_item)
drop policy if exists "listas: leitura publica" on public.listas;
create policy "listas: leitura publica" on public.listas
  for select to anon, authenticated using (true);
drop policy if exists "listas: admin gerencia" on public.listas;
create policy "listas: admin gerencia" on public.listas
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "lista_itens: leitura publica" on public.lista_itens;
create policy "lista_itens: leitura publica" on public.lista_itens
  for select to anon, authenticated using (true);
drop policy if exists "lista_itens: admin gerencia" on public.lista_itens;
create policy "lista_itens: admin gerencia" on public.lista_itens
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "lista_marcacoes: leitura publica" on public.lista_marcacoes;
create policy "lista_marcacoes: leitura publica" on public.lista_marcacoes
  for select to anon, authenticated using (true);
drop policy if exists "lista_marcacoes: admin gerencia" on public.lista_marcacoes;
create policy "lista_marcacoes: admin gerencia" on public.lista_marcacoes
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- notificacoes: só admin
drop policy if exists "notificacoes: admin gerencia" on public.notificacoes;
create policy "notificacoes: admin gerencia" on public.notificacoes
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------- Tempo real (notificações chegam na hora no painel) ----------

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notificacoes'
  ) then
    alter publication supabase_realtime add table public.notificacoes;
  end if;
end $$;

-- Avisa a API do Supabase que as tabelas mudaram (evita o erro "schema cache")
notify pgrst, 'reload schema';

-- =====================================================================
-- DEPOIS de rodar o script acima (só na primeira vez):
--
-- 1) Authentication > Users > Add user > Create new user
--    (coloque e-mail e senha da pessoa da organização, marque "Auto confirm")
--
-- 2) Rode isto trocando o e-mail:
--    insert into public.admins (user_id)
--    select id from auth.users where email = 'organizacao@exemplo.com';
--
-- 3) Authentication > Sign In / Providers > desative "Allow new users to sign up"
--    (assim só quem você cadastrar consegue logar)
-- =====================================================================
