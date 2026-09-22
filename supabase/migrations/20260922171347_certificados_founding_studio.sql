-- Founding Studio: una VARIANTE del mismo certificado Tentare Verified
-- Studio, no un certificado ni una tabla nueva. Decisión de producto
-- (2026-09-22): primeros 100 estudios en RECLAMAR su certificado (no primeros
-- 100 en darse de alta) — la numeración es un incentivo de captación activo,
-- no un dato histórico.

alter table public.certificados_estudio
  add column if not exists is_founding boolean not null default false,
  add column if not exists founding_number integer;

-- El número, una vez asignado, es inmutable y nunca se reutiliza — ni al
-- revocar el certificado. Único entre los no nulos.
create unique index if not exists certificados_estudio_founding_number_uk
  on public.certificados_estudio (founding_number)
  where founding_number is not null;

-- Secuencia que reparte los números 1..100. Un nextval() atómico evita
-- cualquier condición de carrera entre estudios reclamando a la vez, sin
-- necesitar el lock de reservar_numero_factura (esa cadena de huellas
-- Veri*Factu no aplica aquí).
create sequence if not exists public.certificados_estudio_founding_seq;

create or replace function public.crear_certificado_estudio(p_studio_id text)
returns public.certificados_estudio
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existente public.certificados_estudio;
  v_codigo text;
  v_founding_num integer;
  v_es_founding boolean := false;
  v_fila public.certificados_estudio;
begin
  select * into v_existente
    from public.certificados_estudio
   where studio_id = p_studio_id and estado = 'ACTIVE'
   limit 1;
  if found then
    return v_existente;
  end if;

  v_codigo := 'TNT-VS-' || to_char(now(), 'YYYY') || '-'
    || lpad(nextval('public.certificados_estudio_codigo_seq')::text, 4, '0');

  -- El nº 101 en pedirlo simplemente no es Founding: la secuencia sigue
  -- corriendo (no hay condición de carrera que comprobar), y el valor que se
  -- pasa de 100 no se reasigna a founding_number.
  v_founding_num := nextval('public.certificados_estudio_founding_seq');
  if v_founding_num <= 100 then
    v_es_founding := true;
  else
    v_founding_num := null;
  end if;

  insert into public.certificados_estudio (id, studio_id, estado, is_founding, founding_number)
  values (v_codigo, p_studio_id, 'ACTIVE', v_es_founding, v_founding_num)
  returning * into v_fila;

  return v_fila;
end;
$$;

comment on function public.crear_certificado_estudio(text) is
  'Genera (o devuelve el ya activo) el certificado Tentare Verified Studio de un estudio. Los primeros 100 en reclamarlo (no en darse de alta) se marcan is_founding con un founding_number 1-100, inmutable. Solo service_role.';

-- Misma firma que antes (CREATE OR REPLACE sobre el mismo tipo de argumentos):
-- no dispara el gotcha de grants ya documentado en este repo (ese solo salta
-- cuando cambia la FIRMA). Se re-verifica igualmente por si acaso.
revoke all on function public.crear_certificado_estudio(text) from public, anon, authenticated;
grant execute on function public.crear_certificado_estudio(text) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN tras aplicar:
--
-- select r, has_function_privilege(r, 'public.crear_certificado_estudio(text)', 'EXECUTE') as crear
--   from unnest(array['anon', 'authenticated', 'service_role']) as r;
--   → anon: false · authenticated: false · service_role: true
--
-- begin;
--   select public.crear_certificado_estudio('<studio_a>');  -- is_founding=true, founding_number=1 (o el que toque)
--   select public.crear_certificado_estudio('<studio_a>');  -- misma fila (idempotente, no gasta otro número)
--   select public.crear_certificado_estudio('<studio_b>');  -- is_founding=true, founding_number = anterior+1
-- rollback;
-- ─────────────────────────────────────────────────────────────────────────────
