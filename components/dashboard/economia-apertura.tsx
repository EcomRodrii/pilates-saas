'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { authHeader } from '@/lib/api-client';
import type { ResultadoEconomia } from '@/lib/opening/economia';

interface RespuestaEconomia {
  fijosMes: number | null;
  colchon: number | null;
  ivaPct: number;
  sesionesSemanaSinTope: number;
  resultado: ResultadoEconomia;
}

const euros = (n: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
const pct = (x: number) => `${Math.round(x * 100)} %`;
const entero = (n: number) => Math.round(n).toLocaleString('es-ES');

async function pedir(): Promise<RespuestaEconomia | null> {
  try {
    const res = await fetch('/api/opening/economia', { headers: await authHeader() });
    if (!res.ok) return null;
    const d = await res.json() as RespuestaEconomia | null;
    // Sin dar por hecha la forma: un cuerpo raro no puede tumbar la home.
    return d && d.resultado && Array.isArray(d.resultado.filas) ? d : null;
  } catch {
    return null;
  }
}

const aNumero = (s: string): number | null => {
  const t = s.trim().replace(/\./g, '').replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
};

// «¿Cuánto necesito aguantar?» dentro de la tarjeta de apertura. Solo para la
// propietaria (lo decide la home con el mismo criterio que la API y la RLS).
// Nunca da una fecha de equilibrio: sin historial de captación sería inventada.
export function EconomiaApertura() {
  const [abierto, setAbierto] = useState(false);
  const [datos, setDatos] = useState<RespuestaEconomia | null>(null);
  const [cargando, setCargando] = useState(false);
  const [fijos, setFijos] = useState('');
  const [colchon, setColchon] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cargar() {
    setCargando(true);
    const d = await pedir();
    setDatos(d);
    if (d) {
      setFijos(d.fijosMes === null ? '' : String(d.fijosMes));
      setColchon(d.colchon === null ? '' : String(d.colchon));
    } else {
      setError('No se pudo calcular ahora mismo.');
    }
    setCargando(false);
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    const f = aNumero(fijos);
    const c = aNumero(colchon);
    if (Number.isNaN(f) || Number.isNaN(c)) { setError('Escribe solo cifras en euros.'); return; }
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch('/api/opening/economia', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({ fijosMes: f, colchon: c }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null) as { error?: string } | null;
        setError(j?.error ?? 'No se pudo guardar. Inténtalo de nuevo.');
        return;
      }
      await cargar();
    } catch {
      setError('Sin conexión. Inténtalo de nuevo.');
    } finally {
      setGuardando(false);
    }
  }

  const r = datos?.resultado;
  return (
    <div className="mt-3 rounded-xl border border-border bg-background">
      <button
        type="button" aria-expanded={abierto}
        onClick={() => { const a = !abierto; setAbierto(a); if (a && !datos && !cargando) void cargar(); }}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
      >
        <span>
          <span className="block text-[12.5px] font-semibold text-foreground">¿Cuánto necesito aguantar?</span>
          <span className="block text-[11.5px] text-muted-foreground">Cuántas cuotas cubren tus gastos y cuánto dura tu colchón. Solo lo ves tú.</span>
        </span>
        <ChevronDown size={14} className={`shrink-0 text-muted-foreground transition-transform ${abierto ? 'rotate-180' : ''}`} />
      </button>

      {abierto && (
        <div className="space-y-3 border-t border-border px-3 py-2.5">
          {cargando && !datos && <p className="text-[12px] text-muted-foreground">Calculando…</p>}

          <form onSubmit={guardar} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <label className="text-[11.5px] text-muted-foreground">
              Gastos fijos al mes (alquiler, luz, gestoría…)
              <input inputMode="decimal" value={fijos} onChange={e => setFijos(e.target.value)} placeholder="p. ej. 2.400"
                className="mt-1 w-full rounded-lg border border-border bg-card px-2.5 py-1.5 text-[12.5px] text-foreground" />
            </label>
            <label className="text-[11.5px] text-muted-foreground">
              Tu colchón (lo que tienes para aguantar)
              <input inputMode="decimal" value={colchon} onChange={e => setColchon(e.target.value)} placeholder="p. ej. 15.000"
                className="mt-1 w-full rounded-lg border border-border bg-card px-2.5 py-1.5 text-[12.5px] text-foreground" />
            </label>
            <button type="submit" disabled={guardando}
              className="rounded-lg bg-foreground px-3 py-1.5 text-[12.5px] font-medium text-background disabled:opacity-60">
              {guardando ? 'Guardando…' : 'Calcular'}
            </button>
          </form>
          {error && <p role="alert" className="text-[12px] text-destructive">{error}</p>}

          {r && r.faltan.includes('fijos') && (
            <p className="text-[12px] text-muted-foreground">Pon tus gastos fijos al mes para saber cuántas cuotas los cubren.</p>
          )}

          {r && !r.faltan.includes('fijos') && (
            <>
              <dl className="space-y-1 text-[12px]">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Tu equipo al mes (tarifas y horario publicado)</dt>
                  <dd className="tabular-nums text-foreground">{euros(r.costeEquipoMes)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Ya entra al mes ({r.cuotasMensualesVendidas} {r.cuotasMensualesVendidas === 1 ? 'cuota' : 'cuotas'}, sin IVA)</dt>
                  <dd className="tabular-nums text-foreground">{euros(r.ingresoActualMes)}</dd>
                </div>
              </dl>

              <p className="text-[12.5px] font-medium text-foreground">
                {r.deficitMes !== null && r.deficitMes <= 0
                  ? 'Con lo que ya entra cubres tus gastos del mes.'
                  : r.mesesColchon !== null
                    ? `Si no vendes ni una cuota más, tu colchón aguanta ${r.mesesColchon < 1 ? 'menos de un mes' : `${Math.floor(r.mesesColchon)} ${Math.floor(r.mesesColchon) === 1 ? 'mes' : 'meses'}`}.`
                    : `Te faltan ${euros(r.deficitMes ?? 0)} al mes. Pon tu colchón para saber cuánto aguantas.`}
              </p>

              {r.filas.length > 0 ? (
                <ul className="space-y-1.5" aria-label="Cuotas para cubrir gastos">
                  {r.filas.map(f => (
                    <li key={f.id} className="rounded-lg border border-border px-2.5 py-2">
                      <p className="text-[12.5px] text-foreground">
                        <span className="font-semibold">{f.etiqueta}:</span> {f.cuotasEquilibrio} cuotas cubren tus gastos
                        <span className="text-muted-foreground"> ({euros(f.netoCuotaMes)} al mes cada una, sin IVA)</span>
                      </p>
                      {f.ocupacion !== null && (
                        <p className={`mt-0.5 text-[11.5px] ${f.ocupacion > 1 ? 'font-medium text-destructive' : 'text-muted-foreground'}`}>
                          {f.ocupacion > 1
                            ? `Con este horario y estos precios no llegas: harían falta ${entero(f.plazasNecesarias)} plazas al mes y publicas ${entero(f.plazasMes)}.`
                            : `Llenarías el ${pct(f.ocupacion)} de tu horario (${entero(f.plazasNecesarias)} de ${entero(f.plazasMes)} plazas al mes).`}
                        </p>
                      )}
                      {f.ritmoMinimoMes !== null && (
                        <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                          Para cubrir gastos antes de gastar el colchón, suma al menos {f.ritmoMinimoMes} {f.ritmoMinimoMes === 1 ? 'cuota nueva' : 'cuotas nuevas'} al mes.
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[12px] text-muted-foreground">Aún no tienes ninguna cuota mensual a la venta: sin ella no hay un ingreso al mes con el que calcular.</p>
              )}

              <ul className="list-disc space-y-0.5 pl-4 text-[11px] leading-snug text-muted-foreground">
                <li>Precios sin IVA ({datos!.ivaPct} %). Una cuota sin tope semanal se cuenta a {datos!.sesionesSemanaSinTope} clases por semana (lo cambias en «Ajustar previsión»).</li>
                {r.planesNoMensuales > 0 && <li>Bonos y clases sueltas no entran: no dan un ingreso fijo al mes.</li>}
                {r.instructorasSinTarifa > 0 && <li>{r.instructorasSinTarifa === 1 ? 'Una instructora con clases no tiene' : `${r.instructorasSinTarifa} instructoras con clases no tienen`} tarifa: su coste no está contado.</li>}
                {r.hayContratadas && <li>No incluye el coste de empresa (Seguridad Social) de tus instructoras contratadas.</li>}
                <li>No incluye matrícula ni comisiones de cobro. Las fundadoras cuentan al precio que pagan hoy.</li>
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
