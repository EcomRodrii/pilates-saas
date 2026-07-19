# Auditoría Tentare — 2026-07-15

Auditoría automática (solo lectura). Recorrido completo de `lib/`, `app/`, `components/`, `supabase/` + checks automáticos (tsc, tests). **No se ha modificado ningún archivo**: el árbol de trabajo tiene un refactor en curso a medias (cambios staged en `lib/studio-context.tsx` y `lib/supabase-data.ts`, más `estabilizacion-reservas-bono.patch` sin aplicar) y el proyecto está desplegado en producción. Aplicar refactors sin revisar durante una ejecución desatendida sobre código que mueve dinero rompería el principio de *calidad sobre velocidad*. Este informe deja el backlog priorizado y verificado para que apliques los cambios con revisión.

## Resumen de checks automáticos

- **Tests unitarios:** 309/310 en verde. El único fallo (`lib/decision/redaccion.test.ts`) es un artefacto del entorno de sandbox (resolución `@anthropic-ai/sdk/index.mjs` vs `.js`), no un bug de código.
- **TypeScript (`tsc --noEmit`, strict):** ~142 parámetros con `any` implícito y errores reales no ambientales que conviene verificar en build limpio: `err is of type 'unknown'` en `app/api/terminal/{cobrar,estado,lector}/route.ts` y `lib/stripe-cobros.ts:114`; y `Property 'titulo'/'motivo' does not exist on type '{}'` en `lib/inngest/decision.ts:134`. (El resto de errores de `tsc` son ruido del sandbox: `node_modules` incompleto → módulos `next/*` y `lucide-react` sin tipos.)

---

## 🔴 Crítico — resolver primero

**C1 · Colisión de números de migración salta el RLS de datos de salud (GDPR Art. 9).** `supabase/migrations/0014_rls_ficha_clinica_salud.sql` colisiona con `0014_marca_e_iva.sql` (y `0004_ficha_clinica.sql` con `0004_revoke_anon_rpc.sql`). Supabase indexa las migraciones aplicadas por el token numérico inicial (`0014`), así que en un `db push` limpio solo se registra/aplica el primero por número y el segundo se trata como "ya aplicado" y se omite. El archivo que se salta es justo el que activa RLS en `condiciones_salud`/`respuestas_sesion` (lesiones, embarazo/postparto — categoría especial) y el que cierra las RPC `SECURITY DEFINER` expuestas a `anon`. *Fix:* renumerar a versiones únicas y secuenciales (`0020_`, `0022_`…) y verificar contra la tabla de migraciones aplicadas antes de desplegar. **Verificado.**

**C2 · Tablas de salud nacen legibles por `anon`; solo las cierra la migración en riesgo (C1).** `0004_ficha_clinica.sql` crea `condiciones_salud`/`respuestas_sesion` delegando el control de acceso "a la capa de app" (sin RLS). Con el `GRANT ALL ON TABLES TO anon` de base, esas tablas de PHI fueron accesibles cross-tenant vía la anon key pública hasta `0014_rls_*` — que C1 muestra que puede no aplicarse. *Fix:* incluir RLS + `REVOKE` en la **misma** migración que crea cualquier tabla sensible, nunca en una posterior.

**C3 · `otorgarCreditos` mueve el saldo antes de ganar el cerrojo de idempotencia.** `lib/studio-context.tsx:2070` llama `dbAjustarCreditos(...)` incondicionalmente; el cerrojo real (`UNIQUE(studio,trigger,ref_id)` vía `dbInsertRewardAction`) no se comprueba hasta el `if (!ok) return` del bloque async posterior (2073-2076). Si el snapshot local está obsoleto o dos pestañas/kiosko compiten, el saldo se incrementa aunque el insert de la acción pierda el cerrojo → **créditos de fidelidad duplicados** (canjeables por recompensas). La ruta servidor (`lib/supabase-data.ts:1964-1973`) lo hace bien: insertar acción, `if (error) return`, luego ajustar. *Fix:* mover `dbAjustarCreditos` dentro de la rama `if (ok)`. **Verificado.**

**C4 · `canjearRecompensa` (ruta panel) dispara escrituras sin comprobar → canjes gratis / registros divergentes.** `lib/studio-context.tsx:2117-2163`: `dbAjustarStock`, `dbInsertRewardRedemption`, `dbInsertCreditTransaction` y `dbAjustarCreditos` son fire-and-forget. Si el débito atómico de saldo falla (`SALDO_INSUFICIENTE` por gasto concurrente), la fila de canje y el stock ya se escribieron pero el saldo nunca se debita → el socio se queda la recompensa sin pagar. La ruta pública (`lib/supabase-data.ts:1904-1943`) secuencia y revierte stock correctamente. *Fix:* replicar el orden/rollback del servidor y comprobar cada resultado de RPC.

**C5 · El consumo de bono ignora el `agotado` autoritativo de la RPC (refactor a medias).** `lib/studio-context.tsx:1299-1352` llama la RPC atómica `dbConsumirSesionBono` pero **descarta su valor de retorno** y decide si generar el recibo de renovación con `calcularConsumoBono(sesionesRestantes)` sobre el snapshot local obsoleto. Si el local está desfasado, la transición 1→0 se juzga mal → recibo de renovación perdido (ingreso perdido) o duplicado. El servidor (`lib/supabase-data.ts:1347-1361`) usa `rpc.agotado`. *Fix:* `await` la RPC y ramificar sobre su `agotado`. Este es el corazón del refactor "estabilización reservas-bono" a medio terminar.

---

## 🟠 Importante — deuda que va a doler

**I1 · Escrituras optimistas sin rollback (sistémico).** Casi toda mutación en `studio-context.tsx` hace `setState(...)` + `db*()` fire-and-forget cuyo único aviso de fallo es un toast genérico (`lib/studio-context.tsx:433-438`, patrón en `addPlan/updatePlan/deletePlan` `:736-758`, `addReserva`, `marcarCobrado`, `updateSocio`…). En un fallo de escritura la UI conserva el estado "exitoso" mientras la BD tiene el valor viejo → divergencia UI/BD y sensación de pérdida de datos al recargar. *Fix:* `await` la escritura y reconciliar/revertir desde el servidor en error.

**I2 · El Context nunca se memoiza → cada mutación re-renderiza todas las páginas.** `lib/studio-context.tsx:2459` construye un `value` literal nuevo en cada render y lo pasa al Provider (`:2682`). Con ~50 slices de `useState` en un solo provider Dios, las 38 páginas que consumen `useStudio()` re-renderizan ante cualquier cambio no relacionado. *Fix:* dividir en providers por dominio (o selectores tipo store); como mínimo `useMemo` del value + `useCallback` en las mutaciones.

**I3 · Ninguna página consume `dataLoaded` → los estados vacíos se muestran como "sin datos" durante la carga.** Las páginas leen slices que arrancan en `[]` y nunca comprueban `dataLoaded` (expuesto en `:2622`). Durante `fetchCriticalStudioData`, `pagos/page.tsx:751` muestra "Sin recibos", `socios/page.tsx:596` "No hay resultados"… La app parece rota/vacía en cada carga en frío. *Fix:* gatear páginas (o el layout) con `dataLoaded` y renderizar skeletons como ya hace `informes`.

**I4 · N+1 en recordatorios de clase.** `lib/supabase-data.ts:1521-1558` recorre sesiones → reservas → query de `socios` por miembro (`:1546`), y `datosClaseParaEmail` (`:1382-1407`) lanza 4-5 queries por sesión → cientos/miles de round-trips por ejecución de cron. *Fix:* precargar miembros/tipos/salas/instructores con `in(...)` y mapas de lookup.

**I5 · Cargas de tabla completas sin límite al navegador.** `lib/supabase-data.ts:978-1082` (`fetchCriticalStudioData`) trae ~40 tablas con `select('*')` sin cota en `socios/reservas/recibos/sesiones` y `automation_logs` explícitamente sin límite (`:1057`). Para un estudio consolidado carga años de filas por pestaña. *Fix:* agregación/paginación en servidor.

**I6 · Carga cobrada pero recibo no marcado: error de update tragado tras cobro exitoso.** `lib/stripe-cobros.ts:101-104`: tras `paymentIntent.status === 'succeeded'` no se inspecciona el resultado del update `recibos → COBRADO`. Si ese write falla, Stripe cobró pero el recibo queda PENDIENTE y puede reaparecer para cobro (la idempotency key evita el doble cargo, pero la reconciliación se rompe). *Fix:* comprobar el error y alertar/loguear para reconciliación manual.

**I7 · `pausarSuscripcion`/`reanudarSuscripcion` no persisten.** `lib/studio-context.tsx:1174-1184` solo hace `setSuscripciones`, sin `dbUpdateSuscripcion` → pausar/reanudar se pierde al recargar. *Fix:* persistir como hace `assignPlan`.

**I8 · `guardarPreferenciasPublica` escribe claves camelCase como columnas (guardado de prefs del portal roto).** `lib/supabase-data.ts:1861-1878` hace spread de `...params.cambios` (llegan camelCase: `notifEmail`, `instructorFavoritoId`) directo al upsert → columnas inexistentes, write falla. La ruta panel (`:2813-2828`) mapea bien. *Fix:* mapear camel→snake antes del upsert.

**I9 · `configuracion/page.tsx` es un componente Dios de 2.412 líneas.** 13 tabs, 8 inline (solo 5 extraídas a `components/configuracion/`), 36 `useState`, `Toast`/`Dialog`/CSV inline (`:1275`). *Fix:* extraer cada `Tab*` a `components/configuracion/` y mover helpers/CSV a `lib`.

**I10 · Lógica de negocio pesada y sin memoizar en `socios/[id]/page.tsx`.** Todo lo posterior al guard `if (!socio)` (`:297-345`: `proximasReservas`, `asistidas`, `totalGastado`, `.sort`, `diasSinVenir`, engagement) se recomputa en cada tecleo. Además es lógica que pertenece a `lib`. *Fix:* extraer a un selector memoizado `resumenSocio(...)` en `lib`.

**I11 · Provider completo montado en rutas públicas.** `app/reservar/[slug]/layout.tsx` → `StudioSlugGate` llama el mismo `fetchCriticalStudioData()` del staff, hidratando `socios/recibos/facturas/notasInternas/condicionesSalud` (datos de salud) en el navegador de un visitante público. Aunque el endpoint acote filas, enviar todo el esquema de staff al cliente público es un smell de arquitectura y rendimiento. *Fix:* provider "slim" dedicado a rutas públicas (catálogo + reservas del propio visitante).

**I12 · Efectos post-RPC evaluados sobre el set optimista equivocado en `addReserva`.** `lib/studio-context.tsx:1405-1415`: dentro del `.then`, `evaluarLogros/RetosSocio` reciben `reservasActualizadas` construido antes de la RPC asumiendo CONFIRMADA. Si la RPC devuelve `LISTA_ESPERA`, se evalúan logros como si la clase contara. *Fix:* recomputar el set desde el resultado autoritativo de la RPC.

**I13 · `/api/public/login` — enumeración de membresía/PII sin autenticar.** `app/api/public/login/route.ts:6-14` → `lib/supabase-data.ts:1733-1743`: con solo `{slug,email}` devuelve `socioId`, nombre y email de cualquier miembro. Superado por `/api/public/session` (JWT) y sin uso en cliente, pero sigue desplegado. *Fix:* eliminar la ruta (y `resolverLoginSocia`) o protegerla con el mismo check JWT.

**I14 · Sin rate limiting en endpoints públicos/semipúblicos.** No hay `middleware.ts` ni librería de rate-limit. `POST /api/public/studio-data`, `/api/public/login` y `/api/stripe/checkout` son enumerables → fuerza bruta/sondeo de membresía y abuso de objetos/coste Stripe. *Fix:* rate limiting por IP/slug (Upstash o edge middleware) en todo `public/*` y `stripe/checkout`.

**I15 · Lógica de recolección de recibos duplicada.** `marcarCobrado` (`:1663-1715`) y `cobrarTodosPendientes` (`:1739-1788`) copian el bloque de refill de bono / extensión mensual y el build+sellado de factura. Riesgo de divergencia (p. ej. el guard `sesionesRestantes === 0`). *Fix:* extraer `aplicarCobroRecibo(recibo)`.

---

## 🟡 Mejora — pulido y consistencia

**M1 · Helpers de fecha/color/formato duplicados en 6+ páginas.** `localDate` reimplementado en `calendario:44`, `reservar/[slug]:25`, `informes:9`, `socios/[id]:72`, `dashboard:24`, `kiosk/[slug]:28` (firmas divergentes `Date` vs `Date|string`); ídem `addDays`, `hexToRgba`, `isDark`. *Fix:* consolidar en `lib/date.ts`/`lib/utils`.

**M2 · Componente `Toast` copiado por página.** Implementaciones separadas en `configuracion:146`, `calendario:1273`, `socios/[id]`, `kiosk`. *Fix:* un único `<Toast>`/contexto en `components/ui`.

**M3 · Fetches de IA sin abort/cleanup → setState tras unmount.** `socios/[id]:428`, `calendario:341`, `marketing:634` hacen `await fetch` + `setState` en componentes que pueden desmontarse (modales/paneles). *Fix:* `AbortController` / guard de montado.

**M4 · Datos de estudio hardcodeados como fallback en la página pública.** `app/reservar/[slug]/page.tsx:200-202` renderiza `'Málaga · Calle Larios 12'`, `'hola@tentare.es'`, `'+34 951 000 000'` para estudios con perfil incompleto → dirección/teléfono equivocados a clientes reales. `socios/[id]:439,461` usa `instructorId ?? 'inst-1'` (instructor fantasma). *Fix:* ocultar el campo si falta; deshabilitar la acción hasta resolver un instructor real.

**M5 · Estados de carga inconsistentes (flash en blanco vs skeleton).** `calendario:1566`, `configuracion:250`, `dashboard:584`, `pagos:491` hacen `if (!mounted) return null` (pantalla en blanco) mientras `informes:378` y `reservar:468` usan skeletons. *Fix:* estandarizar en skeleton + un hook `useMounted()`/`useClientNow()`.

**M6 · Módulos Dios + mappers a mano duplicados.** `lib/supabase-data.ts` (3.630 líneas) y `lib/studio-context.tsx` (2.705) mezclan decenas de dominios; ~60 `dbUpdate*` reimplementan el mismo mapeo `if ('x' in changes)` camel→snake, frágil y donde se pierden campos por omisión. Casts `as Studio`/`as Reserva` por doquier ocultan drift de esquema. *Fix:* dividir por dominio, generar mappers y devolver literales sin `as` para que TS valide.

**M7 · Teming inconsistente: hex crudo junto a clases de token.** ~60 hex hardcodeados solo en `configuracion` (`EstadoBadge` `bg-[#D1FAE5]` `:207`, borrar `bg-[#DC2626]` `:131`) mientras el resto usa `bg-brand`/`text-muted-foreground` → rompe dark-mode. *Fix:* pasar los colores de estado por los tokens de `panel-theme`.

**M8 · Higiene de repo.** `supabase/migrations/_wtest.tmp` (1 byte) en la carpeta de migraciones; `0019_bono_atomico.sql` y `0021_bono_atomico.sql` byte-idénticos con hueco `0020` (git muestra delete staged de `0019` + re-adds untracked). En raíz: 4 `AUDITORIA-*.md` + 8 `DECISION-OS-*.md` + `FICHA-CLINICA.md` + `estabilizacion-reservas-bono.patch` (24 KB, no gitignoreado → riesgo de commit accidental). *Fix:* borrar `_wtest.tmp` y la migración duplicada; mover docs a `docs/`; aplicar o borrar el patch.

**M9 · `err is of type 'unknown'` en catch (strict).** `app/api/terminal/{cobrar,estado,lector}/route.ts`, `lib/stripe-cobros.ts:114`. *Fix:* estrechar con `err instanceof Error`. Y `lib/inngest/decision.ts:134` accede a `.titulo/.motivo` sobre `{}` → tipar el retorno de la RPC.

**M10 · Webhooks sin dedup por `event.id`.** `app/api/stripe/webhook/route.ts`, `billing/webhook/route.ts` son idempotentes a nivel de operación (aceptable) pero una tabla de `event.id` procesados sería más robusta ante entregas duplicadas/reordenadas.

---

## Recomendación de orden de trabajo

1. **C1 + C2** (migraciones/RLS de salud) — riesgo legal/seguridad y de despliegue; independiente del refactor en curso.
2. **Terminar el refactor bono/reservas (C3, C4, C5, I12)** — ya está a medias en el árbol; cerrar alineando las rutas del panel con las RPC atómicas del servidor, con tests.
3. **I1 + I2 + I3** (rollback optimista, memoización del context, gate de `dataLoaded`) — causas raíz que amplifican media docena de hallazgos de rendimiento y consistencia.
4. Resto de 🟠, luego 🟡.

Las páginas `reservar` e `informes` ya demuestran el patrón correcto (skeletons, aria, estados de error): buena parte del trabajo es elevar las páginas antiguas a ese listón.

## Cambios desde la última auditoría (12-jul)
Las 4 auditorías previas (`AUDITORIA-CTO/PRODUCTO/ESCALABILIDAD/CALENDARIO-RESERVAS.md`) son del 12-jul. Desde entonces el equipo ha añadido dependency-risk por instructor, marca/IVA por estudio, campos personalizados, plantillas de email, y ha empezado el refactor de bono atómico (RPC servidor correctas). Los hallazgos nuevos de esta pasada se concentran en: (a) la colisión de numeración de migraciones introducida al añadir `0014_marca_e_iva` junto al `0014_rls_*` de seguridad, y (b) que las rutas cliente del panel (`studio-context.tsx`) aún no se han alineado con las RPC atómicas nuevas (C3-C5), dejando el refactor a medias.
