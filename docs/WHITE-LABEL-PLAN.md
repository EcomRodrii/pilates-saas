# White-label / Theming multi-tenant — Plan de implementación

> Objetivo: cada `studio_id` personaliza completamente la apariencia de su
> instancia (panel de gestión + portal de socias + página pública de reservas)
> **sin tocar código ni desplegar por cliente**. Solo configuración.

## Decisiones fijadas (2026-07-14)

- **Alcance v1 = Fases 0–3** (marca completa: colores arbitrarios, tipografía,
  radius, favicon, logo, preview en vivo, borrador/publicar). El drag&drop del
  dashboard (Fase 4) va en una **v2 separada**.
- **Marca del panel de gestión = marca del estudio** (server-backed, por-tenant).
  Cada usuario del equipo conserva solo su preferencia **claro/oscuro** en
  localStorage. Se migra `lib/panel-theme.tsx` de preset-en-localStorage a leer
  la marca del estudio desde la DB.

## Arquitectura (por qué CSS variables)

- **CSS variables inyectadas server-side por `studio_id`.** Es ya el patrón del
  repo: Tailwind v4 `@theme inline` mapea utilidades a `--brand*` / `--portal-brand*`
  (222 usos). Tema arbitrario = sobreescribir los valores crudos. **Cero
  recompilación**, una sola build para N clientes.
- Descartado **CSS-in-JS** (runtime, fricción RSC, sistema paralelo a Tailwind).
- Descartado **Tailwind config dinámico por cliente** (build-time → build por
  tenant → no escala; además aquí no hay `tailwind.config.js`, es v4 CSS-first).
- **Inyección server-side** en el layout `[slug]` (patrón `getStudioSeo` + React
  `cache` ya existe) y en el layout del dashboard desde la sesión → **sin FOUC**.
- **Draft/publish**: tabla `studio_theme` con `config_draft` y `config_published`.
  Runtime lee `published`; editor y preview leen `draft`. Publicar = copiar
  draft→published + invalidar cache.
- **Caché**: `unstable_cache` de Next con tag `theme:${studioId}`, invalidado al
  publicar. **Sin Redis** (prematuro a esta escala).
- **Tipografía curada**: set fijo vía `next/font` (build-time, no fuentes libres),
  se conmuta por CSS var `--font-heading`/`--font-sans` según `font_id`.
- **Validación**: `zod` (ya dep directa) valida todo write server-side; contraste
  WCAG AA en cliente (feedback en vivo) y re-verificado en servidor al publicar
  (gate), vía `lib/wcag-contrast.ts`.
- **Guardrails**: allowlist de core-UX NO personalizable (reservas, pagos, textos
  legales, Verifactu/SEPA); el servidor rechaza cualquier intento de tocarlos.

## Lo que YA existe (base sobre la que construir)

| Pieza | Estado | Dónde |
|---|---|---|
| Indirección CSS variables | ✅ | `app/globals.css` `@theme inline` |
| Theming portal por estudio | ✅ (limitado a 6 presets) | `lib/portal-theme.tsx` → `components/portal/portal-shell.tsx` |
| Theming panel | ⚠️ por-usuario localStorage | `lib/panel-theme.tsx` |
| Presets color | ✅ 6 fijos | `lib/theme-presets.ts` |
| Logo del estudio | ✅ subida + display en reservas | `lib/portal-storage.ts` (`subirLogoEstudio`), `studios.logo_url` |
| IVA por estudio | ✅ | `studios.iva_por_defecto` |
| Multi-tenant + RLS | ✅ | `0000_base.sql`, `current_studio_id()`, `lib/auth-server.ts` |
| Columnas públicas `anon` | ✅ patrón | `0006_studios_columnas_publicas.sql` |

## Gaps que cubre este plan

Colores arbitrarios (más allá de 6 presets), tipografía seleccionable, border-radius,
favicon, draft/publish, preview en vivo, validación contraste WCAG, validación
server-side de tema, y migrar `reservar/[slug]` fuera de colores hardcodeados
(`PRIMARY = '#1A1A1A'`). (Drag&drop dashboard + `layout_config` → v2.)

## Fases

### Fase 0 — Sincronizar y cimientos ✅ COMPLETADA (2026-07-14)
- [x] Rebase del worktree sobre `origin/main` (trae migr. 0014–0018: logo_url, IVA,
      campos personalizados, plantillas; evita colisión 0014). Ahora en `#53`.
- [x] `zod@^4.4.3` como dependencia directa.
- [x] `lib/wcag-contrast.ts` + `lib/wcag-contrast.test.ts` (13 tests verdes).
- [x] Typecheck (`tsc --noEmit`) + lint verdes.

### Fase 1 — Motor de tema + modelo de datos ✅ BACKBONE COMPLETO (2026-07-14)
- [x] Migración `0019_studio_theme.sql`: tabla dedicada (PK `studio_id`),
      `config_draft` + `config_published` jsonb, `actualizado_en`, `publicado_en`,
      FK ON DELETE CASCADE. RLS: lectura para staff del estudio, escritura solo
      PROPIETARIO. Sin grant `anon` (lecturas públicas vía service-role, patrón
      `plantillas_email`/`studio-seo`).
- [x] `lib/theme-schema.ts` — zod: 5 colores hex + `fontId` (set curado FUENTES)
      + `radius` (sharp/rounded/pill) + `faviconUrl`. `resolveTheme()` = fallback
      robusto POR TOKEN. `DEFAULT_THEME`. (Logo sigue en `studios.logo_url`.)
- [x] `lib/theme-runtime.ts` — `themeToCssVars()` (inline style) + `themeToCssText()`
      (para <style> server-side, Fase 2) + `foregroundParaFondo()` (deriva texto de
      marca por contraste) + `validarContrasteTheme()` (gate WCAG AA).
- [x] `lib/theme-data.ts` — `getThemePublicado`/`getThemeBorrador` (service-role +
      React `cache()`, patrón `studio-seo`), `guardarBorradorTheme`, `publicarTheme`.
- [x] Tests: `theme-schema.test.ts` + `theme-runtime.test.ts` (19 nuevos; suite 348 verde).
- Decisiones tomadas: NO se extiende `Studio`/`db-types` (el tema vive en su
  tabla, se lee aparte). NO grant `anon` (service-role). Caché persistente
  cross-request (unstable_cache / Cache Components de Next 16) = optimización
  DIFERIDA, no se mete un paradigma de caché nuevo.
- Pendiente de Fase 2: **wiring** (nada se renderiza aún) — inyectar `themeToCssText`
  en layouts `[slug]` + dashboard, migrar `reservar/[slug]`, migrar `panel-theme`.
  Verificar en Fase 2 que el bundler de Next resuelve el import `.ts` de theme-runtime.

### Fase 2 — Aplicación en runtime
**2a ✅ COMPLETA (2026-07-14) — superficies públicas:**
- [x] `components/theme-style.tsx`: server component que inyecta `themeToCssText`
      en `:root` desde `getThemePublicado` (sin FOUC), reusando `getStudioSeo`.
- [x] Wired en `app/portal/[slug]/layout.tsx` y `app/reservar/[slug]/layout.tsx`.
- [x] Puente de retrocompat `presetAThemeConfig`: si el estudio no tiene fila en
      `studio_theme`, el tema se deriva de su `studios.tema_portal` (preset viejo)
      → ningún estudio existente pierde su color al activarse el white-label.
- [x] `components/portal/portal-shell.tsx`: quitado el `portalThemeStyle` inline
      (redundante; `:root` es ahora autoritativo).
- [x] `app/reservar/[slug]/page.tsx`: `PRIMARY` → `var(--portal-brand)` y texto
      sobre marca → `var(--portal-brand-foreground)` (autoderivado por contraste,
      legible también con marcas claras).
- [x] Verificado: suite 350 verde, typecheck OK; dev server compila `reservar`
      (200, Turbopack resuelve los imports `.ts` en el bundle — riesgo despejado).
- Pendiente: verificación VISUAL con tema custom real necesita DB con migr. 0019
      aplicada + un estudio con tema → ver 2b. (No hay creds Supabase en disco;
      solo en Vercel.)

**2b ✅ CÓDIGO COMPLETO (2026-07-14) — panel + favicon:**
- [x] `app/api/theme/route.ts` (GET): tema publicado del estudio del staff
      autenticado (`verificarSesionStaff` → `getThemePublicado`). Fase 3 añadirá
      PUT/POST (borrador/publicar).
- [x] `lib/panel-theme.tsx`: la MARCA del panel ahora viene del estudio (fetch a
      `/api/theme`, aplica `--brand*` con foreground por contraste); el modo
      claro/oscuro sigue por-usuario (localStorage). Eliminado el preset personal.
- [x] `components/layout/appearance-panel.tsx`: quitado el selector de preset
      personal ("Tu panel" ahora solo el toggle claro/oscuro). La sección owner
      "Tema de la app de socias" (temaPortal) se mantiene hasta el editor (Fase 3).
- [x] Favicon dinámico en `app/reservar/[slug]/layout.tsx` (metadata `icons` desde
      `theme.faviconUrl`; sin efecto hasta que la Fase 3 permita subirlo).
- [x] Verificado: suite 350 verde, typecheck + lint OK.
- Deferido a Fase 3: favicon/themeColor del portal (requiere convertir su
  `metadata` estático a `generateMetadata`); se hará junto al upload de favicon.

**Verificación VISUAL end-to-end (toda la Fase 2): PENDIENTE de DB.**
- Docker NO instalado → `supabase start` local no viable sin instalar runtime.
- No hay creds Supabase en disco (solo Vercel).
- Cuando haya DB: aplicar `0019_studio_theme.sql` (local `supabase start`, o prod
  `db push` por el flujo habitual) y comprobar en el navegador un tema custom en
  portal/reservas + la marca del estudio en el panel.

### Fase 3 — Editor white-label + preview en vivo ✅ CÓDIGO COMPLETO (2026-07-14)
- [x] API: `app/api/theme/route.ts` (GET publicado/`?draft`, PUT guardar borrador
      owner) + `app/api/theme/publish/route.ts` (POST publicar, gate WCAG server).
      Helpers cliente en `lib/api-client.ts` (fetch/guardar/publicar).
- [x] `components/theme/theme-preview.tsx`: preview EN VIVO (UI representativa del
      portal con `themeToCssVars`, se actualiza al instante — sin iframe).
- [x] `components/theme/theme-editor.tsx`: split-screen (controles | preview).
      Color pickers (nativo + hex) con aviso de contraste WCAG en vivo; selector
      de fuente; segmented de radius; upload logo+favicon con validación
      tamaño/formato; "Restaurar"; **Guardar borrador vs Publicar** (publicar
      deshabilitado si el contraste no cumple).
- [x] `lib/portal-storage.ts`: `subirFaviconEstudio`/`eliminar` + `validarImagenMarca`
      (tamaño/formato) aplicado también al logo (antes sin validación).
- [x] Página `app/(dashboard)/configuracion/apariencia/page.tsx` (owner-gated por
      el layout). Enlace desde `appearance-panel.tsx` (que ya solo tiene el toggle
      dark + link al editor; preset personal eliminado).
- [x] Verificado: typecheck + lint + suite 350 verde; boundaries client/server OK.
- ⚠️ Runtime/visual NO verificado: sin creds DB en disco + inestabilidad de
      Turbopack dev en `/` (bug RSC-manifest, ajeno al theming, por doble lockfile
      workspace-root). Verificar vía build de Vercel (PR preview) o local con DB.
- Deferido: favicon/themeColor del portal (convertir su metadata a
  generateMetadata) — Fase 3.1 menor.

### Fase 4 — Menú configurable por estudio ✅ CÓDIGO COMPLETO (2026-07-14)
- [x] Migración `0020_studio_layout.sql` (tabla studio_layout, config jsonb, RLS
      lectura staff + escritura PROPIETARIO) — APLICADA a prod.
- [x] `lib/layout-schema.ts` (orden/ocultos/menuPosition + `resolveLayout` +
      `aplicarLayout`) + tests. `lib/layout-data.ts` + `app/api/layout` (GET/PUT).
- [x] `lib/nav-config.tsx`: config de navegación extraída a fuente única
      (navSections + MODULOS + NO_OCULTABLES); sidebar la importa.
- [x] Sidebar aplica orden + ocultos del estudio (lista plana ordenada si hay
      personalización; agrupada por defecto). Módulos críticos no ocultables.
- [x] `components/theme/menu-editor.tsx`: drag & drop (dnd-kit) para reordenar +
      toggles de visibilidad + selector de posición; en Configuración → Apariencia.
- [x] **Posición del menú lateral/superior**: `DesktopTopNav` (barra horizontal)
      en el sidebar tras el flag `menuPosition`; var `--topnav-h` + `--sidebar-w:0`
      en superior; layout aplica `lg:pt-[var(--topnav-h)]`. Lateral intacto.
      (Móvil siempre barra inferior.) A verificar visualmente en preview.
- [x] Verificado: typecheck + lint + suite 367 verde.
- Follow-up: reordenar SECCIONES del dashboard home (monolito de 990 líneas).

### Mejoras post-v1 (2026-07-14)
- Editor de color rico (paletas + derivar armónico), commit 25078a2.
- **Preview en vivo REAL**: iframe de `/reservar/{slug}` con el tema BORRADOR por
  `postMessage` → `ThemePreviewListener` (montado en el layout de reservas,
  whitelist de vars, solo mismo-origen dentro de iframe). Sustituye la maqueta.
- **Optimización técnica — aplicar sin recargar**: eventos `tentare-layout-changed`
  (sidebar recarga menú) y `tentare-theme-changed` (panel recarga marca al publicar).
- **Reordenar/ocultar secciones de la HOME del dashboard**: `lib/home-sections.ts`
  (8 secciones), refactor de `dashboard/page.tsx` a `flex flex-col` con CSS `order`
  por sección (Header fijo `order:-1`; sin mover el DOM, default idéntico).
  `studio_layout.config.home` (jsonb, sin migración) con API **merge** (menú y home
  no se pisan). Editor `home-editor.tsx` (dnd-kit) en Configuración → Apariencia.

## Notas de proceso

- **Antes de escribir código con APIs de Next**: leer la guía en
  `node_modules/next/dist/docs/` (AGENTS.md — esta versión tiene breaking changes).
- Flujo de migraciones: `NNNN_snake_case.sql`, verificar esquema prod con
  `supabase db query --linked` antes de mergear (la colisión 0014 ya rompió
  facturación una vez → fix en 0017).
