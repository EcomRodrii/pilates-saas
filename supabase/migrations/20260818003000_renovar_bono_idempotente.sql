-- Renovar un bono: idempotente por RECIBO, no por "el saldo estaba a 0".
--
-- EL FALLO (I-6). `aplicarRenovacionServidor` recargaba el bono solo si
-- `sesiones_restantes === 0`, y si no, devolvía `aplicada: false` sin tocar nada.
-- Ese guard hacía dos trabajos a la vez y solo uno bien: servía de idempotencia
-- (un segundo intento sobre un bono ya recargado no vuelve a recargarlo) pero
-- confundía "ya lo recargué" con "todavía no lo había agotado". Cobrar un recibo
-- de renovación con saldo > 0 se llevaba el dinero y no entregaba nada.
--
-- Quedaba registrado (`entrega_aplicada = false`), pero no lo mira nadie: el
-- único lector de ese campo es el flujo de revisión de devoluciones, no una
-- alerta. Así que en la práctica era invisible.
--
-- POR QUÉ UNA RPC Y NO ARREGLARLO EN TS. La idempotencia correcta es "este
-- RECIBO ya entregó", que vive en `recibos.entrega_aplicada`. Leerlo en TS,
-- decidir, y luego escribir la suscripción son tres pasos: dos reintentos del
-- webhook a la vez leen ambos `false` y recargan dos veces. Hoy eso no puede
-- pasar porque el guard sobre el saldo es atómico por accidente — quitarlo sin
-- más INTRODUCE una carrera de doble recarga que no existía. Aquí las dos
-- escrituras van en la misma transacción, con la fila del recibo bloqueada.
--
-- SUMA, no reemplaza. Con saldo 0 el resultado es idéntico al de antes
-- (0 + N = N). Con saldo > 0, antes no se entregaba NADA; ahora se suman las
-- sesiones compradas. Es la única opción que nunca destruye algo ya pagado:
-- poner el saldo a N le quitaría a la socia las sesiones que le quedaban.
--
-- Devuelve el saldo nuevo, o NULL si este recibo ya había entregado (reintento)
-- o no hay nada que recargar. Mismo contrato de "NULL = no hice nada" que
-- consumir_sesion_bono / devolver_sesion_bono.
create or replace function public.renovar_bono_idempotente(
  p_recibo_id text, p_studio_id text, p_sesiones integer
)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_aplicada boolean;
  v_suscripcion_id text;
  v_saldo int;
begin
  if auth.uid() is not null and p_studio_id is distinct from public.current_studio_id() then
    raise exception 'STUDIO_MISMATCH';
  end if;
  if p_sesiones is null or p_sesiones <= 0 then
    return null;
  end if;

  -- El candado va sobre el RECIBO: es lo que identifica "esta entrega". Dos
  -- reintentos del webhook se serializan aquí.
  select r.entrega_aplicada, r.suscripcion_id into v_aplicada, v_suscripcion_id
    from recibos as r
   where r.id = p_recibo_id and r.studio_id = p_studio_id
   for update;
  if not found then return null; end if;
  if v_aplicada is true then return null; end if;
  if v_suscripcion_id is null then return null; end if;

  update suscripciones s
     set sesiones_restantes = coalesce(s.sesiones_restantes, 0) + p_sesiones,
         estado = 'ACTIVA'
   where s.id = v_suscripcion_id and s.studio_id = p_studio_id
  returning s.sesiones_restantes into v_saldo;
  if v_saldo is null then return null; end if;

  -- Marca la entrega en la MISMA transacción que la recarga: o pasan las dos, o
  -- ninguna. El snapshot completo (entrega_tipo, sesiones antes/después…) lo
  -- sigue escribiendo el llamador después; esto solo cierra la puerta.
  update recibos set entrega_aplicada = true, entrega_aplicada_en = now()
   where id = p_recibo_id and studio_id = p_studio_id;

  return v_saldo;
end;
$function$;

-- Función NUEVA → gotcha de pg_default_acl. Solo servidor: la llama el webhook y
-- el cron de renovación, nunca el cliente.
revoke all on function public.renovar_bono_idempotente(text, text, integer) from public;
revoke all on function public.renovar_bono_idempotente(text, text, integer) from anon;
revoke all on function public.renovar_bono_idempotente(text, text, integer) from authenticated;
grant execute on function public.renovar_bono_idempotente(text, text, integer) to service_role;
