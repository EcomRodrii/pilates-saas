-- TENTARE — los avisos «Plaza fija por decidir» anteriores al arreglo e235ad57
-- (23-sep-2026) se guardaron con `/dashboard` a secas, así que al pulsarlos
-- llevaban a la pantalla y, con suerte, a la tarjeta, pero no a LA petición.
-- Desde ese arreglo el enlace nace con `?peticion=<id>#decidir-plazas-fijas`;
-- esto se lo pone también a los que ya estaban guardados.
--
-- Solo se toca un aviso cuando su petición se puede identificar SIN duda: mismo
-- estudio, misma socia y creada a menos de 10 s de él (medido: 0,2 s). Si hay
-- más de una candidata, no se toca — un enlace a la petición equivocada es peor
-- que el de la tarjeta. Idempotente: solo afecta a los que siguen en
-- `/dashboard`. Una petición ya resuelta también recibe su enlace: la tarjeta
-- ya sabe decir «esto ya no está» cuando el aviso señala algo que se resolvió.
--
-- Reversible: el valor anterior de todos era exactamente '/dashboard'.

update public.notification n
set deep_link = '/dashboard?peticion=' || m.solicitud_id || '#decidir-plazas-fijas'
from (
  select n2.id as notif_id,
         (array_agg(s.id order by abs(extract(epoch from (s.creada_en - n2.created_at)))))[1] as solicitud_id,
         count(*) as candidatas
  from public.notification n2
  join public.solicitudes_plaza_fija s
    on s.studio_id = n2.studio_id
   and s.socio_id::text = n2.resource_id
   and abs(extract(epoch from (s.creada_en - n2.created_at))) < 10
  where n2.event_type = 'plaza_fija.peticion'
    and n2.deep_link = '/dashboard'
  group by n2.id
) m
where n.id = m.notif_id
  and m.candidatas = 1;
