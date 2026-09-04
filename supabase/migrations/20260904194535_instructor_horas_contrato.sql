-- Horas semanales contratadas de cada instructora, para poder comparar lo que
-- tiene asignado en el calendario contra lo que se le paga por contrato.
--
-- Va en `instructor_tarifas` y NO en `instructores` por el mismo motivo que ya
-- separó la tarifa (PR #562) y antes los mandatos SEPA: la RLS de
-- `instructores` da todas las columnas a todo el estudio sin distinguir fila,
-- así que un dato laboral ahí se filtraría en el JSON crudo a cualquier
-- compañera. Esta tabla ya tiene la RLS acotada que hace falta.
--
-- NULL = sin contrato definido (el caso de las autónomas por horas, que es la
-- norma en estudios pequeños): sin él no se enseña ninguna comparación, en vez
-- de inventarse un 0 que dejaría a todo el mundo "por encima de contrato".

alter table public.instructor_tarifas
  add column if not exists horas_semanales_contrato numeric;

alter table public.instructor_tarifas
  drop constraint if exists instructor_tarifas_horas_contrato_valido;
alter table public.instructor_tarifas
  add constraint instructor_tarifas_horas_contrato_valido
  check (horas_semanales_contrato is null
         or (horas_semanales_contrato >= 0 and horas_semanales_contrato <= 168));

comment on column public.instructor_tarifas.horas_semanales_contrato is
  'Horas semanales pactadas. NULL = sin contrato definido (no se compara nada). Tope 168 = las horas que tiene una semana.';
