-- El estudio decide QUÉ avisos al móvil reciben sus alumnas: puede apagar uno
-- (p. ej. «Valorar la clase después de ir») sin tocar su texto. Lista de tipos de
-- evento apagados; vacía = todo encendido, que es lo de siempre. Solo apaga el
-- PUSH: el aviso sigue en la campana de la app, y los CRÍTICOS no se pueden
-- apagar (lo impone el motor, no la pantalla).
set lock_timeout = '5s';

alter table public.studios
  add column if not exists avisos_push_apagados text[] not null default '{}';

-- `authenticated` escribe `studios` por lista blanca de columnas (migr 20260910171150);
-- la política de la fila deja escribir solo a la propietaria del estudio.
grant update (avisos_push_apagados) on public.studios to authenticated;
