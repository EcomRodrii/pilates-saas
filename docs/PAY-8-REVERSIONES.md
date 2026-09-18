# PAY-8: Reversión de Dobles Cobros Detectados

## Resumen

PAY-8 implementa una UI completa para la reversión manual de dobles cobros detectados por PAY-5/6. Permite a la propietaria:

1. **Ver tabla de dobles cobros** detectados en `/billing/dobles-cobros`
2. **Filtrar** por estado (PENDIENTE_REVISION, CONFIRMADO, RESUELTO, FALSO_POSITIVO)
3. **Revertir** cada doble cobro por uno de dos caminos:
   - **Crédito**: suma a sus bonos para usar en la próxima clase
   - **Reembolso a tarjeta**: devuelve el dinero al payment_intent original (3-5 días)

## Archivos Nuevos

### Lógica de negocio
- `lib/billing/revertir-doble-cobro.ts` — funciones de creación de crédito/refund
- `lib/billing/revertir-doble-cobro.test.ts` — tests unitarios (15 tests ✓)

### Endpoints
- `app/api/billing/dobles-cobros/revertir/route.ts` — POST para procesar reversión

### Componentes React
- `components/billing/dobles-cobros-table.tsx` — tabla con datos y filtros
- `components/billing/modal-revertir.tsx` — modal de confirmación
- `app/billing/dobles-cobros/page.tsx` — página principal

### Hooks
- `lib/hooks/use-revertir-doble-cobro.ts` — hook de mutación para hacer fetch

### Tests E2E
- `e2e/doble-cobro-reversion.spec.ts` — 7 tests Playwright

## Flujo de Reversión

```
1. Propietaria abre /billing/dobles-cobros
   ↓
2. Ve tabla de dobles_cobros_detectados en PENDIENTE_REVISION
   ↓
3. Click "Revertir" en una fila
   ↓
4. Modal muestra:
   - Recibo, socia, importe
   - Radio group: Crédito (default) o Reembolso
   - Textarea: notas opcionales
   ↓
5. Click "Confirmar reversión"
   ↓
6. POST /api/billing/dobles-cobros/revertir
   ├─ Si crédito: INSERT suscripción de bono
   ├─ Si refund: stripe.refunds.create()
   └─ UPDATE dobles_cobros_detectados → RESUELTO
   ↓
7. Modal cierra, tabla se recarga
   ↓
8. Fila ahora muestra estado RESUELTO (botón deshabilitado)
```

## Validaciones

El flujo hace check en tres niveles:

### Cliente (React)
- Radio group obliga elegir uno de dos tipos
- Botón deshabilitado si estado === 'RESUELTO'
- Muestra error si la llamada falla

### Servidor (API route)
- Permiso: solo `puedeMoverDinero` (PROPIETARIO)
- Estado: solo `PENDIENTE_REVISION` puede procesarse
- Importe: debe ser > 0
- Payment intent: debe existir (para refunds)

### Base de datos (RLS)
- Escritura en `dobles_cobros_detectados`: solo `service_role`
- Lectura: solo si `studio_id` es el actual
- Escritura en `suscripciones`: solo `service_role`
- Escritura en refunds (Stripe): autenticada, pero sin RLS (webhook)

## Integración con Stripe

**Crédito:** No toca Stripe, solo crea suscripción local

**Refund:**
```typescript
await stripe.refunds.create({
  payment_intent: 'pi_xxx',
  amount: 2950, // centimos
  metadata: {
    doble_cobro_detectado_id: 'ddc-xxx',
    studio_id: 'studio-xxx',
    socio_id: 'socio-xxx',
  },
})
```

El webhook `stripe.charge.refunded` ya escucha refunds (PAY-4), así que no hay código nuevo en webhooks.

## Metadatos Guardados

Cuando se resuelve, `dobles_cobros_detectados.metadata` se actualiza a:

```json
{
  "tipo_resolucion": "credito|refund",
  "credito_id": "suscripcion-xxx",  // si tipo = credito
  "refund_id": "re_xxx"             // si tipo = refund
}
```

Y `dobles_cobros_detectados.revisado_por` y `.resuelto_en` se rellenan.

## Tests

### Unitarios (node --test)
- 15 tests en `revertir-doble-cobro.test.ts` ✓
- Cálculos de importe, conversiones EUR↔centimos, validaciones, idempotencia

### E2E (Playwright)
- 7 tests en `doble-cobro-reversion.spec.ts`
  1. Flujo completo: crear crédito
  2. Flujo refund: Stripe
  3. Validación: botón deshabilitado si RESUELTO
  4. Error handling: Stripe rechaza refund
  5. Filtro: solo PENDIENTE_REVISION
  6. Permiso: solo PROPIETARIO
  7. Recarga: tabla se actualiza

## Decisiones de Diseño

**¿Por qué crédito por defecto?**
- Es la opción "segura" (no toca Stripe, local)
- La propietaria puede cambiar a refund si prefiere
- Refund exige que haya un payment_intent válido

**¿Por qué no crear automáticamente el crédito?**
- Una reversión es una acción humana (no automática)
- La propietaria debe revisar y decidir el camino
- Evita devolver dinero mal (idempotencia: solo si lo revisó)

**¿Por qué no una página nueva de "gestión de reembolsos"?**
- Los dobles cobros son un caso muy específico
- Una página dedicada sería bulto
- La tabla es simple: 7 columnas, filtro, 1 acción

## Límites Conocidos

1. **Sin sincronización hacia atrás**: si una propietaria crea un crédito local y luego crea un refund en Stripe dashboard directamente, no hay detección de "duplicación" — cada reversión es independiente

2. **Sin auditoría de "quién aprobó"**: solo guarda `revisado_por` (email), no hay log de "intentó refund y falló"

3. **Sin re-intento automático**: si Stripe rechaza un refund (tarjeta expirada, etc), la propietaria debe reintentarlo manualmente

Estos límites son aceptables para MVP (PAY-8 es un MVP).

## Checklist de Prueba Manual

- [ ] Entrar como propietaria
- [ ] Ir a `/billing/dobles-cobros`
- [ ] Ver tabla cargada (si hay dobles)
- [ ] Click filtro, seleccionar "PENDIENTE_REVISION"
- [ ] Tabla solo muestra 1-2 filas
- [ ] Click "Revertir" en una fila
- [ ] Modal se abre, datos correctos
- [ ] Dejar "Crear crédito" seleccionado
- [ ] Escribe nota opcional
- [ ] Click "Confirmar reversión"
- [ ] Esperar 2-3 segundos
- [ ] Modal cierra
- [ ] Tabla recarga, fila ahora dice "Resuelto"
- [ ] Botón en esa fila ahora está disabled
- [ ] Repetir con "Reembolso a tarjeta" (con Stripe test key)
