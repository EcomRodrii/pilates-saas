# Auditoría Tentare — 33ª pasada (8 sep 2026)

## Área elegida y por qué

Las pasadas 27ª-32ª (mismo día) ya barrieron POS/TPV/Bizum, SEPA/dunning, liquidaciones
de instructoras, gamificación por créditos, y checkout de planes/matrícula/consentimiento
legal. De las candidatas sugeridas (reservas/RPCs, Decision OS, ficha clínica, comunidad,
importador, Veri*Factu), un primer barrido rápido mostró que **Comunidad y Mensajería**
(`app/api/comunidad/**`, `app/api/public/comunidad/**`, `app/api/mensajeria/**`,
`app/api/network/mensajes/**`) ya habían recibido varias rondas de endurecimiento
recientes y documentadas (F-19 oráculo cross-tenant, F-24 guard de audiencia en
like/comentarios/RSVP, F-26/F-27) — revisadas igualmente aquí, sin hallazgos nuevos.

Elegí en su lugar el **servidor OAuth 2.0 para terceros** (`app/api/oauth/**`,
`lib/oauth-server.ts`, `lib/oauth-crypto.ts`): es la única vía de acceso de un actor
**externo no humano** (Zapier u otra integración futura) a datos de clientas/reservas/
notas/tareas de un estudio, con su propio modelo de tokens/scopes/tenant, tocado por
última vez en PRs de fase 5/9 (`3dcaae0b`, `6c04e61e`) — superficie de seguridad real,
no cubierta en ninguna de las auditorías del mismo día, y con la complejidad típica
(rotación de tokens, reuse-detection, PKCE) donde este repo ya ha tenido bugs de
"se corrige un lado y no el gemelo".

## Metodología

Lectura completa de los 11 endpoints (`/api/oauth/authorize`, `/token`, `/revoke`, `/me`,
`/consentimientos`, y los 6 de `/api/oauth/v1/*`), de `lib/oauth-server.ts` (todo el
ciclo code→token→refresh, revocación, auditoría) y `lib/oauth-crypto.ts` (PKCE, hashing,
comparación en tiempo constante, catálogo de scopes). Contrastado contra
`docs/oauth-arquitectura.md` para distinguir bug de decisión documentada. Sin cambios de
esquema ni RLS en esta área (las tablas `oauth_*` son intencionalmente sin política,
todo el aislamiento vive en TS — confirmado, no reabierto).

---

## 🟠 Hallazgo — `rotarRefreshToken` revoca la cadena de OTRO cliente antes de comprobar que el `client_id` coincide

**Archivo:** `lib/oauth-server.ts:179-227` (función `rotarRefreshToken`), consumida desde
`app/api/oauth/token/route.ts:88-103`.

**Qué pasa:** el flujo de `authorization_code` sí hace las cosas en el orden correcto —
`canjearCodigoAutorizacion` recibe `clienteEsperado` como parámetro y comprueba
`fila.cliente_id !== clienteEsperado` **antes** de marcar el code como usado (línea 116-122
de `oauth-server.ts`). El flujo de `refresh_token` NO sigue el mismo patrón:

```ts
// oauth-server.ts
export async function rotarRefreshToken(admin: SupabaseClient, refreshTokenRecibido: string) {
  // busca la fila SOLO por hash de refresh_token, sin recibir ni comprobar clienteId
  // ...
  // reclama la fila (revoca la vieja) y emite un par nuevo — YA HECHO, irreversible
  const nuevos = await emitirParTokens(admin, { studioId: fila.studio_id, clienteId: fila.cliente_id, /* ... */ });
  return { ok: true, clienteId: fila.cliente_id, scopes: fila.scopes, ...nuevos };
}
```

```ts
// app/api/oauth/token/route.ts
const resultado = await rotarRefreshToken(admin, refreshToken);
if (!resultado.ok) return errorOAuth(resultado.error, 400);
if (resultado.clienteId !== cliente.id) return errorOAuth('invalid_grant', 400); // comprobación TARDÍA
```

La comprobación de que el `client_id` autenticado en la petición coincide con el dueño
real del refresh token llega **después** de que `rotarRefreshToken` ya haya marcado la
fila vieja como `revocado_en` y haya insertado un par de tokens nuevo en `oauth_tokens`
(que se descarta sin devolverlo a quien llamó, porque el `if` de arriba corta la
respuesta con `invalid_grant`).

**Cómo se explota / cuándo ocurre:** cualquier llamador que posea (por la vía que sea —
filtrado en logs, un integrador que reenvía el token por error, etc.) el *valor* en claro
de un refresh token emitido a la integración **A**, y que tenga credenciales válidas de
**cualquier otro** cliente OAuth registrado en el sistema (**B**) — o incluso sin secreto,
si B es un cliente público (`es_confidencial = false`, como habitualmente son los clientes
PKCE-only) — puede invalidar en silencio la sesión de A: la llamada a `/api/oauth/token`
con `client_id` de B + el refresh token de A devuelve `invalid_grant` (parece un fallo
inocuo), pero el efecto secundario real — revocar la cadena de tokens de A — ya ocurrió.
La próxima vez que la integración A intente refrescar, su token ya está muerto y deja de
funcionar sin aviso ni causa aparente para quien audite solo la respuesta HTTP.

Es el mismo error de categoría que el propio repo ya identificó y corrigió para
`canjearCodigoAutorizacion` (comprobar pertenencia al cliente **antes** de consumir el
recurso de un solo uso) — aquí simplemente no se replicó el mismo orden en el gemelo
(`refresh_token` vs `authorization_code`), el patrón "se arregla un lado y no el gemelo"
que este repo repite en distintas áreas.

**Impacto real, sin sobrestimar:** con un solo cliente OAuth activo hoy (Zapier) el
impacto práctico es bajo — no hay hoy un segundo integrador con el que confundir el
`client_id`, y el ataque exige de todas formas conocer el valor en claro de un refresh
token ajeno (alta entropía, 32 bytes aleatorios — no se puede adivinar ni fuerza bruta).
No es una fuga de datos ni un bypass de scope: en ningún momento un cliente obtiene
acceso a datos de un estudio que no autorizó. Es una vía de **denegación de servicio
selectiva contra otra integración**, real pero de explotación no trivial hoy — clasificado
🟠 (importante, no crítico) por eso.

**Arreglo propuesto:** dar a `rotarRefreshToken` el mismo parámetro `clienteEsperado` que
ya tiene `canjearCodigoAutorizacion`, y comprobar `fila.cliente_id !== clienteEsperado`
**antes** de la reclamación atómica (el `UPDATE ... WHERE revocado_en IS NULL`), devolviendo
`invalid_grant` sin tocar la fila. Mismo patrón, aplicado al gemelo que se quedó atrás.

---

## 🟡 Hallazgo menor — `comentarios_count` se actualiza con lectura-luego-escritura, no atómico

**Archivos:** `app/api/comunidad/comentarios/route.ts:82-86` y
`app/api/public/comunidad/comentarios/route.ts:129-133`.

**Qué pasa:** ambos endpoints (staff y portal) incrementan el contador con
`(post.comentarios_count ?? 0) + 1` leído unas líneas antes, en vez de un
`UPDATE ... SET comentarios_count = comentarios_count + 1` atómico en SQL. Dos
comentarios casi simultáneos sobre el mismo post (dos socias comentando a la vez, o una
socia y el staff) pueden pisarse: ambos leen el mismo valor antes de que el otro escriba,
y el contador final queda uno por debajo de los comentarios reales.

**Impacto:** cosmético — el contador es solo para la tarjeta del feed y el ranking de
"miembros más activos"; los comentarios en sí se guardan siempre correctamente (el
propio `INSERT` del comentario nunca se pierde), y el propio código ya lo documenta como
"best-effort: si falla, el comentario ya está guardado". No es dinero ni RLS ni un dato
de otro estudio — solo una cifra que puede quedar ligeramente desincronizada bajo
concurrencia real. 🟡 menor, no bloqueante; mencionado por completitud, no por urgencia.

**Arreglo propuesto (si algún día se prioriza):** `UPDATE posts_comunidad SET
comentarios_count = comentarios_count + 1 WHERE id = ... AND studio_id = ...` en vez de
leer-y-sumar en TS. Cambio de una línea en cada uno de los dos ficheros, sin migración.

---

## Zonas revisadas SIN hallazgos nuevos (para no repetir en la 34ª pasada)

- **`app/api/oauth/authorize`, `/revoke`, `/me`, `/consentimientos`**: rol comprobado en
  servidor (`puedeGestionarAppsOAuth`), `redirect_uri` en whitelist exacta, PKCE S256
  obligatorio siempre, `/me` con lista blanca de campos. Sin hallazgos.
- **Los 6 endpoints `/api/oauth/v1/*`**: los seis pasan por `conOAuth()`, que exige
  scope + filtra SIEMPRE por `studio_id` del token — verificado caso a caso
  (`clientas`, `notas`, `planes`, `reservas` GET/POST, `reservas/cancelar`, `tareas`):
  ninguno confía en un `studioId`/`socioId` del body sin re-verificar pertenencia al
  estudio del token (`crearTareaAdmin`, `crearReservaPublica`, `cancelarReservaPublica`,
  `registrarSociaPublica` comprueban todos `.eq('studio_id', ...)` antes de escribir).
  Sin hallazgos.
- **`app/api/comunidad/**` y `app/api/public/comunidad/**`** (posts, comentarios, likes,
  asistentes a evento): guard de audiencia (`socioEnLaAudiencia`/`audienciaDelPost`)
  presente en los cuatro caminos de escritura del portal, ids generados siempre en
  servidor con entropía real (`uuidV4`/`crypto.randomUUID`), imagen de post validada
  contra el prefijo exacto del bucket propio. Sin hallazgos.
- **`app/api/mensajeria/**` y `app/api/network/mensajes/**`**: apertura de conversación
  con reglas de "en nombre de quién" comprobadas en servidor para INSTRUCTOR vs.
  PROPIETARIO/MANAGER/RECEPCION; envío de mensaje delegado a RLS con el JWT de sesión
  (no service-role) allí donde la política ya resuelve la visibilidad correcta; tope de
  3 mensajes en Network mientras la solicitud está `pendiente`, comprobado con `COUNT`
  server-side. Sin hallazgos.
- **`app/api/ai/ficha-clinica-socio`**: rol comprobado (`puedeVerFichaClinica`) antes de
  llamar a la IA; nunca llega el nombre de la socia al prompt. Sin hallazgos.

## Conclusión

Un hallazgo real de severidad 🟠 (asimetría de comprobación cliente-token en la rotación
de refresh tokens, gemelo mal corregido del patrón ya arreglado en el canje de
authorization code) y un 🟡 cosmético (contador no atómico). El resto de la superficie
revisada — que es amplia, 20 endpoints entre OAuth y Comunidad/Mensajería — está
consistentemente bien construida: rol comprobado en servidor en todos los casos, ningún
query sin filtro de `studio_id`, ningún id aceptado del cliente en un INSERT sensible.
No se fuerzan hallazgos adicionales para completar cuota.
