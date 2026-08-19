-- ─────────────────────────────────────────────────────────────────────────────
-- La promoción de lista de espera solo puede ocurrir sobre una clase VIVA.
--
-- PROBLEMA (auditoría 19-ago-2026)
-- `promocionar_siguiente_espera` no miraba la sesión en absoluto: promocionaba
-- (o hacía oferta a) la siguiente de la cola pasara lo que pasara con la clase.
-- Sus tres llamadores son `cancelar_reserva_plaza`, `expirar_oferta_lista_espera`
-- y `ofrecerPlazaLibre`, y el primero se alcanza desde el panel SIN guardia de
-- fecha: la comprobación de "esta clase ya ha empezado" vive solo en la capa TS
-- del portal público (supabase-data-admin.ts), y allí está puesta a propósito
-- fuera de la RPC para que el mostrador SÍ pueda cancelar una reserva pasada y
-- cuadrar el histórico.
--
-- Esa decisión de producto es razonable, pero dejó el efecto colateral abierto:
-- al cancelar del histórico una reserva de una clase de ayer, la primera de la
-- lista de espera pasaba a CONFIRMADA en una clase que ya se había dado,
-- `consumir_sesion_bono` le descontaba una sesión del bono (es un UPDATE
-- condicional, no comprueba fechas) y se le enviaba "tu plaza está confirmada"
-- para el día anterior. Sesión de bono robada, es decir, dinero.
--
-- ARREGLO
-- El guardia va aquí y no en cada llamador porque el invariante es de la
-- promoción, no de la cancelación: "no se promociona a nadie a una clase que ya
-- empezó o que está cancelada". Poniéndolo en un solo sitio quedan cubiertos los
-- tres caminos. Cancelar sigue funcionando igual (la reserva se cancela y la
-- plaza se libera); lo único que ya no ocurre es la promoción sin sentido.
--
-- `create or replace` SIN cambio de firma → conserva los grants existentes
-- (solo service_role, ver 20260731130000).
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.promocionar_siguiente_espera(
  p_studio_id text,
  p_sesion_id text,
  p_plazo_minutos integer
)
returns table (promovida_socio_id text, oferta_socio_id text, oferta_expira_en timestamptz)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare v_id text; v_socio text; v_expira timestamptz;
begin
  -- Clase viva = existe, no cancelada y todavía no ha empezado. Si no lo está,
  -- no hay nadie a quien promocionar: se devuelve la fila vacía que el llamador
  -- ya sabe interpretar (mismo contrato que "no había nadie en la cola").
  if not exists (
    select 1 from public.sesiones s
     where s.id = p_sesion_id
       and s.studio_id = p_studio_id
       and coalesce(s.cancelada, false) = false
       and s.inicio > now()
  ) then
    return query select null::text, null::text, null::timestamptz;
    return;
  end if;

  select r.id, r.socio_id into v_id, v_socio from reservas as r
   where r.sesion_id = p_sesion_id and r.estado = 'LISTA_ESPERA' and r.oferta_expira_en is null
   order by r.creado_en asc, r.id asc limit 1 for update;
  if not found then return query select null::text, null::text, null::timestamptz; return; end if;
  if coalesce(p_plazo_minutos,0) <= 0 then
    update reservas set estado='CONFIRMADA', posicion_espera=null, oferta_expira_en=null where id=v_id;
    return query select v_socio, null::text, null::timestamptz;
  else
    v_expira := now() + make_interval(mins => p_plazo_minutos);
    update reservas set oferta_expira_en = v_expira where id=v_id;
    return query select null::text, v_socio, v_expira;
  end if;
end; $$;
