'use client'

// Constructor visual de flujos (Fase 7). Define un desencadenante y una cadena
// de acciones (email, tarea, publicar en otra red, notificar al equipo).
// Persiste los pasos en automatizaciones.pasos (jsonb).

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { useStudio } from '@/lib/studio-context'
import type { Automatizacion, PasoFlujo, AccionFlujo, TriggerAutomatizacion } from '@/lib/types'
import {
  Mail, CheckSquare, Share2, Bell, Plus, Trash2, ChevronUp, ChevronDown,
  Zap, X, ArrowRight, Loader2,
} from 'lucide-react'

const inputCls = 'w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-foreground/10'

const TRIGGERS: { value: TriggerAutomatizacion; label: string; desc: string }[] = [
  { value: 'CONTENIDO_PUBLICADO', label: 'Se publica un contenido', desc: 'Al publicar una publicación del módulo de Contenido' },
  { value: 'NUEVA_ALTA', label: 'Nueva clienta registrada', desc: 'Cuando se registra una nueva clienta' },
  { value: 'CUMPLEANOS', label: 'Cumpleaños de clienta', desc: 'El día del cumpleaños' },
  { value: 'PRIMERA_CLASE', label: 'Primera clase', desc: 'Tras completar la primera clase' },
  { value: 'SUSCRIPCION_EXPIRA_7D', label: 'Suscripción expira en 7 días', desc: 'Aviso de renovación' },
  { value: 'SUSCRIPCION_CANCELADA', label: 'Suscripción cancelada', desc: 'Cuando se cancela una suscripción' },
  { value: 'INACTIVIDAD_30D', label: 'Sin actividad 30 días', desc: 'Reactivación de clientas inactivas' },
  { value: 'BONO_AGOTADO', label: 'Bono agotado', desc: 'Cuando se agota el bono' },
]

interface CampoDef { key: string; label: string; textarea?: boolean; select?: string[]; placeholder?: string }

export const ACCIONES: Record<AccionFlujo, { label: string; icon: React.ElementType; color: string; campos: CampoDef[] }> = {
  EMAIL: {
    label: 'Enviar email', icon: Mail, color: '#0ea5e9',
    campos: [
      { key: 'asunto', label: 'Asunto', placeholder: '¡Gracias por tu confianza!' },
      { key: 'mensaje', label: 'Mensaje', textarea: true, placeholder: 'Hola {nombre}…' },
    ],
  },
  TAREA: {
    label: 'Crear tarea', icon: CheckSquare, color: '#8b5cf6',
    campos: [
      { key: 'titulo', label: 'Título de la tarea', placeholder: 'Llamar a la clienta' },
      { key: 'asignadoA', label: 'Asignar a', placeholder: 'Recepción' },
    ],
  },
  PUBLICAR_RED: {
    label: 'Publicar en otra red', icon: Share2, color: '#ec4899',
    campos: [
      { key: 'red', label: 'Red social', select: ['Instagram', 'TikTok', 'Facebook', 'LinkedIn', 'YouTube', 'X'] },
      { key: 'texto', label: 'Texto de la publicación', textarea: true, placeholder: 'Copia adaptada a la red…' },
    ],
  },
  NOTIFICAR_EQUIPO: {
    label: 'Notificar al equipo', icon: Bell, color: '#f59e0b',
    campos: [
      { key: 'mensaje', label: 'Mensaje al equipo', textarea: true, placeholder: 'Revisar nueva alta…' },
    ],
  },
}

const ORDEN_ACCIONES: AccionFlujo[] = ['EMAIL', 'TAREA', 'PUBLICAR_RED', 'NOTIFICAR_EQUIPO']

let pasoSeq = 0
function nuevoPasoId() { pasoSeq += 1; return `paso-${Date.now().toString(36)}-${pasoSeq}` }

// La columna accion (NOT NULL) espera EMAIL/WHATSAPP/NOTIFICACION. Mapeamos la
// primera acción del flujo para mantener compatibilidad con las vistas simples.
function accionCompat(pasos: PasoFlujo[]): 'EMAIL' | 'WHATSAPP' | 'NOTIFICACION' {
  const primera = pasos[0]?.accion
  return primera === 'EMAIL' ? 'EMAIL' : 'NOTIFICACION'
}

export function FlowBuilder({
  open, onClose, automatizacion,
}: {
  open: boolean
  onClose: () => void
  automatizacion?: Automatizacion | null
}) {
  const { addAutomatizacion, updateAutomatizacion } = useStudio()
  const editando = !!automatizacion

  // El componente se monta/desmonta al abrir (el padre lo renderiza con key),
  // así que inicializamos el estado directamente desde la automatización.
  const [nombre, setNombre] = useState(automatizacion?.nombre ?? '')
  const [trigger, setTrigger] = useState<TriggerAutomatizacion>(automatizacion?.trigger ?? 'CONTENIDO_PUBLICADO')
  const [pasos, setPasos] = useState<PasoFlujo[]>(() => {
    if (automatizacion?.pasos?.length) return automatizacion.pasos.map(p => ({ ...p, id: p.id || nuevoPasoId() }))
    if (automatizacion) return [{ id: nuevoPasoId(), accion: (automatizacion.accion === 'EMAIL' ? 'EMAIL' : 'NOTIFICAR_EQUIPO') as AccionFlujo, config: { asunto: automatizacion.asunto || '', mensaje: automatizacion.mensaje || '' } }]
    return [{ id: nuevoPasoId(), accion: 'EMAIL', config: {} }]
  })
  const [guardando, setGuardando] = useState(false)

  function addPaso(accion: AccionFlujo) {
    setPasos(prev => [...prev, { id: nuevoPasoId(), accion, config: {} }])
  }
  function setConfig(id: string, key: string, value: string) {
    setPasos(prev => prev.map(p => p.id === id ? { ...p, config: { ...p.config, [key]: value } } : p))
  }
  function cambiarAccion(id: string, accion: AccionFlujo) {
    setPasos(prev => prev.map(p => p.id === id ? { ...p, accion, config: {} } : p))
  }
  function removePaso(id: string) {
    setPasos(prev => prev.filter(p => p.id !== id))
  }
  function movePaso(id: string, dir: -1 | 1) {
    setPasos(prev => {
      const i = prev.findIndex(p => p.id === id)
      const j = i + dir
      if (i < 0 || j < 0 || j >= prev.length) return prev
      const copia = [...prev]
      ;[copia[i], copia[j]] = [copia[j], copia[i]]
      return copia
    })
  }

  function guardar() {
    if (!nombre.trim() || pasos.length === 0) return
    setGuardando(true)
    const primerEmail = pasos.find(p => p.accion === 'EMAIL')
    const payload = {
      nombre: nombre.trim(),
      trigger,
      accion: accionCompat(pasos),
      asunto: primerEmail?.config.asunto ?? '',
      mensaje: primerEmail?.config.mensaje ?? '',
      activa: automatizacion?.activa ?? true,
      pasos,
    }
    if (automatizacion) updateAutomatizacion(automatizacion.id, payload)
    else addAutomatizacion(payload)
    setGuardando(false)
    onClose()
  }

  if (!open) return null
  const triggerMeta = TRIGGERS.find(t => t.value === trigger)

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-6" onClick={onClose}>
      <div className="w-full max-w-4xl my-4 bg-card border border-border rounded-2xl shadow-xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-lg font-bold text-foreground">{editando ? 'Editar flujo' : 'Nuevo flujo de automatización'}</h2>
          <button onClick={onClose} aria-label="Cerrar" className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors"><X className="w-4 h-4" /></button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-0">
          {/* Configuración */}
          <div className="p-5 space-y-4 lg:border-r border-border">
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Nombre del flujo</label>
              <input className={inputCls} value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej. Bienvenida a nuevas clientas" autoFocus />
            </div>

            {/* Desencadenante */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5"><Zap className="w-3.5 h-3.5" /> Cuando…</label>
              <select className={inputCls} value={trigger} onChange={e => setTrigger(e.target.value as TriggerAutomatizacion)}>
                {TRIGGERS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              {triggerMeta && <p className="text-[11px] text-muted-foreground">{triggerMeta.desc}</p>}
            </div>

            {/* Pasos */}
            <div className="space-y-2">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Entonces, haz esto…</label>
              {pasos.map((p, i) => {
                const meta = ACCIONES[p.accion]
                return (
                  <div key={p.id} className="rounded-xl border border-border p-3 space-y-2.5 bg-background">
                    <div className="flex items-center gap-2">
                      <span className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-white text-xs font-bold" style={{ background: meta.color }}>{i + 1}</span>
                      <select className={cn(inputCls, 'flex-1')} value={p.accion} onChange={e => cambiarAccion(p.id, e.target.value as AccionFlujo)}>
                        {ORDEN_ACCIONES.map(a => <option key={a} value={a}>{ACCIONES[a].label}</option>)}
                      </select>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button onClick={() => movePaso(p.id, -1)} disabled={i === 0} className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted disabled:opacity-30 transition-colors"><ChevronUp className="w-4 h-4" /></button>
                        <button onClick={() => movePaso(p.id, 1)} disabled={i === pasos.length - 1} className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted disabled:opacity-30 transition-colors"><ChevronDown className="w-4 h-4" /></button>
                        <button onClick={() => removePaso(p.id)} disabled={pasos.length <= 1} className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-rose-600 hover:bg-rose-500/10 disabled:opacity-30 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                    <div className="pl-9 space-y-2">
                      {meta.campos.map(campo => (
                        <div key={campo.key}>
                          {campo.select ? (
                            <select className={inputCls} value={p.config[campo.key] ?? ''} onChange={e => setConfig(p.id, campo.key, e.target.value)}>
                              <option value="">{campo.label}…</option>
                              {campo.select.map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                          ) : campo.textarea ? (
                            <textarea rows={2} className={cn(inputCls, 'resize-y')} placeholder={campo.placeholder ?? campo.label} value={p.config[campo.key] ?? ''} onChange={e => setConfig(p.id, campo.key, e.target.value)} />
                          ) : (
                            <input className={inputCls} placeholder={campo.placeholder ?? campo.label} value={p.config[campo.key] ?? ''} onChange={e => setConfig(p.id, campo.key, e.target.value)} />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}

              {/* Añadir acción */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {ORDEN_ACCIONES.map(a => {
                  const m = ACCIONES[a]; const Icon = m.icon
                  return (
                    <button key={a} onClick={() => addPaso(a)} className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-muted-foreground transition-colors">
                      <Plus className="w-3.5 h-3.5" /> <Icon className="w-3.5 h-3.5" style={{ color: m.color }} /> {m.label}
                    </button>
                  )
                })}
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
              {pasos.map((p) => {
                const meta = ACCIONES[p.accion]; const Icon = meta.icon
                const resumen = p.config[meta.campos[0]?.key] || meta.label
                return (
                  <div key={p.id}>
                    <div className="flex justify-center py-0.5"><ArrowRight className="w-3.5 h-3.5 text-muted-foreground rotate-90" /></div>
                    <div className="rounded-xl border border-border bg-card p-3">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="w-5 h-5 rounded-full flex items-center justify-center text-white" style={{ background: meta.color }}><Icon className="w-3 h-3" /></span>
                        <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{meta.label}</span>
                      </div>
                      <p className="text-[12px] text-foreground leading-snug line-clamp-2">{resumen}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-border text-foreground hover:bg-muted transition-colors">Cancelar</button>
          <button onClick={guardar} disabled={!nombre.trim() || pasos.length === 0 || guardando} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-brand text-brand-foreground hover:brightness-95 disabled:opacity-40 transition-colors font-medium">
            {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {editando ? 'Guardar flujo' : 'Crear flujo'}
          </button>
        </div>
      </div>
    </div>
  )
}
