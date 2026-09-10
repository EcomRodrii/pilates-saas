# Auditoría 41ª pasada (2026-09-09) — Community OS / Mensajería

## Resumen ejecutivo

Área asignada: mensajería estudio↔socia (`app/api/mensajeria/**`,
`app/api/public/mensajeria/**`), Comunidad/tablón (`app/api/comunidad/**`,
`app/api/public/comunidad/**`), mensajería de Network/marketplace de
instructoras (`app/api/network/mensajes/**`) y Realtime Broadcast
(`realtime.messages`, `conversacion:{id}`).

**No se ha encontrado ningún hallazgo crítico ni importante nuevo.** Esta es
un área que ya ha recibido atención de seguridad repetida y reciente (F-15,
F-19, F-24, F-27, I-16 y la corrección de condición de carrera de la 35ª
pasada), y en esta revisión todos los caminos de escritura relevantes
(abrir conversación, enviar mensaje, marcar leído, publicar post, comentar,
dar like, RSVP a evento, mensajería de Network) verifican identidad
server-side ANTES de tocar datos, y la RLS subyacente replica exactamente
la misma condición que el TS — no hay ningún caso de "la API comprueba algo
que la tabla no comprueba también". El patrón "gemelos divergentes" que se
pedía buscar explícitamente **no aparece** en el par
staff/público de mensajería ni en el par staff/público de Comunidad: ambos
lados están sincronizados a propósito y lo dice el propio código en
comentarios ("mismo patrón que...").

Se documentan dos hallazgos 🟡 menores (no bloqueantes) y se deja constancia
de dos áreas ya cerradas por diseño que no hace falta reabrir.

---

## Hallazgos

### 🟡 M-1 — `POST /api/network/mensajes` no tiene rate limit, a diferencia de TODOS sus hermanos de mensajería

**Archivo**: `app/api/network/mensajes/route.ts:95-124` (función `POST`)

Todos los demás endpoints de escritura de mensajería del repo llaman a
`enforceRateLimit` antes de escribir:
- `app/api/mensajeria/conversaciones/[id]/mensajes/route.ts:69` (`staff-mensajeria-mensajes`, 120/min)
- `app/api/public/mensajeria/conversaciones/[id]/mensajes/route.ts:71` (`public-mensajeria-mensajes`, 60/min)
- `app/api/public/comunidad/comentarios/route.ts:72` (`public-comunidad-comentarios`, 30/min)
- `app/api/public/comunidad/posts/[id]/like/route.ts:15` (`public-comunidad-like`, 60/min)

`app/api/network/mensajes/route.ts` (mensajería del marketplace
instructora↔estudio, ya auditada dos veces por el tope
`TOPE_MENSAJES_PENDIENTE` y por la condición de carrera de la 35ª pasada)
**no llama a `enforceRateLimit` en ningún punto del fichero** — verificado
con grep, cero coincidencias.

El tope de 3 mensajes (`TOPE_MENSAJES_PENDIENTE`) solo aplica **mientras la
solicitud está `pendiente`**; en cuanto pasa a `aceptada`,
`limiteRestante` es explícitamente `null` ("sin tope") y no hay ningún
freno de frecuencia. La RPC `enviar_mensaje_red` cierra la condición de
carrera del conteo (bloqueo `FOR UPDATE`), pero eso no es un rate limit —
solo evita que dos peticiones simultáneas cuenten mal el tope de 3.

**Escenario de explotación**: una cuenta de instructora autenticada (o un
token de staff robado) con una solicitud ya `aceptada` puede hacer
`POST /api/network/mensajes` en bucle sin ningún límite de frecuencia,
inundando el hilo del estudio o de la instructora contraria — molestia real
(spam, no fuga de datos) pero perfectamente automatizable, exactamente el
tipo de gap que `enforceRateLimit` ya cierra en todos los endpoints
hermanos.

**Severidad**: 🟡 menor — requiere sesión autenticada válida, no expone
datos de otra persona ni de otro estudio, es exclusivamente un vector de
molestia/DoS de bajo impacto sobre un hilo 1:1.

**Fix propuesto**: añadir la misma línea que ya tienen sus hermanos, p.ej.
```ts
const limited = await enforceRateLimit(req, 'network-mensajes', { max: 60, windowSeconds: 60 }, participante.userId);
if (limited) return limited;
```
tras resolver `participante` (para limitar por usuario, no por IP — mismo
criterio ya documentado en el resto del repo para tokens de staff/socia
compartiendo oficina/conexión).

---

### 🟡 M-2 — `toggle_like_post` (RPC staff) no valida que el post pertenezca al mismo estudio antes del INSERT en `post_likes`

**Archivo**: `supabase/migrations/0025_fix_toggle_like_search_path.sql:20-49`

A diferencia de su gemelo `toggle_like_post_portal` (usado por el portal de
socias, que primero resuelve `audienciaDelPost`/comprueba pertenencia vía
`app/api/public/comunidad/posts/[id]/like/route.ts:36-40` antes de llamar a
la RPC), `toggle_like_post` (llamado directo por el cliente de staff,
`lib/supabase-data.ts:4047`, `dbToggleLikePost`) comprueba
`auth.uid()`/`current_studio_id() = p_studio_id` pero **inserta en
`post_likes` sin comprobar que `p_post_id` pertenezca a `p_studio_id`**:

```sql
insert into public.post_likes (post_id, user_id, studio_id)
  values (p_post_id, v_uid, p_studio_id)
  on conflict (post_id, user_id) do nothing;
```

**Impacto real, verificado**: no es explotable como fuga cross-tenant. La
RLS de `post_likes` (`0023_post_likes.sql:41-50`) exige
`studio_id = current_studio_id()` tanto para SELECT como para
INSERT/DELETE, así que un miembro de staff solo puede ver/crear filas de
`post_likes` de SU PROPIO estudio — el `studio_id` grabado en la fila de
like siempre es el suyo, nunca el del estudio dueño real del post. El único
efecto observable es una fila "huérfana" (`post_id` apuntando a un post de
otro estudio, con `studio_id` del atacante) que no se refleja en ningún
contador visible (el `UPDATE ... WHERE p.studio_id = p_studio_id` que
recalcula `likes` no encuentra fila y no actualiza nada) — ruido de
integridad, no una vulnerabilidad de confidencialidad ni de escritura
cruzada visible.

**Severidad**: 🟡 menor-documentado — no requiere fix urgente, pero si se
toca esta función en el futuro, añadir el mismo guard que ya tiene su
gemelo portal (`exists (select 1 from posts_comunidad p where p.id =
p_post_id and p.studio_id = p_studio_id)` antes del INSERT) cerraría la
asimetría por completo.

---

## Verificado sin hallazgos (para no repetir trabajo en próximas pasadas)

- **RLS vs. TS en `conversaciones`/`conversacion_participantes`/`mensajes`**
  (`supabase/migrations/20260825175436_community_messaging_os_rls.sql`):
  la condición de la policy es EXACTAMENTE la misma que el chequeo en TS en
  los 4 endpoints (`GET`/`POST` de conversaciones y mensajes, staff y
  público). `abrir_conversacion` está concedida a `authenticated`
  directamente (verificado con `has_function_privilege`) de forma
  **intencional y documentada**: la RPC repite sus propios checks de
  `auth.uid()` como candado real, la API route es defensa en profundidad —
  probé mentalmente el bypass directo vía `.rpc()` para los tres tipos
  (`ALUMNA_INSTRUCTORA`, `ALUMNA_MOSTRADOR`, `EQUIPO`) y los tres siguen
  cerrados sin pasar por la ruta.
- **Grants de las funciones `SECURITY DEFINER` de mensajería**
  (`abrir_conversacion`, `enviar_mensaje_red`, `toggle_like_post_portal`,
  `difundir_mensaje_nuevo`, `ajustar_comentarios_count`,
  `es_participante_conversacion`, `promocionar_siguiente_espera`):
  verificado en vivo con `has_function_privilege` para `anon`/
  `authenticated`/`service_role` — ningún caso del gotcha ya documentado
  (`PUBLIC`/rol con `EXECUTE` no revocado tras cambiar firma).
- **Realtime Broadcast** (`conversacion:{id}`,
  `supabase/migrations/20260826015940_realtime_broadcast_mensajeria.sql`):
  la policy de `realtime.messages` reconstruye el `id` de conversación
  desde el topic (`split_part(realtime.topic(), ':', 2)`) y aplica la MISMA
  condición que `mensajes_lectura` — no hay forma de suscribirse a un canal
  de otro estudio o de una conversación ajena. El cliente Realtime del
  portal (`lib/db/supabase-portal-realtime.ts`) reutiliza el JWT real de
  Supabase Auth de la socia (no un token propio del backend), así que
  `auth.uid()` sí resuelve para ella dentro de esa policy.
- **XSS en el cuerpo de un mensaje/post/comentario**: ningún componente de
  mensajería/comunidad/portal usa `dangerouslySetInnerHTML` sobre contenido
  de usuario (los 6 usos totales en el repo son SVG de QR, CSS de acento de
  marca y JSON-LD serializado, ninguno mensajería) — React escapa por
  defecto, sin gap de sanitización.
- **Comunidad — filtro de audiencia en el lado socia** (F-24, ya cerrado):
  GET/POST de comentarios y el toggle de like comprueban
  `socioEnLaAudiencia` incluso cuando se pide por `postId` directo
  (adivinable), no solo en el listado — confirmado que sigue así en los
  tres endpoints.
- **`/chat` (chat de equipo por canales, `mensajes_equipo`)**: sigue
  congelado (`lib/frozen-features.ts`, motivo documentado: "RLS roto D2 + no
  es la cuña") y **no tiene ningún endpoint `app/api/**` activo** que lo
  exponga — el único hook (`use-team-chat-store.ts`) solo lo importa la
  página congelada (`page.frozen.tsx`); la mención en
  `components/mensajeria/conversaciones-tab.tsx` es un comentario, no un
  import real. No se ha tocado ni reabierto esta área, coherente con el
  encargo de la pasada.
- **`enviar_mensaje_red`**: la condición de carrera del conteo del tope ya
  se cerró en la 35ª pasada con `FOR UPDATE`; revisado de nuevo y sigue
  cerrada. Grants verificados: solo `service_role`.

## Alcance NO tocado (fuera de esta pasada / ya cerrado en otras)

- `mensajes_equipo`/`/chat` — congelado a propósito, no reabierto (ver
  arriba).
- Cualquier flujo de dinero, Stripe, POS, ficha clínica, Migración Mágica,
  Decision OS, sustituciones — pasadas dedicadas previas.
- No se ha tocado `lib/frozen-features.ts` ni se ha propuesto reactivar
  nada.
