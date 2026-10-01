-- ─────────────────────────────────────────────────────────────────────────────
-- API pública: claves de cadena.
--
-- Una clave de cadena llega a todas las sedes de una cadena, en vez de a una
-- sola. Cada petición dice a qué sede va con la cabecera `Tentare-Estudio`, y
-- la puerta de la API comprueba que la clave llega a ella
-- (lib/api-publica/cadena.ts): la sede es de la cadena de la clave, quien la
-- creó es HOY la dueña de la cadena y de la sede, y la sede tiene la API
-- activada. Así la API sigue trabajando sobre UNA sede por petición, que es lo
-- que filtra cada consulta.
--
-- `studio_id` sigue siendo obligatorio: en una clave de cadena es la sede desde
-- la que se creó (o se rotó). Solo sirve para auditar ahí la llamada que lista
-- las sedes (`GET /api/v1/estudios`); no da acceso a nada por sí mismo.
--
-- Sin `on delete cascade`: una clave no se borra nunca (revocar deja la fila,
-- que la auditoría necesita), tampoco al borrar su cadena. Mismo criterio que
-- `studios.cadena_id`.
--
-- Aditiva: una columna que puede ser nula y un índice. La tabla sigue siendo de
-- SERVIDOR (RLS sin políticas, sin grants para anon/authenticated): una columna
-- nueva no hereda más privilegios que los de la tabla.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.api_claves
  add column if not exists cadena_id text references public.cadenas(id);

create index if not exists api_claves_cadena_idx
  on public.api_claves (cadena_id, creada_en desc) where cadena_id is not null;

do $$
declare
  r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if has_table_privilege(r, 'public.api_claves', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
       or has_column_privilege(r, 'public.api_claves', 'cadena_id', 'SELECT, INSERT, UPDATE, REFERENCES') then
      raise exception 'api_claves no puede ser accesible para %', r;
    end if;
  end loop;
end $$;
