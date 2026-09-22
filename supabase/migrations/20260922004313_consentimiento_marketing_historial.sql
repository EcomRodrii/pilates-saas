-- ─────────────────────────────────────────────────────────────────────────────
-- Consentimiento de marketing: historial y alta desde las pantallas públicas.
--
-- Hasta ahora `socios.consentimiento_marketing_*` solo guardaba el ÚLTIMO
-- estado y la baja lo ponía a NULL: no quedaba prueba de «lo dio el día X y lo
-- retiró el día Y» (RGPD art. 7.1: hay que poder demostrar el consentimiento).
-- Mismo patrón que `aceptaciones_contrato_eventos` (20260914015133).
--
--  1. `consentimientos_marketing_eventos` — APPEND-ONLY. Una fila por cada vez
--     que se da o se retira: cuándo (now() del servidor), por qué puerta, qué
--     texto, HMAC de la IP (nunca la IP) y user-agent recortado cuando la
--     puerta los conoce.
--  2. Un TRIGGER sobre `socios` es el ÚNICO que escribe el historial. Así cubre
--     todas las puertas —la ficha del panel (UPDATE directo de authenticated),
--     la RPC de mostrador por lotes, el enlace de baja y la de la propia
--     socia— sin que ninguna pueda olvidarse de apuntarlo.
--  3. `consentimiento_marketing_propio(...)` — la puerta de la socia y del
--     enlace de baja (solo service_role). Pasa origen e IP/UA al trigger por
--     `set_config` local a la transacción.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.consentimientos_marketing_eventos (
  id uuid primary key default gen_random_uuid(),
  studio_id text not null references public.studios(id) on delete cascade,
  socio_id text not null references public.socios(id) on delete cascade,
  en timestamptz not null default now(),
  accion text not null check (accion in ('DAR', 'RETIRAR')),
  origen text not null check (origen in ('SOCIA', 'MOSTRADOR', 'BAJA_EMAIL', 'DESCONOCIDO')),
  -- DAR: el texto aceptado. RETIRAR: el que se retira.
  texto text,
  ip_hmac text check (ip_hmac is null or ip_hmac ~ '^[0-9a-f]{64}$'),
  user_agent text check (user_agent is null or char_length(user_agent) <= 256)
);

create index if not exists idx_consentimientos_marketing_eventos_socio
  on public.consentimientos_marketing_eventos (studio_id, socio_id, en desc);

alter table public.consentimientos_marketing_eventos enable row level security;

revoke all on table public.consentimientos_marketing_eventos from anon;
revoke all on table public.consentimientos_marketing_eventos from authenticated;
grant select on table public.consentimientos_marketing_eventos to authenticated;
grant all on table public.consentimientos_marketing_eventos to service_role;

drop policy if exists consentimientos_marketing_eventos_lectura on public.consentimientos_marketing_eventos;
create policy consentimientos_marketing_eventos_lectura on public.consentimientos_marketing_eventos
  for select to authenticated
  using (studio_id = current_studio_id() and current_rol() = 'PROPIETARIO');

-- ─── 2. El trigger: único que escribe el historial ──────────────────────────

create or replace function public.consentimiento_marketing_historial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_accion text;
  v_texto text;
  v_origen text := nullif(current_setting('tentare.consent_origen', true), '');
begin
  if tg_op = 'INSERT' then
    if new.consentimiento_marketing_texto is null then return null; end if;
    v_accion := 'DAR';
  else
    if new.consentimiento_marketing_texto is not distinct from old.consentimiento_marketing_texto
       and new.consentimiento_marketing_en is not distinct from old.consentimiento_marketing_en then
      return null;
    end if;
    if new.consentimiento_marketing_texto is null then
      if old.consentimiento_marketing_texto is null then return null; end if;
      v_accion := 'RETIRAR';
    else
      v_accion := 'DAR';
    end if;
  end if;

  v_texto := case when v_accion = 'DAR' then new.consentimiento_marketing_texto else old.consentimiento_marketing_texto end;
  if v_origen is null or v_origen not in ('SOCIA', 'MOSTRADOR', 'BAJA_EMAIL') then
    v_origen := case when v_accion = 'DAR' and new.consentimiento_marketing_por in ('SOCIA', 'MOSTRADOR')
                     then new.consentimiento_marketing_por else 'DESCONOCIDO' end;
  end if;

  insert into public.consentimientos_marketing_eventos (studio_id, socio_id, accion, origen, texto, ip_hmac, user_agent)
  values (new.studio_id, new.id, v_accion, v_origen, v_texto,
          nullif(current_setting('tentare.consent_ip_hmac', true), ''),
          left(nullif(current_setting('tentare.consent_user_agent', true), ''), 256));
  return null;
end;
$$;

revoke all on function public.consentimiento_marketing_historial() from public;
revoke all on function public.consentimiento_marketing_historial() from anon;
revoke all on function public.consentimiento_marketing_historial() from authenticated;

drop trigger if exists trg_socios_consentimiento_marketing_historial on public.socios;
create trigger trg_socios_consentimiento_marketing_historial
  after insert or update of consentimiento_marketing_texto, consentimiento_marketing_en on public.socios
  for each row execute function public.consentimiento_marketing_historial();

-- ─── 3. La puerta de la socia y del enlace de baja ──────────────────────────
--
-- Devuelve 'OK' | 'YA_CONSTABA' | 'SOCIA_NO_ENCONTRADA'. No comprueba quién
-- llama: solo service_role; la ruta decide (la socia con su JWT; la baja con
-- su token firmado). El texto lo compone el servidor, nunca el navegador.

create or replace function public.consentimiento_marketing_propio(
  p_studio_id text,
  p_socio_id text,
  p_dar boolean,
  p_texto text,
  p_origen text,
  p_ip_hmac text,
  p_user_agent text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_origen not in ('SOCIA', 'BAJA_EMAIL') then
    raise exception 'ORIGEN_NO_VALIDO';
  end if;
  if p_dar and (p_texto is null or btrim(p_texto) = '') then
    raise exception 'TEXTO_VACIO';
  end if;
  perform set_config('tentare.consent_origen', p_origen, true);
  perform set_config('tentare.consent_ip_hmac', coalesce(p_ip_hmac, ''), true);
  perform set_config('tentare.consent_user_agent', coalesce(left(p_user_agent, 256), ''), true);

  if p_dar then
    update public.socios
       set consentimiento_marketing_en = now(),
           consentimiento_marketing_texto = p_texto,
           consentimiento_marketing_por = 'SOCIA'
     where id = p_socio_id and studio_id = p_studio_id
       and consentimiento_marketing_texto is distinct from p_texto;
  else
    update public.socios
       set consentimiento_marketing_en = null,
           consentimiento_marketing_texto = null,
           consentimiento_marketing_por = null
     where id = p_socio_id and studio_id = p_studio_id
       and consentimiento_marketing_texto is not null;
  end if;
  if found then return 'OK'; end if;
  if exists (select 1 from public.socios where id = p_socio_id and studio_id = p_studio_id) then
    return 'YA_CONSTABA';
  end if;
  return 'SOCIA_NO_ENCONTRADA';
end;
$$;

revoke all on function public.consentimiento_marketing_propio(text, text, boolean, text, text, text, text) from public;
revoke all on function public.consentimiento_marketing_propio(text, text, boolean, text, text, text, text) from anon;
revoke all on function public.consentimiento_marketing_propio(text, text, boolean, text, text, text, text) from authenticated;
grant execute on function public.consentimiento_marketing_propio(text, text, boolean, text, text, text, text) to service_role;
