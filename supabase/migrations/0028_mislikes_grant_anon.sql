-- ═══════════════════════════════════════════════════════════════════════════
-- 0028 · mis_likes_comunidad ejecutable por anon (arregla 42501 permission denied)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- BUG (Sentry, 42501 "permission denied for function mis_likes_comunidad")
-- `dbMisLikesComunidad` se llama al CARGAR la app (provider), a veces antes de
-- que la sesión esté enganchada al cliente supabase → la petición llega con el
-- rol `anon`. 0023 revocó execute de anon → 42501. (toggle_like_post no falla
-- porque solo se llama al hacer clic, ya con rol authenticated.)
--
-- FIX
-- Conceder execute a anon. Es SEGURO: la función solo hace
-- `select post_id from post_likes where user_id = auth.uid()`; para anon
-- auth.uid() es NULL → devuelve conjunto vacío, no expone datos de nadie.
-- (Distinto de toggle_like_post/restaurar_backup, que SÍ mutan y siguen sin anon.)
-- ═══════════════════════════════════════════════════════════════════════════

grant execute on function public.mis_likes_comunidad() to anon;
