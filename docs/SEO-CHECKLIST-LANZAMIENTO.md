# Checklist final SEO/contenido antes de abrir Tentare al público

Fecha: 2026-08-13. Alcance: **solo SEO y contenido** — no cubre modo Stripe
(live vs test), revisión legal por abogado, ni auditoría de seguridad. Esos
tres son checklists aparte, con sus propios dueños (`tentare-stripe`,
asesoría legal, `tentare-seguridad`).

Contexto que hay que tener presente al leer esto: **Tentare todavía no está
abierto al público** — `/crear-estudio` hoy solo recoge email de interés
(`app/crear-estudio/page.tsx`, vía `/api/public/interes-lanzamiento`), no
crea cuentas reales. Todo lo de abajo prepara el terreno de contenido para
cuando SÍ se abra; ninguna de estas acciones lo abre por sí sola.

Todo lo publicado esta sesión está en `main` vía [PR #1016](https://github.com/EcomRodrii/pilates-saas/pull/1016) — dos commits, working tree limpio, nada pendiente de subir.

---

## ✅ Hecho y verificado (no requiere acción)

- [x] Auditoría completa: `SEO-URL-INVENTORY.md`, `SEO-KEYWORD-URL-MAP.md`, `SEO-COMPETITOR-ANALYSIS.md`, `SEO-AI-SEARCH-QUERIES.md`, `SEO-AI-MASTERPLAN.md`.
- [x] Las 7 páginas `/comparativa/tentare-vs-*` ampliadas: veredicto + interlinking real.
- [x] Hub `/comparativa` compara contra los 7 competidores (antes solo 3).
- [x] Guía Veri\*factu refrescada, fechas de mandato reverificadas (sin cambios), enlace a `/funcionalidades/facturacion` cerrado.
- [x] Glosario ampliado de 9 a 23 términos.
- [x] Metadata sincronizada en las 13 páginas que divergían del registro (home, 7 comparativas, seguridad, 4 legales) — de paso, las 4 legales ganaron `canonical`/`openGraph` que no tenían.
- [x] Footer: 5 de 8 usos de `SiteFooter` no enlazaban a `/funcionalidades` ni `/precios` — corregido en los 5.
- [x] `/soluciones/cambiar-de-software` publicada, con interfaz nueva para el endpoint `/api/public/migracion-concierge` que antes no tenía ninguna.
- [x] `tsc --noEmit`, `eslint` y los 15 tests de `lib/seo/paginas.test.ts` en verde en cada commit.

## ⬜ Listo para ejecutar, pero requiere una acción tuya (no puedo hacerlo yo)

- [ ] **Crear los perfiles de empresa en G2 y Capterra.** Todo el texto está listo para copiar/pegar en [`docs/SEO-G2-CAPTERRA-PERFIL.md`](SEO-G2-CAPTERRA-PERFIL.md) — proceso, tagline, descripción, checklist de funcionalidades, tabla de precios. Falta: crear la cuenta (requiere email corporativo), decidir si publicas como autónomo o esperas a una S.L. (marcado ahí como `⚠️ TU DATO`), y capturas de pantalla reales (mínimo 3-5 en Capterra) — sin credenciales de sesión de prueba en este entorno no las puedo generar.
- [ ] **Conectar Google Search Console.** Sin esto, todo lo que este trabajo asume sobre indexación real (`site:tentare.app`, posiciones, qué ve Google de verdad) sigue siendo UNKNOWN — las herramientas de esta sesión no pueden verificarlo. Es gratis y son 5 minutos: verificar la propiedad `www.tentare.app`, enviar `https://www.tentare.app/sitemap.xml`.
- [ ] **Verificar el `<head>` real de la home con las herramientas de Search Console o `curl -s https://www.tentare.app/ | grep -A2 'og:description'`.** La herramienta de fetch de esta sesión convierte HTML a markdown y puede perder `<meta>`/`<script type="application/ld+json">` sin que eso signifique que faltan — quedó marcado UNKNOWN en `SEO-URL-INVENTORY.md §5` y sigue sin cerrar.
- [ ] **`/sobre-tentare`**: bloqueada esperando que me pases quién eres, por qué construiste Tentare y qué quieres mostrar — ver mi pregunta de antes. Sin esto no se construye (evita fabricar una narrativa de fundador).

## 🔒 Deliberadamente fuera de esta fase (no son huecos, son decisiones)

- Árbol en inglés — el ICP actual (EUR, Veri\*Factu, SEPA, soporte en español) no lo justifica; revisar solo si cambia el plan de expansión.
- Páginas programáticas / por ciudad — evaluado y descartado como doorway.
- Contenido original con voz real de propietarias — la fuente que existía (49 llamadas) se descartó por grabarse sin permiso; retomar esto requeriría una investigación nueva con consentimiento, fuera de alcance.
- Pedir reseñas reales a clientas — secuenciado a propósito DESPUÉS de que existan los perfiles de G2/Capterra, no antes.

## Antes de decir "el contenido está listo para lanzar"

1. Los 4 primeros ítems de la sección "requiere una acción tuya" son el
   verdadero cuello de botella — sin Search Console conectado, cualquier
   afirmación sobre "cómo está posicionando Tentare" seguirá siendo una
   suposición, no un dato.
2. Ninguno de los pendientes de arriba bloquea técnicamente abrir
   `/crear-estudio` al público — son mejoras de visibilidad/confianza, no
   requisitos funcionales. La decisión de cuándo abrir es tuya y depende de
   los otros dos checklists (Stripe, legal) que quedan fuera de este documento.
3. Recomendado, no urgente: una pasada visual real en navegador de las 7
   comparativas y el footer antes de dar esto por cerrado del todo — no se
   ha podido verificar visualmente en ningún punto de esta sesión (el dev
   server del worktree no arranca por falta de env de Supabase, limitación
   documentada, no nueva).
