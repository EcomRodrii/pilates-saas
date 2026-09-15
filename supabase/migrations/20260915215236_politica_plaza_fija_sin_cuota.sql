-- Plaza fija sin cuota: la política la elige el estudio.
--
-- 20260915203717 soltaba para TODOS los estudios las reservas de plaza fija de
-- quien se quedaba sin cuota. El fundador no quiere un comportamiento universal:
-- cada estudio trabaja distinto. Ahora cada estudio elige qué pasa con las clases
-- que su plaza fija ya tenía reservadas cuando la cuota deja de estar activa
-- (se cancela, se pausa, termina tras la baja programada o se cancela por impago):
--
--   · LIBERAR                 → se liberan TODAS sus reservas futuras de plaza
--                               fija, también las de dentro del plazo de
--                               cancelación (no es una cancelación de la alumna),
--                               sin penalización. Serie, horario y plaza intactos.
--   · MANTENER_SIN_PENALIZAR  → las conserva; si no viene o cancela tarde, no se
--                               le cobra (lo decide el cron de penalizaciones con
--                               el estado nuevo OMITIDA_SIN_CUOTA).
--   · MANTENER (por defecto)  → las conserva con las reglas de siempre: nada
--                               cambia hasta que la propietaria elija.
--
-- En las tres, el motor nunca reserva clases NUEVAS sin cuota vigente, y lo que
-- ya empezó o pasó no se toca nunca (histórico).
--
-- ⚠️ No redefine `materializar_plazas_fijas`: 20260915205236 (#2101) le añadió el
-- `for update` sobre sesiones y copiar aquí un cuerpo anterior lo perdería.

alter table public.studios
  add column if not exists plaza_fija_sin_cuota text not null default 'MANTENER';

alter table public.studios
  drop constraint if exists studios_plaza_fija_sin_cuota_check;
alter table public.studios
  add constraint studios_plaza_fija_sin_cuota_check
  check (plaza_fija_sin_cuota in ('LIBERAR', 'MANTENER_SIN_PENALIZAR', 'MANTENER'));

comment on column public.studios.plaza_fija_sin_cuota is
  'Qué pasa con las reservas de plaza fija ya hechas cuando la alumna se queda sin cuota: LIBERAR, MANTENER_SIN_PENALIZAR o MANTENER (por defecto).';

-- La propietaria lo guarda desde Configuración con su sesión (RLS `owner_studios`
-- limita la fila); sin el grant de columna el UPDATE da 42501.
grant update (plaza_fija_sin_cuota) on public.studios to authenticated;

-- Lo que se libera: solo en estudios con LIBERAR, y sin el filtro del plazo de
-- cancelación (sustituido por `inicio > now()`: lo empezado o pasado no se toca).
-- Misma firma → conserva los grants; se re-declaran igual.
create or replace function public.reservas_plaza_fija_sin_cuota(p_studio_id text default null, p_socio_id text default null)
 returns table(studio_id text, reserva_id text)
 language sql
 stable
 set search_path to 'public', 'pg_temp'
as $function$
  select r.studio_id, r.id
  from reservas r
  join sesiones s on s.id = r.sesion_id
  join studios st on st.id = r.studio_id and st.plaza_fija_sin_cuota = 'LIBERAR'
  where r.id like 'res-pf-%'
    and r.estado in ('CONFIRMADA', 'LISTA_ESPERA')
    and (p_studio_id is null or r.studio_id = p_studio_id)
    and (p_socio_id is null or r.socio_id = p_socio_id)
    and coalesce(s.cancelada, false) = false
    and s.inicio > now()
    -- `false`: una cuota ACTIVA con la renovación por cobrar sigue siendo cuota.
    and not public.cuota_cubre_plaza_fija(r.studio_id, r.socio_id, s.tipo_clase_id, (s.inicio at time zone 'Europe/Madrid')::date, false);
$function$;

revoke all on function public.reservas_plaza_fija_sin_cuota(text, text) from public, anon, authenticated;
grant execute on function public.reservas_plaza_fija_sin_cuota(text, text) to service_role;

-- Estado auditable para la penalización que no se cobra por la política (B, y A
-- en el hueco antes de liberar). Los 10 valores de hoy + OMITIDA_SIN_CUOTA.
alter table public.penalizaciones drop constraint if exists penalizaciones_estado_check;
alter table public.penalizaciones
  add constraint penalizaciones_estado_check
  check (estado in (
    'DETECTADA', 'OMITIDA_SIN_TARJETA', 'OMITIDA_SIN_CONSENTIMIENTO', 'OMITIDA_COMPENSADA', 'OMITIDA_REVERTIDA',
    'OMITIDA_SIN_CUOTA', 'PENDIENTE_APROBACION', 'RECIBO_CREADO', 'COBRADA', 'FALLIDA', 'REEMBOLSADA'
  ));
