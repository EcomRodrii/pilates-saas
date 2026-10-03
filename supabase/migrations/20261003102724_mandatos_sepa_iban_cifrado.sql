-- ═══════════════════════════════════════════════════════════════════════════
-- Mandatos SEPA: el IBAN se guarda cifrado y solo lo escribe el servidor.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Contrato de encargo (2-oct-2026). El IBAN de una domiciliación (remesa propia
-- del cuaderno 19.14) lo protegían la separación por estudio y la RLS por rol.
-- Desde aquí:
--
--   · Lo cifra la APP (AES-256-GCM, clave SEPA_CLAVE_CIFRADO solo en Vercel,
--     lib/billing/iban-cifrado.ts) y la BD rechaza cualquier valor que no lo
--     esté (CHECK). Sin la clave, no se puede guardar ningún IBAN.
--   · El navegador ya no escribe en la tabla: alta, cambio y cancelación van por
--     /api/cobros/mandatos-sepa (mismo permiso que la RLS que había,
--     `puedeMoverDinero`).
--   · El navegador tampoco LEE la columna `iban`: el panel tiene `iban_ultimos4`,
--     y el IBAN entero solo sale, descifrado, al generar el fichero de la remesa
--     (/api/cobros/mandatos-sepa/remesa).
--
-- En producción hay 0 mandatos (2-oct-2026), así que el CHECK se valida sin
-- convertir nada. Si apareciera uno en claro, la migración se para aquí.
-- ═══════════════════════════════════════════════════════════════════════════

do $$
begin
  if exists (select 1 from public.mandatos_sepa where iban not like 'enc:v1:%') then
    raise exception 'hay mandatos con el IBAN en claro: cífralos antes (lib/billing/iban-cifrado.ts)';
  end if;
end $$;

-- Sin filas, NOT NULL entra directo; con alguna (ya cifrada) fallaría aquí, a la vista.
alter table public.mandatos_sepa add column if not exists iban_ultimos4 text;
alter table public.mandatos_sepa alter column iban_ultimos4 set not null;

alter table public.mandatos_sepa drop constraint if exists mandatos_sepa_iban_cifrado;
alter table public.mandatos_sepa
  add constraint mandatos_sepa_iban_cifrado check (iban like 'enc:v1:%');
alter table public.mandatos_sepa drop constraint if exists mandatos_sepa_iban_ultimos4;
alter table public.mandatos_sepa
  add constraint mandatos_sepa_iban_ultimos4 check (iban_ultimos4 ~ '^[0-9A-Z]{4}$');

comment on column public.mandatos_sepa.iban is
  'IBAN cifrado por la app (enc:v1:…, lib/billing/iban-cifrado.ts). Nunca en claro (CHECK). Solo service_role lo lee.';
comment on column public.mandatos_sepa.iban_ultimos4 is
  'Los 4 últimos dígitos del IBAN: lo único que ve el panel.';

-- ── Escritura: solo el servidor ─────────────────────────────────────────────
drop policy if exists mandatos_sepa_escritura_insert on public.mandatos_sepa;
drop policy if exists mandatos_sepa_escritura_update on public.mandatos_sepa;
drop policy if exists mandatos_sepa_escritura_delete on public.mandatos_sepa;
revoke insert, update, delete on table public.mandatos_sepa from anon, authenticated;

-- ── Lectura: todas las columnas menos `iban` ────────────────────────────────
-- ⚠️ Un REVOKE de columna no resta de un GRANT de tabla: por eso es REVOKE de
-- tabla + GRANT por columnas, en ese orden. La política de lectura por rol
-- (mandatos_sepa_lectura) no cambia.
revoke select on table public.mandatos_sepa from anon, authenticated;
grant select (id, studio_id, socio_id, iban_ultimos4, ref_mandato, fecha_firma, estado, creada_en)
  on public.mandatos_sepa to authenticated;
grant select, insert, update, delete on table public.mandatos_sepa to service_role;

-- ── Verificación ─────────────────────────────────────────────────────────────
do $$
declare v_rol text;
begin
  foreach v_rol in array array['anon', 'authenticated'] loop
    if has_table_privilege(v_rol, 'public.mandatos_sepa', 'INSERT')
       or has_table_privilege(v_rol, 'public.mandatos_sepa', 'UPDATE')
       or has_table_privilege(v_rol, 'public.mandatos_sepa', 'DELETE') then
      raise exception '% puede escribir en mandatos_sepa', v_rol;
    end if;
    if has_column_privilege(v_rol, 'public.mandatos_sepa', 'iban', 'SELECT') then
      raise exception '% puede leer mandatos_sepa.iban', v_rol;
    end if;
  end loop;
  if not has_column_privilege('authenticated', 'public.mandatos_sepa', 'iban_ultimos4', 'SELECT') then
    raise exception 'authenticated no puede leer mandatos_sepa.iban_ultimos4';
  end if;
end $$;
