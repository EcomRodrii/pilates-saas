-- «La semana es la ventana»: una cancelación a tiempo solo libera el hueco de ESA semana.
--
-- Hoy, al cancelar una sesión de plaza fija a tiempo con un plan de límite semanal, el
-- sistema concede además una «recuperación» (un crédito que caduca a fin de mes, o de
-- mes y medio, según el estudio) que deja saltarse el límite semanal en otra semana. Hay
-- estudios con grupos cerrados cuya regla es otra: la sesión cancelada se recupera dentro
-- de la misma semana natural (lunes a domingo) o se pierde, sin acumular nada. Ese hueco
-- ya lo da el propio límite semanal (una reserva cancelada no cuenta para él), así que lo
-- único que falta es poder pedir que NO se conceda además un crédito.
--
-- Con el ajuste encendido, ningún camino AUTOMÁTICO concede recuperaciones por cancelar:
-- ni al cancelar la plaza fija, ni el barrido de los lunes. Lo que da una persona a mano o
-- importa de otra plataforma no cambia (es una decisión suya), ni la compensación por un
-- fallo del estudio al aceptar una oferta de lista de espera.
--
-- De serie apagado: ningún estudio ve un cambio hasta que lo enciende.

alter table public.studios
  add column if not exists recuperacion_solo_en_la_semana boolean not null default false;

comment on column public.studios.recuperacion_solo_en_la_semana is
  'La semana es la ventana: cancelar a tiempo una clase solo libera el hueco de esa semana, sin conceder recuperación (ni al cancelar una plaza fija ni en el barrido semanal). De serie no (como siempre).';

-- La propietaria lo guarda desde Configuración con su sesión (RLS `owner_studios` limita la fila): sin el grant de
-- columna el UPDATE da 42501. Lo lee el servidor con service-role.
grant update (recuperacion_solo_en_la_semana) on public.studios to authenticated;
