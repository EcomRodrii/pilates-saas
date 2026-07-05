'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Plus, Copy, Trash2, ToggleLeft, ToggleRight, Mail, MessageSquare, Bell, Zap, Eye, EyeOff, Check } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useStudio } from '@/lib/studio-context'
import type { Campana, Automatizacion, CodigoDescuento, TipoCampana, TriggerAutomatizacion } from '@/lib/types'


function FF({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-semibold uppercase tracking-wide text-[#71727A]">{label}</label>
      {children}
    </div>
  )
}

const inputCls = 'w-full rounded-lg border border-[#ECECF1] px-3 py-2 text-sm text-[#15161B] placeholder-[#A2A3AC] focus:outline-none focus:ring-2 focus:ring-[#15161B]/10'
const selectCls = 'w-full rounded-lg border border-[#ECECF1] px-3 py-2 text-sm text-[#15161B] bg-white focus:outline-none focus:ring-2 focus:ring-[#15161B]/10'

const destinatariosLabel: Record<string, string> = {
  TODAS: 'Todas las socias',
  ACTIVAS: 'Socias activas',
  INACTIVAS: 'Socias inactivas',
  SIN_PLAN: 'Sin plan',
  BONO: 'Con bono',
  VIP: 'VIP',
}

const triggerLabel: Record<string, string> = {
  SUSCRIPCION_EXPIRA_7D: 'Suscripción expira en 7 días',
  SUSCRIPCION_EXPIRA_1D: 'Suscripción expira mañana',
  CUMPLEANOS: 'Cumpleaños de socia',
  NUEVA_ALTA: 'Nueva socia registrada',
  INACTIVIDAD_30D: 'Sin actividad 30 días',
  BONO_AGOTADO: 'Bono agotado',
  BONO_QUEDA_1: 'Queda 1 sesión en bono',
  CITA_RECORDATORIO: 'Recordatorio de cita',
  SUSCRIPCION_CANCELADA: 'Suscripción cancelada',
  PRIMERA_CLASE: 'Primera clase',
}

const triggerDesc: Record<string, string> = {
  SUSCRIPCION_EXPIRA_7D: 'Cuando una suscripción caduca en 7 días',
  SUSCRIPCION_EXPIRA_1D: 'El día antes de que caduque la suscripción',
  CUMPLEANOS: 'El día del cumpleaños de la socia',
  NUEVA_ALTA: 'Cuando se registra una nueva socia',
  INACTIVIDAD_30D: 'Si no hay actividad en los últimos 30 días',
  BONO_AGOTADO: 'Cuando se agota el bono de sesiones',
  BONO_QUEDA_1: 'Cuando solo queda 1 sesión en el bono',
  CITA_RECORDATORIO: 'Recordatorio antes de una clase reservada',
  SUSCRIPCION_CANCELADA: 'Cuando se cancela una suscripción',
  PRIMERA_CLASE: 'Tras completar la primera clase',
}

const accionDesc: Record<string, string> = {
  EMAIL: 'Envía un email automático',
  WHATSAPP: 'Envía un mensaje de WhatsApp',
  NOTIFICACION: 'Envía una notificación push',
}

// Email templates
const TEMPLATES = {
  bienvenida: {
    label: 'Bienvenida',
    emoji: '👋',
    text: 'Hola {nombre},\n\n¡Bienvenida a Tentare! 🌟\n\nEstamos encantadas de tenerte con nosotras. Tu próxima clase es el {fecha}.\n\nSi tienes cualquier pregunta, no dudes en escribirnos.\n\nUn abrazo,\nEl equipo de Tentare',
  },
  oferta: {
    label: 'Oferta',
    emoji: '🎁',
    text: 'Hola {nombre},\n\n¡Tenemos una oferta especial para ti! 🎁\n\nEste mes puedes disfrutar de un 20% de descuento en tu renovación de bono.\n\nUsa el código PILATES20 al hacer tu próxima reserva.\n\n¡No dejes que caduque!\n\nUn abrazo,\nEl equipo de Tentare',
  },
  recordatorio: {
    label: 'Recordatorio',
    emoji: '⏰',
    text: 'Hola {nombre},\n\nTe recordamos que tu bono está a punto de agotarse. 📅\n\nTe quedan pocas sesiones. ¡Renueva hoy y sigue disfrutando de tus clases sin interrupciones!\n\nUn abrazo,\nEl equipo de Tentare',
  },
} as const

type TemplateKey = keyof typeof TEMPLATES

function formatDateEs(dateStr: string | null | undefined) {
  if (!dateStr) return 'Sin fecha'
  try {
    return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(dateStr))
  } catch {
    return 'Sin fecha'
  }
}

// Estado badge with colored dot
function EstadoBadge({ estado, programadaEn, enviadaEn }: { estado: string; programadaEn?: string | null; enviadaEn?: string | null }) {
  const dotColor =
    estado === 'ENVIADA' ? 'bg-[#059669]' :
    estado === 'PROGRAMADA' ? 'bg-[#D97706]' :
    estado === 'BORRADOR' ? 'bg-[#A2A3AC]' :
    estado === 'ACTIVA' ? 'bg-[#4B3FD6]' :
    estado === 'PAUSADA' ? 'bg-[#EA580C]' :
    'bg-[#A2A3AC]'

  const bgColor =
    estado === 'ENVIADA' ? 'bg-[#D1FAE5] text-[#065F46]' :
    estado === 'PROGRAMADA' ? 'bg-[#FEF3C7] text-[#92400E]' :
    estado === 'BORRADOR' ? 'bg-[#F1F1F6] text-[#71727A]' :
    estado === 'ACTIVA' ? 'bg-[#DBEAFE] text-[#1D4ED8]' :
    estado === 'PAUSADA' ? 'bg-[#FFEDD5] text-[#C2410C]' :
    'bg-[#F1F1F6] text-[#71727A]'

  const dateStr =
    estado === 'ENVIADA' && enviadaEn ? ` · ${formatDateEs(enviadaEn)}` :
    estado === 'PROGRAMADA' && programadaEn ? ` · ${formatDateEs(programadaEn)}` :
    ''

  return (
    <span className={cn('flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium', bgColor)}>
      <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', dotColor)} />
      {estado === 'BORRADOR' ? 'Borrador' :
       estado === 'PROGRAMADA' ? 'Programada' :
       estado === 'ENVIADA' ? 'Enviada' :
       estado === 'ACTIVA' ? 'Activa' :
       estado === 'PAUSADA' ? 'Pausada' :
       estado}
      {dateStr}
    </span>
  )
}

// Copy button with tooltip
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="relative inline-flex">
      <button
        onClick={handleCopy}
        className={cn(
          'flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors border',
          copied
            ? 'bg-[#D1FAE5] border-[#059669] text-[#065F46]'
            : 'bg-white border-[#ECECF1] text-[#71727A] hover:text-[#15161B] hover:border-[#D1D5DB]'
        )}
        title="Copiar código"
      >
        {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
        {copied ? '¡Copiado!' : 'Copiar'}
      </button>
    </div>
  )
}

// Progress bar for discount code usage
function UsageBar({ usos, usosMax }: { usos: number; usosMax: number | null }) {
  if (usosMax == null) {
    return <span className="text-[#71727A]">{usos} usos</span>
  }
  const pct = Math.min(100, Math.round((usos / usosMax) * 100))
  const barColor = pct >= 90 ? 'bg-[#DC2626]' : pct >= 60 ? 'bg-[#D97706]' : 'bg-[#059669]'
  return (
    <div className="flex flex-col gap-1 min-w-[80px]">
      <span className="text-xs text-[#71727A]">{usos} / {usosMax}</span>
      <div className="w-full h-1.5 bg-[#F1F1F6] rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', barColor)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export default function MarketingPage() {
  const {
    campanas, addCampana, deleteCampana, duplicateCampana,
    automatizaciones, addAutomatizacion, toggleAutomatizacion,
    codigosDescuento: codigos, addCodigoDescuento, toggleCodigoDescuento, deleteCodigoDescuento,
    socios,
    suscripciones,
  } = useStudio()
  const [tab, setTab] = useState<'campanas' | 'automatizaciones' | 'codigos'>('campanas')

  // Campañas modal
  const [showCampanaModal, setShowCampanaModal] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateKey | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [newCampana, setNewCampana] = useState({
    nombre: '',
    tipo: 'EMAIL' as TipoCampana,
    asunto: '',
    destinatarios: 'TODAS',
    contenido: '',
  })

  // Automatizaciones modal
  const [showAutoModal, setShowAutoModal] = useState(false)
  const [newAuto, setNewAuto] = useState({
    nombre: '',
    trigger: 'SUSCRIPCION_EXPIRA_7D' as TriggerAutomatizacion,
    accion: 'EMAIL' as 'EMAIL' | 'WHATSAPP' | 'NOTIFICACION',
    asunto: '',
    mensaje: '',
  })

  // Códigos modal
  const [showCodigoModal, setShowCodigoModal] = useState(false)
  const [newCodigo, setNewCodigo] = useState({
    codigo: '',
    descripcion: '',
    tipo: 'PORCENTAJE' as 'PORCENTAJE' | 'IMPORTE_FIJO',
    valor: '',
    usosMaximos: '',
    expira: '',
  })

  // Hover state for campaign cards
  const [hoveredCampana, setHoveredCampana] = useState<string | null>(null)

  // Campañas stats
  const enviadas = campanas.filter(c => c.estado === 'ENVIADA')
  const tasaApertura = enviadas.length > 0
    ? Math.round(enviadas.reduce((acc, c) => acc + (c.enviados > 0 ? (c.abiertos / c.enviados) * 100 : 0), 0) / enviadas.length)
    : 0

  // Automatizaciones stats
  const autoActivas = automatizaciones.filter(a => a.activa).length
  const totalEjecuciones = automatizaciones.reduce((acc, a) => acc + (a.ejecutadas ?? 0), 0)

  // Códigos stats
  const codigosActivos = codigos.filter(c => c.activo).length
  const totalUsos = codigos.reduce((acc, c) => acc + (c.usos ?? 0), 0)

  // Recipient counts by destinatarios type
  const socioIds = new Set(socios.map(s => s.id))
  const socioIdsConSuscripcionActiva = new Set(
    suscripciones.filter(s => s.estado === 'ACTIVA').map(s => s.socioId)
  )
  const recipientCount: Record<string, number> = {
    TODAS: socios.length,
    ACTIVAS: socios.filter(s => (s as any).activo !== false).length,
    INACTIVAS: socios.filter(s => (s as any).activo === false).length,
    SIN_PLAN: socios.filter(s => !socioIdsConSuscripcionActiva.has(s.id)).length,
    BONO: socioIdsConSuscripcionActiva.size,
    VIP: socios.filter(s => (s as any).tags?.includes('VIP')).length,
  }

  function handleAddCampana() {
    if (!newCampana.nombre.trim()) return
    addCampana({
      nombre: newCampana.nombre,
      tipo: newCampana.tipo,
      asunto: newCampana.asunto,
      destinatarios: newCampana.destinatarios as any,
      contenido: newCampana.contenido,
      estado: 'BORRADOR',
      enviadaEn: null,
      programadaEn: null,
    })
    setNewCampana({ nombre: '', tipo: 'EMAIL', asunto: '', destinatarios: 'TODAS', contenido: '' })
    setSelectedTemplate(null)
    setShowPreview(false)
    setShowCampanaModal(false)
  }

  function handleAddAuto() {
    if (!newAuto.nombre.trim()) return
    addAutomatizacion({
      nombre: newAuto.nombre,
      trigger: newAuto.trigger,
      accion: newAuto.accion,
      asunto: newAuto.asunto,
      mensaje: newAuto.mensaje,
      activa: true,
    })
    setNewAuto({ nombre: '', trigger: 'SUSCRIPCION_EXPIRA_7D', accion: 'EMAIL', asunto: '', mensaje: '' })
    setShowAutoModal(false)
  }

  function handleAddCodigo() {
    if (!newCodigo.codigo.trim() || !newCodigo.valor) return
    addCodigoDescuento({
      codigo: newCodigo.codigo.toUpperCase(),
      descripcion: newCodigo.descripcion,
      tipo: newCodigo.tipo,
      valor: parseFloat(newCodigo.valor),
      usosMax: newCodigo.usosMaximos ? parseInt(newCodigo.usosMaximos) : null,
      expira: newCodigo.expira || null,
      activo: true,
    })
    setNewCodigo({ codigo: '', descripcion: '', tipo: 'PORCENTAJE', valor: '', usosMaximos: '', expira: '' })
    setShowCodigoModal(false)
  }

  function handleSelectTemplate(key: TemplateKey) {
    setSelectedTemplate(key)
    setNewCampana(p => ({ ...p, contenido: TEMPLATES[key].text }))
    setShowPreview(false)
  }

  const tipoBadge = (tipo: string) => {
    if (tipo === 'EMAIL') return 'bg-[#DBEAFE] text-[#1D4ED8]'
    if (tipo === 'WHATSAPP') return 'bg-[#D1FAE5] text-[#065F46]'
    return 'bg-[#FEF3C7] text-[#92400E]'
  }

  const accionBadge = (accion: string) => {
    if (accion === 'EMAIL') return 'bg-[#DBEAFE] text-[#1D4ED8]'
    if (accion === 'WHATSAPP') return 'bg-[#D1FAE5] text-[#065F46]'
    return 'bg-[#F1F1F6] text-[#71727A]'
  }

  const accionIcon = (accion: string) => {
    if (accion === 'EMAIL') return <Mail className="w-3 h-3" />
    if (accion === 'WHATSAPP') return <MessageSquare className="w-3 h-3" />
    return <Bell className="w-3 h-3" />
  }

  return (
    <div className="min-h-screen bg-[#F7F7FB] p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[#15161B]">Marketing</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1 flex-nowrap">
        {(['campanas', 'automatizaciones', 'codigos'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'px-4 py-2 text-sm rounded-lg transition-colors',
              tab === t
                ? 'bg-white border border-[#ECECF1] text-[#15161B] font-medium'
                : 'text-[#71727A] hover:text-[#15161B]'
            )}
          >
            {t === 'campanas' ? 'Campañas' : t === 'automatizaciones' ? 'Automatizaciones' : 'Códigos de descuento'}
          </button>
        ))}
      </div>

      {/* ==================== TAB 1: CAMPAÑAS ==================== */}
      {tab === 'campanas' && (
        <div className="space-y-6">
          {/* Stats + button row */}
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex gap-3 flex-wrap">
              {[
                { label: 'Total campañas', value: campanas.length },
                { label: 'Enviadas', value: enviadas.length },
                { label: 'Tasa apertura media', value: `${tasaApertura}%` },
              ].map(s => (
                <div key={s.label} className="bg-white border border-[#ECECF1] rounded-xl px-4 py-3 min-w-[110px]">
                  <p className="text-xs text-[#71727A] mb-1">{s.label}</p>
                  <p className="text-xl font-bold text-[#15161B]">{s.value}</p>
                </div>
              ))}
            </div>
            <button
              onClick={() => setShowCampanaModal(true)}
              className="flex items-center gap-2 bg-[#15161B] text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-[#2A2B34] transition-colors shrink-0"
            >
              <Plus className="w-4 h-4" />
              Nueva campaña
            </button>
          </div>

          {/* Campaign list */}
          {campanas.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-[#71727A]">Sin campañas</div>
          ) : (
            <div className="space-y-3">
              {campanas.map(c => (
                <div
                  key={c.id}
                  className="bg-white border border-[#ECECF1] rounded-xl p-5 relative group"
                  onMouseEnter={() => setHoveredCampana(c.id)}
                  onMouseLeave={() => setHoveredCampana(null)}
                >
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        <span className="font-semibold text-[#15161B]">{c.nombre}</span>
                        <span className={cn('px-2 py-0.5 rounded-md text-xs font-medium', tipoBadge(c.tipo))}>{c.tipo}</span>
                        <EstadoBadge estado={c.estado} programadaEn={c.programadaEn} enviadaEn={c.enviadaEn} />
                      </div>
                      <p className="text-xs text-[#71727A] mb-2">{destinatariosLabel[c.destinatarios] ?? c.destinatarios}</p>
                      <p className="text-xs text-[#71727A]">
                        Enviados: {c.enviados} · Abiertos: {c.abiertos}{c.enviados > 0 ? ` (${Math.round((c.abiertos / c.enviados) * 100)}%)` : ''} · Clics: {c.clics}{c.enviados > 0 ? ` (${Math.round((c.clics / c.enviados) * 100)}%)` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-[#A2A3AC]">{formatDateEs(c.creadaEn)}</span>
                      <div className={cn('flex gap-1 transition-opacity', hoveredCampana === c.id ? 'opacity-100' : 'opacity-0')}>
                        <button
                          onClick={() => duplicateCampana(c)}
                          className="p-1.5 rounded-lg hover:bg-[#F1F1F6] text-[#71727A] hover:text-[#15161B] transition-colors"
                          title="Duplicar"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => deleteCampana(c.id)}
                          className="p-1.5 rounded-lg hover:bg-[#FEE2E2] text-[#71727A] hover:text-[#DC2626] transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ==================== TAB 2: AUTOMATIZACIONES ==================== */}
      {tab === 'automatizaciones' && (
        <div className="space-y-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex gap-4">
              {[
                { label: 'Activas', value: autoActivas },
                { label: 'Ejecuciones este mes', value: totalEjecuciones },
              ].map(s => (
                <div key={s.label} className="bg-white border border-[#ECECF1] rounded-xl px-5 py-3 min-w-[130px]">
                  <p className="text-xs text-[#71727A] mb-1">{s.label}</p>
                  <p className="text-xl font-bold text-[#15161B]">{s.value}</p>
                </div>
              ))}
            </div>
            <button
              onClick={() => setShowAutoModal(true)}
              className="flex items-center gap-2 bg-[#15161B] text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-[#2A2B34] transition-colors shrink-0"
            >
              <Plus className="w-4 h-4" />
              Nueva automatización
            </button>
          </div>

          {automatizaciones.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-[#71727A]">Sin automatizaciones</div>
          ) : (
            <div className="bg-white border border-[#ECECF1] rounded-xl overflow-hidden overflow-x-auto">
              <table className="w-full text-sm min-w-[700px]">
                <thead>
                  <tr className="border-b border-[#ECECF1]">
                    {['Automatización', 'Cuándo se activa', 'Qué hace', 'Ejecuciones', 'Última ejecución', 'Estado'].map(col => (
                      <th key={col} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[#71727A]">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {automatizaciones.map((a, i) => (
                    <tr key={a.id} className={cn('border-b border-[#ECECF1] last:border-0', i % 2 === 0 ? 'bg-white' : 'bg-[#F4F4F8]')}>
                      <td className="px-4 py-4">
                        <span className="font-semibold text-[#15161B]">{a.nombre}</span>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-start gap-1.5">
                          <Zap className="w-3.5 h-3.5 text-[#A2A3AC] mt-0.5 shrink-0" />
                          <div>
                            <p className="text-sm text-[#15161B] font-medium leading-snug">{triggerLabel[a.trigger] ?? a.trigger}</p>
                            <p className="text-xs text-[#A2A3AC] leading-snug mt-0.5">{triggerDesc[a.trigger] ?? ''}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-start gap-1.5">
                          <span className={cn('flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium shrink-0', accionBadge(a.accion))}>
                            {accionIcon(a.accion)}
                            {a.accion}
                          </span>
                        </div>
                        <p className="text-xs text-[#A2A3AC] mt-1">{accionDesc[a.accion] ?? ''}</p>
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-[#15161B] font-medium">{a.ejecutadas ?? 0}</span>
                      </td>
                      <td className="px-4 py-4">
                        <span className={cn('text-sm', (a.ejecutadas ?? 0) === 0 ? 'text-[#A2A3AC] italic' : 'text-[#71727A]')}>
                          {(a.ejecutadas ?? 0) === 0 ? 'Nunca' : 'Reciente'}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <button
                          onClick={() => toggleAutomatizacion(a.id)}
                          className={cn(
                            'w-10 h-[22px] rounded-full transition-colors relative shrink-0',
                            a.activa ? 'bg-[#15161B]' : 'bg-[#D1D5DB]'
                          )}
                          aria-label={a.activa ? 'Desactivar' : 'Activar'}
                        >
                          <span
                            className={cn(
                              'absolute top-0.5 w-[18px] h-[18px] rounded-full bg-white shadow transition-all',
                              a.activa ? 'left-[calc(100%-1.25rem-0.125rem)]' : 'left-0.5'
                            )}
                          />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ==================== TAB 3: CÓDIGOS DE DESCUENTO ==================== */}
      {tab === 'codigos' && (
        <div className="space-y-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex gap-4">
              {[
                { label: 'Total códigos', value: codigos.length },
                { label: 'Activos', value: codigosActivos },
                { label: 'Usos totales', value: totalUsos },
              ].map(s => (
                <div key={s.label} className="bg-white border border-[#ECECF1] rounded-xl px-5 py-3 min-w-[120px]">
                  <p className="text-xs text-[#71727A] mb-1">{s.label}</p>
                  <p className="text-xl font-bold text-[#15161B]">{s.value}</p>
                </div>
              ))}
            </div>
            <button
              onClick={() => setShowCodigoModal(true)}
              className="flex items-center gap-2 bg-[#15161B] text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-[#2A2B34] transition-colors shrink-0"
            >
              <Plus className="w-4 h-4" />
              Nuevo código
            </button>
          </div>

          {codigos.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-[#71727A]">Sin códigos</div>
          ) : (
            <div className="bg-white border border-[#ECECF1] rounded-xl overflow-hidden overflow-x-auto">
              <table className="w-full text-sm min-w-[650px]">
                <thead>
                  <tr className="border-b border-[#ECECF1]">
                    {['Código', 'Descripción', 'Descuento', 'Usos', 'Expira', 'Estado', 'Acciones'].map(col => (
                      <th key={col} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[#71727A]">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {codigos.map((cod, i) => (
                    <tr key={cod.id} className={cn('border-b border-[#ECECF1] last:border-0', i % 2 === 0 ? 'bg-white' : 'bg-[#F4F4F8]')}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-[#15161B] text-sm">{cod.codigo}</span>
                          <CopyButton text={cod.codigo} />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[#71727A]">{cod.descripcion || '—'}</td>
                      <td className="px-4 py-3 text-[#15161B] font-medium">
                        {cod.tipo === 'PORCENTAJE' ? `${cod.valor}%` : `${cod.valor} €`}
                      </td>
                      <td className="px-4 py-3">
                        <UsageBar usos={cod.usos} usosMax={cod.usosMax} />
                      </td>
                      <td className="px-4 py-3 text-[#71727A]">{formatDateEs(cod.expira)}</td>
                      <td className="px-4 py-3">
                        <span className={cn('px-2 py-0.5 rounded-md text-xs font-medium', cod.activo ? 'bg-[#D1FAE5] text-[#065F46]' : 'bg-[#F1F1F6] text-[#71727A]')}>
                          {cod.activo ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => toggleCodigoDescuento(cod.id)}
                            className="p-1.5 rounded-lg hover:bg-[#F1F1F6] text-[#71727A] hover:text-[#15161B] transition-colors"
                            title={cod.activo ? 'Desactivar' : 'Activar'}
                          >
                            {cod.activo ? <ToggleRight className="w-4 h-4 text-[#059669]" /> : <ToggleLeft className="w-4 h-4" />}
                          </button>
                          <button
                            onClick={() => deleteCodigoDescuento(cod.id)}
                            className="p-1.5 rounded-lg hover:bg-[#FEE2E2] text-[#71727A] hover:text-[#DC2626] transition-colors"
                            title="Eliminar"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ==================== MODAL: NUEVA CAMPAÑA ==================== */}
      <Dialog open={showCampanaModal} onOpenChange={(open) => {
        setShowCampanaModal(open)
        if (!open) { setSelectedTemplate(null); setShowPreview(false) }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nueva campaña</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {/* Basic fields */}
            <FF label="Nombre">
              <input
                className={inputCls}
                placeholder="Nombre de la campaña"
                value={newCampana.nombre}
                onChange={e => setNewCampana(p => ({ ...p, nombre: e.target.value }))}
              />
            </FF>
            <FF label="Tipo">
              <select
                className={selectCls}
                value={newCampana.tipo}
                onChange={e => setNewCampana(p => ({ ...p, tipo: e.target.value as TipoCampana }))}
              >
                <option value="EMAIL">Email</option>
                <option value="WHATSAPP">WhatsApp</option>
                <option value="SMS">SMS</option>
              </select>
            </FF>
            <FF label="Asunto">
              <input
                className={inputCls}
                placeholder="Asunto del mensaje"
                value={newCampana.asunto}
                onChange={e => setNewCampana(p => ({ ...p, asunto: e.target.value }))}
              />
            </FF>
            <FF label="Destinatarios">
              <div className="flex items-center gap-2">
                <select
                  className={selectCls}
                  value={newCampana.destinatarios}
                  onChange={e => setNewCampana(p => ({ ...p, destinatarios: e.target.value }))}
                >
                  <option value="TODAS">Todas las socias</option>
                  <option value="ACTIVAS">Socias activas</option>
                  <option value="INACTIVAS">Socias inactivas</option>
                  <option value="SIN_PLAN">Sin plan</option>
                  <option value="BONO">Con bono</option>
                  <option value="VIP">VIP</option>
                </select>
                <span className="shrink-0 text-xs font-medium text-[#71727A] bg-[#F1F1F6] px-2.5 py-1.5 rounded-lg whitespace-nowrap">
                  ~{recipientCount[newCampana.destinatarios] ?? 0} destinatarias
                </span>
              </div>
            </FF>

            {/* Content section */}
            <div className="space-y-3 pt-1">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-[#71727A]">Contenido</label>

              {/* Template picker */}
              <div className="grid grid-cols-3 gap-2">
                {(Object.entries(TEMPLATES) as [TemplateKey, typeof TEMPLATES[TemplateKey]][]).map(([key, tpl]) => (
                  <button
                    key={key}
                    onClick={() => handleSelectTemplate(key)}
                    className={cn(
                      'flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all text-center',
                      selectedTemplate === key
                        ? 'border-[#15161B] bg-[#F4F4F8]'
                        : 'border-[#ECECF1] hover:border-[#D1D5DB] bg-white'
                    )}
                  >
                    <span className="text-2xl">{tpl.emoji}</span>
                    <span className="text-xs font-semibold text-[#15161B]">{tpl.label}</span>
                    <span className="text-[10px] text-[#A2A3AC]">Plantilla</span>
                  </button>
                ))}
              </div>

              {/* Preview toggle */}
              <div className="flex items-center justify-between">
                <p className="text-xs text-[#A2A3AC]">Variables: {'{nombre}'}, {'{fecha}'}, {'{plan}'}</p>
                {newCampana.contenido && (
                  <button
                    onClick={() => setShowPreview(p => !p)}
                    className="flex items-center gap-1 text-xs text-[#71727A] hover:text-[#15161B] transition-colors"
                  >
                    {showPreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    {showPreview ? 'Editar' : 'Vista previa'}
                  </button>
                )}
              </div>

              {showPreview ? (
                /* Email preview card */
                <div className="bg-white border border-[#ECECF1] rounded-xl p-5 shadow-sm">
                  <div className="border-b border-[#F1F1F6] pb-3 mb-3">
                    <p className="text-xs text-[#A2A3AC] uppercase tracking-wide">Vista previa</p>
                    {newCampana.asunto && (
                      <p className="text-sm font-semibold text-[#15161B] mt-1">{newCampana.asunto}</p>
                    )}
                  </div>
                  <div className="text-sm text-[#3A3B44] whitespace-pre-line leading-relaxed">
                    {newCampana.contenido}
                  </div>
                </div>
              ) : (
                <textarea
                  className={cn(inputCls, 'resize-none')}
                  rows={8}
                  placeholder="Escribe el contenido del mensaje, o elige una plantilla arriba..."
                  value={newCampana.contenido}
                  onChange={e => setNewCampana(p => ({ ...p, contenido: e.target.value }))}
                />
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => { setShowCampanaModal(false); setSelectedTemplate(null); setShowPreview(false) }}
                className="px-4 py-2 text-sm rounded-lg bg-white border border-[#ECECF1] text-[#15161B] hover:bg-[#F4F4F8] transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleAddCampana}
                className="px-4 py-2 text-sm rounded-lg bg-[#15161B] text-white hover:bg-[#2A2B34] transition-colors font-medium"
              >
                Crear campaña
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ==================== MODAL: NUEVA AUTOMATIZACIÓN ==================== */}
      <Dialog open={showAutoModal} onOpenChange={setShowAutoModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nueva automatización</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <FF label="Nombre">
              <input
                className={inputCls}
                placeholder="Nombre de la automatización"
                value={newAuto.nombre}
                onChange={e => setNewAuto(p => ({ ...p, nombre: e.target.value }))}
              />
            </FF>
            <FF label="Trigger">
              <select
                className={selectCls}
                value={newAuto.trigger}
                onChange={e => setNewAuto(p => ({ ...p, trigger: e.target.value as TriggerAutomatizacion }))}
              >
                {Object.entries(triggerLabel).map(([val, lbl]) => (
                  <option key={val} value={val}>{lbl}</option>
                ))}
              </select>
            </FF>
            <FF label="Acción">
              <select
                className={selectCls}
                value={newAuto.accion}
                onChange={e => setNewAuto(p => ({ ...p, accion: e.target.value as 'EMAIL' | 'WHATSAPP' | 'NOTIFICACION' }))}
              >
                <option value="EMAIL">Email</option>
                <option value="WHATSAPP">WhatsApp</option>
                <option value="NOTIFICACION">Notificación</option>
              </select>
            </FF>
            <FF label="Asunto">
              <input
                className={inputCls}
                placeholder="Asunto del mensaje"
                value={newAuto.asunto}
                onChange={e => setNewAuto(p => ({ ...p, asunto: e.target.value }))}
              />
            </FF>
            <FF label="Mensaje">
              <textarea
                className={cn(inputCls, 'resize-none h-24')}
                placeholder="Contenido del mensaje automático..."
                value={newAuto.mensaje}
                onChange={e => setNewAuto(p => ({ ...p, mensaje: e.target.value }))}
              />
            </FF>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowAutoModal(false)}
                className="px-4 py-2 text-sm rounded-lg bg-white border border-[#ECECF1] text-[#15161B] hover:bg-[#F4F4F8] transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleAddAuto}
                className="px-4 py-2 text-sm rounded-lg bg-[#15161B] text-white hover:bg-[#2A2B34] transition-colors font-medium"
              >
                Crear automatización
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ==================== MODAL: NUEVO CÓDIGO ==================== */}
      <Dialog open={showCodigoModal} onOpenChange={setShowCodigoModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nuevo código de descuento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <FF label="Código">
              <input
                className={inputCls}
                placeholder="Ej. VERANO20"
                value={newCodigo.codigo}
                onChange={e => setNewCodigo(p => ({ ...p, codigo: e.target.value.toUpperCase() }))}
              />
            </FF>
            <FF label="Descripción">
              <input
                className={inputCls}
                placeholder="Descripción del código"
                value={newCodigo.descripcion}
                onChange={e => setNewCodigo(p => ({ ...p, descripcion: e.target.value }))}
              />
            </FF>
            <div className="grid grid-cols-2 gap-4">
              <FF label="Tipo">
                <select
                  className={selectCls}
                  value={newCodigo.tipo}
                  onChange={e => setNewCodigo(p => ({ ...p, tipo: e.target.value as 'PORCENTAJE' | 'IMPORTE_FIJO' }))}
                >
                  <option value="PORCENTAJE">Porcentaje (%)</option>
                  <option value="IMPORTE_FIJO">Importe fijo (€)</option>
                </select>
              </FF>
              <FF label="Valor">
                <input
                  className={inputCls}
                  type="number"
                  placeholder={newCodigo.tipo === 'PORCENTAJE' ? '20' : '10'}
                  value={newCodigo.valor}
                  onChange={e => setNewCodigo(p => ({ ...p, valor: e.target.value }))}
                  min={0}
                />
              </FF>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FF label="Usos máximos">
                <input
                  className={inputCls}
                  type="number"
                  placeholder="Sin límite"
                  value={newCodigo.usosMaximos}
                  onChange={e => setNewCodigo(p => ({ ...p, usosMaximos: e.target.value }))}
                  min={1}
                />
              </FF>
              <FF label="Fecha de expiración">
                <input
                  className={inputCls}
                  type="date"
                  value={newCodigo.expira}
                  onChange={e => setNewCodigo(p => ({ ...p, expira: e.target.value }))}
                />
              </FF>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowCodigoModal(false)}
                className="px-4 py-2 text-sm rounded-lg bg-white border border-[#ECECF1] text-[#15161B] hover:bg-[#F4F4F8] transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleAddCodigo}
                className="px-4 py-2 text-sm rounded-lg bg-[#15161B] text-white hover:bg-[#2A2B34] transition-colors font-medium"
              >
                Crear código
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
