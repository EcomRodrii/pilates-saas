# Feature Freeze — fase Product-Market Fit (2026-07-23)

Se **congelan** cuatro módulos para centrar Tentare en el flujo principal de un
estudio de Pilates. **Congelar ≠ borrar**: código, páginas, hooks, APIs, tablas,
migraciones y datos siguen intactos. Solo se **desconectan del flujo principal**
para que el usuario no sepa que existen. Todo sigue compilando y los 690 tests
siguen en verde.

| Módulo | Rutas | Cómo queda |
|---|---|---|
| **Kiosko** | `/kiosk`, `/kiosk/[slug]` | **404** (rutas retiradas del router) |
| **POS / Caja** | `/pos` | **redirect → `/dashboard`** (stub de servidor) |
| **VOD / On Demand** | `/ondemand` + `/portal/[slug]/videos` | staff: redirect → `/dashboard`; portal socias: redirect → home |
| **Comunidad** | `/comunidad` | **redirect → `/dashboard`** (stub de servidor) |

Fuente única de verdad: [`lib/frozen-features.ts`](../lib/frozen-features.ts).
El freeze es **independiente de `MARKETING_MODULE_ENABLED`** a propósito.

---

## 1. Mecanismo

- **`lib/frozen-features.ts`** — `RUTAS_CONGELADAS` + `esRutaCongelada(path)` +
  `PORTAL_VIDEOS_CONGELADO`. Un solo interruptor gobierna menú, buscador y guardia
  de ruta.
- **`lib/permisos.ts`** — `puedeVer()` devuelve `false` para toda ruta congelada
  (cualquier rol). Eso las saca **a la vez** del menú lateral, la barra inferior,
  el cajón "Más", el editor de menú y el buscador ⌘K, y hace que el guardia del
  layout redirija a `/dashboard`.
- **`lib/nav-config.tsx`** — filtra los ítems congelados de `navSections` (y por
  tanto de `MODULOS` y del editor de menú), quitando las secciones vacías.
- **Rutas** — cada `page.tsx` congelada se sustituye por un stub de servidor
  (`redirect('/dashboard')`); la implementación original se conserva intacta al
  lado como `page.frozen.tsx` (Next no enruta ficheros que no se llamen `page`).
  En kiosko se retiran los ficheros de ruta → 404 real.

## 2. Archivos modificados

### Nuevos
- `lib/frozen-features.ts` — interruptor central del freeze.
- `docs/FEATURE-FREEZE-2026-07.md` — este documento.

### Núcleo del freeze
- `lib/permisos.ts` — guardia `esRutaCongelada` en `puedeVer`; se quitan
  `/ondemand` y `/comunidad` de la lista blanca de instructora.
- `lib/nav-config.tsx` — filtro de rutas congeladas sobre `navSections`; limpieza
  de 2 imports muertos (`FileText`, `ArrowLeftRight`).
- `lib/tareas.ts` — se retira la tarea `cobrar-caja` (⌘K → `/pos`).
- `lib/tareas.test.ts` — tests actualizados al nuevo comportamiento (POS congelado).
- `lib/feature-flags.ts` — solo comentario: VOD ya no depende de este flag.

### Rutas (stub + original preservado)
- `app/(dashboard)/pos/page.tsx` → stub · `…/pos/page.frozen.tsx` (original).
- `app/(dashboard)/comunidad/page.tsx` → stub · `…/comunidad/page.frozen.tsx`.
- `app/(dashboard)/ondemand/page.tsx` → stub · `…/ondemand/page.frozen.tsx`.
- `app/kiosk/page.tsx` → `app/kiosk/page.frozen.tsx` (sin stub → 404).
- `app/kiosk/[slug]/page.tsx` → `…/[slug]/page.frozen.tsx`.
- `app/kiosk/[slug]/layout.tsx` → `…/[slug]/layout.frozen.tsx`.

### Referencias visibles retiradas
- `app/(dashboard)/dashboard/page.tsx` — botón "Abrir caja" y acceso rápido
  "Punto de venta" (ambos → `/pos`) + import `ShoppingCart`.
- `app/(dashboard)/calendario/page.tsx` — enlace de pie "Ver en modo kiosk" +
  import `ArrowUpRight`.
- `app/(dashboard)/productos/page.tsx` — se oculta la pestaña "Productos POS"
  (la ruta y la pestaña core "Planes de suscripción" se mantienen).
- `components/decision/quick-actions.tsx` — acceso rápido "Nueva venta" → `/pos`.
- `components/configuracion/tab-estudio.tsx` — enlace "Modo quiosco" + `Monitor`.
- `components/configuracion/tab-integraciones.tsx` — tarjeta "Kiosko de check-in"
  y su lógica de generación de token (única llamada a `/api/kiosk/token`).
- `components/cobros/panel-movimientos.tsx` — se retira todo lo POS del panel de
  Movimientos de `/cobros` (KPI "Ventas POS", filtro POS, badge POS, fusión de
  `ventasPOS`, total POS, etiqueta de CSV, import `ShoppingCart`).
- `components/layout/help-widget.tsx` — mención a "vídeos on-demand" en un FAQ.

### VOD del portal de socias (desacoplado del flag de marketing)
- `components/portal/portal-shell.tsx` — nav "Vídeos" gobernada por `PORTAL_VIDEOS_CONGELADO`.
- `app/portal/[slug]/home/page.tsx` — acceso rápido "Vídeos" idem.
- `app/portal/[slug]/videos/page.tsx` — redirect al home idem.

## 3. Qué NO se tocó (decisiones)

- **`/productos`** — se **mantiene**: su pestaña "Planes de suscripción" es núcleo
  de facturación (alimenta MRR, renovaciones, socios, cobros). Solo se oculta la
  pestaña "Productos POS".
- **`/transacciones`** — se **mantiene**: es un redirect a `/cobros?tab=movimientos`
  y la URL de retorno de sesiones de pago de Stripe ya creadas.
- **APIs** — las 8 rutas exclusivas siguen vivas pero **sin ningún llamador de
  frontend**: `/api/kiosk/token`, `/api/terminal/*` (5), `/api/stripe/pos-bizum`,
  `/api/ondemand/upload-url`, `/api/comunidad/comentarios`. No se deshabilitan a
  nivel de servidor para no añadir fricción de reactivación.
- **Compartido, intacto**: `/api/stripe/webhook` (su rama de reconciliación POS
  queda dormida), `/api/public/checkin` (la rama de check-in de staff se usa desde
  calendario/dashboard; solo la rama de kiosko queda inalcanzable), `/api/public/studio-data`.
- **Base de datos** — nada borrado. `studio-context` sigue cargando `ventasPOS`,
  `videosOnDemand` y `postsComunidad` (datos dormidos, listos para reactivar).

## 4. Dependencias preservadas (para reactivar)

Todo esto sigue en el repo y hace posible reactivar con pocos cambios:

- **Wrappers de API** en `lib/api-client.ts`: `terminalCobrar`, `terminalEstadoCobro`,
  `terminalRegistrarLector`, `terminalEstadoLector`, `terminalReconciliacionesPendientes`,
  `terminalMarcarReconciliado`, `posBizumCheckout`, `pedirSubidaVideo`, `subirVideoAStream`.
- **Capa de datos** en `lib/supabase-data.ts`: `dbInsertVentaPOS`, `validarKioskToken`,
  `checkinPublico`, `dbSetTerminalReader`, `dbInsert/Update/DeleteVideoOnDemand`,
  `dbList/AddComentarioComunidad`, `dbInsert/Update/ToggleLikePost/DeletePostComunidad`,
  rpc `mis_likes_comunidad`.
- **Estado** en `lib/studio-context.tsx`: `ventasPOS`/`addVentaPOS`, `videosOnDemand`,
  `postsComunidad` (y sus setters), cargados en el bootstrap del estudio.
- **Helpers**: `lib/stream.ts`, `lib/stream-playback.ts` (Cloudflare Stream para VOD).
- **Tipos** en `lib/types.ts`: `VentaPOS`, `ItemVentaPOS`, `ProductoPOS`, `VideoOnDemand`,
  `PostComunidad`, etc.
- **Originales de página** en los `*.frozen.tsx` de cada ruta.
- **Tablas** (Supabase): `ventas_pos`, `reconciliaciones_pos`, `videos_on_demand`,
  `posts_comunidad`, `comentarios_comunidad`, columnas `studios.kiosk_token` /
  `stripe_terminal_reader_id` / `stripe_terminal_location_id`.

## 5. Cómo reactivar un módulo

1. Quitar su prefijo de `RUTAS_CONGELADAS` en `lib/frozen-features.ts`.
2. Restaurar la ruta: `page.frozen.tsx` → `page.tsx` (en kiosko también
   `layout.frozen.tsx` → `layout.tsx`), borrando el stub.
3. Volver a añadir su entrada de menú en `lib/nav-config.tsx` **no hace falta**:
   el ítem sigue definido y reaparece solo al salir de `RUTAS_CONGELADAS`. Para
   la instructora, re-añadir su ruta a `PERMITIDO_INSTRUCTOR` en `lib/permisos.ts`
   si se quiere que la vea.
4. Volver a enchufar las referencias visibles quitadas (marcadas con `CONGELADO`
   en cada archivo) si se desean.
5. Para el "Vídeos" del portal: `PORTAL_VIDEOS_CONGELADO = false`.
6. Para la pestaña "Productos POS": se desoculta sola al salir `/pos` de
   `RUTAS_CONGELADAS`.

## 6. Verificación

- `npx tsc --noEmit` → limpio.
- `npm test` → **690/690** en verde.
- `npx next build` → compila (falla solo en "collect page data" por falta de env
  de Supabase en el worktree, no por el código; con env de placeholder termina y
  el manifiesto de rutas confirma el freeze).
- En vivo: `/kiosk/tentare` → 404; `/pos`, `/comunidad`, `/ondemand` → redirigen
  sin pintar nunca la página congelada.
