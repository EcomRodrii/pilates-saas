-- ─────────────────────────────────────────────────────────────────────────────
-- La matrícula admite CUPO y FECHA: «matrícula gratis, solo 4 plazas, hasta
-- final de año».
--
-- ── De dónde sale ────────────────────────────────────────────────────────────
-- Una propietaria preguntó si Tentare podía hacer lo del cartel de un
-- competidor: pack de 4 meses, clases ilimitadas, y **matrícula gratis solo
-- para 4 personas, hasta final de año**. Todo lo demás ya se podía. Esto no:
-- un código de descuento se aplica al PLAN y nunca a la matrícula (decisión
-- explícita de la 26ª pasada, P-1: «ese es del plan, no de esta venta aparte»),
-- así que la única salida era un apaño que llegaba al mismo precio con otra
-- etiqueta en el recibo.
--
-- ── Por qué la decisión vive AQUÍ y no en cada pantalla ──────────────────────
-- Hoy hay CUATRO sitios que deciden si se cobra matrícula: los dos checkouts
-- online (Modo A y Modo B) y las dos vías de mostrador (alta con plan y
-- asignar plan). Repartir el cupo entre los cuatro es repartir la misma carrera
-- cuatro veces — y dos socias comprando a la vez con un cupo libre se lo
-- llevarían las dos. Bajo `for update` de la fila del plan, no.
--
-- Es el mismo patrón que `canjear_recompensa` (#1806): quien decide y quien
-- descuenta son la misma transacción.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.planes_tarifa
  -- NULL = sin fecha límite. La promoción se acaba cuando se acaben los cupos.
  add column if not exists matricula_gratis_hasta date,
  -- NULL = sin tope de plazas. La promoción se acaba en la fecha.
  add column if not exists matricula_gratis_cupos int,
  -- Cuántas se han perdonado ya. Lo lleva la BD, no una cuenta de recibos:
  -- contar recibos de 0 € no distingue una matrícula perdonada de un plan
  -- gratis, y además no se puede bloquear para decidir.
  add column if not exists matricula_gratis_usados int not null default 0;

comment on column public.planes_tarifa.matricula_gratis_cupos is
  'Plazas con matricula gratis. NULL = sin tope. Con las dos columnas a NULL no hay promocion: se cobra la matricula de siempre.';
comment on column public.planes_tarifa.matricula_gratis_usados is
  'Contador de plazas ya gastadas. Editable por la propietaria: si un checkout abandonado se come una, puede devolverla.';

alter table public.planes_tarifa
  drop constraint if exists planes_tarifa_matricula_cupos_valido;
alter table public.planes_tarifa
  add constraint planes_tarifa_matricula_cupos_valido
  check (matricula_gratis_cupos is null or matricula_gratis_cupos > 0);

alter table public.planes_tarifa
  drop constraint if exists planes_tarifa_matricula_usados_valido;
alter table public.planes_tarifa
  add constraint planes_tarifa_matricula_usados_valido
  check (matricula_gratis_usados >= 0);

-- ── Reservar (o no) la matrícula ─────────────────────────────────────────────
--
-- Devuelve LO QUE HAY QUE COBRAR: 0 si la promoción la cubre, el importe de la
-- matrícula si no. Quien llama no decide nada; solo cobra lo que salga de aquí.
--
-- ⚠️ Solo se llama cuando ya se sabe que es la PRIMERA vez de esa socia
-- (`primeraVezConPlan` / `dbSocioTieneAlgunPlan`). Si no, una socia veterana
-- —que no paga matrícula de todos modos— gastaría un cupo al contratar su
-- segundo plan.
create or replace function public.reservar_matricula(
  p_plan_id text,
  p_studio_id text
) returns numeric
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_matricula numeric;
  v_hasta date;
  v_cupos int;
  v_usados int;
  v_hay_promo boolean;
  -- La base va en UTC. Un «hasta el 31 de diciembre» calculado así seguiría
  -- regalando matrículas hasta las 01:00 del día 1 — la propietaria piensa en
  -- su calendario, no en el del servidor. Mismo criterio que el resto del repo.
  v_hoy date := (now() at time zone 'Europe/Madrid')::date;
begin
  perform public.validar_studio_mismatch(p_studio_id);

  -- Con service role (`auth.uid()` nulo) entra el checkout online, que ya ha
  -- verificado la identidad; con sesión de navegador entra el mostrador, y ahí
  -- hace falta rol de gestión. Una socia autenticada NO pasa: podría quemar
  -- los cupos de un estudio llamando a esto en bucle.
  if auth.uid() is not null and not public.puede_gestionar_clientas() then
    raise exception 'NO_AUTORIZADO';
  end if;

  select p.matricula, p.matricula_gratis_hasta, p.matricula_gratis_cupos, p.matricula_gratis_usados
    into v_matricula, v_hasta, v_cupos, v_usados
  from planes_tarifa p
  where p.id = p_plan_id and p.studio_id = p_studio_id
  for update;

  if not found then
    raise exception 'PLAN_NO_ENCONTRADO';
  end if;

  -- Sin matrícula no hay nada que perdonar, y sobre todo no hay cupo que
  -- gastar: un plan sin matrícula no puede vaciar la promoción de nadie.
  if v_matricula is null or v_matricula <= 0 then
    return 0;
  end if;

  -- Las dos a NULL = este plan no tiene promoción. Es el estado de todos los
  -- planes que ya existen, así que la migración no cambia lo que nadie cobra.
  v_hay_promo := v_hasta is not null or v_cupos is not null;

  if v_hay_promo
     and (v_hasta is null or v_hoy <= v_hasta)
     and (v_cupos is null or v_usados < v_cupos)
  then
    update planes_tarifa
       set matricula_gratis_usados = matricula_gratis_usados + 1
     where id = p_plan_id and studio_id = p_studio_id;
    return 0;
  end if;

  return v_matricula;
end;
$function$;

-- ── Devolver un cupo ─────────────────────────────────────────────────────────
--
-- El cupo se reserva ANTES de cobrar, porque el precio hay que decidirlo antes
-- de enseñárselo a nadie. Si la creación del cobro falla después, esa plaza no
-- se ha llegado a usar y tiene que volver.
--
-- ⚠️ Límite conocido, y se documenta en vez de disimularlo: un checkout que la
-- socia ABANDONA (cierra la pestaña sin pagar) se queda con el cupo reservado.
-- Devolverlo exigiría escuchar la expiración de la sesión de Stripe, que es un
-- camino nuevo para un caso de borde. En su lugar, el contador es visible y
-- editable en la pantalla de planes: si pasa, la propietaria lo ve y suma uno.
create or replace function public.liberar_cupo_matricula(
  p_plan_id text,
  p_studio_id text
) returns void
language plpgsql
security definer
set search_path = public
as $function$
begin
  perform public.validar_studio_mismatch(p_studio_id);

  if auth.uid() is not null and not public.puede_gestionar_clientas() then
    raise exception 'NO_AUTORIZADO';
  end if;

  -- `greatest(...,0)` y no un `check` que reviente: devolver de más es un error
  -- de quien llama, y hacer fallar la compensación dejaría el fallo original
  -- sin arreglar Y este encima.
  update planes_tarifa
     set matricula_gratis_usados = greatest(0, matricula_gratis_usados - 1)
   where id = p_plan_id and studio_id = p_studio_id;
end;
$function$;

-- ── Grants ───────────────────────────────────────────────────────────────────
--
-- ⚠️ Firmas NUEVAS: Postgres las crea con `EXECUTE` a PUBLIC por defecto, y en
-- este proyecto `pg_default_acl` además se lo da directo a anon/authenticated.
-- Revocar PUBLIC no basta. Documentado en `.claude/tentare-os.md`; van cinco.
--
-- `authenticated` sí, porque el mostrador llama desde el navegador con la
-- sesión de la propietaria — el guardián de rol de dentro es el que decide.
revoke all on function public.reservar_matricula(text, text) from public, anon;
grant execute on function public.reservar_matricula(text, text) to authenticated, service_role;

revoke all on function public.liberar_cupo_matricula(text, text) from public, anon;
grant execute on function public.liberar_cupo_matricula(text, text) to authenticated, service_role;
