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
      <DialogContent className="sm:max-w-md" data-testid="felicidades-crecimiento">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full" style={{ backgroundColor: 'color-mix(in srgb, var(--success) 14%, var(--card))', color: 'var(--success)' }} aria-hidden>
            <PartyPopper size={28} />
          </span>
          <DialogTitle className="text-[24px] font-extrabold tracking-tight">¡Felicidades!</DialogTitle>
          <DialogDescription className="text-[14.5px] leading-relaxed text-foreground text-pretty">
            Tu estudio ha pasado de {textoLimites(g.motivos)}. Eso solo pasa cuando la gente vuelve.
          </DialogDescription>
          <p className="text-[14px] italic leading-relaxed text-muted-foreground text-pretty">{fraseDeFelicidades(cierraEl)}</p>
        </div>

        <div className="mt-2 rounded-2xl border border-border bg-muted/40 p-4">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[15px] font-bold text-foreground">Founding Studio</p>
            <p className="text-[15px] font-bold text-foreground tabular-nums">{precio} €<span className="text-[12.5px] font-medium text-muted-foreground">/mes</span></p>
          </div>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground text-pretty">
            Todo igual que ahora, sin límite de clientes ni de reservas. Tienes hasta el {fechaLarga(cierraEl)} para dar el paso; mientras tanto, nada cambia.
          </p>
        </div>

        {error && <p role="alert" className="text-[12.5px] font-semibold text-destructive">{error}</p>}

        <div className="mt-1 flex flex-col gap-2">
          {estado.configurado ? (
            <button type="button" onClick={() => void contratar()} disabled={contratando} data-testid="felicidades-contratar"
              className="inline-flex h-11 items-center justify-center rounded-full bg-foreground px-5 text-[14px] font-bold text-background disabled:opacity-60">
              {contratando ? 'Abriendo el pago…' : `Seguir creciendo · ${precio} €/mes`}
            </button>
          ) : (
            <Link href="/suscripcion" onClick={cerrar}
              className="inline-flex h-11 items-center justify-center rounded-full bg-foreground px-5 text-[14px] font-bold text-background">
              Ver el plan · {precio} €/mes
            </Link>
          )}
          <button type="button" onClick={cerrar} className="h-10 rounded-full text-[13.5px] font-semibold text-muted-foreground hover:text-foreground">
            Ahora no
          </button>
          {vistaPrevia && <p className="text-center text-[11.5px] text-muted-foreground">Vista previa con cifras de ejemplo: no se guarda ni se cobra nada.</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
