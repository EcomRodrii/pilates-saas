import { PosTerminal } from '@/components/pos/pos-terminal';

// ─────────────────────────────────────────────────────────────────────────────
// Caja / TPV.
//
// Estuvo congelada desde el feature-freeze de PMF (2026-07-23) y se ha
// reactivado con el rediseño server-authoritative: la venta ya no la escribe el
// navegador, la registra `registrar_venta_pos` releyendo el catálogo. El
// historial de por qué estaba congelada sigue en docs/FEATURE-FREEZE-2026-07.md.
//
// El guardia de rol NO vive aquí: `puedeVer(rol, '/pos')` lo aplica
// dashboard-shell, y las rutas de servidor vuelven a comprobarlo con
// `puedeMoverDinero`/`puedeVerFinanzas` — la pantalla nunca es el límite.
// ─────────────────────────────────────────────────────────────────────────────
export default function Page() {
  return <PosTerminal />;
}
