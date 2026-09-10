# Auditoría Tentare — 40ª pasada (2026-09-09)

## Área elegida y por qué

**Motor de sustituciones de instructoras** (`lib/sustituciones/`, `app/api/sustituciones/`,
`app/api/public/aceptar-sustitucion/`, `app/api/public/disponibilidad/`,
`app/api/mi-disponibilidad/`, y las RPC `confirmar_sustitucion`/`rankear_candidatas`/
`alumnas_apuntadas` en `supabase/migrations/`).

Ninguna de las 39 pasadas previas la tocó como área principal — aparece solo de refilón
(PR #545/#555/#558/#562 en `tentare-os.md`, siempre como "ya diseñado y revisado por
seguridad sin bloqueantes"). Tiene superficie real: es dinero indirecto (liquidaciones de
instructoras leen `sustituciones.sustituta_final_id`), tiene un endpoint público sin login
(deep link firmado) y una RPC `SECURITY INVOKER` con lógica de compare-and-set — la
combinación exacta que ya ha producido bugs en otras áreas del repo (RLS que no distingue
fila, grants a `authenticated` de más). El propio código está muy comentado con hallazgos
de auditorías de producto previas (P0-2, P0-3), lo que sugiere que ya se miró de cerca a
nivel de endpoint HTTP — pero no a nivel de RLS/RPC-grant, que es donde hasta ahora no
había mirado nadie.

Se descartaron como candidatas: Radar de ocupación / WhatsApp
(`app/api/marketing/hueco/avisar`, `app/api/webhooks/twilio-inbound`) y Módulo de
Contenido (`lib/contenido/`) — ambas revisadas por encima primero; el Radar está
excepcionalmente bien blindado (rate-limit, recompute server-side de aforo/candidatas,
consentimiento RGPD, dedup, cap) y sin hallazgos nuevos en la lectura; Contenido no ha
tenido commits de peso desde `#1058` (agosto) y no maneja dinero ni RLS sensible.

---

# 🟠 IMPORTANTE

## I-1 — `confirmar_sustitucion` es invocable directamente por CUALQUIER instructor/staff del estudio, saltándose token, candidatura y el guardián de "clase ya empezada"

**Dónde**: `supabase/migrations/0048_sustituciones_confirmar_sin_solape.sql:31-83` (la RPC,
sin `SECURITY DEFINER` → corre como `SECURITY INVOKER`, sujeta a la RLS del que llama) +
`GRANT EXECUTE ... TO authenticated, service_role` (idéntico en 0040/0042/0048) +
`supabase/migrations/0037_sustituciones_wedge.sql:191-194` (`admin_sustituciones`, política
`FOR ALL TO authenticated USING (studio_id = current_studio_id())` — **sin ninguna
distinción de rol ni de candidatura**, la misma forma de política que ya se identificó como
el bug repetido de este repo en `sesiones`/`reservas` antes del PR #528).

**Cómo se explota**: los DOS únicos llamadores reales de esta RPC
(`app/api/sustituciones/route.ts:223` y `app/api/public/aceptar-sustitucion/route.ts:67`)
usan siempre `getSupabaseAdmin()` (cliente service-role) — nunca el cliente autenticado del
navegador. El `GRANT ... TO authenticated` es puro sobrante de superficie: nada de la app
lo necesita, pero cualquier usuario con sesión válida (cualquier instructora del estudio,
o cualquier miembro de staff) puede llamar `supabase.rpc('confirmar_sustitucion', {...})`
directamente desde la consola del navegador con su propio JWT + la clave `anon` pública
(exactamente el patrón que este repo ya usa deliberadamente en otros sitios, p. ej.
`dbCancelarReservaPlaza`, documentado en `tentare-os.md`).

Con eso, una instructora (sin ser staff, sin ser la `candidata_actual`, sin token de email,
sin que la clase esté siquiera en juego para ella) puede:

1. Pasar `p_sustitucion_id` de **cualquier** sustitución activa de su propio estudio (los
   ids no son secretos: se ven en el panel/calendario a los que ya tiene acceso legítimo de
   lectura — `sesiones_lectura`/`sustituciones` sin restricción de SELECT).
2. Pasar `p_instructor_id` = su propio id (o cualquier otro id de instructora del estudio).
3. La RPC hace `UPDATE sustituciones SET estado='confirmada', sustituta_final_id=...`. Esta
   UPDATE pasa la RLS de `sustituciones` sin más comprobación que `studio_id` — **no
   requiere ser staff ni ser la candidata**.
4. La RPC intenta después `UPDATE sesiones SET instructor_id=p_instructor_id WHERE id=v_sesion`.
   Para una instructora (no staff), la RLS de `sesiones_escritura_update` exige que la fila
   **actual** tenga `instructor_id = current_instructor_id()` — casi nunca es cierto en una
   sustitución real (la clase sigue asignada a la instructora que se dio de baja). Esta
   segunda UPDATE se filtra en silencio a **0 filas por RLS, sin lanzar ningún error**
   (no es una excepción SQL, PostgREST/plpgsql no distingue "0 filas por RLS" de "0 filas
   porque no había ninguna que coincidiera").
5. La función devuelve `{ok:true, sesion_id}` igualmente — **la sustitución queda
   'confirmada' con una `sustituta_final_id` que nunca llegó a asignarse en `sesiones`**.

**Impacto real**:
- **Corrupción de estado, sin error visible**: la sustitución pasa a un estado terminal
  (`confirmada`) sin que la clase esté realmente cubierta por nadie. Nadie puede volver a
  abrirla desde el panel (no hay flujo de "reabrir una confirmada"), así que la clase queda
  efectivamente sin sustituta real y sin ningún aviso — el barrido de vencidas
  (`cerrar-vencidas.ts`) no la toca porque ya no está en `ESTADOS_EN_JUEGO`.
- **Sabotaje del flujo legítimo**: cualquier instructora del estudio (no solo staff) puede
  "cerrar" con `estado='confirmada'` una sustitución activa antes de que la candidata real
  del ranking la acepte por su enlace, arrebatándosela igual que describía el hallazgo P0-3
  ya cerrado — pero por una vía completamente distinta (RPC directa, no replay de token) que
  el arreglo de P0-3 (`ultimaRespuestaDe` en `app/api/public/aceptar-sustitucion/route.ts`)
  **no cubre**, porque esa comprobación vive en la ruta HTTP, no en la RPC ni en la RLS.
- **Se salta el guardián de "clase ya empezada"**: ambas rutas HTTP comprueban
  `sesionYaEmpezada()` antes de llamar a la RPC (con comentarios explícitos sobre por qué
  hace falta — evita que `avisarAlumnas(..., 'cubierta')` mienta sobre una clase que ya se
  dio). La RPC en sí no lo comprueba nunca. Llamada directamente, ese guardián no existe.
- **No es cruce de tenant** (la RLS de `studio_id = current_studio_id()` sí frena eso), pero
  sí es una escalada de privilegio dentro del propio estudio: ninguna instructora debería
  poder resolver sustituciones por su cuenta en modo asistido, y ninguna debería poder
  "confirmarse" a sí misma sin pasar por el ranking/candidatura.
- **Nómina no se ve afectada por esta vía concreta** (revisado: `lib/equipo/liquidacion-datos.ts:83-94`
  filtra `sesiones` por `instructor_id = instructorId` ANTES de cruzar con
  `sustituciones.sustituta_final_id`, así que una `sustituciones.confirmada` fraudulenta sin
  el `UPDATE sesiones` correspondiente no genera pago de más — pero sí dejaría al estudio
  sin ninguna sustituta real un día cualquiera, sin saberlo).

**Por qué no es el mismo hallazgo que P0-3 (`auditoria-tentare-final.md`)**: P0-3 era sobre
reenviar/reabrir la petición POST tras rechazar explícitamente, y se cerró añadiendo la
comprobación `ultimaRespuestaDe` **dentro de la ruta HTTP**. Este hallazgo es sobre que la
RPC subyacente sigue siendo alcanzable **sin pasar por esa ruta en absoluto**, porque el
`GRANT` a `authenticated` nunca se retiró tras cerrar P0-3 — el propio patrón que
`tentare-os.md` documenta como error ya cometido con `reservar_numero_factura` (grant de
más a un rol que no necesita ejecutar la función directamente).

**Arreglo propuesto**: revocar el `GRANT EXECUTE` a `authenticated` (dejar solo
`service_role`, que es quien de verdad la llama, mismo patrón que
`promocionar_siguiente_espera`/`aceptar_oferta_lista_espera`) y verificar con
`has_function_privilege('authenticated', 'confirmar_sustitucion(text,text,text,uuid)',
'EXECUTE')` que quede en `false`. Alternativa si algún día hiciera falta invocarla desde
cliente: añadir dentro de la función el chequeo `auth.uid() IS NOT NULL AND
p_instructor_id <> current_instructor_id() AND NOT puede_gestionar_calendario() → RAISE`,
más comprobar explícitamente `sesiones.inicio > now()` y que `p_instructor_id` sea la
`candidata_actual` del ranking — pero revocar el grant es la corrección mínima y ya
suficiente, dado que ningún caller legítimo lo necesita.

---

# 🟡 MEJORAS (documentadas, no aplicadas)

- **`sustitucion_contactos` tiene la misma forma de RLS que `sustituciones`**
  (`admin_sustitucion_contactos`, `0037_sustituciones_wedge.sql:196-199`): `FOR ALL TO
  authenticated USING (studio_id = current_studio_id())`, sin distinguir rol. No se ha
  encontrado una vía de explotación concreta (nada crítico depende de escribir ahí
  directamente — es solo traza/histórico, y `ultimaRespuestaDe` ya la trata como
  best-effort), pero es la misma forma de agujero que I-1 y merece cerrarse por
  consistencia si se toca esa migración por otro motivo.
- **`rankear_candidatas`/`alumnas_apuntadas` están correctamente documentadas como
  inofensivas** al ser `SECURITY INVOKER` (el propio código de la migración
  `20260810231458` lo razona explícitamente) — no se ha encontrado nada que contradiga esa
  afirmación, se confirma en esta pasada.
- **El Radar de ocupación (`app/api/marketing/hueco/avisar`,
  `app/api/webhooks/twilio-inbound`) no tiene hallazgos nuevos** — es, con diferencia, el
  código mejor blindado que se ha leído en esta pasada: recomputa aforo efectivo y
  candidatas siempre en servidor, filtra por consentimiento RGPD de marketing (el único
  canal de marketing del repo que antes no lo comprobaba, ya corregido con comentario in
  situ), tiene rate-limit propio, cap de envíos y dedup de 24h, y el webhook de Twilio tiene
  verificación de firma HMAC en tiempo constante con fail-closed documentado.

---

# LO QUE NO SE ENCONTRÓ

- **Ninguna escritura optimista sin confirmar** en el motor de sustituciones: cada mutación
  de estado usa compare-and-set (`estado IN (...)` en el WHERE) y trata `0 filas afectadas`
  como "alguien llegó antes", nunca como éxito.
- **Ninguna condición de carrera de doble-reasignación**: la `EXCLUSION CONSTRAINT`
  `sesiones_instructor_sin_solape` (0048) cierra a nivel de Postgres, no de aplicación, el
  caso de dos sustituciones concurrentes reasignando la misma instructora a horarios
  solapados — atrapada con `EXCEPTION WHEN exclusion_violation`, sin dejar la sustitución
  en un estado a medias (el `BEGIN`/`EXCEPTION` anidado hace rollback también del UPDATE de
  `sustituciones`).
- **El token de aceptación (`lib/sustituciones/token.ts`) está bien construido**: HMAC-SHA256
  con comparación en tiempo constante (`timingSafeEqual`), TTL corto (3h) para el scope de
  aceptar, scope separado del de disponibilidad/reportar-baja (un enlace de disponibilidad
  no puede usarse para aceptar una sustitución), y expiración validada dentro del propio
  payload firmado (no depende de un registro server-side que pueda desincronizarse).
- El código de este módulo lleva ya varias rondas de auditoría de producto sobre el propio
  flujo HTTP (P0-1/P0-2/P0-3, comentarios in situ con contexto de por qué cada guardia
  existe) — no se ha encontrado ningún regreso de esos bugs ya cerrados.

---

## Recuento

- 🔴 Críticos: **0**
- 🟠 Importantes: **1** (I-1 — RPC de confirmación de sustitución alcanzable sin pasar por
  ninguna comprobación de rol/candidatura/horario)
- 🟡 Mejoras: **2** (documentadas, no aplicadas)
- Ningún fix aplicado en esta pasada — solo informe, según lo pedido.
