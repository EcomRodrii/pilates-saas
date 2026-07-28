-- Escalada de privilegios vía `self_claim_instructores`.
--
-- ⚠️ YA APLICADA EN PRODUCCIÓN (2026-07-28, versión 20260728132411) antes de
-- que #453 ocupara el número 0118. Se renumeró a 0119 solo para el guardia de
-- numeración del repo; en producción va DESPUÉS de studios_como_nos_conocio
-- (20260728123808), que es el orden correcto.
--
-- La policy que permite a alguien invitado reclamar su ficha al registrarse es:
--
--   USING      (auth_user_id IS NULL AND email = auth.jwt() ->> 'email')
--   WITH CHECK (auth_user_id = auth.uid())
--
-- El WITH CHECK fija `auth_user_id` y NADA MÁS. No fija `rol` ni `studio_id`, y
-- el UPDATE lo lanza el navegador directamente (lib/supabase-data.ts,
-- dbClaimInstructorAccount). Así que en el mismo update con el que reclamas tu
-- ficha puedes escribir rol='PROPIETARIO' y el studio_id que te apetezca.
--
-- Y funciona de punta a punta porque la identidad se resuelve DESDE ESA FILA:
--   · current_studio_id() cae a  select studio_id from instructores where auth_user_id = auth.uid()
--   · current_rol()       lee    select rol        from instructores where auth_user_id = auth.uid()
--
-- ⇒ cualquiera que haya sido invitado alguna vez a CUALQUIER estudio podía
--   convertirse en propietario de CUALQUIER otro. Es una fuga entre inquilinos,
--   no una escalada dentro del propio estudio.
--
-- Una policy no puede comparar con la fila antigua (WITH CHECK solo ve la nueva),
-- así que la cerradura va en un trigger BEFORE UPDATE: el self-claim solo puede
-- tocar `auth_user_id`; `rol` y `studio_id` se fuerzan a su valor previo.
--
-- Se distingue el self-claim del resto de escrituras por la señal que lo define y
-- que ninguna otra ruta reproduce: la fila pasa de auth_user_id NULL a NO NULL.
-- Las escrituras legítimas de la propietaria y del manager van por
-- owner_write_instructores / manager_gestiona_equipo sobre filas YA reclamadas
-- (o con auth_user_id nulo en ambos lados), y no entran por esta rama.

create or replace function public.self_claim_no_escala() returns trigger
  language plpgsql
  security definer
  set search_path to 'public'
as $$
begin
  -- Solo el gesto de reclamar: NULL -> uid propio.
  if old.auth_user_id is null
     and new.auth_user_id is not null
     and new.auth_user_id = auth.uid()
  then
    -- Reclamar vincula la cuenta. No asciende ni cambia de estudio.
    new.rol       := old.rol;
    new.studio_id := old.studio_id;
  end if;
  return new;
end;
$$;

revoke all on function public.self_claim_no_escala() from public, anon, authenticated;

drop trigger if exists trg_self_claim_no_escala on public.instructores;
create trigger trg_self_claim_no_escala
  before update on public.instructores
  for each row execute function public.self_claim_no_escala();
