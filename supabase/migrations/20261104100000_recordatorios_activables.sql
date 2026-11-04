-- Cada recordatorio de clase se puede ENCENDER o APAGAR por separado.
--
-- Hasta ahora solo se elegía CUÁNDO salía cada uno (24 h/12 h/48 h y 1 h/30 min/2 h) y no había forma de quitarlo: una
-- propietaria que solo quería el de 1 hora no podía apagar el largo (push + correo + WhatsApp). Dos interruptores
-- independientes; por defecto los dos encendidos, que es lo que ya hacían todos los estudios.
-- El barrido (lib/notificaciones/recordatorio-clase.ts) no manda NADA de un recordatorio apagado, por ningún canal.
set lock_timeout = '5s';

alter table public.studios
  add column if not exists recordatorio_largo_activo boolean not null default true,
  add column if not exists recordatorio_corto_activo boolean not null default true;

-- `authenticated` escribe `studios` por lista blanca de columnas (migr 20260910171150); la política de la fila
-- deja escribir solo a la propietaria.
grant update (recordatorio_largo_activo, recordatorio_corto_activo) on public.studios to authenticated;
