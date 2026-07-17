# 03 · Mercado España — compliance fiscal, pagos y Go-To-Market

> Parte 3. El terreno donde Tentare puede ganar o perder de forma estructural. Fuentes primarias: AEAT, AEPD, Redsys, Stripe, RDL 15/2025. Fechas verificadas a jul-2026.

## 1. ⚠️ Corrección crítica que debes interiorizar

Casi todo blog sectorial (y probablemente tu propio material) dice que **Verifactu es obligatorio "1-ene-2026 empresas / 1-jul-2026 autónomos". ESTO ESTÁ OBSOLETO.** El **RDL 15/2025 (2-dic-2025) aplazó los plazos un año.** Fechas vinculantes actuales (nota AEAT, marzo 2026):

- **Fabricantes/distribuidores de software (SIF):** **29-jul-2025** — NO se aplazó. **El software conforme ya debía existir.** → No puedes vender a largo plazo sin capacidad Verifactu; es *table-stakes*, no diferenciador.
- **Empresas (Impuesto de Sociedades):** **1-ene-2027.**
- **Autónomos (IRPF):** **1-jul-2027.**
- **2026 = periodo voluntario de pruebas.**

**Ángulo de venta:** muchos prospectos AÚN creen que es 2026 → esa confusión es una oportunidad. Vende con las fechas correctas (2027) pero explota la urgencia percibida.

## 2. Qué exige realmente la ley (y qué tienes)

**Verifactu / RD 1007/2023:** registros de facturación con integridad, conservación, trazabilidad e **inalterabilidad** → formato estándar, **encadenamiento por hash**, **QR en cada factura**, log de eventos, exportación a AEAT. Dos modos: (a) **Verifactu** (envío en tiempo real a AEAT, sin firma) o (b) **No-Verifactu** (firma electrónica cualificada obligatoria). La mayoría de SaaS eligen modo Verifactu.

- ✅ **Tu `lib/verifactu.ts` + `facturas.sellar` ya implementan hash chain + QR.** Esto es un activo real. **Verifica en producción** que: (1) el encadenamiento es correcto y resistente a huecos de secuencia, (2) el QR cumple el formato AEAT, (3) hay numeración atómica sin duplicados (la auditoría de escalabilidad marcó falta de `UNIQUE` en `facturas.numero_completo` — **confírmalo cerrado**).

**TicketBAI (País Vasco: Álava/Bizkaia/Gipuzkoa)** + **Navarra** (sistema propio espejo de Verifactu): más estrictos (firma en cada factura + envío inmediato). Cobertura nacional = Verifactu (territorio común, ~85% del mercado) + 3 variantes TicketBAI + Navarra. **Lanza con Verifactu; TicketBAI es fase 2.** ⚠️ **Timp y Eversports ya publicitan TicketBAI** → contra ellos no tener TicketBAI es una desventaja, no paridad.

**IVA:** general **21%** para estudios comerciales (SL/autónomo). Exención art. 20.Uno.13º LIVA **solo para entidades sin ánimo de lucro** — un estudio boutique NO aplica. (Propuesta PP de bajar a 10% sin fecha de voto → mantén un flag de configuración por si cambia; ya tienes `iva_por_defecto`/`tipo_iva`.) **Facturas simplificadas ("tickets")** válidas ≤400€ — caso típico de recibo de clase suelta; deben pasar igualmente por Verifactu.

## 3. Pagos: el modelo español que debes soportar

| Método | Uso correcto | Estado en Tentare |
|--------|--------------|-------------------|
| **SEPA Core (recibo domiciliado)** | **Backbone de la mensualidad**. Mandato firmado (IBAN, ref. única, tipo). Devolución 8 semanas / 13 meses no autorizado. | ⚠️ **Verifica**: ¿gestionas mandatos SEPA y dunning de impagos? Es lo que esperan los estudios españoles y es el flujo de cobro nº1. Hoy tu foco parece tarjeta (Stripe Connect). **Hueco probable prioritario.** |
| **Bizum** | **Pagos puntuales**: clase suelta, compra de bono, primer pago. **NO recurrente.** 28,8M usuarios, ~50% de transferencias ES. Stripe lo soporta nativo. | ⚠️ Tu POS lista "Bizum" como método → **confirma que es Bizum real (Stripe/Redsys) y no solo una etiqueta manual de caja.** |
| **Tarjeta on-file** | Recurrente (alternativa a SEPA) | ✅ Stripe Connect off-session |
| **Datáfono/TPV** | Presencial | ✅ Stripe Terminal (WisePOS E) |

**Diseño obligado:** Bizum/tarjeta para el primer pago y bonos; **SEPA CORE o tarjeta on-file para la mensualidad recurrente**. Casa tu motor de recurrencia con el fiscal (factura hasheada + QR por ciclo) — es el punto de integración que las tools genéricas fallan.

## 4. RGPD / datos de salud (tu ficha clínica)

Los datos de tu **ficha clínica** (lesiones, embarazo, condiciones) son **categoría especial art. 9 RGPD** → **consentimiento explícito** obligatorio (casilla afirmativa, no tácito), con registro de auditoría. Tu SaaS debe ayudar al estudio a: registro de actividades de tratamiento, consentimiento por finalidad, y derechos del interesado. **Ángulo de venta fuerte vs Mindbody (US):** datos alojados en UE + DPA español limpio.
- ⚠️ **Verifica**: ¿la ficha clínica captura consentimiento explícito con timestamp/auditoría antes de guardar condiciones de salud? Si no, es un riesgo legal directo Y una feature de venta desaprovechada.

## 5. El "wedge" competitivo real (con matiz honesto)

La premisa "los competidores extranjeros no cumplen fiscalidad española" es **parcialmente cierta pero erosionándose**:

- **Eversports:** ✅ ya tiene Verifactu **Y** TicketBAI (vía Fiskaly, **de pago**, solo centros ES, NIF no autoeditable). → No es incumplimiento; es *bolt-on de pago*. Tu ángulo: **"compliance nativo, incluido, sin add-on"**.
- **bsport:** ❌ sin evidencia pública de Verifactu/TicketBAI nativo (requiere ERP). **Verifícalo con una demo antes de afirmarlo en público.**
- **Mindbody:** ❌ sin evidencia; además soporte en inglés y caro. El objetivo más blando.
- **Deporwin (ES):** ✅ cumple SIF+Verifactu — un local ya lo tiene.

**Posición defendible (no "compliance" a secas, que se está igualando):**
> **Verifactu/TicketBAI nativo + incluido + Bizum + SEPA CORE + comisiones de tarjeta bajas + soporte humano en español < 3h.**

Ese paquete combinado, no una sola pieza, es tu foso local. La pieza más débil hoy probablemente es **SEPA CORE con gestión de mandatos y dunning** — priorízala (archivo 06).

## 6. Go-To-Market — lectura brutal

- **Ventaja de precio real** (€29-149 vs €150+/feature de bsport, €49-229 de Eversports). Pero **cobras desde el día 1 sin trial** → fricción de adquisición máxima en un mercado donde TeamUp/PushPress/Gymdesk regalan trial/free tier. **Añade trial de 14-30 días o free tier limitado.**
- **No tienes canal de adquisición.** Eversports/Mindbody/Vagaro tienen **marketplace de consumidor** que genera leads. Tú no. Opciones: (a) construir marketplace es caro y lento; (b) mejor — **posiciónalo como virtud** ("sin marketplace que compita con tu marca", como Walla) y compensa con **integraciones de agregadores** (Wellhub/ClassPass/Urban Sports) que hoy son stubs, y con **migración asistida gratis** como gancho de switching.
- **Momento de switching regalado:** el cierre de **Fitogram (dic-2024)** dejó estudios boutique huérfanos migrando a Eversports, algunos resentidos por el cambio de precio. Y cada subida del 70% de Glofox/44% de Timp es un lead.
- **Mensaje central recomendado (en español, para el dueño de estudio):** *"El software de gestión que sí habla tu idioma: Verifactu incluido, Bizum y recibos SEPA, precio público sin permanencia, y soporte humano que responde el lunes a primera hora — no un chatbot en inglés."*
