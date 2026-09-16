-- Una sola plaza fija por alumna y franja, garantizado por la base.
--
-- Lo pedía la revisión de seguridad de #2096: el código ya lo comprueba
-- (`validarPlazaFijaDesdeSesion`, el chequeo `duplicada`), pero es un
-- lee-y-escribe sin nada detrás, así que dos escrituras a la vez se cuelan las
-- dos. Pasaba por dos puertas: aprobar la misma petición desde dos sitios
-- —ya arreglado reclamándola antes de escribir— y guardar la plaza desde la
-- ficha, que sigue teniendo la misma carrera.
--
-- Efecto de dos filas iguales: el motor le reserva la clase DOS veces cada
-- semana (aforo real perdido en cada ocurrencia) y cuenta doble contra el
-- límite semanal de su cuota, sin que nada lo diga en pantalla.
--
-- El predicado es EXACTAMENTE la regla que ya aplica el código: cuentan las
-- ACTIVA y las PAUSADA, y la vigencia no entra (el chequeo `duplicada` tampoco
-- la mira, así que este índice no puede rechazar nada que la app aceptara hoy).
-- `spot_id` fuera a propósito: el sitio ya lo cubre la exclusión GiST de 0083.
--
-- Comprobado en producción antes de crearlo: 0 duplicadas con este criterio.
create unique index if not exists plazas_fijas_una_por_franja
  on public.plazas_fijas (studio_id, socio_id, dia_semana, hora_inicio, sala_id)
  where estado <> 'BAJA';
