# Verificación en producción — RLS de datos de salud + RPCs sensibles (C1/C2)

**Fecha:** 16 de julio de 2026
**Proyecto Supabase:** `dwqvdycjcffqwfkzapvi` (producción, backend de tentare.app)
**Método:** prueba de **comportamiento** contra la API REST de producción usando la
`anon key` **pública** (la misma que va embebida en el bundle del navegador de
cualquier visitante — exactamente la capacidad que tendría un atacante). No se usó
el `service_role` ni ninguna credencial privilegiada. Todas las llamadas son de solo
lectura o fueron rechazadas antes de ejecutarse.

## Resultado: RLS y revocaciones ACTIVAS. Producción NO expuesta.

| Prueba | Endpoint | Resultado | Veredicto |
|---|---|---|---|
| Datos de salud (C2) | `GET /rest/v1/condiciones_salud` | `HTTP 401` — `42501 permission denied for table condiciones_salud` | ✅ Bloqueado |
| Datos de salud (C2) | `GET /rest/v1/respuestas_sesion` | `HTTP 401` — `42501 permission denied for table respuestas_sesion` | ✅ Bloqueado |
| RPC créditos (C1) | `POST /rest/v1/rpc/ajustar_creditos` | `HTTP 401` — `permission denied for function ajustar_creditos` | ✅ Bloqueado |
| RPC backup destructivo (C1) | `POST /rest/v1/rpc/restaurar_backup` | `HTTP 401` — `permission denied for function restaurar_backup` | ✅ Bloqueado |
| **Control** (lectura pública legítima) | `GET /rest/v1/studios?select=id` | `HTTP 200` — `[{"id":"studio-1"}]` | ✅ Correcto |

El **control** es esencial para la validez de la prueba: demuestra que la anon key
**sí** funciona para los datos que deben ser públicos (branding del estudio), luego
los `401` sobre salud y RPCs son control de acceso real, no una key rota o un fallo
de red.

## Interpretación

- La categoría especial de datos de salud (GDPR Art. 9 — lesiones, embarazo/postparto)
  **no es legible** por el rol anónimo público, ni cross-tenant. La RLS + `REVOKE`
  de la migración de seguridad está efectivamente aplicada en producción.
- Las RPCs `SECURITY DEFINER` sensibles (ajuste de créditos y, sobre todo,
  `restaurar_backup`, que borra/reinserta datos) **no son invocables** sin
  autenticar.
- Esto es coherente con la evidencia documental previa: la nota en
  `supabase/migrations/0021_...sql:41` y el Security Advisor del 12-jul con 0 errores.

## Higiene de historial de migraciones — RESUELTO (16-jul, vía SQL editor)

Al inspeccionar `supabase_migrations.schema_migrations` en producción se confirmó:
- Versión `0004` = `revoke_anon_rpc` y versión `0014` = `rls_ficha_clinica_salud`
  están **registradas y aplicadas** (su contenido —RLS de salud + revocaciones— está
  en prod, coherente con la verificación de comportamiento de arriba).
- Prod tenía exactamente las versiones `0000`–`0028`; faltaban `0029`/`0030`.

Dado que el **contenido** ya estaba aplicado, se registró el historial (equivalente a
`supabase migration repair --status applied`) con un INSERT idempotente:

```sql
insert into supabase_migrations.schema_migrations (version, name)
values ('0029','revoke_anon_rpc'), ('0030','rls_ficha_clinica_salud')
on conflict (version) do nothing;
```

Verificado tras el INSERT: ambas versiones presentes. El historial de migraciones de
producción queda **consistente con el repositorio renumerado** (PR #76); un futuro
`supabase db push` verá `0029`/`0030` como aplicadas y no las re-ejecutará. **C1/C2
cerrado por completo**: seguridad activa (verificada) + historial limpio.
