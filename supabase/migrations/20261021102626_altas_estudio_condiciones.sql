-- ═══════════════════════════════════════════════════════════════════════════
-- Qué textos legales aceptó cada alta, y cuándo (PR-2 del alta nueva).
-- ═══════════════════════════════════════════════════════════════════════════
--
-- El alta nueva (app/crear-estudio/alta-nueva.tsx) lleva la línea «Al crear tu
-- estudio aceptas las condiciones de uso y la política de privacidad». El
-- fundador decidió (21-oct-2026) que se guarde la FECHA y la VERSIÓN de los
-- textos aceptados: sin eso, el día que cambien no se puede saber qué aceptó
-- quién.
--
--   · `condiciones_version`: la versión de /terminos y /privacidad que se
--     aceptó, en formato fijo AAAA-MM-DD (`VERSION_TEXTOS_LEGALES`,
--     lib/legal-info.ts: la fecha de «Última actualización» de esas páginas).
--   · `condiciones_aceptadas_en`: cuándo. Es el momento en que se creó la
--     cuenta (`auth.users.created_at`): la casilla no existe, aceptar es pulsar
--     «Crear mi estudio», y ese mismo clic crea la cuenta.
--
-- Las copia el trigger de auth.users del `pending_studio` del signUp, como ya
-- copia `version` y `llegada` (20261021020248). Las altas con la sesión ya
-- abierta (sin signUp) las apunta /api/alta/progreso.
--
-- Sin datos personales: una fecha de versión y un instante, nada más.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.altas_estudio
  add column if not exists condiciones_version text
    check (condiciones_version is null
           or condiciones_version ~ '^20[0-9]{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'),
  add column if not exists condiciones_aceptadas_en timestamptz;

-- Las dos van juntas: una versión sin cuándo, o un cuándo sin qué, no prueba nada.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.altas_estudio'::regclass and conname = 'altas_estudio_condiciones_juntas'
  ) then
    alter table public.altas_estudio
      add constraint altas_estudio_condiciones_juntas
      check ((condiciones_version is null) = (condiciones_aceptadas_en is null));
  end if;
end;
$$;

comment on column public.altas_estudio.condiciones_version is
  'Versión (AAAA-MM-DD, VERSION_TEXTOS_LEGALES de lib/legal-info.ts) de /terminos y /privacidad aceptada al crear el estudio. Null = alta sin la línea legal.';
comment on column public.altas_estudio.condiciones_aceptadas_en is
  'Cuándo se aceptaron (al crear la cuenta, o al montar el estudio con la sesión ya abierta). Va siempre con condiciones_version.';

-- ── El trigger de auth.users, con las condiciones ──────────────────────────
-- Mismo cuerpo que 20261021020248 más las dos columnas. ⚠️ Igual que entonces,
-- un valor raro NUNCA rompe un alta: la versión se normaliza ANTES del INSERT
-- (fuera del formato → null, y entonces tampoco hay fecha), para que ningún
-- CHECK salte y se lleve la fila entera, y todo sigue dentro del bloque con
-- EXCEPTION: perder una fila de diagnóstico es aceptable; perder un alta, no.
-- Sin `::date`: un cast que falla lanzaría, y la fila se perdería entera.
create or replace function public.altas_estudio_registrar_cuenta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pendiente jsonb;
  v_version text;
  v_llegada text;
  v_condiciones text;
begin
  begin
    v_pendiente := new.raw_user_meta_data -> 'pending_studio';
    if jsonb_typeof(v_pendiente) = 'object' then
      v_version := coalesce(v_pendiente ->> 'version', '');
      if v_version not in ('v1', 'v2', 'v2_prueba') then
        v_version := 'v1';
      end if;
      v_llegada := lower(btrim(v_pendiente ->> 'llegada'));
      if v_llegada is null or v_llegada !~ '^[a-z0-9/_.-]{1,80}$' then
        v_llegada := null;
      end if;
      v_condiciones := btrim(v_pendiente ->> 'condiciones_version');
      if v_condiciones is null
         or v_condiciones !~ '^20[0-9]{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' then
        v_condiciones := null;
      end if;
      insert into public.altas_estudio (
        auth_user_id, origen, estudio_nombre, iniciada_en, version, llegada,
        condiciones_version, condiciones_aceptadas_en
      )
      values (
        new.id,
        'registro',
        nullif(left(btrim(v_pendiente ->> 'nombre'), 120), ''),
        coalesce(new.created_at, now()),
        v_version,
        v_llegada,
        v_condiciones,
        case when v_condiciones is not null then coalesce(new.created_at, now()) end
      )
      on conflict (auth_user_id) do nothing;
    end if;
  exception when others then
    raise warning 'altas_estudio_registrar_cuenta: %', sqlerrm;
  end;
  return new;
end;
$$;

-- Misma firma: los permisos se conservan, pero se reescriben igual (función de
-- trigger: nadie la llama, el permiso se comprueba al crear el trigger).
revoke execute on function public.altas_estudio_registrar_cuenta() from public, anon, authenticated;
grant execute on function public.altas_estudio_registrar_cuenta() to service_role;

-- ── Verificación ────────────────────────────────────────────────────────────
do $$
declare
  t text := 'public.altas_estudio_registrar_cuenta()';
  r text;
  p text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if has_function_privilege(r, t, 'EXECUTE') then
      raise exception '% puede ejecutar %', r, t;
    end if;
    -- `altas_estudio` sigue siendo solo del servidor: ni las columnas nuevas.
    foreach p in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
      if has_table_privilege(r, 'public.altas_estudio', p) then
        raise exception '% tiene % sobre altas_estudio', r, p;
      end if;
    end loop;
    foreach p in array array['SELECT', 'INSERT', 'UPDATE'] loop
      if has_any_column_privilege(r, 'public.altas_estudio', p) then
        raise exception '% tiene % de columna sobre altas_estudio', r, p;
      end if;
    end loop;
  end loop;
  if not has_function_privilege('service_role', t, 'EXECUTE') then
    raise exception 'service_role no puede ejecutar %', t;
  end if;
  if not exists (
    select 1 from pg_trigger tg
     where tg.tgrelid = 'auth.users'::regclass
       and tg.tgname = 'trg_altas_estudio_registrar_cuenta'
       and tg.tgfoid = 'public.altas_estudio_registrar_cuenta()'::regprocedure
  ) then
    raise exception 'auth.users sin el trigger trg_altas_estudio_registrar_cuenta';
  end if;
end;
$$;
