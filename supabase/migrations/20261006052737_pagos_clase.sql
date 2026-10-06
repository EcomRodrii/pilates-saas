-- ─────────────────────────────────────────────────────────────────────────────
-- `pagos_clase`: el dueño de «el pago de UNA clase concreta» (P06, Fase A del
-- bloque de dinero de la app de la alumna, 6-oct-2026).
--
-- Por qué una tabla y no más metadata en Stripe: un pago de clase tiene que
-- terminar SIEMPRE en una reserva o en una compensación registrada, y hoy no
-- deja marca que no se pierda. El webhook reserva lo último y, si falla, lo
-- traga con Sentry; el conciliador solo reintenta los PaymentIntent sin
-- `rec-web`. Con esta fila:
--   · el pago tiene estado propio:
--       ABIERTO → PAGADO → RESERVADA | COMPENSADA(motivo) → REEMBOLSADA | CERRADA
--       ABIERTO → CANCELADO (nadie pagó)
--   · solo puede haber UN pago vivo por (pagador, clase): un índice único
--     parcial. Doble toque, dos pestañas o dos dispositivos reutilizan el mismo
--     PaymentIntent en vez de crear otro;
--   · la clave de idempotencia de Stripe es el id de la fila (no un `intentoId`
--     del cliente);
--   · la prioridad en la lista de espera de quien pagó y se quedó sin plaza vive
--     AQUÍ, no en `reservas` (que tiene UPDATE de tabla para `authenticated`).
--
-- ⚠️ ADITIVA y sin código que la use todavía: se aplica ANTES del código que la
-- escribe (el cobro con clase, el webhook y el conciliador), y el código de antes
-- no la toca. Repetible: `if not exists` en la tabla y los índices, `create or
-- replace` en la función, `drop policy if exists` en las políticas.
--
-- Solo el servidor la escribe (service_role). El personal que ve las finanzas
-- (PROPIETARIO, RECEPCION) la LEE, de su estudio y con la verificación en dos
-- pasos si la tiene activada. Nadie más.
--
-- Supresión (RGPD): CONSERVAR. `anonimizar_socio` no la toca: es el registro de
-- cada pago de una clase (ids, importes, estados y fechas) y cuadra con el recibo
-- fiscal que ya se conserva, con el mismo seudónimo por `socio_id`. `pagador` es
-- su socio_id o un hash de su email, nunca el email. Clasificada en
-- lib/socios/supresion-clasificacion.ts (`documentadaEn`).
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.pagos_clase (
  id                     text primary key,
  studio_id              text not null references public.studios(id) on delete cascade,
  -- Quién paga: `quienPaga(socioId, email)` (su socio_id, o un hash del email de la
  -- invitada). La clave de «un pago vivo por persona y clase».
  pagador                text not null,
  socio_id               text references public.socios(id) on delete set null,
  sesion_id              text not null,
  plan_id                text not null,
  spot_id                text,
  codigo_descuento_id    text,
  -- El CONTENIDO del cobro, para reutilizar el mismo PaymentIntent solo si no
  -- ha cambiado nada, y para recrearlo con los mismos parámetros.
  importe_centimos       integer not null check (importe_centimos >= 0),
  matricula_centimos     integer not null default 0 check (matricula_centimos >= 0),
  cupo_matricula         boolean not null default false,
  terminos_hash          text,
  -- `pi_…` (Payment Element) o `cs_…` (Checkout hospedado, Bizum).
  referencia_stripe      text unique,
  payment_intent_id      text unique,
  estado                 text not null default 'ABIERTO' check (estado in (
    'ABIERTO', 'CANCELADO', 'PAGADO', 'RESERVADA', 'COMPENSADA', 'REEMBOLSADA', 'CERRADA'
  )),
  motivo                 text check (motivo in (
    'EN_ESPERA', 'PENDIENTE_APROBACION', 'SIN_PLAZA', 'YA_TENIA_RESERVA', 'CLASE_CERRADA',
    'PAGADO_SIN_USAR', 'RECHAZADA', 'ERROR'
  )),
  reserva_id             text,
  -- La suscripción que entregó este pago (`sus-web-…`): la que tiene que gastar la reserva.
  suscripcion_id         text,
  plaza_comprobada_en    timestamptz not null,
  pagado_en              timestamptz,
  prioridad_espera_desde timestamptz,
  intentos_reserva       integer not null default 0 check (intentos_reserva >= 0),
  aviso_estudio_en       timestamptz,
  aviso_socia_en         timestamptz,
  resuelta_en            timestamptz,
  resuelta_por           uuid,
  creado_en              timestamptz not null default now(),
  actualizado_en         timestamptz not null default now(),
  constraint pagos_clase_compensada_con_motivo check (estado <> 'COMPENSADA' or motivo is not null)
);

comment on table public.pagos_clase is
  'El pago de UNA clase concreta desde la app o /reservar (P06): ABIERTO → PAGADO → RESERVADA | COMPENSADA(motivo). Un pago vivo por (pagador, clase). Solo la escribe el servidor.';

-- Un solo pago VIVO por persona y clase: la segunda petición relee y reutiliza.
create unique index if not exists pagos_clase_uno_vivo
  on public.pagos_clase (studio_id, pagador, sesion_id)
  where estado in ('ABIERTO', 'PAGADO');
-- Lo que leen las funciones que ordenan la cola (prioridad de quien pagó).
create index if not exists pagos_clase_prioridad
  on public.pagos_clase (reserva_id)
  where prioridad_espera_desde is not null and estado = 'COMPENSADA';
-- El barrido del conciliador y la bandeja del estudio.
create index if not exists pagos_clase_por_estado
  on public.pagos_clase (studio_id, estado, creado_en)
  where estado in ('ABIERTO', 'PAGADO', 'COMPENSADA');
create index if not exists pagos_clase_por_reserva on public.pagos_clase (reserva_id) where reserva_id is not null;

-- ── Permisos y RLS ───────────────────────────────────────────────────────────
-- Una tabla nueva nace con `arwdm` para `authenticated` (pg_default_acl): se
-- quita TODO y se da solo SELECT. Escribe el servidor.
alter table public.pagos_clase enable row level security;
revoke all on table public.pagos_clase from public, anon, authenticated;
grant select on table public.pagos_clase to authenticated;
grant all on table public.pagos_clase to service_role;

drop policy if exists pagos_clase_lectura on public.pagos_clase;
create policy pagos_clase_lectura on public.pagos_clase
  for select to authenticated
  using (studio_id = (select public.current_studio_id()) and (select public.puede_ver_finanzas()));

-- La verificación en dos pasos (20261003102845): la MISMA sentencia que el DO de esa migración.
drop policy if exists exige_doble_factor on public.pagos_clase;
create policy exige_doble_factor on public.pagos_clase as restrictive for all to authenticated
  using ((select public.nivel_acceso_suficiente())) with check ((select public.nivel_acceso_suficiente()));

-- ── registrar_resultado_pago_clase: el único que cambia el estado ────────────
-- Compare-and-set: el webhook, el conciliador y el barrido pueden llamarla a la
-- vez y solo una escribe. Transiciones admitidas (cualquier otra no cambia nada
-- y devuelve el estado de ahora con `cambiado = false`):
--   ABIERTO            → PAGADO | CANCELADO | RESERVADA | COMPENSADA
--   PAGADO             → RESERVADA | COMPENSADA
--   PAGADO             → PAGADO   (un intento de reserva que falló: intentos_reserva + 1)
--   COMPENSADA         → RESERVADA (la promoción desde la espera la confirmó)
--   COMPENSADA         → CERRADA   (la clase pasó)
-- Con `p_prioridad` y motivo EN_ESPERA fija `prioridad_espera_desde` y renumera la
-- cola de esa clase EN LA MISMA transacción. Devuelve la posición REAL en la cola.
-- (Lo que ordena la cola por esa prioridad llega en otra migración: aquí solo se anota.)
create or replace function public.registrar_resultado_pago_clase(
  p_id text,
  p_studio_id text,
  p_estado text,
  p_motivo text default null,
  p_reserva_id text default null,
  p_suscripcion_id text default null,
  p_pagado_en timestamptz default null,
  p_prioridad boolean default false
)
returns table (estado text, motivo text, posicion_espera integer, cambiado boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_fila public.pagos_clase%rowtype;
  v_ok boolean := false;
  v_pos integer;
begin
  select * into v_fila from public.pagos_clase as pc
   where pc.id = p_id and pc.studio_id = p_studio_id
   for update;
  if not found then
    return;
  end if;

  if p_estado = 'COMPENSADA' and p_motivo is null then
    raise exception 'registrar_resultado_pago_clase: COMPENSADA exige motivo';
  end if;

  v_ok := case
    when v_fila.estado = 'ABIERTO' and p_estado in ('PAGADO', 'CANCELADO', 'RESERVADA', 'COMPENSADA') then true
    when v_fila.estado = 'PAGADO' and p_estado in ('PAGADO', 'RESERVADA', 'COMPENSADA') then true
    when v_fila.estado = 'COMPENSADA' and p_estado in ('RESERVADA', 'CERRADA') then true
    else false
  end;

  if v_ok then
    update public.pagos_clase as pc
       set estado = p_estado,
           motivo = case when p_estado = 'COMPENSADA' then p_motivo
                         when p_estado = 'RESERVADA' then null
                         else pc.motivo end,
           reserva_id = coalesce(p_reserva_id, pc.reserva_id),
           suscripcion_id = coalesce(p_suscripcion_id, pc.suscripcion_id),
           pagado_en = coalesce(pc.pagado_en, p_pagado_en,
                                case when p_estado in ('PAGADO', 'RESERVADA', 'COMPENSADA') then now() end),
           intentos_reserva = case when v_fila.estado = 'PAGADO' and p_estado = 'PAGADO'
                                   then pc.intentos_reserva + 1 else pc.intentos_reserva end,
           prioridad_espera_desde = case
             when p_estado = 'COMPENSADA' and p_motivo = 'EN_ESPERA' and p_prioridad
               then coalesce(pc.prioridad_espera_desde, p_pagado_en, pc.pagado_en, now())
             when p_estado = 'RESERVADA' then null
             else pc.prioridad_espera_desde end,
           actualizado_en = now()
     where pc.id = p_id
     returning * into v_fila;

    if v_fila.estado = 'COMPENSADA' and v_fila.prioridad_espera_desde is not null then
      perform public.renumerar_lista_espera(v_fila.sesion_id);
    end if;
  end if;

  if v_fila.reserva_id is not null then
    select r.posicion_espera into v_pos from public.reservas as r
     where r.id = v_fila.reserva_id and r.studio_id = p_studio_id and r.estado = 'LISTA_ESPERA';
  end if;

  return query select v_fila.estado, v_fila.motivo, v_pos, v_ok;
end;
$fn$;

comment on function public.registrar_resultado_pago_clase(text, text, text, text, text, text, timestamptz, boolean) is
  'Compare-and-set del estado de un pago de clase (pagos_clase). Solo service_role: la llaman el webhook, el conciliador y el panel (por API con permiso de dinero).';

-- Función NUEVA: pg_default_acl le da EXECUTE directo a anon/authenticated. Los tres pasos.
revoke all on function public.registrar_resultado_pago_clase(text, text, text, text, text, text, timestamptz, boolean) from public;
revoke all on function public.registrar_resultado_pago_clase(text, text, text, text, text, text, timestamptz, boolean) from anon;
revoke all on function public.registrar_resultado_pago_clase(text, text, text, text, text, text, timestamptz, boolean) from authenticated;
grant execute on function public.registrar_resultado_pago_clase(text, text, text, text, text, text, timestamptz, boolean) to service_role, postgres;

-- ── Verificación: que no quede nada abierto ──────────────────────────────────
do $$
declare
  v_fn constant text := 'public.registrar_resultado_pago_clase(text, text, text, text, text, text, timestamptz, boolean)';
begin
  if has_table_privilege('anon', 'public.pagos_clase', 'SELECT') then
    raise exception 'anon puede leer pagos_clase';
  end if;
  if has_table_privilege('authenticated', 'public.pagos_clase', 'INSERT')
     or has_table_privilege('authenticated', 'public.pagos_clase', 'UPDATE')
     or has_table_privilege('authenticated', 'public.pagos_clase', 'DELETE')
     or has_table_privilege('authenticated', 'public.pagos_clase', 'TRUNCATE') then
    raise exception 'authenticated puede escribir pagos_clase';
  end if;
  if has_function_privilege('anon', v_fn, 'EXECUTE') or has_function_privilege('authenticated', v_fn, 'EXECUTE') then
    raise exception 'registrar_resultado_pago_clase ejecutable desde el cliente';
  end if;
  if not has_function_privilege('service_role', v_fn, 'EXECUTE') then
    raise exception 'service_role no puede ejecutar registrar_resultado_pago_clase';
  end if;
  if not exists (
    select 1 from pg_policy p join pg_class c on c.oid = p.polrelid
     where c.relname = 'pagos_clase' and p.polname = 'exige_doble_factor' and not p.polpermissive
  ) then
    raise exception 'pagos_clase sin la política exige_doble_factor';
  end if;
end $$;
