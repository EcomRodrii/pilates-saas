-- 20261019190000 · TENTARE — el logo de un estudio solo sale en la landing si el estudio
-- ha dado su consentimiento, y ese consentimiento no lo escribe el navegador.
--
-- La franja «Estudios que ya usan Tentare» de la home (components/landing/FranjaLogos.tsx)
-- enseña el logo de estudios CLIENTES. Usar la marca de un cliente en publicidad exige
-- que lo sepa, y «ha subido un logo» no es consentimiento: hay logos de la demo del
-- equipo, de estudios de prueba y de estudios casi vacíos. Por eso la selección es una
-- columna explícita, apagada de serie, que decide una persona del equipo de Tentare
-- caso a caso (hoy, con un UPDATE por SQL; ver el PR).
--
-- Aditiva y compatible con el código anterior: el código nuevo tolera que la columna
-- aún no exista (la franja simplemente no se pinta), así que el orden de despliegue es
-- esta migración primero y el código después.
--
-- Permisos. `authenticated` ya tiene UPDATE e INSERT de `studios` POR COLUMNAS
-- (20260910171150 y 20261016115000): una columna nueva no hereda nada, así que nace sin
-- escritura desde el navegador. Los REVOKE de abajo no quitan nada hoy y se dejan
-- escritos a propósito (si algún día un GRANT de tabla reabriera `studios`, este
-- consentimiento seguiría siendo del servidor); la verificación final comprueba el
-- resultado real y no los comentarios. Lectura: `anon` solo tiene SELECT de once
-- columnas concretas de `studios` (no esta) y `authenticated` solo ve la fila de su
-- propio estudio (RLS), que es su propio consentimiento: nada que esconder.

set local lock_timeout = '5s';

alter table public.studios
  add column if not exists mostrar_logo_en_landing boolean not null default false;

comment on column public.studios.mostrar_logo_en_landing is
  'Consentimiento del estudio para que su logo salga en la franja de clientes de la landing de Tentare. Apagado de serie; solo lo cambia el servidor / el equipo de Tentare, nunca el navegador.';

revoke update (mostrar_logo_en_landing) on public.studios from authenticated;
revoke update (mostrar_logo_en_landing) on public.studios from anon;
revoke insert (mostrar_logo_en_landing) on public.studios from authenticated;
revoke insert (mostrar_logo_en_landing) on public.studios from anon;

do $$
declare
  rol text;
  priv text;
begin
  foreach rol in array array['authenticated', 'anon'] loop
    foreach priv in array array['UPDATE', 'INSERT'] loop
      if has_column_privilege(rol, 'public.studios', 'mostrar_logo_en_landing', priv) then
        raise exception 'mostrar_logo_en_landing: % puede hacer % desde el navegador', rol, priv;
      end if;
    end loop;
  end loop;
  if has_column_privilege('anon', 'public.studios', 'mostrar_logo_en_landing', 'SELECT') then
    raise exception 'mostrar_logo_en_landing: anon puede leerla';
  end if;
  if not (has_column_privilege('service_role', 'public.studios', 'mostrar_logo_en_landing', 'UPDATE')
          and has_column_privilege('service_role', 'public.studios', 'mostrar_logo_en_landing', 'SELECT')) then
    raise exception 'mostrar_logo_en_landing: service_role perdió su acceso';
  end if;
  -- Control: el resto de la whitelist de UPDATE sigue intacta.
  if not has_column_privilege('authenticated', 'public.studios', 'nombre', 'UPDATE') then
    raise exception 'authenticated perdió UPDATE de studios.nombre';
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Activar a un estudio (lo decide el fundador, uno a uno):
--   update public.studios set mostrar_logo_en_landing = true where id = 'studio-ejemplo';
-- Retirarlo:
--   update public.studios set mostrar_logo_en_landing = false where id = 'studio-ejemplo';
-- La landing se refresca sola en una hora como máximo.
-- ─────────────────────────────────────────────────────────────────────────────
