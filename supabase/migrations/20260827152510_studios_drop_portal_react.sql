-- El sistema de temas del kit se retiró por completo (PR 1-3): `esTemaPortal()`
-- devuelve siempre `false`, así que nada en el código vuelve a leer esta
-- columna para decidir qué portal montar. Verificado con grep en todo el
-- repo antes de esta migración: portalReact/portal_react ya no aparece en
-- ninguna condición, solo en la fontanería (Studio type, contexts) que
-- también se retira en el mismo commit.
ALTER TABLE public.studios DROP COLUMN IF EXISTS portal_react;
