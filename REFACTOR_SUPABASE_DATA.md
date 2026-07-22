# Refactor: Dividir `lib/supabase-data.ts` en 3 módulos

**Status:** Ready for implementation  
**Complexity:** High (156 exported functions, 4400 líneas)  
**Risk:** Low (barrel export = 0 breaking changes)  
**Timeline:** ~3-4 PRs (one per module + verification)

---

## Problema actual

`lib/supabase-data.ts` es un god-file:
- **4400 líneas** de código
- **156 funciones exportadas** sin organización lógica
- Imposible hacer unit tests de módulos individuales
- Merge conflicts frecuentes por tamaño
- Cambios pequeños requieren leer/entender todo el archivo

## Solución: 3 módulos especializados

### **1. `lib/supabase/studios.ts`** (~1200 líneas)

**Responsabilidad:** Core multi-tenancy context, mappers, datos críticos

**Incluye:**
- **Context**: `STUDIO_ID`, `setCurrentStudioId()`, `getCurrentStudioId()`, `resolveStudioId()`
- **Helpers**: `dbEscritura()`, `reportDbError()`, `setDbErrorListener()`
- **Mappers** (36 funciones): `mapStudio`, `mapSocio`, `mapReserva`, `mapRecibo`, `mapFactura`, ... (todas las conversion functions de Row → TS)
- **Reverse mappers** (16 funciones): `_socioToDb`, `_reciboToDb`, `_reservaToDb`, ... (todas las conversiones TS → DB)
- **Fetches**:
  - `fetchCriticalStudioData()` — datos necesarios para arrancar UI
  - `fetchDeferredStudioData()` — historial y logs (carga diferida)
  - `fetchAllStudioData()` — union de ambas (para crons)
  - `fetchPublicStudioData()` — datos públicos scopeados por email
  - `studioPublico()` — helper de mapeo público
- **Studio CRUD**:
  - `dbCreateStudio()` — crear estudio nuevo
  - `resolveStudioIdBySlug()` — buscar por slug
  - `dbUpdateStudio()` — actualizar campo por campo
  - `dbUpdateStudioAvatar()` — update avatar
- **Instructor ops**:
  - `dbInsertInstructor()`, `dbUpdateInstructor()`, `dbDeleteInstructor()`, `dbClaimInstructorAccount()`
  - `dbSetTerminalReader()` — datáfono Stripe
- **Integraciones**:
  - `dbGetGoogleCalendarCredenciales()`, `dbSaveGoogleCalendarCredenciales()`, `dbDeleteGoogleCalendarCredenciales()`
  - `dbSetStripeAccountId()`, `dbSetGoogleCalendarEmail()`
- **Auditoría/Crons**:
  - `generarRecordatoriosRevision()` — alertar sobre fichas clínicas a revisar
  - `barrerNoShows()` — marcar no-shows automáticos
  - `enviarRecordatoriosClasesProximas()` — notificaciones de próximas clases

**Dependencias permitidas:** `@sentry`, `supabase`, `db-types`, `types`, `booking-logic`, `bono-logic`, `engines/*`, `ficha-clinica`, `emails/*`, `whatsapp`

---

### **2. `lib/supabase/bookings.ts`** (~1500 líneas)

**Responsabilidad:** Operaciones públicas (reservas, sesiones, citas, recibos)

**Incluye:**
- **Public writes** (server, service-role):
  - `crearReservaPublica()` — crear + validación
  - `cancelarReservaPublica()` — cancelar + devolver bono
  - `registrarSociaPublica()` — signup público
  - `actualizarSociaPublica()` — update perfil
  - `canjearRecompensaPublica()` — canjear reward
- **Public auth**:
  - `socioAutenticado()` — obtener socio de la sesión
  - `resolverSociaAutenticada()` — validar email + id
  - `validarKioskToken()` — validar token de kiosk
  - `checkinPublico()` — check-in en clase pública
- **Sessions CRUD**:
  - `dbInsertSesion()`, `dbInsertSesionesBatch()`, `dbUpdateSesion()`, `dbUpdateSesionesBatch()`, `dbDeleteSesion()`
- **Reservations CRUD**:
  - `dbInsertReserva()` — crear reserva
  - `dbReservarPlaza()` — ocupar un spot
  - `dbCancelarReservaPlaza()` — liberar spot
  - `dbConsumirSesionBono()` — descontar sesión del bono
  - `dbDevolverSesionBono()` — devolver sesión al bono
  - `dbUpdateReserva()` — actualizar estado
- **Appointments CRUD**:
  - `dbInsertCita()`, `dbUpdateCita()`
  - `dbInsertServicioCita()`, `dbUpdateServicioCita()`, `dbDeleteServicioCita()`
  - `dbInsertDisponibilidadCita()`, `dbUpdateDisponibilidadCita()`, `dbDeleteDisponibilidadCita()`
- **Receipts CRUD**:
  - `dbInsertRecibo()`, `dbUpdateRecibo()`, `dbDeleteRecibo()`
- **POS**:
  - `dbInsertVentaPOS()`
- **Notifications**:
  - `dbMarcarNotificacionLeida()`, `dbMarcarNotificacionesLeidas()`
- **Helpers** (server-side):
  - `validarSociaPublica()` — validar id + email
  - `consumirBonoServidor()` — descontar bono atómicamente
  - `devolverBonoServidor()` — devolver bono atómicamente
  - `datosClaseParaEmail()` — armar datos para email transaccional
  - `notificarPromocionEspera()` — enviar email de promoción

**Dependencias permitidas:** `supabase`, `db-types`, `types`, `studios` (para mappers), `booking-logic`, `bono-logic`, `emails/*`, `utils`

**Imports de studios:**
```typescript
import { dbEscritura, reportDbError, getCurrentStudioId, STUDIO_ID } from './studios'
import { 
  _mapSesion, _mapReserva, _mapRecibo, _mapCita, _mapServicioCita,
  _mapDisponibilidadCita, _mapVentaPOS,
  _sesionToDb, _reservaToDb, _reciboToDb, _citaToDb
} from './studios'
```

---

### **3. `lib/supabase/members.ts`** (~1200 líneas)

**Responsabilidad:** Miembros, rewards, achievements, integraciones, equipo

**Incluye:**
- **Socios CRUD**:
  - `dbInsertSocio()`, `dbUpdateSocio()`, `dbDeleteSocio()`
  - `dbFetchSociosPorTag()` — socios con tag específico
- **Custom fields**:
  - `dbFetchCamposPersonalizados()`, `dbInsertCampoPersonalizado()`, `dbUpdateCampoPersonalizado()`, `dbDeleteCampoPersonalizado()`
- **Plans & Subscriptions**:
  - `dbInsertPlanTarifa()`, `dbUpdatePlanTarifa()`, `dbDeletePlanTarifa()`
  - `dbInsertSuscripcion()`, `dbUpdateSuscripcion()`
- **Products POS**:
  - `dbInsertProductoPOS()`, `dbUpdateProductoPOS()`, `dbDeleteProductoPOS()`
- **Preferences**:
  - `dbUpsertPreferenciasSocio()`
- **Rewards** (11 functions):
  - Rules: `dbInsertRewardRule()`, `dbUpdateRewardRule()`, `dbDeleteRewardRule()`
  - Actions: `dbInsertRewardAction()`
  - History: `dbInsertRewardHistory()`
  - Credits: `dbInsertCreditTransaction()`, `dbAjustarCreditos()`
  - Catalog: `dbInsertRewardCatalogItem()`, `dbUpdateRewardCatalogItem()`, `dbDeleteRewardCatalogItem()`
  - Redemptions: `dbInsertRewardRedemption()`, `dbUpdateRewardRedemption()`
  - Claiming: `dbClaimRecompensaUnica()`
  - Member credits: `dbUpsertMemberCredits()`
- **Achievements** (8 functions):
  - `dbInsertAchievementDefinition()`, `dbUpdateAchievementDefinition()`, `dbDeleteAchievementDefinition()`
  - `dbInsertAchievementProgress()`, `dbUpdateAchievementProgress()`
  - `dbInsertAchievementHistory()`
  - `dbInsertLevelDefinition()`, `dbUpdateLevelDefinition()`, `dbDeleteLevelDefinition()`
- **Challenges** (7 functions):
  - Definitions: `dbInsertChallengeDefinition()`, `dbUpdateChallengeDefinition()`, `dbDeleteChallengeDefinition()`
  - Progress: `dbInsertChallengeProgress()`, `dbUpdateChallengeProgress()`
  - History: `dbInsertChallengeHistory()`
- **Community**:
  - `dbListComentariosComunidad()`, `dbAddComentarioComunidad()`
  - `dbListPostsComunidad()` — no en supabase-data.ts, ver si existe
- **Activity & Messaging**:
  - `dbInsertActividadReciente()`
  - `dbInsertMensajeEquipo()`, `dbFetchCanalesEquipo()`, `dbInsertCanalEquipo()`
- **Health records**:
  - `dbInsertCondicionSalud()`, `dbUpdateCondicionSalud()`, `dbDeleteCondicionSalud()`
  - `dbInsertRespuestaSesion()`, `dbUpdateRespuestaSesion()`
- **Internal notes**:
  - `dbInsertNotaInterna()`, `dbUpdateNotaInterna()`, `dbDeleteNotaInterna()`
- **Instructor dependency**:
  - `dbFetchDependencySnapshots()`
- **Templates & Content**:
  - `dbFetchPlantillasEmail()`, `dbUpsertPlantillaEmail()`
  - Videos: `dbInsertVideoOnDemand()`, `dbUpdateVideoOnDemand()`, `dbDeleteVideoOnDemand()`
  - Campaigns: `dbInsertCampana()`, `dbUpdateCampana()`, `dbDeleteCampana()`
  - Automations: `dbInsertAutomatizacion()`, `dbUpdateAutomatizacion()`, `dbDeleteAutomatizacion()`
  - `dbInsertAutomationRule()`, `dbUpdateAutomationRule()`, `dbDeleteAutomationRule()`
  - `dbInsertAutomationLog()`

**Dependencias permitidas:** `supabase`, `db-types`, `types`, `studios` (solo para mappers), `utils`

**Imports de studios:**
```typescript
import { dbEscritura, reportDbError, getCurrentStudioId, STUDIO_ID } from './studios'
import { 
  _mapSocio, _mapCampoPersonalizado, _mapPreferenciasSocio,
  _mapRewardRule, _mapRewardHistory, _mapMemberCredits,
  _mapAchievementDefinition, _mapAchievementProgress,
  _mapLevelDefinition, _mapChallengeDefinition,
  _mapCondicionSalud, _mapNotaInterna, _mapActividadReciente,
  _mapVideoOnDemand, _mapPostComunidad, _mapCampana,
  _socioToDb, _campoToDb, _condicionSaludToDb, etc.
} from './studios'
```

---

### **4. `lib/supabase-data.ts` (actualizado)** — Barrel export

```typescript
// Re-export everything for backward compatibility
export * from './supabase/studios'
export * from './supabase/bookings'
export * from './supabase/members'
```

**Result:** All 256 dependent files work unchanged.

---

## Paso a paso de ejecución

### **PR 1: Extract studios module**

1. Create `lib/supabase/studios.ts` con:
   - Imports, context, helpers
   - All mappers + reverse mappers
   - Fetches (Critical, Deferred, All, Public)
   - Studio CRUD (Create, Update, Avatar, Resolve)
   - Instructor ops
   - Integrations (Google Calendar, Stripe)
   - Audit/Crons

2. Update `lib/supabase-data.ts` → barrel export

3. Run `npx tsc --noEmit` (type check)

4. Verify no circular deps: `grep -r "from './studios'" lib/supabase/ | grep -v '^lib/supabase/bookings\|^lib/supabase/members'` (should be empty)

5. Merge PR 1

### **PR 2: Extract bookings module**

1. Create `lib/supabase/bookings.ts` con:
   - Public writes
   - Public auth
   - Sessions/Reservations CRUD
   - Appointments + Availability
   - Receipts/POS
   - Notifications
   - Helpers

2. Import mappers from studios

3. Update barrel export

4. Type check + circular check

5. Merge PR 2

### **PR 3: Extract members module**

1. Create `lib/supabase/members.ts` con:
   - Socios, Custom fields, Plans, Products
   - Rewards (11 functions)
   - Achievements (8 functions)
   - Challenges (7 functions)
   - Community, Activity, Health, Notes, Templates, Automations

2. Import mappers from studios

3. Update barrel export

4. Type check + circular check

5. Merge PR 3

### **PR 4: Cleanup (optional)**

- Remove original `lib/supabase-data.ts` (now just barrel)
- Update imports in files that directly import internals (rarely happens)
- Verify all 256 files still import from barrel

---

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|-----------|
| Imports circulares | No circular allowed: studios ← bookings/members ✗, bookings/members ← studios ✓ |
| Mappers en 2 módulos | Todos en studios, re-export si es necesario |
| Breaking changes | Barrel export + `export *` = cero cambios en callers |
| Perder funcionalidad | Copy-paste exacto, sin cambios de comportamiento |
| Tests rotos | Todos importan de barrel, tests sin cambios |

---

## Verificación final

```bash
# Type check
npx tsc --noEmit

# Grep for circular imports (should be empty)
grep -r "from './bookings\|from './members'" lib/supabase/{bookings,members}.ts 2>/dev/null | wc -l

# Verify barrel is complete
grep "^export " lib/supabase-data.ts | wc -l  # Should be 3 (one per module)

# Spot-check a few import paths from codebase
grep -r "from '@/lib/supabase-data'" app/ lib/ | head -5
# All should still work without changes
```

---

## Alternativa rápida

Si solo quieres ver el impacto ahora sin hacer 3 PRs:

1. Create **just** `lib/supabase/mappers.ts` (all 36 mappers + 16 reverse mappers)
2. Import en `supabase-data.ts`
3. Reduc `supabase-data.ts` a ~3200 líneas

**Ganancia:** reducción de tamaño, mappers testables aisladamente  
**Esfuerzo:** ~30 mins  
**Risk:** muy bajo (pure extraction)

---

## Quién puede hacer esto

✅ Cualquier engineer con 2-3 horas  
✅ Mejor en worktree separado (ya tienes el setup)  
✅ Una PR por módulo para review incremental

---

**Next:** Pick either:
- Full 3-module refactor (3 PRs, 2-3 hours total)
- Quick mappers-only refactor (30 mins, low risk)

Or wait for another session. Either way, doc is ready.
