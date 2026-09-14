-- ─────────────────────────────────────────────────────────────────────────────
-- «La instructora crea sus clases / solo se le asignan»: lo decide el estudio
-- (decisión del fundador, 14-sep-2026). Default `true` = el comportamiento de
-- siempre (#550, 20260731100000): nadie nota el cambio hasta que la propietaria
-- lo apague en Configuración → Reservas.
--
-- Solo afecta a CREAR. Mover o editar sus propias clases sigue igual
-- (`sesiones_escritura_update`, 20260730012600): decisión confirmada.
--
-- La RLS es la cerradura real: la política de INSERT exige el ajuste a la
-- instructora con un EXISTS en línea sobre `studios` (sin función nueva, así que
-- sin el gotcha de grants de funciones). `own_studio_read` ya le deja leer su
-- propia sede, que es justo la que exige `studio_id = current_studio_id()`.
--
-- De paso se cierra un hueco que venía de #550: por el camino del panel, la RLS
-- no impedía a la instructora crear su clase con serie o con precio puntual
-- (solo lo frenaba la pantalla). Sus clases van siempre sueltas y sin precio.
--
-- Grant de columna: `authenticated` no tiene UPDATE de tabla en `studios`, sino
-- columna a columna (20260911000542). Sin este grant, guardar la política de
-- reservas entera fallaría.
--
-- Reversible: drop column + la política de 20260731100000.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.studios
  add column if not exists instructoras_crean_clases boolean not null default true;

grant update (instructoras_crean_clases) on public.studios to authenticated;

drop policy if exists sesiones_escritura_insert on public.sesiones;

create policy sesiones_escritura_insert on public.sesiones
  for insert to authenticated
  with check (
    studio_id = public.current_studio_id()
    and (
      public.puede_gestionar_calendario()
      or (
        public.current_rol() = 'INSTRUCTOR'
        and instructor_id = public.current_instructor_id()
        and serie_id is null
        and precio_puntual is null
        and exists (
          select 1 from public.studios s
          where s.id = sesiones.studio_id and s.instructoras_crean_clases
        )
      )
    )
  );
