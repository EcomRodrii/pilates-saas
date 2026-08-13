'use client'

// Constructor visual de flujos (Fase 7). Define un desencadenante y UNA
// acción (email o aviso interno al equipo) — no una cadena: la columna
// `accion` de Automatizacion (NOT NULL) admite un único canal por fila, y
// el motor (lib/engines/marketing-automation-engine.ts) solo ejecuta ese
// canal. Antes esta pantalla dejaba encadenar varios pasos con vista previa
// de todos ellos, pero solo el primero llegaba a guardarse/ejecutarse — el
// resto era decorado sin efecto. Persiste el paso en automatizaciones.pasos
// (jsonb, array de 1 elemento) para no romper la vista "Flujo" que ya lee
// ese campo.

import { useState, useId } from 'react'
import { cn } from '@/lib/utils'
import { useStudio } from '@/lib/studio-context'
import { DashboardSheet } from '@/components/ui/dashboard-sheet'
import type { Automatizacion, PasoFlujo, AccionFlujo, TriggerAutomatizacion } from '@/lib/types'
import { Mail, Bell, Zap, X, ArrowRight, Loader2 } from 'lucide-react'

const inputCls = 'w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-foreground/10'

const TRIGGERS: { value: TriggerAutomatizacion; label: string; desc: string }[] = [
  { value: 'NUEVA_ALTA', label: 'Nueva clienta registrada', desc: 'Cuando se registra una nueva clienta' },
  { value: 'CUMPLEANOS', label: 'Cumpleaños de clienta', desc: 'El día del cumpleaños' },
  { value: 'PRIMERA_CLASE', label: 'Primera clase', desc: 'Tras completar la primera clase' },
  { value: 'SUSCRIPCION_EXPIRA_7D', label: 'Suscripción expira en 7 días', desc: 'Aviso de renovación' },
  { value: 'SUSCRIPCION_CANCELADA', label: 'Suscripción cancelada', desc: 'Cuando se cancela una suscripción' },
  { value: 'INACTIVIDAD_30D', label: 'Sin actividad 30 días', desc: 'Reactivación de clientas inactivas' },
  { value: 'BONO_AGOTADO', label: 'Bono agotado', desc: 'Cuando se agota el bono' },
]

interface CampoDef { key: string; label: string; textarea?: boolean; placeholder?: string }

export const ACCIONES: Record<AccionFlujo, { label: string; icon: React.ElementType; color: string; campos: CampoDef[] }> = {
  EMAIL: {
    label: 'Enviar email', icon: Mail, color: '#0ea5e9',
    campos: [
      { key: 'asunto', label: 'Asunto', placeholder: '¡Gracias por tu confianza!' },
      { key: 'mensaje', label: 'Mensaje', textarea: true, placeholder: 'Hola {nombre}…' },
    ],
  },
  NOTIFICAR_EQUIPO: {
    label: 'Notificar al equipo', icon: Bell, color: '#A87A1E',
    campos: [
      { key: 'mensaje', label: 'Mensaje al equipo', textarea: true, placeholder: 'Revisar nueva alta…' },
    ],
  },
}

const ORDEN_ACCIONES: AccionFlujo[] = ['EMAIL', 'NOTIFICAR_EQUIPO']

let pasoSeq = 0
function nuevoPasoId() { pasoSeq += 1; return `paso-${Date.now().toString(36)}-${pasoSeq}` }

export function FlowBuilder({
  open, onClose, automatizacion,
}: {
  open: boolean
  onClose: () => void
  automatizacion?: Automatizacion | null
}) {
  const uid = useId();
  const { addAutomatizacion, updateAutomatizacion } = useStudio()
  const editando = !!automatizacion

  // El componente se monta/desmonta al abrir (el padre lo renderiza con key),
  // así que inicializamos el estado directamente desde la automatización.
  const [nombre, setNombre] = useState(automatizacion?.nombre ?? '')
  const [trigger, setTrigger] = useState<TriggerAutomatizacion>(automatizacion?.trigger ?? 'NUEVA_ALTA')
  const [paso, setPaso] = useState<PasoFlujo>(() => {
    // Automatizaciones antiguas guardadas con varios pasos: solo el primero
    // llegó a ejecutarse nunca, así que es el único que tiene sentido editar.
    if (automatizacion?.pasos?.[0]) return { ...automatizacion.pasos[0], id: automatizacion.pasos[0].id || nuevoPasoId() }
    if (automatizacion) return { id: nuevoPasoId(), accion: (automatizacion.accion === 'EMAIL' ? 'EMAIL' : 'NOTIFICAR_EQUIPO') as AccionFlujo, config: { asunto: automatizacion.asunto || '', mensaje: automatizacion.mensaje || '' } }
    return { id: nuevoPasoId(), accion: 'EMAIL', config: {} }
  })
  const [guardando, setGuardando] = useState(false)
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null)

  function setConfig(key: string, value: string) {
    setPaso(prev => ({ ...prev, config: { ...prev.config, [key]: value } }))
  }
  function cambiarAccion(accion: AccionFlujo) {
    setPaso(prev => ({ ...prev, accion, config: {} }))
  }

  async function guardar() {
    if (!nombre.trim()) return
    setGuardando(true)
    setErrorGuardar(null)
    const payload = {
      nombre: nombre.trim(),
      trigger,
      accion: (paso.accion === 'EMAIL' ? 'EMAIL' : 'NOTIFICACION') as 'EMAIL' | 'WHATSAPP' | 'NOTIFICACION',
      asunto: paso.config.asunto ?? '',
      mensaje: paso.config.mensaje ?? '',
      activa: automatizacion?.activa ?? true,
      pasos: [paso],
    }
    const res = automatizacion ? await updateAutomatizacion(automatizacion.id, payload) : await addAutomatizacion(payload)
    setGuardando(false)
    if (!res.ok) { setErrorGuardar(res.error); return }
    onClose()
  }

  const triggerMeta = TRIGGERS.find(t => t.value === trigger)
  const meta = ACCIONES[paso.accion]

  return (
    <DashboardSheet
      open={open}
      onClose={onClose}
      label={editando ? 'Editar flujo' : 'Nuevo flujo de automatización'}
      backdropClassName="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-6"
      sheetClassName="w-full max-w-4xl my-4 bg-card border border-border rounded-2xl shadow-xl"
    >
      <>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-lg font-bold text-foreground">{editando ? 'Editar flujo' : 'Nuevo flujo de automatización'}</h2>
          <button onClick={onClose} aria-label="Cerrar" className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors"><X className="w-4 h-4" /></button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-0">
          {/* Configuración */}
          <div className="p-5 space-y-4 lg:border-r border-border">
            <div className="space-y-1.5">
              <label htmlFor={`${uid}-1`} className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Nombre del flujo</label>
              <input id={`${uid}-1`} className={inputCls} value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej. Bienvenida a nuevas clientas" autoFocus />
            </div>

            {/* Desencadenante */}
            <div className="space-y-1.5">
              <label htmlFor={`${uid}-2`} className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5"><Zap className="w-3.5 h-3.5" /> Cuando…</label>
              <select id={`${uid}-2`} className={inputCls} value={trigger} onChange={e => setTrigger(e.target.value as TriggerAutomatizacion)}>
                {TRIGGERS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              {triggerMeta && <p className="text-[11px] text-muted-foreground">{triggerMeta.desc}</p>}
            </div>

            {/* Acción */}
            <div className="space-y-2">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Entonces, haz esto…</label>
              <div className="rounded-xl border border-border p-3 space-y-2.5 bg-background">
                <div className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-white text-xs font-bold" style={{ background: meta.color }}>1</span>
                  <select className={cn(inputCls, 'flex-1')} value={paso.accion} onChange={e => cambiarAccion(e.target.value as AccionFlujo)}>
                    {ORDEN_ACCIONES.map(a => <option key={a} value={a}>{ACCIONES[a].label}</option>)}
                  </select>
                </div>
                <div className="pl-9 space-y-2">
                  {meta.campos.map(campo => (
                    <div key={campo.key}>
                      {campo.textarea ? (
                        <textarea rows={2} className={cn(inputCls, 'resize-y')} placeholder={campo.placeholder ?? campo.label} value={paso.config[campo.key] ?? ''} onChange={e => setConfig(campo.key, e.target.value)} />
                      ) : (
                        <input className={inputCls} placeholder={campo.placeholder ?? campo.label} value={paso.config[campo.key] ?? ''} onChange={e => setConfig(campo.key, e.target.value)} />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Vista previa del flujo */}
          <div className="p-5 bg-muted/30 rounded-b-2xl lg:rounded-b-none lg:rounded-r-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-3">Vista previa</p>
            <div className="space-y-2">
              <div className="rounded-xl border border-border bg-card p-3">
                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1"><Zap className="w-3 h-3" /> Cuando</div>
                <p className="text-[13px] font-semibold text-foreground leading-snug">{triggerMeta?.label}</p>
              </div>
              <div className="flex justify-center py-0.5"><ArrowRight className="w-3.5 h-3.5 text-muted-foreground rotate-90" /></div>
              <div className="rounded-xl border border-border bg-card p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="w-5 h-5 rounded-full flex items-center justify-center text-white" style={{ background: meta.color }}><meta.icon className="w-3 h-3" /></span>
                  <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{meta.label}</span>
                </div>
                <p className="text-[12px] text-foreground leading-snug line-clamp-2">{paso.config[meta.campos[0]?.key] || meta.label}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border">
          {errorGuardar && <p className="text-sm text-destructive mr-auto">{errorGuardar}</p>}
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-border text-foreground hover:bg-muted transition-colors">Cancelar</button>
          <button onClick={guardar} disabled={!nombre.trim() || guardando} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-brand text-brand-foreground hover:brightness-95 disabled:opacity-40 transition-colors font-medium">
            {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {editando ? 'Guardar flujo' : 'Crear flujo'}
          </button>
        </div>
      </>
    </DashboardSheet>
  )
}
