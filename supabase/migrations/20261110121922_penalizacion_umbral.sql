-- ─────────────────────────────────────────────────────────────────────────────
-- Penalización por cancelación tardía / no-show: «a partir de la falta N».
--
-- Hasta hoy el cargo era el mismo desde la PRIMERA falta. Un estudio que quiere ser amable («la primera vez te lo
-- perdonamos») no tenía cómo. Ahora elige a partir de qué falta se cobra y cuántos días hacia atrás cuenta las faltas.
--
-- Decisiones:
--   · La DETECCIÓN no cambia: cada falta sigue quedando registrada en `penalizaciones` (la crea `cancelar_reserva_plaza` o
--     el trigger de no-show, en la misma transacción que la reserva). Lo que se decide después es solo si se COBRA.
--   · Lo decide el cron de penalizaciones, como ya decide «sin cuota» o «sin consentimiento»: una falta de las primeras
--     queda `OMITIDA_FRANQUICIA` (auditable: se ve por qué no se cobró). Solo puede cobrar MENOS que antes, nunca más.
--   · De serie 1 = cobra desde la primera falta: cero cambio de comportamiento para los estudios que hoy tienen regla.
--   · El contrato de la alumna dice «si cancelas tarde o no vienes, X €»; perdonar las primeras queda DENTRO de lo que
--     aceptó, así que no hace falta cambiar el texto legal ni vuelve a pedir su consentimiento a nadie.
--   · Cuenta las faltas registradas de la alumna en esa ventana, menos las revertidas. Una falta de cuando la regla estaba
--     apagada no existe como fila y no cuenta.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.studios add column if not exists penalizacion_umbral_faltas smallint not null default 1;
alter table public.studios add column if not exists penalizacion_umbral_ventana_dias smallint not null default 90;

alter table public.studios drop constraint if exists studios_penalizacion_umbral_faltas_check;
alter table public.studios add constraint studios_penalizacion_umbral_faltas_check
  check (penalizacion_umbral_faltas between 1 and 10);
alter table public.studios drop constraint if exists studios_penalizacion_umbral_ventana_check;
alter table public.studios add constraint studios_penalizacion_umbral_ventana_check
  check (penalizacion_umbral_ventana_dias in (30, 60, 90, 180, 365));

-- ⚠️ `authenticated` solo escribe `studios` por lista blanca de columnas (migr 20260910171150): sin esto, Configuración
-- recibiría un 42501 al guardar «cobrar desde la falta N». Mismo patrón que 20261104100000.
grant update (penalizacion_umbral_faltas, penalizacion_umbral_ventana_dias) on public.studios to authenticated;

comment on column public.studios.penalizacion_umbral_faltas is
  'Se cobra a partir de la falta N de la alumna (1 = desde la primera, como siempre). Las anteriores quedan OMITIDA_FRANQUICIA.';
comment on column public.studios.penalizacion_umbral_ventana_dias is
  'Cuántos días hacia atrás cuentan las faltas de una alumna para el umbral (solo se usa con umbral > 1).';

-- Estado auditable de la falta que no se cobra por ser de las primeras. Los 11 valores de hoy + OMITIDA_FRANQUICIA.
alter table public.penalizaciones drop constraint if exists penalizaciones_estado_check;
alter table public.penalizaciones
  add constraint penalizaciones_estado_check
  check (estado in (
    'DETECTADA', 'OMITIDA_SIN_TARJETA', 'OMITIDA_SIN_CONSENTIMIENTO', 'OMITIDA_COMPENSADA', 'OMITIDA_REVERTIDA',
    'OMITIDA_SIN_CUOTA', 'OMITIDA_FRANQUICIA', 'PENDIENTE_APROBACION', 'RECIBO_CREADO', 'COBRADA', 'FALLIDA', 'REEMBOLSADA'
  ));

-- Corregir una asistencia equivocada tiene que borrar también la falta que ya se había dejado sin cobrar.
--
-- El trigger de no-show solo revertía las penalizaciones aún DETECTADA o PENDIENTE_APROBACION. Ahora el cron las deja en
-- estados terminales sin dinero (OMITIDA_FRANQUICIA y las demás OMITIDA_*) y esas faltas CUENTAN para llegar al umbral de
-- la alumna: un no-show marcado por error y corregido al día siguiente seguía sumando, y su siguiente falta de verdad se
-- cobraba antes de lo que la propietaria había configurado. Se revierten también esos estados, y siguen fuera las que
-- movieron dinero (RECIBO_CREADO, COBRADA, FALLIDA, REEMBOLSADA): eso requiere un reembolso explícito, no un revert.
-- Cuerpo copiado de producción; solo cambia la lista de estados del revert.
create or replace function public.trigger_detectar_penalizacion_no_show()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_importe numeric;
  v_tipo_clase_id text;
begin
  if new.estado = 'NO_ASISTIO' and old.estado is distinct from 'NO_ASISTIO' then
    -- R-8: defensa en profundidad.
    select tipo_clase_id into v_tipo_clase_id from sesiones where id = new.sesion_id and studio_id = new.studio_id;
    select coalesce(tc.penalizacion_importe_eur, st.penalizacion_importe_eur)
      into v_importe
      from studios st
      left join tipos_clase tc on tc.id = v_tipo_clase_id and tc.studio_id = st.id
     where st.id = new.studio_id and coalesce(st.penalizacion_aplica_no_show, true);
    if v_importe is not null and v_importe > 0 and new.socio_id is not null then
      insert into penalizaciones (id, studio_id, socio_id, reserva_id, tipo, importe, estado)
        values ('pen-' || gen_random_uuid()::text, new.studio_id, new.socio_id, new.id, 'NO_SHOW', v_importe, 'DETECTADA')
        on conflict (reserva_id, tipo) do nothing;
    end if;
  elsif old.estado = 'NO_ASISTIO' and new.estado is distinct from 'NO_ASISTIO' then
    update penalizaciones
       set estado = 'OMITIDA_REVERTIDA', procesada_en = now()
     where reserva_id = new.id and tipo = 'NO_SHOW'
       and estado in (
         'DETECTADA', 'PENDIENTE_APROBACION',
         'OMITIDA_FRANQUICIA', 'OMITIDA_SIN_TARJETA', 'OMITIDA_SIN_CONSENTIMIENTO', 'OMITIDA_COMPENSADA', 'OMITIDA_SIN_CUOTA'
       );
  end if;

  return new;
end;
$function$;
