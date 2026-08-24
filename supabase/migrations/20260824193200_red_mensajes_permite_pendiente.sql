-- Tentare Network, Fase F1 — mensajería pre-match (decisión ya confirmada
-- con el fundador). red_mensajes (20260813183513) exigía sc.estado =
-- 'aceptada' para leer/escribir; se relaja a 'pendiente' O 'aceptada' para
-- permitir el primer contacto antes de que el estudio acepte la solicitud.
--
-- El tope de mensajes durante 'pendiente' se aplica en la API (no en RLS —
-- contar filas en una policy es frágil, mismo criterio que el resto del
-- repo para límites de este tipo). Todo lo demás (quién es remitente,
-- quién participa) se copia tal cual de la política anterior.

drop policy red_mensajes_select on public.red_mensajes;
drop policy red_mensajes_insert on public.red_mensajes;

create policy red_mensajes_select on public.red_mensajes
  for select to authenticated
  using (
    exists (
      select 1 from public.red_solicitudes_contacto sc
      where sc.id = red_mensajes.solicitud_id
        and sc.estado in ('pendiente', 'aceptada')
        and (
          sc.studio_id = public.current_studio_id()
          or exists (select 1 from public.red_perfiles rp where rp.id = sc.perfil_id and rp.auth_user_id = auth.uid())
        )
    )
  );

create policy red_mensajes_insert on public.red_mensajes
  for insert to authenticated
  with check (
    remitente = auth.uid()
    and exists (
      select 1 from public.red_solicitudes_contacto sc
      where sc.id = red_mensajes.solicitud_id
        and sc.estado in ('pendiente', 'aceptada')
        and (
          sc.studio_id = public.current_studio_id()
          or exists (select 1 from public.red_perfiles rp where rp.id = sc.perfil_id and rp.auth_user_id = auth.uid())
        )
    )
  );

comment on table public.red_mensajes is
  'Tentare Network. Hilo de mensajes por solicitud de contacto pendiente o aceptada — sin concepto de "conversación" aparte. RLS: solo staff del estudio o dueña del perfil implicados. Tope de mensajes en pendiente aplicado en la API, no aquí.';
