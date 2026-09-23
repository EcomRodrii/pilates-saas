'use client';

import { useEffect, useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { listarPeticionesPlazaFija, resolverPeticionPlazaFija, type PeticionPlazaFija } from '@/lib/api-client';
import { ANCLA_DECIDIR, invalidarEstadoEstudio, useAnclaDeAviso } from '@/lib/estado-estudio-cliente';
import { textoMotivoVuelta } from '@/lib/plazas-fijas-solicitudes';
import { Button } from '@/components/ui/button';

// Peticiones de plaza fija que esperan al estudio: las de la app de la alumna (una
// plaza o una pausa) y las vueltas de una pausa que no pudieron volver solas. Mismo
// alcance que `BajasPorRevisar`: una lista y dos botones, dentro de la bandeja. Se
// oculta sola si no hay nada.
//
// Decisiones del fundador (16-sep-2026): hasta que el estudio aprueba no cambia
// nada; pasar del límite semanal se enseña y decide ella; rechazar la vuelta de
// una pausa quita la plaza, y por eso ese botón pide confirmar.
//
// Solo se monta con `puedeGestionarClientas` y `puedeGestionarCalendario`, los
// mismos permisos que exige el servidor.

const MAX_MOTIVO = 200;

function diaMes(ymd: string | null): string {
  if (!ymd) return '';
  const [, m, d] = ymd.split('-');
  return `${Number(d)}/${Number(m)}`;
}

function quePide(p: PeticionPlazaFija): string {
  if (p.tipo === 'CREAR') return 'Pide plaza fija';
  if (p.tipo === 'CREAR_CLASE_FIJA') return 'Pide una clase fija';
  if (p.tipo === 'AMPLIAR_CLASE_FIJA') return 'Pide ampliar su clase fija';
  if (p.tipo === 'PAUSAR') return 'Pide pausar su plaza fija';
  return 'Vuelta de su pausa';
}

function detalle(p: PeticionPlazaFija): string | null {
  if (p.tipo === 'CREAR_CLASE_FIJA' || p.tipo === 'AMPLIAR_CLASE_FIJA') {
    const c = p.claseFija;
    const frases = [c ? `${p.tipo === 'AMPLIAR_CLASE_FIJA' ? `Ampliarla ${c.duracion} más` : `Durante ${c.duracion}`}, hasta el ${c.hasta}.` : null, c?.aviso ?? null,
      p.superaLimite ? 'Pasaría del límite de clases por semana de su cuota.' : null];
    return frases.filter(Boolean).join(' ') || null;
  }
  if (p.tipo === 'PAUSAR' && p.desde && p.hasta) return `Del ${diaMes(p.desde)} al ${diaMes(p.hasta)}.`;
  if (p.tipo === 'REANUDAR') {
    return `Su pausa acaba el ${diaMes(p.hasta)}. No ha vuelto sola porque ${textoMotivoVuelta(p.motivoSistema ?? 'PREGUNTAR')}.`;
  }
  if (p.superaLimite) return 'Pasaría del límite de clases por semana de su cuota.';
  return null;
}

export function PlazasFijasPorDecidir({ onToast }: { onToast: (m: string) => void }) {
  const [items, setItems] = useState<PeticionPlazaFija[] | null>(null);
  const [motivos, setMotivos] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState<string | null>(null);
  // Rechazar la vuelta de una pausa quita la plaza: se confirma antes.
  const [confirmandoQuitar, setConfirmandoQuitar] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    void listarPeticionesPlazaFija().then((r) => { if (vivo) setItems(r); });
    return () => { vivo = false; };
  }, []);

  // Llegar desde el aviso de la campana: a esta petición, no solo a la pantalla.
  useAnclaDeAviso(ANCLA_DECIDIR.plazasFijasPorDecidir, items !== null,
    () => onToast('Esa petición ya está resuelta.'));

  const quitar = (id: string) => {
    setItems((prev) => (prev ?? []).filter((p) => p.id !== id));
    invalidarEstadoEstudio();
  };

  async function decidir(p: PeticionPlazaFija, aprobar: boolean) {
    if (enviando) return;
    setEnviando(p.id);
    setConfirmandoQuitar(null);
    // Si la pantalla ya le ha enseñado que pasa del límite, aprobar es aceptarlo.
    const r = await resolverPeticionPlazaFija(p.id, aprobar, aprobar ? '' : motivos[p.id] ?? '', p.superaLimite);
    setEnviando(null);
    if ('error' in r) {
      if (r.codigo === 'SUPERA_LIMITE') {
        // Ahora pasaría del límite (no al pedirla): se enseña y se vuelve a decidir.
        setItems((prev) => (prev ?? []).map((x) => (x.id === p.id ? { ...x, superaLimite: true } : x)));
      } else if (r.status === 409 && /resuelta|ya no existe/.test(r.error)) {
        quitar(p.id);
      }
      onToast(r.error);
      return;
    }
    quitar(p.id);
    onToast(r.mensaje);
  }

  if (!items?.length) return null;

  return (
    // Sin marco propio: vive dentro de la bandeja (EstadoDelEstudio), que ya lo pone.
    <div id={ANCLA_DECIDIR.plazasFijasPorDecidir} tabIndex={-1} data-testid="plazas-fijas-por-decidir"
      className="scroll-mt-20 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
      <div className="mb-1 flex items-center gap-2">
        <CalendarClock className="size-4 text-muted-foreground" />
        <p className="text-[13px] font-medium text-foreground">
          {items.length === 1 ? 'Una petición de plaza fija' : `${items.length} peticiones de plaza fija`}
        </p>
      </div>
      <p className="mb-3 text-[11px] text-muted-foreground">
        Hasta que decidas no cambia nada. Ella recibe tu respuesta en su app.
      </p>

      <div className="flex flex-col gap-2">
        {items.map((p) => {
          const texto = detalle(p);
          const vuelta = p.tipo === 'REANUDAR';
          const ocupado = enviando !== null;
          return (
            <div key={p.id} data-peticion={p.id} className="flex flex-col gap-2 rounded-lg bg-muted/40 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-[13px] text-foreground">{p.socia} · {p.franja}</p>
                <p className="text-[11px] text-muted-foreground">{quePide(p)}</p>
                {texto && (
                  <p className={`mt-0.5 text-[12px] ${p.superaLimite && !vuelta ? 'font-medium text-warning' : 'text-foreground/80'}`}>
                    {texto}
                  </p>
                )}
              </div>
              <input
                value={motivos[p.id] ?? ''}
                onChange={(e) => setMotivos((prev) => ({ ...prev, [p.id]: e.target.value }))}
                maxLength={MAX_MOTIVO}
                disabled={enviando === p.id}
                placeholder="Motivo si no la apruebas (opcional, lo verá ella)"
                aria-label={`Motivo si no la apruebas (opcional): ${p.socia}`}
                className="h-9 min-w-0 rounded-lg border border-border bg-background px-3 text-[13px] placeholder:text-muted-foreground"
              />
              {confirmandoQuitar === p.id ? (
                <div role="alert" className="flex flex-col gap-2 rounded-lg border border-destructive/30 bg-background px-3 py-2">
                  <p className="text-[12px] text-foreground">
                    Se le quita la plaza fija y se cancelan las clases que tenga reservadas en ese horario.
                  </p>
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="outline" disabled={ocupado} onClick={() => setConfirmandoQuitar(null)}>
                      No
                    </Button>
                    <Button size="sm" variant="destructive" disabled={ocupado} onClick={() => void decidir(p, false)}>
                      {enviando === p.id ? 'Quitando…' : 'Sí, quitársela'}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex justify-end gap-2">
                  <Button
                    size="sm" variant="outline" disabled={ocupado}
                    onClick={() => (vuelta ? setConfirmandoQuitar(p.id) : void decidir(p, false))}
                  >
                    {vuelta ? 'Quitar la plaza' : 'No aprobar'}
                  </Button>
                  <Button size="sm" disabled={ocupado} onClick={() => void decidir(p, true)}>
                    {enviando === p.id
                      ? 'Guardando…'
                      : p.tipo === 'CREAR_CLASE_FIJA' ? (p.superaLimite ? 'Dar la clase fija igualmente' : 'Dar la clase fija')
                      : p.tipo === 'AMPLIAR_CLASE_FIJA' ? (p.superaLimite ? 'Ampliarla igualmente' : 'Ampliarla')
                      : p.tipo === 'CREAR' ? (p.superaLimite ? 'Dar la plaza igualmente' : 'Dar la plaza')
                        : p.tipo === 'PAUSAR' ? 'Aprobar la pausa' : 'Que vuelva'}
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
