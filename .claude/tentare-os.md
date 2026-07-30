<!-- BEGIN:tentare-development-os -->
# Tentare Development OS

Este archivo convierte las convenciones reales de este repo en reglas siempre cargadas.
No son aspiraciones — son hechos verificados de este código a fecha 2026-07-28. Si algo
aquí deja de ser cierto, corrígelo en vez de dejarlo como ruido.

## Convenciones que hay que seguir sin preguntar

- **Nombres**: dominio de negocio en español (`socios`, `reservas`, `puedeVerFichaClinica`,
  `puedeMoverDinero`), scaffolding de código (sintaxis, keywords) en inglés. Tablas
  snake_case en español salvo `studios`/`spots`. Sigue este patrón mixto, no lo "arregles"
  traduciendo todo a un solo idioma.
- **Tests**: unitarios con `node --test --experimental-strip-types` sobre `lib/**/*.test.ts`
  (no Jest/Vitest). E2E con Playwright en `e2e/*.spec.ts`, mockeando red con `page.route`.
  Los imports relativos dentro de `lib/` necesitan la extensión `.ts` explícita
  (`tsconfig.json` tiene `allowImportingTsExtensions` justo para esto) — sin ella, pasa en
  local pero rompe en CI.
- **Commits**: Conventional Commits con scope en español que refleja el área de negocio
  (`fix(seguridad):`, `feat(alta):`, `chore(migraciones):`, `perf(panel):`...) y número de
  PR entre paréntesis cuando exista. El tono puede ser narrativo/autocrítico, no hace falta
  forzar un tono corporativo.
- **Migraciones**: numeradas correlativas en `supabase/migrations/`. Comprueba siempre el
  último número existente antes de crear una (`list_migrations` o `ls`) — este repo ha
  colisionado números más de una vez. Mergear un PR **no** aplica su migración: verifica que
  quedó aplicada de verdad, no solo mergeada en git.
- **Seguridad**: la RLS es la cerradura real, la UI nunca es el límite de seguridad — regla
  explícita y repetida en `lib/permisos-reglas.ts`. Cualquier permiso nuevo se implementa en
  ambos sitios o no está terminado.
- **Dinero**: cero escritura optimista sin comprobar el resultado real (`await` la
  confirmación, maneja el camino de fallo, sé idempotente ante webhooks repetidos). Es el
  patrón de bug más repetido en los flujos de Stripe/cobros de este repo.

## Decisiones de producto/arquitectura ya cerradas (no reabrir sin pedirlo expresamente)

- No trocear los "god files" (`lib/supabase-data.ts`, `studio-context.tsx`...) — propuesto y
  rechazado dos veces.
- Feature-freeze activo sobre Kiosko/POS/VOD/Comunidad (`lib/frozen-features.ts`).
- `suscripciones` con RLS abierta a todo el personal es decisión de producto deliberada, no
  agujero pendiente. `sesiones`/`reservas` **YA NO** son "sin cerrar del todo" — probando en
  persona la cuenta de una instructora se vio que podía crear/editar/cancelar CUALQUIER clase
  y añadir clientas a cualquier reserva (migr `20260730109000`/`20260730110000`): INSTRUCTOR
  ahora solo puede UPDATE en sus propias clases (sin INSERT/DELETE); PROPIETARIO/MANAGER/
  RECEPCION mantienen control total, sin cambios.
- El menú de una cadena es por cadena, no por sede (migración 0103) — no reintroducir el
  toggle antiguo.

## Arquitectura de marca: Tentare Manager / Tentare Core

Tentare se percibe como dos productos, no un panel único con roles:
- **Tentare Manager** → propietaria, gerencia (`MANAGER`), recepción (`RECEPCION`).
- **Tentare Core** → instructoras (`INSTRUCTOR`).

Esto es un **rebranding sobre una sola app role-gateada** (`app/(dashboard)/` +
`lib/permisos-reglas.ts`), NO un split estructural — no hay `app/manager/` ni
`app/core/`, y no se debe "terminar" ese split por iniciativa propia sin que se pida
expresamente. Fuente de verdad del nombre por rol: `nombreAppPorRol()` en
`lib/permisos-reglas.ts`. Los emails al equipo del estudio usan
`remitentePorMarca()` (`lib/emails/remitente.ts`) para que el nombre de producto se
vea también en el remitente aunque `RESEND_FROM` esté configurado.

Queda fuera a propósito (no tocar sin pedirlo): `/login` y `app/manifest.ts` (el rol
solo se conoce tras autenticar, así que se quedan con la marca paraguas "Tentare");
`components/landing/*` (copy nuevo, no un renombrado); `app/interno` ("Tentare
Internal", backoffice de Tentare-empresa, no relacionado); `app/portal/[slug]`
(marca blanca por estudio, tercer contexto de marca ya separado); los emails a
socias/clientas (sin marca de producto interno, solo la marca del estudio); el logo
colapsado del sidebar (el icono "T" es el mismo en las tres marcas, sin texto que
distinguir) y el de `/login` (aunque ya existen `logo-stacked-core.png`/
`-manager.png` con export real de diseño, `/login` sigue sin poder usarlos porque el
rol no se conoce antes de autenticar — no es un hueco de asset, es la misma
limitación de siempre).

## Loop de calidad — conecta con las skills que ya existen, no las reinventes

Para trabajo no trivial (nueva funcionalidad, cambio de esquema, refactor con impacto),
sigue este orden y usa lo que ya está instalado en vez de rehacerlo:

1. **Analizar y diseñar** → agente `tentare-arquitecto` (o `graphify` para ver el grafo real
   de dependencias antes de tocar algo con muchas conexiones).
2. **Programar** siguiendo los patrones ya existentes (Contexts de React, RPC transaccional,
   convenciones de arriba).
3. **Refactorizar** → agente `tentare-refactor` (con el veto de god-files/frozen-features).
4. **Rendimiento** → agente `tentare-performance`, o skill `/code-review` con foco
   `efficiency` para una pasada general.
5. **Seguridad** → agente `tentare-seguridad` para el patrón "rol no comprobado en
   servidor"/RLS, o skill `/security-review` para un barrido completo.
6. **UX** → agente `tentare-ux`, verificado en navegador real (no solo leyendo el JSX).
7. **Pruebas** → agente `tentare-qa` (casos normales/límite/error/permisos/móvil-escritorio),
   o skill `/verify` para el flujo de verificación end-to-end estándar.
8. **Producto** → agente `tentare-producto` cuando la funcionalidad sea nueva y de peso, no
   para cambios menores.
9. **Documentar** solo lo que no sea obvio del código (decisión, no explicación); actualizar
   memoria de sesión si el hallazgo es una decisión o hecho de proyecto duradero.
10. **No romper nada** → antes de cerrar, repasa que el cambio no reabra ninguna de las
    decisiones ya cerradas de la sección anterior.

Dinero y Supabase específicos: usa siempre `tentare-stripe`/`tentare-supabase` para esas
áreas en vez de improvisar — ya conocen los flujos reales (Connect direct-charge, cron de
renovación, roles y RLS) y los errores ya cometidos antes en este repo.

## Qué se descartó deliberadamente de ECC (github.com/affaan-m/ECC) y por qué

ECC es un plugin de marketplace multi-lenguaje (Go/Java/Perl incluido) y multi-harness
(Claude Code, Codex, Cursor, Gemini, Zed, Copilot...) con 67 agentes, 281 skills y 94
comandos legacy pensado para instalarse tal cual en cualquier proyecto. Para Tentare
(un único stack, un único harness, un único dominio) eso es bulto genérico, no valor:

- **No se instaló el plugin** (`/plugin install ecc@ecc`) — habría traído 67 agentes y 281
  skills que en su inmensa mayoría no aplican a este stack.
- **No se trajo AgentShield** (escáner de seguridad genérico de ECC) — el skill
  `/security-review` ya instalado cubre ese hueco sin duplicar herramienta.
- **No se trajeron los 94 comandos legacy ni soporte multi-lenguaje/multi-harness** — este
  repo es Next.js/TypeScript exclusivamente sobre Claude Code.
- **No se añadieron hooks de enforcement** (bloquear commits sin test, etc.) — quedó fuera
  de este cambio por fricción/riesgo; si se quiere en el futuro, es una decisión aparte a
  confirmar explícitamente, no algo que se activó por defecto aquí.

Lo que sí se tomó de la idea de ECC: agentes especializados con propósito muy concreto,
reglas siempre cargadas, y un loop de calidad disciplinado — construido nativamente con lo
que Claude Code ya soporta en este proyecto, sin dependencias externas nuevas.
<!-- END:tentare-development-os -->
