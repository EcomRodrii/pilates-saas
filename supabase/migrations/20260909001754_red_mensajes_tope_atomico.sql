-- ═══════════════════════════════════════════════════════════════════════════
-- 35ª pasada de auditoría — el tope de 3 mensajes en una solicitud "pendiente"
-- de Network tenía una ventana de carrera (TOCTOU): contar y comparar en TS,
-- sin lock ni constraint, dejaba pasar más de 3 mensajes si dos POST del mismo
-- remitente llegaban a la vez (doble clic, doble pestaña, reintento de red).
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Impacto bajo (límite de spam/ruido, no de dinero ni seguridad — se
-- documenta así en el hallazgo N-2), pero el arreglo es barato: mover el
-- conteo+inserción a una RPC que bloquea la fila de la solicitud con
-- `FOR UPDATE` antes de contar, serializando los envíos concurrentes de la
-- MISMA solicitud (no afecta a solicitudes distintas, que no comparten lock).
CREATE OR REPLACE FUNCTION public.enviar_mensaje_red(
  p_mensaje_id  text,
  p_solicitud_id text,
  p_remitente   uuid,
  p_cuerpo      text,
  p_tope_pendiente integer
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_estado text;
  v_enviados integer;
BEGIN
  -- El lock serializa dos llamadas concurrentes sobre la MISMA solicitud: la
  -- segunda espera a que la primera confirme (o aborte) antes de contar.
  SELECT estado INTO v_estado
    FROM public.red_solicitudes_contacto
   WHERE id = p_solicitud_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SOLICITUD_NO_ENCONTRADA'; END IF;

  IF v_estado = 'pendiente' THEN
    SELECT count(*) INTO v_enviados
      FROM public.red_mensajes
     WHERE solicitud_id = p_solicitud_id AND remitente = p_remitente;
    IF v_enviados >= p_tope_pendiente THEN
      RAISE EXCEPTION 'TOPE_ALCANZADO';
    END IF;
  END IF;

  INSERT INTO public.red_mensajes (id, solicitud_id, remitente, cuerpo)
  VALUES (p_mensaje_id, p_solicitud_id, p_remitente, p_cuerpo);
END;
$$;

-- Solo servidor: la autorización (quién participa, si la solicitud sigue
-- viva) ya se comprueba en la ruta antes de llamar aquí — la RPC solo añade
-- la atomicidad que faltaba. Firma nueva → EXECUTE por defecto a PUBLIC en
-- este proyecto; los tres pasos explícitos, sin excepción.
REVOKE ALL ON FUNCTION public.enviar_mensaje_red(text, text, uuid, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enviar_mensaje_red(text, text, uuid, text, integer) TO service_role;

COMMENT ON FUNCTION public.enviar_mensaje_red(text, text, uuid, text, integer) IS
  'Network: envía un mensaje de red_mensajes, contando el tope de mensajes en solicitud pendiente de forma ATÓMICA (35ª pasada de auditoría) — bloquea la fila de red_solicitudes_contacto con FOR UPDATE antes de contar, cerrando el TOCTOU de dos POST concurrentes. Lanza TOPE_ALCANZADO o SOLICITUD_NO_ENCONTRADA; el resto de la autorización vive en la ruta.';
