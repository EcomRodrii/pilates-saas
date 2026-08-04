-- Fila 12 del informe estratégico (P1 España, Impacto 4/Dificultad 2):
-- "Datos de salud sin base legal sólida" → "Consentimiento explícito
-- trazable, revocación al causar baja".
--
-- Diseñado con tentare-arquitecto. Dos huecos reales encontrados, ambos
-- cerrados aquí:
--
-- 1) TRAZABILIDAD: `socios.consentimiento_salud_fecha`/`_registrado_por`
--    (migr 0138) ya guardan cuándo se dio el consentimiento y quién lo
--    recogió, pero nunca se marca cuándo dejó de estar vigente. El único
--    punto del código donde "ya no es socia" tiene sentido semántico es la
--    baja completa (app/api/socios/eliminar/route.ts) — ese mismo flujo YA
--    borra `condiciones_salud` por completo en su paso 1, así que es el
--    único momento real donde "revocar" el consentimiento tiene un dato de
--    salud que efectivamente deja de estar amparado. No hace falta una
--    tabla de historial: no existe ningún flujo de "dar de baja → volver a
--    dar consentimiento sobre la misma fila" en este repo (una socia que
--    vuelve entra como fila nueva; la anonimizada queda con `borrado_en`
--    para siempre) — una columna nullable basta.
--
-- 2) BASE LEGAL NO FORZADA EN SERVIDOR: `tiene_consentimiento_salud(text)`
--    existe desde 0138/20260729161000, pero SIN NINGÚN LLAMADOR — ni en SQL
--    ni en TS (confirmado por grep en todo el repo). El único gate real es
--    en el cliente (ficha-salud.tsx: `if (!socio?.consentimientoSalud)`),
--    así que un token PROPIETARIO/INSTRUCTOR podía escribir en
--    `condiciones_salud` por REST sin que existiera consentimiento — la
--    regla no negociable de este repo es que la UI nunca es el límite de
--    seguridad, la RLS sí. Se conecta aquí, solo en INSERT (editar/borrar
--    una condición ya existente no necesita volver a comprobar consentimiento).

alter table public.socios
  add column if not exists consentimiento_salud_revocado_en timestamptz;

comment on column public.socios.consentimiento_salud_revocado_en is
  'Cuándo dejó de estar vigente el consentimiento de datos de salud — se marca al dar de baja completa a la socia (app/api/socios/eliminar), momento en el que condiciones_salud ya se ha borrado por completo. NULL = vigente o nunca dado.';

-- tiene_consentimiento_salud() (STABLE SECURITY DEFINER, ya existente, sin
-- ningún llamador hasta este PR) solo miraba `consentimiento_salud_fecha is
-- not null` — nunca supo de la revocación porque hasta ahora no existía. Se
-- reemplaza con CREATE OR REPLACE (misma firma, conserva los GRANT que ya
-- tenía) para que una socia con el consentimiento revocado nunca vuelva a
-- pasar el check nuevo de más abajo, aunque `consentimiento_salud_fecha`
-- original se conserve intacto como traza.
create or replace function public.tiene_consentimiento_salud(p_socio_id text)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select consentimiento_salud_fecha is not null and consentimiento_salud_revocado_en is null
  from public.socios
  where id = p_socio_id;
$function$;

-- Split de la policy FOR ALL de 0095 en SELECT/UPDATE/DELETE (sin cambios de
-- criterio) + INSERT con el requisito de consentimiento añadido. Solo
-- `condiciones_salud`: es la única de las 3 tablas de 0095 que el diálogo de
-- consentimiento de ficha-salud.tsx protege (notas_progreso/respuestas_sesion
-- quedan fuera de esta fila, tal como se decidió con tentare-arquitecto).
drop policy if exists salud_condiciones_salud on public.condiciones_salud;

create policy salud_condiciones_salud_lectura on public.condiciones_salud
  for select to authenticated
  using (studio_id = current_studio_id() and current_rol() in ('PROPIETARIO', 'INSTRUCTOR'));

create policy salud_condiciones_salud_actualizacion on public.condiciones_salud
  for update to authenticated
  using      (studio_id = current_studio_id() and current_rol() in ('PROPIETARIO', 'INSTRUCTOR'))
  with check (studio_id = current_studio_id() and current_rol() in ('PROPIETARIO', 'INSTRUCTOR'));

create policy salud_condiciones_salud_borrado on public.condiciones_salud
  for delete to authenticated
  using (studio_id = current_studio_id() and current_rol() in ('PROPIETARIO', 'INSTRUCTOR'));

create policy salud_condiciones_salud_alta on public.condiciones_salud
  for insert to authenticated
  with check (
    studio_id = current_studio_id()
    and current_rol() in ('PROPIETARIO', 'INSTRUCTOR')
    and public.tiene_consentimiento_salud(socio_id)
  );

-- tiene_consentimiento_salud() ya estaba revocada de anon/public
-- (20260729161000); ahora SÍ tiene un llamador real (la policy de arriba,
-- que corre con los privilegios de `authenticated` vía RLS), así que se
-- concede EXECUTE a ese rol explícitamente — sin esto, el INSERT fallaría
-- con "permission denied for function" para cualquier staff real.
grant execute on function public.tiene_consentimiento_salud(text) to authenticated;
