'use client';

// «Datos personales» en la ficha de la clienta (panel): sus derechos RGPD vistos
// desde el estudio, que es el responsable del tratamiento.
//
// Por qué aquí y no en una pantalla aparte: el aviso al estudio enlaza a esta
// ficha, y es donde ya vive «Eliminar clienta». Quien atiende la solicitud la
// ve, ejecuta la supresión y la cierra sin salir de la clienta. La lista de
// Clientas (SolicitudesDerechosPendientes) solo evita que se pierda una.
//
// Tres cosas, todas con lo que dice el servidor:
//   · solicitudes pendientes con su plazo → «Ejecutar supresión» (llama a la
//     ruta de siempre y SOLO si responde OK cierra la solicitud), «Marcar como
//     atendida» o «Rechazar» (nota obligatoria);
//   · si la clienta se ha opuesto al perfilado (lo decide ella en su app);
//   · «Descargar sus datos» (JSON; la salud solo con permiso clínico).

import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  cerrarSolicitudDerechos, descargarDatosSocia, ejecutarSupresionSocia, listarSolicitudesDerechos, type SolicitudConSocia,
} from '@/lib/socios/derechos-cliente';
import { etiquetaTipoSolicitud, NOTA_MAX, textoPlazo } from '@/lib/socios/solicitudes-derechos';
import { fechaCortaEstudio } from '@/lib/utils';

type Accion = { tipo: 'suprimir' | 'resolver' | 'rechazar'; solicitud: SolicitudConSocia };

const ESTADO_TEXTO = { pendiente: 'Pendiente', resuelta: 'Atendida', rechazada: 'Rechazada' } as const;

export function DerechosRgpdFicha({ socioId, nombreSocia, onToast }: {
  socioId: string; nombreSocia: string; onToast: (mensaje: string) => void;
}) {
  const [datos, setDatos] = useState<{ solicitudes: SolicitudConSocia[]; excluirDePerfilado: boolean | null } | null>(null);
  const [error, setError] = useState(false);
  // `Date.now()` no puede ir en render (React Compiler): se fija al cargar.
  const [ahoraMs, setAhoraMs] = useState(0);
  const [descargando, setDescargando] = useState(false);
  const [accion, setAccion] = useState<Accion | null>(null);
  const [nota, setNota] = useState('');
  const [ocupado, setOcupado] = useState(false);
  // Un doble clic en «Ejecutar supresión» no puede lanzar dos supresiones.
  const cerrojo = useRef(false);

  const cargar = useCallback(async () => {
    const r = await listarSolicitudesDerechos(socioId);
    setAhoraMs(Date.now());
    if (!r) { setError(true); return; }
    setError(false);
    setDatos(r);
  }, [socioId]);

  useEffect(() => { void cargar(); }, [cargar]);

  async function descargar() {
    if (descargando) return;
    setDescargando(true);
    const r = await descargarDatosSocia(socioId);
    setDescargando(false);
    onToast(r.ok ? 'Datos descargados' : r.error);
  }

  function abrir(tipo: Accion['tipo'], solicitud: SolicitudConSocia) {
    setNota('');
    setAccion({ tipo, solicitud });
  }

  async function confirmar() {
    if (!accion || cerrojo.current) return;
    if (accion.tipo === 'rechazar' && !nota.trim()) return;
    cerrojo.current = true;
    setOcupado(true);
    try {
      if (accion.tipo === 'suprimir') {
        const sup = await ejecutarSupresionSocia(socioId);
        if (!sup.ok) { onToast(sup.error); return; }
        const cierre = await cerrarSolicitudDerechos(accion.solicitud.id, 'resolver');
        if (!cierre.ok) {
          // La supresión SÍ se hizo: se dice tal cual, sin fingir que todo fue bien.
          setAccion(null);
          onToast(`Sus datos se han eliminado, pero la solicitud no se ha podido cerrar (${cierre.error}). Ciérrala desde Clientas.`);
          return;
        }
        // Ya no hay ficha que mostrar: la socia ha quedado anonimizada.
        window.location.href = '/clientas';
        return;
      }
      const r = await cerrarSolicitudDerechos(accion.solicitud.id, accion.tipo, nota.trim() || undefined);
      if (!r.ok) { onToast(r.error); return; }
      setAccion(null);
      onToast(accion.tipo === 'rechazar' ? 'Solicitud rechazada' : 'Solicitud marcada como atendida');
      await cargar();
    } finally {
      cerrojo.current = false;
      setOcupado(false);
    }
  }

  const ahora = new Date(ahoraMs);
  const pendientes = datos?.solicitudes.filter(s => s.estado === 'pendiente') ?? [];
  const cerradas = datos?.solicitudes.filter(s => s.estado !== 'pendiente').slice(0, 3) ?? [];
  const btn = 'inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold border border-border hover:bg-muted transition-colors disabled:opacity-50';

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-4">Datos personales</h3>

      {error && <p className="text-xs text-destructive mb-3">No se han podido cargar sus solicitudes de datos.</p>}

      {pendientes.map(s => (
        <div
          key={s.id}
          role="alert"
          className="rounded-lg p-3 mb-3"
          style={{ backgroundColor: 'color-mix(in srgb, var(--warning) 12%, var(--card))', border: '1px solid color-mix(in srgb, var(--warning) 35%, transparent)' }}
        >
          <p className="text-sm font-semibold text-foreground">Ha pedido: {etiquetaTipoSolicitud(s.tipo).toLowerCase()}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Desde su app, el {fechaCortaEstudio(s.solicitadaEn)}. {textoPlazo(s.plazoHasta, ahora)}.
          </p>
          <div className="flex flex-wrap gap-2 mt-2.5">
            {s.tipo === 'supresion' ? (
              <button onClick={() => abrir('suprimir', s)} className={`${btn} text-destructive`}>Ejecutar supresión</button>
            ) : (
              <button onClick={() => abrir('resolver', s)} className={btn}>Marcar como atendida</button>
            )}
            <button onClick={() => abrir('rechazar', s)} className={`${btn} text-muted-foreground`}>Rechazar</button>
          </div>
        </div>
      ))}

      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">Recomendaciones automáticas</span>
        <span className="text-xs font-bold text-foreground">
          {datos?.excluirDePerfilado == null ? '—' : datos.excluirDePerfilado ? 'Se ha opuesto' : 'Permitidas'}
        </span>
      </div>
      {datos?.excluirDePerfilado && (
        <p className="text-[11px] text-muted-foreground mt-1">Lo decidió ella desde su app: el Centro de Control no la señala.</p>
      )}

      {cerradas.length > 0 && (
        <div className="mt-3 space-y-1">
          {cerradas.map(s => (
            <p key={s.id} className="text-[11px] text-muted-foreground">
              {etiquetaTipoSolicitud(s.tipo)} · {ESTADO_TEXTO[s.estado]}{s.resueltaEn ? ` el ${fechaCortaEstudio(s.resueltaEn)}` : ''}{s.nota ? ` · ${s.nota}` : ''}
            </p>
          ))}
        </div>
      )}

      <button
        onClick={() => void descargar()}
        disabled={descargando}
        className="w-full mt-4 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold border border-border text-foreground hover:bg-muted transition-colors disabled:opacity-50"
      >
        {descargando ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
        {descargando ? 'Preparando…' : 'Descargar sus datos'}
      </button>

      <Dialog open={accion !== null} onOpenChange={open => { if (!open && !ocupado) setAccion(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {accion?.tipo === 'suprimir' ? 'Ejecutar la supresión' : accion?.tipo === 'rechazar' ? 'Rechazar la solicitud' : 'Marcar como atendida'}
            </DialogTitle>
          </DialogHeader>
          {accion?.tipo === 'suprimir' ? (
            <p className="text-sm text-muted-foreground">
              Se anonimizan los datos personales de {nombreSocia} y se elimina su ficha de salud; su suscripción queda
              cancelada. Las facturas y recibos se conservan por obligación fiscal. La solicitud quedará como atendida.
              Esta acción no se puede deshacer.
            </p>
          ) : (
            <label className="block">
              <span className="text-xs font-semibold text-muted-foreground mb-1.5 block">
                {accion?.tipo === 'rechazar' ? 'Motivo (se guarda y lo verá la clienta en sus datos)' : 'Qué se ha hecho (opcional)'}
              </span>
              <textarea
                value={nota}
                onChange={e => setNota(e.target.value.slice(0, NOTA_MAX))}
                rows={3}
                placeholder={accion?.tipo === 'rechazar' ? 'Por ejemplo: la ley obliga a conservar sus facturas' : ''}
                className="w-full text-sm rounded-lg border border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
          )}
          <div className="flex gap-3 mt-2">
            <button onClick={() => setAccion(null)} disabled={ocupado} className="flex-1 py-2.5 rounded-xl text-sm font-bold border border-border text-muted-foreground hover:bg-muted disabled:opacity-50">
              Cancelar
            </button>
            <button
              onClick={() => void confirmar()}
              disabled={ocupado || (accion?.tipo === 'rechazar' && !nota.trim())}
              className={`flex-1 py-2.5 rounded-xl text-sm font-bold disabled:opacity-50 transition-colors ${accion?.tipo === 'suprimir' ? 'text-white bg-red-500 hover:bg-red-600' : 'text-primary-foreground bg-primary hover:brightness-95'}`}
            >
              {ocupado ? 'Guardando…' : accion?.tipo === 'suprimir' ? 'Eliminar sus datos' : accion?.tipo === 'rechazar' ? 'Rechazar' : 'Confirmar'}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
