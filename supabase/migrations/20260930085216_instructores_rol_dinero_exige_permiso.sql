-- Dar a una cuenta YA ACTIVA un rol que mueve dinero lo decide quien puede moverlo.
--
-- `manager_gestiona_equipo` (0113) deja a un manager editar las fichas de
-- INSTRUCTOR y RECEPCION de su estudio: que dé de alta a su recepcionista es
-- decisión tomada. Lo que esa política no distingue es si la ficha ya tiene una
-- cuenta detrás. Cambiar `rol` a RECEPCION sobre una ficha con cuenta deja a esa
-- cuenta operando con el poder de cobrar y devolver, que a un manager se le
-- niega (`puede_mover_dinero()` es PROPIETARIO y RECEPCION).
--
-- El servidor ya lo comprueba (`puedeActivarAccesoDelRol`, lib/permisos-reglas.ts),
-- pero la política también deja escribir `rol` por la API de Supabase sin pasar
-- por él, y la RLS es la cerradura real. Una política no puede comparar con la
-- fila antigua, así que va en un trigger (mismo motivo que 0124).
--
-- Solo se bloquea lo que ACTIVA acceso:
--   · cambiar el rol de una ficha SIN cuenta sigue valiendo (es preparar un alta);
--   · bajar de RECEPCION a INSTRUCTOR también (no da poder, lo quita);
--   · las rutas del servidor entran con service-role y aplican la misma regla en
--     código, así que se dejan pasar (mismo criterio que
--     `instructores_auth_user_id_solo_propio`).
--
-- Los roles que mueven dinero son los de `puede_mover_dinero()`. Si esa función
-- cambia, cambia aquí: supabase/tests/rls-manager-no-activa-dinero.test.ts lo
-- comprueba contra la base de datos.

create or replace function public.instructores_rol_dinero_exige_permiso() returns trigger
  language plpgsql
  security definer
  set search_path to 'public'
as $$
begin
  if public.es_llamada_servicio() then
    return new;
  end if;

  if new.rol in ('PROPIETARIO', 'RECEPCION')
     and old.auth_user_id is not null
     and not public.puede_mover_dinero()
  then
    raise exception 'Dar a una cuenta activa un rol que mueve dinero lo decide quien puede moverlo'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- Función de trigger: no es una RPC. Se cierra igual que las demás guardias del
-- repo (0124) para que ningún rol la tenga ejecutable por defecto.
revoke all on function public.instructores_rol_dinero_exige_permiso() from public, anon, authenticated;

comment on function public.instructores_rol_dinero_exige_permiso() is
  'Guardia de instructores.rol: quien no puede mover dinero no puede dar un rol que lo mueve a una ficha que ya tiene cuenta. Espejo en código: puedeActivarAccesoDelRol (lib/permisos-reglas.ts).';

drop trigger if exists trg_instructores_rol_dinero_exige_permiso on public.instructores;
create trigger trg_instructores_rol_dinero_exige_permiso
  before update of rol on public.instructores
  for each row
  when (old.rol is distinct from new.rol)
  execute function public.instructores_rol_dinero_exige_permiso();
