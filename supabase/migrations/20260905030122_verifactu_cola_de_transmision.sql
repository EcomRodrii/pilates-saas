-- La cola de transmisión a la AEAT.
--
-- `facturas.verifactu_estado` ya existía pero nunca se escribió: las 26
-- facturas de producción lo tienen a NULL porque el proveedor externo que
-- debía rellenarlo no llegó a firmar ninguna. Ahora pasa a ser la cola de
-- nuestra propia transmisión.
--
-- ⚠️ NULL SIGNIFICA «NO ENTRA EN LA COLA», Y ES DELIBERADO.
-- Las facturas anteriores a que exista la transmisión propia se quedan como
-- están: no se retransmite histórico. Veri*Factu no es obligatorio hasta enero
-- de 2027 (sociedades) y julio de 2027 (autónomos), así que no hay nada que
-- regularizar hacia atrás, y mandar registros viejos con fechas de generación
-- de hace meses solo puede traer preguntas. Si algún día se decide lo
-- contrario, es un UPDATE consciente sobre estas filas, no un efecto
-- secundario de desplegar.

alter table public.facturas
  drop constraint if exists facturas_verifactu_estado_valido;
alter table public.facturas
  add constraint facturas_verifactu_estado_valido check (
    verifactu_estado is null or verifactu_estado in (
      'PENDIENTE',              -- sellada, esperando envío
      'REGISTRADA',             -- la AEAT la admitió
      'ACEPTADA_CON_ERRORES',   -- admitida con marca (códigos 2000-2008)
      'RECHAZADA'               -- la AEAT la rechazó: hay que mirarla
    )
  );

comment on column public.facturas.verifactu_estado is
  'Cola de transmisión a la AEAT. NULL = fuera de la cola (histórico anterior a la transmisión propia). PENDIENTE = esperando al cron. REGISTRADA/ACEPTADA_CON_ERRORES = ya no se reenvía. RECHAZADA = requiere revisión.';

-- El cron pregunta siempre lo mismo: qué queda pendiente, por estudio y en
-- orden de secuencia. Parcial para que el índice no cargue con las miles de
-- facturas ya resueltas.
create index if not exists idx_facturas_pendientes_transmitir
  on public.facturas (studio_id, verifactu_seq)
  where verifactu_estado = 'PENDIENTE';
