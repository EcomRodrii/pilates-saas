-- Borrar un estudio fallaba con `review_boost_feedback_studio_id_fkey` (y, tras
-- ella, con `review_boost_recompensas_studio_id_fkey`): las dos FK a `studios`
-- se crearon sin `ON DELETE` (= NO ACTION) y las dos tablas no tienen ningún
-- otro padre que se lleve sus filas por cascada, así que bastaba UNA respuesta
-- del «review boost» para que `delete from studios` se rechazara con 23503.
--
-- Qué comportamiento es el correcto:
--   · NO `CASCADE`. Estas dos tablas no son datos operativos del estudio, son el
--     histórico de Tentare sobre su relación con él: la valoración de la
--     propietaria (rating + comentario) y el descuento que se le concedió. El
--     panel interno las agrega SIN filtrar por estudio (`/api/interno/crecimiento/
--     review-boost`: media de valoraciones, recompensas concedidas/canjeadas);
--     con cascada, borrar un estudio cambiaría esas cifras con efecto
--     retroactivo, y justo se perdería la valoración de quien se fue.
--   · NO dejarlo en `NO ACTION`: es el bug.
--   · `SET NULL`, el patrón que ya usa el repo para el histórico que debe
--     sobrevivir al estudio (`sales_leads`, `red_experiencias`,
--     `plataforma_lead`). La fila queda huérfana pero íntegra.
--
-- Lo que implica `studio_id` nullable:
--   · `unique (studio_id)` sigue valiendo: Postgres permite varios NULL, y para
--     un estudio vivo sigue habiendo como mucho una fila («no volver a pedirlo»
--     lo garantiza el esquema, no solo la UI).
--   · Las políticas de `review_boost_feedback` comparan con
--     `current_studio_id()`: `NULL = x` no es verdadero, así que una fila
--     huérfana no la ve ni la escribe nadie desde el navegador. La lee el
--     servidor (service-role), como el resto del panel interno.
--   · `review_boost_recompensas.feedback_id` apunta a la fila de feedback, que
--     ya no se borra, así que esa FK no bloquea nada.
--
-- Sin pérdida de datos: solo cambia una restricción y se relaja un NOT NULL.
--
-- REVERSIÓN (posible mientras no existan filas huérfanas; si las hay, hay que
-- decidir antes qué se hace con ellas, no se pueden devolver a NOT NULL):
--   alter table public.review_boost_recompensas drop constraint review_boost_recompensas_studio_id_fkey;
--   alter table public.review_boost_recompensas add constraint review_boost_recompensas_studio_id_fkey
--     foreign key (studio_id) references public.studios(id);
--   alter table public.review_boost_recompensas alter column studio_id set not null;
--   (y lo mismo con review_boost_feedback)

alter table public.review_boost_feedback alter column studio_id drop not null;
alter table public.review_boost_feedback drop constraint review_boost_feedback_studio_id_fkey;
alter table public.review_boost_feedback
  add constraint review_boost_feedback_studio_id_fkey
  foreign key (studio_id) references public.studios(id) on delete set null;

alter table public.review_boost_recompensas alter column studio_id drop not null;
alter table public.review_boost_recompensas drop constraint review_boost_recompensas_studio_id_fkey;
alter table public.review_boost_recompensas
  add constraint review_boost_recompensas_studio_id_fkey
  foreign key (studio_id) references public.studios(id) on delete set null;

comment on column public.review_boost_feedback.studio_id is
  'Estudio que dio la valoración. NULL = el estudio se borró: la valoración se conserva como histórico de Tentare.';
comment on column public.review_boost_recompensas.studio_id is
  'Estudio al que se concedió. NULL = el estudio se borró: la recompensa se conserva como histórico.';
