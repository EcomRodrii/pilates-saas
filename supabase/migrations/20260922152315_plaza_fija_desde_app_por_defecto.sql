-- «Peticiones desde su app» (plaza fija) pasa a venir ACTIVADO por defecto, y se
-- activa también para los estudios que ya existen. Nació apagado por la convención
-- genérica «nuevo ajuste = comportamiento actual», sin ningún motivo de negocio
-- registrado para tenerlo apagado — y con eso apagado, ninguna alumna ve NUNCA la
-- opción de quedarse fija en una clase suelta, aunque su cuota la cubra de sobra.
-- Sigue siendo petición + aprobación del estudio: activarlo no da nada solo, solo
-- deja que la alumna lo pida.
alter table public.studios
  alter column plaza_fija_solicitar_desde_app set default true;

update public.studios
  set plaza_fija_solicitar_desde_app = true
  where plaza_fija_solicitar_desde_app = false;
