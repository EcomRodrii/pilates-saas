'use client';

// ─────────────────────────────────────────────────────────────────────────────
// «¡Felicidades!» cuando un estudio gratis pasa de 150
// reservas al mes (reglas en lib/billing/plan-gratis.ts y felicidades.ts).
//
// Pasarse del plan gratis es una buena noticia, no una multa: sale con confeti y
// una frase bonita, y debajo, el plan de pago listo para contratar en UN clic
// (va directo a Stripe; si Stripe aún no está listo, a /suscripcion).
//
//  · Solo la propietaria, solo mientras corre el margen y una sola vez por cada
//    vez que se pasa (la marca se guarda en este navegador, por fecha de cierre).
//  · Cerrar el diálogo no cambia nada: el margen sigue contando y /suscripcion
//    sigue enseñando el uso.
//  · Todo sale de /api/billing/status, que ya comparte petición con el marco del
//    panel (`unaVez`): esto no añade ninguna llamada.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PartyPopper } from 'lucide-react';
import { estadoBilling, iniciarSuscripcion, type EstadoBilling } from '@/lib/api-client';
import { PLAN_INFO } from '@/lib/billing/entitlements';
import { textoLimites } from '@/lib/billing/plan-gratis';
import { QueCambia } from '@/components/billing/plan-gratis';
import { AL_PAGAR_FOUNDING } from '@/lib/landing/founding-gratis';
import { claveFelicidadesVista, fraseDeFelicidades, tocaFelicitar } from '@/lib/billing/felicidades';
import { vistaPreviaSolicitada } from '@/lib/growth/vista-previa';
import { TZ_ESTUDIO, hoyEnEstudio, masDias } from '@/lib/utils';
import { Confeti } from '@/components/demo/Confeti';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

const fechaLarga = (ymd: string) =>
  new Date(`${ymd}T12:00:00Z`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', timeZone: TZ_ESTUDIO });

function yaVista(cierraEl: string): boolean {
  try { return localStorage.getItem(claveFelicidadesVista(cierraEl)) === '1'; } catch { return false; }
}
function marcarVista(cierraEl: string) {
  try { localStorage.setItem(claveFelicidadesVista(cierraEl), '1'); } catch { /* sin almacenamiento: puede repetirse */ }
}

export function FelicidadesCrecimiento() {
  const [estado, setEstado] = useState<EstadoBilling | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [contratando, setContratando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Vista previa (`?vista-previa=felicidades`): se enseña con cifras de ejemplo y no escribe, guarda ni cobra nada.
  const [vistaPrevia, setVistaPrevia] = useState(false);

  useEffect(() => {
    let vivo = true;
    void estadoBilling().then(e => {
      if (vivo && e?.esPropietaria && vistaPreviaSolicitada(window.location.search) === 'felicidades') {
        const cierra = masDias(hoyEnEstudio(), 20);
        setEstado({
          ...e,
          gratis: {
            fase: 'MARGEN', uso: { alumnasActivas: 80, reservas30Dias: 151 }, motivos: ['reservas'],
            diasRestantes: 20, cierraEl: cierra, limites: { reservasMes: 150 }, margenDias: 30,
          },
        });
        setVistaPrevia(true);
        setAbierto(true);
        return;
      }
      if (!vivo || !e?.gratis) return;
      const g = e.gratis;
      if (!tocaFelicitar({ fase: g.fase, esPropietaria: e.esPropietaria, cierraEl: g.cierraEl, yaVista: g.cierraEl ? yaVista(g.cierraEl) : true })) return;
      setEstado(e);
      setAbierto(true);
    }).catch(() => undefined);
    return () => { vivo = false; };
  }, []);

  const g = estado?.gratis;
  if (!estado || !g || !g.cierraEl) return null;
  const cierraEl = g.cierraEl;

  function cerrar() {
    if (!vistaPrevia) marcarVista(cierraEl);
    setAbierto(false);
  }

  async function contratar() {
    // En la vista previa «contratar» no abre ningún pago: solo cierra.
    if (vistaPrevia) { setAbierto(false); return; }
    setError(null);
    setContratando(true);
    const r = await iniciarSuscripcion('BASE');
    if ('url' in r) { window.location.assign(r.url); return; }
    setError(r.error);
    setContratando(false);
  }

  const precio = PLAN_INFO.BASE.precioMes;

  return (
    <Dialog open={abierto} onOpenChange={(v) => { if (!v) cerrar(); }}>
      {abierto && <Confeti zIndex={9999} />}
      {/* La forma de los diálogos del admin de Shopify: título arriba, contenido y botones abajo a la derecha. */}
      <DialogContent className="flex flex-col gap-0 overflow-hidden rounded-[20px] p-0 sm:max-w-2xl" data-testid="felicidades-crecimiento">
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-5 py-3.5">
          <PartyPopper size={18} aria-hidden style={{ color: 'var(--success)' }} />
          <DialogTitle className="text-[16px] font-semibold tracking-tight">¡Felicidades!</DialogTitle>
        </div>

        {/* Lo único que se desliza: título y botones quedan siempre a la vista, también en un móvil bajo. */}
        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto px-5 py-4">
          <DialogDescription className="text-[14px] leading-relaxed text-foreground text-pretty">
            Tu estudio ha pasado de {textoLimites(g.motivos)}. Eso solo pasa cuando la gente vuelve.
          </DialogDescription>
          <p className="text-[13px] italic leading-relaxed text-muted-foreground text-pretty">{fraseDeFelicidades(cierraEl)}</p>
          <div className="flex items-baseline justify-between gap-3 pt-1">
            <p className="text-[15px] font-semibold text-foreground">Founding Studio</p>
            <p className="text-[22px] font-semibold text-foreground tabular-nums">{precio} €<span className="text-[12.5px] font-medium text-muted-foreground">/mes</span></p>
          </div>
          <QueCambia compacta />
          <p className="text-[13px] leading-relaxed text-muted-foreground text-pretty">
            Sin límite de clientes ni de reservas. {AL_PAGAR_FOUNDING} Tienes hasta el {fechaLarga(cierraEl)} para dar el paso; mientras tanto, nada cambia.
          </p>
          {error && <p role="alert" className="text-[12.5px] font-semibold text-destructive">{error}</p>}
          {vistaPrevia && <p className="text-[11.5px] text-muted-foreground">Vista previa con cifras de ejemplo: no se guarda ni se cobra nada.</p>}
        </div>

        <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-border px-5 py-3.5">
          <button type="button" onClick={cerrar} className="h-9 rounded-full bg-muted px-4 text-[13px] font-medium text-foreground hover:brightness-95">
            Ahora no
          </button>
          {estado.configurado ? (
            <button type="button" onClick={() => void contratar()} disabled={contratando} data-testid="felicidades-contratar"
              className="inline-flex h-9 items-center justify-center rounded-full bg-foreground px-4 text-[13px] font-medium text-background disabled:opacity-60">
              {contratando ? 'Abriendo el pago…' : `Seguir creciendo · ${precio} €/mes`}
            </button>
          ) : (
            <Link href="/suscripcion" onClick={cerrar}
              className="inline-flex h-9 items-center justify-center rounded-full bg-foreground px-4 text-[13px] font-medium text-background">
              Ver el plan · {precio} €/mes
            </Link>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
