-- Arreglos de la revisión de seguridad de la autorización por tipo de clase.
-- La tabla está vacía y ningún tipo tiene la regla encendida todavía, así que
-- se puede rehacer la clave sin migrar ni una fila.

-- ── 1. La clave primaria no llevaba el estudio ───────────────────────────────
-- Con PK (socio_id, tipo_clase_id) GLOBAL, un estudio podía insertar una fila
-- con SU studio_id pero con la socia y el tipo de OTRO (la policy solo mira
-- studio_id) y dejar al estudio legítimo sin poder autorizar a esa socia nunca
-- más: no ve la fila (RLS), no puede actualizarla (revocado) ni borrarla. Un
-- bloqueo permanente y sin salida desde el producto.
alter table public.socio_tipos_clase_autorizados
  drop constraint if exists socio_tipos_clase_autorizados_pkey;
alter table public.socio_tipos_clase_autorizados
  add primary key (studio_id, socio_id, tipo_clase_id);

-- Y para que la fila no pueda apuntar a una socia o un tipo de OTRO estudio,
-- las claves ajenas pasan a ser compuestas. Los UNIQUE de destino son
-- redundantes con la PK de cada tabla (el id ya es único), pero hacen falta
-- como destino de una FK compuesta.
alter table public.socios
  drop constraint if exists socios_studio_id_id_key;
alter table public.socios
  add constraint socios_studio_id_id_key unique (studio_id, id);

alter table public.tipos_clase
  drop constraint if exists tipos_clase_studio_id_id_key;
alter table public.tipos_clase
  add constraint tipos_clase_studio_id_id_key unique (studio_id, id);

alter table public.socio_tipos_clase_autorizados
  drop constraint if exists socio_tipos_clase_autorizados_socio_id_fkey,
  drop constraint if exists socio_tipos_clase_autorizados_tipo_clase_id_fkey,
  drop constraint if exists autorizados_socio_del_studio,
  drop constraint if exists autorizados_tipo_del_studio;

alter table public.socio_tipos_clase_autorizados
  add constraint autorizados_socio_del_studio
    foreign key (studio_id, socio_id) references public.socios (studio_id, id) on delete cascade,
  add constraint autorizados_tipo_del_studio
    foreign key (studio_id, tipo_clase_id) references public.tipos_clase (studio_id, id) on delete cascade;

-- ── 2. La cerradura de verdad: un disparador sobre `reservas` ────────────────
-- La comprobación vivía SOLO en `reservar_plaza`, y a `reservas` se entra por
-- más sitios: el cron de plazas fijas (`materializar_plazas_fijas`), la
-- promoción desde lista de espera, aceptar una oferta, aprobar una reserva
-- pendiente y la restauración de copias. La revisión encontró que una socia
-- podía crearse una plaza fija desde el portal y que el cron le confirmaba
-- TODAS las ocurrencias de una clase para la que no estaba autorizada.
--
-- Parchear cinco funciones deja fuera la sexta que aparezca. El disparador es
-- un solo objeto y no se le escapa ninguna vía — mismo principio de «la base
-- decide una vez» que ya usa la detección de penalizaciones.
--
-- ⚠️ Solo mira clases FUTURAS. Es lo que deja pasar lo legítimo sin excepciones
-- a medida: importar histórico de asistencia (`/api/reservas/import`, que ya
-- comprueba rol en servidor) y restaurar una copia de seguridad meten filas de
-- clases ya pasadas, y bloquearlas sería impedir registrar lo que de verdad
-- ocurrió.
create or replace function public.exigir_autorizacion_tipo_clase()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_tipo text;
  v_inicio timestamptz;
  v_requiere boolean;
begin
  if new.estado not in ('CONFIRMADA', 'ASISTIDA', 'PENDIENTE_APROBACION') then
    return new;
  end if;

  select s.tipo_clase_id, s.inicio into v_tipo, v_inicio
    from sesiones s where s.id = new.sesion_id;

  -- Sin clase, sin tipo o ya pasada: no es asunto de esta regla.
  if v_tipo is null or v_inicio is null or v_inicio <= now() then
    return new;
  end if;

  select tc.requiere_autorizacion into v_requiere
    from tipos_clase tc where tc.id = v_tipo;

  if not coalesce(v_requiere, false) then
    return new;
  end if;

  if not exists (
    select 1 from socio_tipos_clase_autorizados a
     where a.studio_id = new.studio_id
       and a.socio_id = new.socio_id
       and a.tipo_clase_id = v_tipo
  ) then
    raise exception 'NECESITA_AUTORIZACION';
  end if;

  return new;
end;
$$;

comment on function public.exigir_autorizacion_tipo_clase() is
  'Impide ocupar plaza en una clase FUTURA con requiere_autorizacion sin fila en socio_tipos_clase_autorizados. Cubre todas las vías de escritura de reservas, no solo reservar_plaza. Las clases pasadas quedan fuera para no romper importaciones ni restauraciones de histórico.';

drop trigger if exists trg_exigir_autorizacion_tipo_clase on public.reservas;
create trigger trg_exigir_autorizacion_tipo_clase
  before insert or update of estado, sesion_id, socio_id on public.reservas
  for each row execute function public.exigir_autorizacion_tipo_clase();
