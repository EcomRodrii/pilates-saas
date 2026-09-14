# Auditoria de seguridad - 57a pasada (2026-09-11)

## Area elegida: Panel interno Tentare (/interno, app/api/interno/**)

Backoffice de la propia empresa Tentare: cruza datos de TODOS los estudios con
service_role (MRR real via Stripe, ficha completa de cada estudio, moderacion
de Tentare Network incluyendo documentos de identidad, alta/baja del equipo
interno, envio de campanas de prospeccion en frio, changelog de producto). Es
la superficie con mas alcance del repo -- cualquier fallo aqui no afecta a un
tenant, afecta a todos a la vez -- y no habia sido el foco de ninguna de las 56
pasadas previas (solo mencionado de pasada en memoria como "MRR de Stripe").
De paso se reviso /api/exportar/mis-datos (exportacion CSV bajo demanda,
mismo tipo de superficie "un solo endpoint toca datos de todo el estudio").

## Resumen ejecutivo

Se auditaron los 30 endpoints de app/api/interno/**, el guardia de
autorizacion (lib/interno/auth.ts), el catalogo de permisos
(lib/interno/permisos.ts), las reglas de alta/baja del propio equipo interno
(lib/interno/equipo-reglas.ts), la politica de Storage del bucket de
documentos de identidad, y los GRANT de las RPC SECURITY DEFINER que sirven
a esas pantallas (plataforma_equipo, plataforma_uid_por_email). Se
verifico en vivo (solo lecturas, sin BEGIN/mutaciones) contra
dwqvdycjcffqwfkzapvi.

RESULTADO: 0 hallazgos criticos, 0 importantes, 1 menor. Es la pasada con
menos hallazgos de las ultimas auditorias -- el area esta en un estado de
higiene notablemente mejor que la media historica del repo, con patrones
que valdria la pena replicar en otras zonas:

- Autorizacion por PERMISO explicito (no por rol), un unico guardia
  (exigirPermiso/exigirAlguno) reutilizado en las 30 rutas sin excepcion,
  verificado con grep exhaustivo.
- Autoservicio del propio equipo interno (dar de alta/baja/cambiar permisos)
  con cuatro reglas puras y testeadas aparte (equipo-reglas.ts): nadie se
  edita a si mismo, no se concede lo que no se tiene, los permisos
  "solo CEO" (studios.delete, users.delete, admin.full) no se delegan, y
  nunca puede quedar la plataforma sin ningun admin.full activo.
- El bucket de documentos de identidad (red-documentos-identidad) no tiene
  NINGUNA politica de SELECT para anon/authenticated -- verificado en vivo
  (pg_policies) -- solo service_role puede leerlo, y solo tras
  exigirPermiso(req, 'network.moderate'); el INSERT de subida esta acotado
  por RLS a la propia carpeta del usuario (storage.foldername(name)[1] =
  auth.uid()).
- Las tablas plataforma_admin/plataforma_permiso/plataforma_auditoria
  tienen RLS activada SIN ninguna politica -- verificado en vivo que ni anon
  ni authenticated tienen privilegio SELECT/INSERT/UPDATE directo
  (has_table_privilege): la unica via de acceso es el service_role que usa
  el propio backoffice tras pasar exigirPermiso.
- Las dos RPC SECURITY DEFINER que estas rutas invocan (plataforma_equipo,
  plataforma_uid_por_email) estan correctamente bloqueadas a
  anon/authenticated (has_function_privilege = false para ambos, solo
  service_role) -- si hubieran heredado el grant por defecto a PUBLIC (el
  gotcha ya documentado varias veces en este repo), cualquier socia o
  instructora con sesion habria podido llamarlas directo via PostgREST y
  listar el email de todo el equipo interno de Tentare.

## Hallazgos

### MENOR -- permisos declarados sin ningun endpoint que los use

lib/interno/permisos.ts declara billing.refund, plans.update y
studios.delete como permisos asignables (aparecen en PERMISOS,
PERMISO_ETIQUETA, PERMISOS_POR_AREA, y studios.delete/billing.refund
ademas en PERMISOS_PELIGROSOS/PERMISOS_SOLO_CEO). Un grep sobre
app/api/interno/** no encuentra ningun exigirPermiso(req, 'billing.refund')
ni 'plans.update' ni 'studios.delete' -- no existe endpoint de reembolso,
de edicion de planes de precio ni de borrado de estudio en el backoffice. El
comentario de app/api/interno/estudios/[id]/acciones/route.ts lo confirma
como decision de producto ("nada de acciones que solo Stripe sabe hacer bien
... el panel enlaza a Stripe en vez de duplicar una superficie").

No es una vulnerabilidad -- no hay ninguna puerta que abran, asi que no hay
nada que explotar -- pero si es la misma categoria de problema que el propio
codigo ya identifico y cerro para users.create/users.delete (comentario en
app/api/interno/equipo/route.ts: "eran permisos declarados que no cerraban
ninguna puerta"). Riesgo real: alguien concede billing.refund a Finanzas (el
preset Finanzas lo incluye) creyendo que asi puede devolver dinero desde el
panel, y no puede -- o al reves, alguien audita accesos, ve billing.refund
concedido a una persona y sobreestima lo que esa persona puede tocar. Ninguno
de los dos casos mueve dinero ni datos por si solo.

Recomendacion (no aplicada, fuera de alcance de esta pasada de solo
auditoria): o se retiran del catalogo hasta que exista el endpoint real, o se
documenta explicitamente en permisos.ts que son "reservados, sin puerta
todavia" -- mismo criterio que ya se aplico para dejar de fingir en
users.create/users.delete.

## Checklist de lo verificado

- [x] Los 30 route.ts de app/api/interno/** -- todos pasan por
      exigirPermiso/exigirAlguno antes de tocar datos, sin excepcion (grep
      exhaustivo, no solo lectura de una muestra).
- [x] verificarAdminInterno valida el JWT contra gotrue
      (supabase.auth.getUser(token), no un decode local) y exige fila activa
      en plataforma_admin -- un usuario de un estudio normal, por legitimo
      que sea, no pasa este filtro nunca.
- [x] Reglas de autoservicio del equipo interno (equipo-reglas.ts): las
      cuatro reglas (no auto-edicion, no conceder lo que no se tiene,
      permisos solo-CEO no delegables, nunca 0 admin.full activos) estan
      implementadas y se aplican tanto en el alta (POST) como en el cambio
      (PATCH [userId]) -- releidas linea a linea, no solo por nombre de
      funcion.
- [x] app/api/interno/equipo/[userId]/route.ts (PATCH): el permiso exigido
      depende de la ACCION real (users.delete solo si de verdad da de baja,
      users.create para el resto), y se aplica el orden "quitar primero,
      anadir despues" para que un fallo a mitad deje menos acceso, nunca mas.
- [x] Bucket red-documentos-identidad: public = false, sin policy de SELECT
      para anon/authenticated (verificado con pg_policies en vivo), policy
      de INSERT acotada a la propia carpeta del usuario. El unico camino de
      lectura es
      app/api/interno/network/verificaciones-identidad/documento/route.ts,
      gateado por network.moderate, con URL firmada de 5 minutos.
- [x] RLS de plataforma_admin/plataforma_permiso/plataforma_auditoria:
      activada, sin policies, sin privilegio directo para anon/authenticated
      (has_table_privilege, verificado en vivo) -- el acceso cross-tenant de
      estas tablas solo es alcanzable via service_role dentro de las rutas
      ya gateadas.
- [x] GRANT de plataforma_equipo() y plataforma_uid_por_email()
      (SECURITY DEFINER, invocadas desde el backoffice): has_function_privilege
      confirma false para anon y authenticated, true solo para service_role
      -- no heredan el gotcha de grants ya documentado varias veces en este
      repo (firma nueva -> EXECUTE por defecto a PUBLIC).
- [x] app/api/interno/estudios/route.ts y kpis/route.ts: usan catalogo()
      (paginacion explicita) para las tablas que agregan TODOS los estudios,
      evitando el corte silencioso de PostgREST en 1000 filas que ya causo
      falsos negativos en otras zonas del repo.
- [x] app/api/interno/estudios/[id]/acciones/route.ts (cambiar plan,
      suspender, reactivar, activar Review Boost manual): exige
      studios.update, lee el estado "antes" y audita ambos lados; el cambio
      de plan rechaza explicitamente estudios que pertenecen a una cadena
      (el plan real vive en cadenas.plan, hallazgo ya cerrado en la 37a
      pasada segun su propio comentario).
- [x] app/api/interno/wallets/registrar-dominios/route.ts: registra
      dominios de Apple/Google Wallet SOLO sobre la cuenta Stripe Connect
      del propio estudio leido de stripe_account_id -- sin cruce entre
      estudios, protegido por studios.update.
- [x] app/api/interno/prospeccion/enviar/route.ts: solo encola correos ya
      en estado APROBADO (flujo borrador -> aprobado previo), no permite
      enviar a direcciones arbitrarias fuera de esa cola.
- [x] app/api/interno/changelog/imagen/route.ts: el nombre de fichero en
      Storage lo genera el servidor (crypto.randomUUID()), nunca el nombre
      original del cliente -- sin path traversal ni colision posible.
- [x] app/api/exportar/mis-datos/route.ts: exige rol PROPIETARIO en
      servidor (no confia en la UI), filtra todas las tablas por
      studio_id = sesion.studioId, usa catalogo() paginado, y tiene
      rate-limit propio (20/60s) -- descartado como candidato a hallazgo, ya
      esta bien construido.
- [x] get_advisors (security): los unicos avisos sobre plataforma_* son
      "RLS enabled, no policy" en nivel INFO -- comportamiento esperado y
      deliberado (default-deny), no un hallazgo nuevo. El resto de avisos
      (SECURITY DEFINER ejecutable por anon/authenticated) ya esta cerrado
      como intencional desde la 49a pasada; no se encontro ninguna funcion
      nueva sin explicar en esa lista.

## Descartado (evaluado, sin superficie real de hallazgo)

- billing.refund/plans.update/studios.delete como vector de escalada: no se
  pudo escalar nada porque no existe ningun endpoint que los consuma -- ver
  hallazgo menor arriba, es un problema de catalogo, no de acceso.
- Impersonacion de estudio desde /interno: no existe ningun mecanismo de
  "entrar como" un estudio o generar una sesion de esa propietaria desde el
  backoffice -- las acciones sobre un estudio (acciones/route.ts) son todas
  mutaciones directas y auditadas, nunca un login prestado.

## Conclusion

El panel interno de Tentare, la superficie de mayor alcance del repo (cruza
todos los tenants a la vez), esta construido con el patron correcto desde el
principio: un unico guardia de autorizacion por permiso explicito, reutilizado
sin excepcion en 30 rutas, con las tablas y RPC que lo sostienen bloqueadas por
defecto y verificadas en vivo. No hay nada critico que requiera accion
inmediata. El unico hallazgo (menor) es de higiene de catalogo -- tres
permisos que no abren ninguna puerta todavia -- y no representa riesgo
explotable hoy.
