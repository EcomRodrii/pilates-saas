# Auditoría 47ª pasada — Módulo de Contenido (redes sociales)

Fecha: 2026-09-10
Alcance pedido: panel de creación de contenido, calendario editorial,
biblioteca de medios y métricas — autorización server-side, RLS,
subida de medios, credenciales de redes sociales, publicación
programada, posible solape con Community OS.

## Resumen ejecutivo

**No hay superficie de ataque que auditar, porque no hay servidor.** El
"Módulo de Contenido" (`app/(dashboard)/contenido/**`, `lib/contenido/**`)
es una maqueta funcional 100% cliente: todo el estado (publicaciones, ideas,
métricas, "actividad") vive en `localStorage` del navegador
(`STORAGE_KEY = 'contenido-store-v1'`, `lib/contenido/store.tsx`), sembrado
con datos deterministas de demo (`lib/contenido/seed.ts`). No existe:

- Ninguna tabla en `supabase/migrations/` para posts/calendario
  editorial/biblioteca de medios de este módulo (el único acierto textual,
  `contenido_portal`, es un sistema DISTINTO — banners del portal blanco de
  socias, no tiene relación).
- Ninguna ruta `app/api/**` para este módulo. `grep -r` sobre
  `app/(dashboard)/contenido` y `lib/contenido` no encuentra ni un `fetch(`,
  `/api/`, `supabase`, ni `upload`.
- Ninguna llamada a Instagram/Facebook/TikTok/YouTube. Las "métricas" de
  `lib/contenido/analytics.ts` son una función pura, determinista, con
  seguidores base y crecimiento diario hardcodeados por plataforma — no hay
  ni un token OAuth, ni una clave de API, ni un `fetch` externo en todo el
  árbol (`grep -in "key\|token\|secret\|api"` sobre `lib/contenido/*.ts`
  solo encuentra el nombre `STORAGE_KEY`).
- Ninguna subida de fichero real: no hay `<input type="file">` conectado a
  Storage, ni endpoint de subida, ni bucket dedicado. "Biblioteca" es una
  lista/grid sobre las mismas `Publicacion[]` de localStorage, sin adjuntos.
- Ningún cron/Inngest de publicación programada. `estado: 'programada'` es
  solo un campo de UI: nada la promueve automáticamente a `'publicada'`
  salvo que la propia usuaria edite el registro a mano en el diálogo.

Además, el módulo entero está **apagado** por
`MARKETING_MODULE_ENABLED = false` (`lib/feature-flags.ts:25`), y
`app/(dashboard)/contenido/layout.tsx` corta el árbol de React antes de
montar cualquier `page.tsx` hijo cuando el flag es `false` (el `if
(!MARKETING_MODULE_ENABLED) return null;` se ejecuta en el render, no en un
efecto — los hijos ni siquiera se montan, así que no hay ni una ventana de
parpadeo). Confirmado que esta feature NO está gestionada por
`lib/frozen-features.ts` (Kiosko/POS/VOD/Comunidad): es un interruptor
distinto y más simple, específico de "Marketing" en sentido amplio.

**Conclusión: sin hallazgos de seguridad.** No hay rol que comprobar en el
servidor porque no hay servidor; no hay RLS que auditar porque no hay
tabla; no hay credenciales que proteger porque no hay integración real; no
hay cross-tenant porque no hay concepto de `studio_id` en el código — todo
vive en un `localStorage` sin espacio de nombres por estudio.

## Qué se buscó (para que quede constancia de la exhaustividad)

- `grep -ril "contenido"` sobre `app/` y `lib/` completos.
- `find` de directorios `*contenido*`, `*editorial*`, `*biblioteca*` en
  `app/` y `lib/`.
- `grep -rlE "contenido|editorial|biblioteca"` sobre `supabase/migrations/`
  → sin resultado relevante (solo `contenido_portal`, sistema de banners
  del portal, no relacionado).
- Búsqueda de rutas API bajo `app/api` con nombre "contenido" → ninguna.
- Lectura completa de `lib/contenido/store.tsx`, `analytics.ts`,
  `read-publicaciones.ts`, `layout.tsx`, y cabecera de
  `biblioteca/page.tsx` y `publicacion-dialog.tsx`.
- `get_advisors` de Supabase no se ejecutó porque no hay ninguna tabla
  nueva que revisar en este módulo (ninguna migración lo crea); ejecutar el
  escáner de RLS sobre el catálogo completo ya está cubierto por auditorías
  previas (pasadas 22ª–46ª) y no aporta nada específico de "Contenido".

## Un matiz de producto, no de seguridad (🟡 informativo, no bloqueante)

`lib/contenido/store.tsx` usa una clave fija `'contenido-store-v1'` en
`localStorage`, sin `studio_id`. Un mismo navegador que participa en varias
sedes (rol multi-estudio, ver `mis_estudios()`/`P2-14`) vería el MISMO
calendario de contenido "demo" al cambiar de sede activa — porque no hay
ningún dato real detrás, esto es una inconsistencia cosmética de una
maqueta, no una fuga de datos: no hay clientas, fichas de salud, ni
información de negocio real en esas publicaciones. Si algún día este
módulo pasa a tener backend real, esa clave debe llevar el `studio_id`
(o mejor: dejar de usar `localStorage` y migrar a tablas con RLS por
`studio_id`, siguiendo el patrón del resto del repo). No se propone fix
ahora porque el módulo está desconectado y sin servidor: arreglarlo hoy
sería construir seguridad para una feature que todavía no existe.

## Comparación con Community OS / Notification Engine (punto 7 del encargo)

No hay solape de código ni de tablas. Community/Messaging OS (auditado en
la 41ª pasada) tiene tablas reales (`mensajes_equipo`/conversaciones),
Realtime y RLS propia; el Módulo de Contenido no comparte ni un import, ni
un tipo, ni una tabla con él. La única conexión real en el repo es
cosmética: `app/(dashboard)/marketing/page.tsx` importa
`leerPublicacionesContenido()` (`lib/contenido/read-publicaciones.ts`) para
mostrar, como conveniencia de UI, los títulos de las publicaciones-demo de
localStorage al armar una campaña de marketing real — no escribe nada, no
cruza `studio_id`, y no puede filtrar datos de otro estudio porque solo lee
el localStorage del propio navegador. Sin impacto de seguridad.

## Siguiente paso recomendado (no para esta pasada)

Si el fundador decide construir el backend real de este módulo (persistir
en Supabase, subir medios de verdad, conectar APIs de redes sociales), la
siguiente pasada de seguridad debe repetirse desde cero sobre ese código
nuevo — nada de lo revisado aquí sirve de base porque no existe todavía.
En ese momento, aplicar el patrón ya establecido en el repo: tabla con
`studio_id` + RLS acotada, guard de rol en la API route (no en la RPC, si
la hay), credenciales de terceros en tabla server-only nunca expuesta al
cliente (mismo criterio que `stripe_customer_id`/tokens de WhatsApp Meta
por estudio), y jamás fiarse de que el flag `MARKETING_MODULE_ENABLED` sea
la única puerta — un flag de cliente no es un control de seguridad.
