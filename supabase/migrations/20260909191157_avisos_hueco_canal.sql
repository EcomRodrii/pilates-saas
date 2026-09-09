-- avisos_hueco: por dónde salió el aviso.
--
-- La tabla apunta cada intento (ok o error) y es lo que permitió ver que el
-- botón «Avisar a N seleccionadas» no había mandado nunca nada: cero filas.
-- Ahora el aviso puede salir por WhatsApp (Meta Cloud API del estudio) o por
-- email (Resend), así que sin esta columna el histórico dice que se avisó
-- pero no por dónde — y con dos canales eso deja de ser un detalle: si una
-- socia dice que no le llegó, la respuesta depende del canal.
--
-- Default 'WHATSAPP' porque es lo que era todo lo anterior. Hoy la tabla está
-- vacía en producción, así que no reescribe ningún historial real.
alter table public.avisos_hueco
  add column if not exists canal text not null default 'WHATSAPP';

alter table public.avisos_hueco
  drop constraint if exists avisos_hueco_canal_valido;

alter table public.avisos_hueco
  add constraint avisos_hueco_canal_valido check (canal in ('WHATSAPP', 'EMAIL'));

comment on column public.avisos_hueco.canal is
  'Canal por el que se intentó el aviso: WHATSAPP (Meta Cloud API del estudio) o EMAIL (Resend).';
