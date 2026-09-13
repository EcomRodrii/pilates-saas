-- ─────────────────────────────────────────────────────────────────────────────
-- Completar las supresiones HECHAS ANTES de `anonimizar_socio`.
--
-- ⚠️ Esta migración escribe datos de producción. Va aparte de las de esquema
-- (20260913170000/170100/170200) para poder aplicarla con permiso explícito y
-- después de verificar esas tres. Requiere que existan `supresiones` y
-- `anonimizar_socio`.
--
-- Qué hace:
--   1. Reaplica `anonimizar_socio` (origen 'backfill') a cada socia que ya tiene
--      `borrado_en`. La auditoría midió en ellas firma, datos de tarjeta,
--      notificaciones, logs con nombre, comunicaciones, recomendaciones,
--      comentarios de valoración y mensajes que la baja antigua no tocaba.
--      Lo que va por cuenta (push, preferencias, likes, mensajes) no se puede
--      alcanzar: la baja antigua ya había desenlazado `auth_user_id`.
--      No toca nada fiscal (ver la clasificación en 20260913170100).
--   2. Anonimiza `automation_logs` cuyo `socio_id` ya no existe en `socios`
--      (la auditoría contó 96, todas con `socio_nombre`): son de fichas borradas
--      físicamente en el pasado y no hay socia a la que aplicar la función.
--
-- Comprobación tras aplicar (solo recuentos):
--   select count(*) from socios where borrado_en is not null and aceptacion_firma is not null;       -- 0
--   select count(*) from socios s left join supresiones sp on sp.socio_id = s.id
--    where s.borrado_en is not null and sp.id is null;                                             -- 0
--   select count(*) from automation_logs al where al.socio_id is not null
--    and not exists (select 1 from socios s where s.id = al.socio_id)
--    and al.socio_nombre is distinct from 'Socia eliminada';                                       -- 0
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  v_fila record;
  v_n integer := 0;
begin
  for v_fila in
    select s.studio_id, s.id from public.socios s where s.borrado_en is not null order by s.studio_id, s.id
  loop
    perform public.anonimizar_socio(v_fila.studio_id, v_fila.id, null, 'backfill');
    v_n := v_n + 1;
  end loop;

  update public.automation_logs al
     set socio_nombre = 'Socia eliminada', mensaje_cliente = null, detalle = null
   where al.socio_id is not null
     and not exists (select 1 from public.socios s where s.id = al.socio_id)
     and (al.socio_nombre is distinct from 'Socia eliminada' or al.mensaje_cliente is not null or al.detalle is not null);

  raise notice 'supresión reaplicada a % socias ya borradas', v_n;
end
$$;
