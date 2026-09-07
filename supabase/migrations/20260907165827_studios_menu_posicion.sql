-- Dónde vive el menú del panel: fijo a la izquierda (lo de siempre) o fijo
-- arriba.
--
-- Es del ESTUDIO y no de cada persona, a propósito: la propietaria está
-- configurando SU software, y quien entra después —recepción, una instructora—
-- se encuentra el panel montado como ella lo dejó. El modo claro/oscuro sí es
-- personal y sigue guardándose en el navegador de cada una (`panel-dark-mode`):
-- son dos cosas distintas y se quedan separadas.
--
-- CHECK y no un enum: mismo criterio que el resto de columnas de `studios` con
-- valores cerrados. Un valor que no esté en la lista no entra, y el default
-- deja a todos los estudios exactamente como están hoy.

alter table public.studios
  add column if not exists menu_posicion text not null default 'izquierda';

alter table public.studios
  drop constraint if exists studios_menu_posicion_valido;
alter table public.studios
  add constraint studios_menu_posicion_valido
  check (menu_posicion in ('izquierda', 'arriba'));

comment on column public.studios.menu_posicion is
  'Posición del menú del panel: izquierda (por defecto) o arriba. Del estudio, no de cada usuario — el modo oscuro sí es personal y vive en el navegador.';
