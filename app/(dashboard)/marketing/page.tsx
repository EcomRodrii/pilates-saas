'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Plus, Copy, Trash2, ToggleLeft, ToggleRight, Mail, MessageSquare, Bell, Zap, Eye, EyeOff, Check, Filter, BarChart3, PieChart, MoreVertical, Sparkles, Loader2, Send, Play, Pause, Flag, ArrowRight, Pencil } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useStudio } from '@/lib/studio-context'
import { authHeader } from '@/lib/api-client'
import type { Campana, Automatizacion, CodigoDescuento, TipoCampana, LeadStage } from '@/lib/types'
import { FlowBuilder, ACCIONES } from '@/components/marketing/flow-builder'
import { leerPublicacionesContenido } from '@/lib/contenido/read-publicaciones'
import type { PublicacionAsociada } from '@/lib/types'


function FF({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</label>
      {children}
    </div>
  )
}

const inputCls = 'w-full rounded-lg border border-border px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-foreground/10'
const selectCls = 'w-full rounded-lg border border-border px-3 py-2 text-sm text-foreground bg-card focus:outline-none focus:ring-2 focus:ring-foreground/10'

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
    estado === 'BORRADOR' ? 'bg-muted-foreground' :
    estado === 'ACTIVA' ? 'bg-[#7AA80E]' :
    estado === 'PAUSADA' ? 'bg-[#EA580C]' :
    'bg-muted-foreground'

  const bgColor =
    estado === 'ENVIADA' ? 'bg-[#D1FAE5] text-[#065F46]' :
    estado === 'PROGRAMADA' ? 'bg-[#FEF3C7] text-[#92400E]' :
    estado === 'BORRADOR' ? 'bg-muted text-muted-foreground' :
    estado === 'ACTIVA' ? 'bg-[#DBEAFE] text-[#1D4ED8]' :
    estado === 'PAUSADA' ? 'bg-[#FFEDD5] text-[#C2410C]' :
    'bg-muted text-muted-foreground'

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
            : 'bg-card border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground'
        )}
        title="Copiar código"
      >
        {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
        {copied ? '¡Copiado!' : 'Copiar'}
      </button>
    </div>
  )
}

// ─── Resumen tab: card chrome shared by every widget ───────────────────────────

function WidgetCard({ icon: Icon, title, action, children, className }: {
  icon: React.ElementType; title: string; action?: React.ReactNode; children: React.ReactNode; className?: string
}) {
  return (
    <div className={cn('bg-card border border-border rounded-3xl p-5', className)}>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-full border border-border flex items-center justify-center shrink-0">
            <Icon size={14} className="text-foreground" />
          </span>
          <h3 className="text-[15px] font-bold text-foreground">{title}</h3>
        </div>
        <div className="flex items-center gap-2">
          {action}
          <span className="w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground">
            <MoreVertical size={14} />
          </span>
        </div>
      </div>
      {children}
    </div>
  )
}

// ─── Mini sparkline used by the KPI cards ──────────────────────────────────────

function MiniSparkline({ points, color }: { points: number[]; color: string }) {
  if (points.length < 2) return null
  const w = 200, h = 56
  const max = Math.max(...points, 1)
  const min = Math.min(...points, 0)
  const range = max - min || 1
  const step = w / (points.length - 1)
  const coords = points.map((p, i) => [i * step, h - ((p - min) / range) * (h - 8) - 4] as const)
  const line = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `${line} L${w},${h} L0,${h} Z`
  const gid = `spark-${color.replace('#', '')}`
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-14" preserveAspectRatio="none">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function KpiTrendCard({ title, value, deltaPct, points, color, axisLabels }: {
  title: string; value: string; deltaPct: number | null; points: number[]; color: string; axisLabels: string[]
}) {
  const positive = (deltaPct ?? 0) >= 0
  return (
    <div className="bg-card border border-border rounded-3xl p-5 flex flex-col">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[26px] font-extrabold text-foreground leading-none tabular-nums">{value}</span>
        {deltaPct !== null && (
          <span className={cn(
            'text-[11px] font-bold px-2 py-0.5 rounded-full',
            positive ? 'bg-brand/10 text-brand-secondary' : 'bg-[#FEF3C7] text-[#92400E]'
          )}>
            {positive ? '+' : ''}{deltaPct.toFixed(1)}%
          </span>
        )}
      </div>
      <p className="text-[12px] text-muted-foreground mb-2">{title}</p>
      <MiniSparkline points={points} color={color} />
      <div className="flex justify-between mt-1">
        {axisLabels.map((l, i) => <span key={i} className="text-[10px] text-muted-foreground">{l}</span>)}
      </div>
    </div>
  )
}

function ConversionRatioCard({ activas, total }: { activas: number; total: number }) {
  const pct = total > 0 ? Math.round((activas / total) * 100) : 0
  return (
    <div className="bg-card border border-border rounded-3xl p-5 flex flex-col">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[26px] font-extrabold text-foreground leading-none tabular-nums">{pct}%</span>
      </div>
      <p className="text-[12px] text-muted-foreground mb-3">Tasa de conversión</p>
      <div className="h-2.5 bg-muted rounded-full overflow-hidden mt-auto">
        <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[11px] text-muted-foreground mt-2">{activas} activas de {total} con etapa asignada</p>
    </div>
  )
}

// ─── Embudo de captación (real funnel from Socio.leadStage) ───────────────────

const FUNNEL_STAGES: { stage: LeadStage[]; label: string }[] = [
  { stage: ['LEAD', 'INTERESADA', 'PRUEBA', 'ACTIVA', 'EN_RIESGO', 'PERDIDA'], label: 'Leads captados' },
  { stage: ['INTERESADA', 'PRUEBA', 'ACTIVA', 'EN_RIESGO', 'PERDIDA'], label: 'Interesadas' },
  { stage: ['PRUEBA', 'ACTIVA', 'EN_RIESGO'], label: 'En prueba' },
  { stage: ['ACTIVA'], label: 'Convertidas' },
]

function ConversionFunnelCard({ socios }: { socios: { leadStage?: LeadStage }[] }) {
  const counts = FUNNEL_STAGES.map(({ stage, label }) => ({
    label,
    value: socios.filter(s => s.leadStage && stage.includes(s.leadStage)).length,
  }))
  const total = counts[0]?.value ?? 0

  if (total === 0) {
    return (
      <WidgetCard icon={Filter} title="Embudo de captación" className="lg:col-span-2">
        <div className="flex flex-col items-center justify-center text-center py-10">
          <p className="text-[14px] font-semibold text-foreground">Aún no hay leads en el embudo</p>
          <p className="text-[12px] text-muted-foreground mt-1">Asigna una etapa (lead, interesada, prueba…) a tus socias en su ficha para ver la conversión real aquí.</p>
        </div>
      </WidgetCard>
    )
  }

  return (
    <WidgetCard icon={Filter} title="Embudo de captación" action={<span className="text-[11px] font-semibold text-muted-foreground px-2">Todo el histórico</span>} className="lg:col-span-2">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {counts.map((c, i) => {
          const widthPct = total > 0 ? Math.max(8, (c.value / total) * 100) : 0
          const pctOfPrev = i === 0 ? 100 : counts[i - 1].value > 0 ? Math.round((c.value / counts[i - 1].value) * 100) : 0
          return (
            <div key={c.label}>
              <p className="text-[22px] font-extrabold text-foreground leading-none tabular-nums">{c.value}</p>
              <p className="text-[11px] text-muted-foreground mt-1 mb-3">{c.label}</p>
              <div className="h-16 flex items-end">
                <div
                  className={cn('w-full rounded-t-md', i === counts.length - 1 ? 'bg-brand' : 'bg-border')}
                  style={{ height: `${widthPct}%` }}
                />
              </div>
              <p className="text-[11px] font-semibold text-muted-foreground mt-1.5">{i === 0 ? '100%' : `${pctOfPrev}%`}</p>
            </div>
          )
        })}
      </div>
    </WidgetCard>
  )
}

// ─── Clases más demandadas (reemplaza el mapa — un estudio de un solo local no
// tiene "top ubicaciones", pero sí clases con más reservas reales) ────────────

function TopClasesCard({ sesiones, reservas, tiposClase }: {
  sesiones: { id: string; tipoClaseId: string }[]
  reservas: { sesionId: string; estado: string }[]
  tiposClase: { id: string; nombre: string; color: string }[]
}) {
  const conteos = new Map<string, number>()
  for (const r of reservas) {
    if (r.estado === 'CANCELADA') continue
    const s = sesiones.find(x => x.id === r.sesionId)
    if (!s) continue
    conteos.set(s.tipoClaseId, (conteos.get(s.tipoClaseId) ?? 0) + 1)
  }
  const ranking = tiposClase
    .map(t => ({ ...t, reservas: conteos.get(t.id) ?? 0 }))
    .sort((a, b) => b.reservas - a.reservas)
    .slice(0, 5)
  const max = Math.max(...ranking.map(r => r.reservas), 1)
  const total = ranking.reduce((a, r) => a + r.reservas, 0)

  return (
    <WidgetCard icon={BarChart3} title="Clases más demandadas" action={<span className="text-[11px] font-semibold text-muted-foreground px-2">Todo el histórico</span>} className="lg:col-span-2">
      {total === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-10">
          <p className="text-[14px] font-semibold text-foreground">Aún no hay reservas</p>
          <p className="text-[12px] text-muted-foreground mt-1">Cuando tus socias empiecen a reservar clases, verás aquí el ranking real de demanda.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {ranking.map(r => (
            <div key={r.id} className="flex items-center gap-3">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: r.color }} />
              <span className="text-[13px] font-semibold text-foreground w-36 truncate shrink-0">{r.nombre}</span>
              <div className="flex-1 h-2.5 bg-muted rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${(r.reservas / max) * 100}%`, backgroundColor: r.color }} />
              </div>
              <span className="text-[12px] font-bold text-foreground tabular-nums w-8 text-right shrink-0">{r.reservas}</span>
            </div>
          ))}
        </div>
      )}
    </WidgetCard>
  )
}

// ─── Desglose de ingresos por tipo de plan (donut, importes reales cobrados) ──

const PLAN_TIPO_COLOR: Record<string, string> = { MENSUAL: 'var(--brand)', BONO: '#F5D97A', PUNTUAL: '#A6D8F0' }
const PLAN_TIPO_LABEL: Record<string, string> = { MENSUAL: 'Mensual', BONO: 'Bonos', PUNTUAL: 'Clase suelta' }

function RevenueDonutCard({ recibos, suscripciones, planesTarifa }: {
  recibos: { suscripcionId: string | null; importe: number; estado: string }[]
  suscripciones: { id: string; planId: string }[]
  planesTarifa: { id: string; tipo: string }[]
}) {
  const totals: Record<string, number> = { MENSUAL: 0, BONO: 0, PUNTUAL: 0 }
  for (const r of recibos) {
    if (r.estado !== 'COBRADO') continue
    const sus = suscripciones.find(s => s.id === r.suscripcionId)
    const plan = sus ? planesTarifa.find(p => p.id === sus.planId) : null
    const tipo = plan?.tipo ?? 'PUNTUAL'
    totals[tipo] = (totals[tipo] ?? 0) + r.importe
  }
  const total = Object.values(totals).reduce((a, b) => a + b, 0)
  const R = 70, C = 2 * Math.PI * R
  let offset = 0

  return (
    <WidgetCard icon={PieChart} title="Ingresos por tipo de plan" className="lg:col-span-2">
      {total === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-10">
          <p className="text-[14px] font-semibold text-foreground">Aún no hay cobros registrados</p>
          <p className="text-[12px] text-muted-foreground mt-1">El desglose aparecerá en cuanto se cobren recibos.</p>
        </div>
      ) : (
        <>
          <div className="relative w-full flex items-center justify-center py-4">
            <svg viewBox="0 0 180 180" className="w-44 h-44 -rotate-90">
              <circle cx="90" cy="90" r={R} fill="none" stroke="var(--muted)" strokeWidth="16" />
              {Object.entries(totals).filter(([, v]) => v > 0).map(([tipo, v]) => {
                const frac = v / total
                const dash = frac * C
                const el = (
                  <circle
                    key={tipo}
                    cx="90" cy="90" r={R} fill="none"
                    stroke={PLAN_TIPO_COLOR[tipo]}
                    strokeWidth="16"
                    strokeDasharray={`${dash} ${C - dash}`}
                    strokeDashoffset={-offset}
                    strokeLinecap="round"
                  />
                )
                offset += dash
                return el
              })}
            </svg>
            <div className="absolute flex flex-col items-center">
              <p className="text-[24px] font-extrabold text-foreground leading-none">{total.toLocaleString('es-ES', { maximumFractionDigits: 0 })} €</p>
              <p className="text-[11px] text-muted-foreground mt-1">Ingresos cobrados</p>
            </div>
          </div>
          <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 mt-2">
            {Object.entries(totals).filter(([, v]) => v > 0).map(([tipo, v]) => (
              <div key={tipo} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: PLAN_TIPO_COLOR[tipo] }} />
                <div>
                  <p className="text-[12px] font-bold text-foreground leading-tight">{v.toLocaleString('es-ES', { maximumFractionDigits: 0 })} €</p>
                  <p className="text-[10px] text-muted-foreground leading-tight">{PLAN_TIPO_LABEL[tipo]}</p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </WidgetCard>
  )
}

// Progress bar for discount code usage
function UsageBar({ usos, usosMax }: { usos: number; usosMax: number | null }) {
  if (usosMax == null) {
    return <span className="text-muted-foreground">{usos} usos</span>
  }
  const pct = Math.min(100, Math.round((usos / usosMax) * 100))
  const barColor = pct >= 90 ? 'bg-[#DC2626]' : pct >= 60 ? 'bg-[#D97706]' : 'bg-[#059669]'
  return (
    <div className="flex flex-col gap-1 min-w-[80px]">
      <span className="text-xs text-muted-foreground">{usos} / {usosMax}</span>
      <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', barColor)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export default function MarketingPage() {
  const {
    campanas, addCampana, deleteCampana, duplicateCampana, updateCampana, enviarCampana,
    automatizaciones, toggleAutomatizacion, deleteAutomatizacion,
    codigosDescuento: codigos, addCodigoDescuento, toggleCodigoDescuento, deleteCodigoDescuento,
    socios,
    suscripciones,
    recibos, planesTarifa, sesiones, reservas, tiposClase,
  } = useStudio()
  const [tab, setTab] = useState<'resumen' | 'campanas' | 'automatizaciones' | 'codigos'>('resumen')

  // ── Resumen: leads captados por mes (últimos 6 meses, para el sparkline) ────
  const leadsPorMes = (() => {
    const now = new Date()
    const meses: { key: string; label: string }[] = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1)
      return { key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString('es-ES', { month: 'short' }) }
    })
    return meses.map(({ key, label }) => {
      const [y, m] = key.split('-').map(Number)
      const count = socios.filter(s => {
        const d = new Date(s.fechaAlta)
        return d.getFullYear() === y && d.getMonth() === m
      }).length
      return { label, count }
    })
  })()
  const totalLeadsActual = leadsPorMes[leadsPorMes.length - 1]?.count ?? 0
  const totalLeadsPrev = leadsPorMes[leadsPorMes.length - 2]?.count ?? 0
  const leadsDeltaPct = totalLeadsPrev > 0 ? ((totalLeadsActual - totalLeadsPrev) / totalLeadsPrev) * 100 : null

  const totalConLeadStage = socios.filter(s => s.leadStage).length
  const activas = socios.filter(s => s.leadStage === 'ACTIVA').length
  const tasaConversion = totalConLeadStage > 0 ? (activas / totalConLeadStage) * 100 : 0

  // Campañas modal
  const [showCampanaModal, setShowCampanaModal] = useState(false)
  const [editCampanaId, setEditCampanaId] = useState<string | null>(null)
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateKey | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const CAMPANA_VACIA = {
    nombre: '', tipo: 'EMAIL' as TipoCampana, asunto: '', destinatarios: 'TODAS',
    contenido: '', objetivo: '', presupuesto: '',
    publicaciones: [] as PublicacionAsociada[],
  }
  const [newCampana, setNewCampana] = useState(CAMPANA_VACIA)
  // Publicaciones del módulo Contenido disponibles para asociar (localStorage).
  const [pubsDisponibles, setPubsDisponibles] = useState<PublicacionAsociada[]>([])

  // Asistente IA de campañas
  const [objetivoIA, setObjetivoIA] = useState('')
  const [generandoIA, setGenerandoIA] = useState(false)
  const [errorIA, setErrorIA] = useState<string | null>(null)
  const [razonSegmentoIA, setRazonSegmentoIA] = useState<string | null>(null)

  // Automatizaciones: constructor de flujos + vista (tabla vs flujo visual)
  const [autoView, setAutoView] = useState<'tabla' | 'flujo'>('flujo')
  const [flowBuilder, setFlowBuilder] = useState<{ auto: Automatizacion | null } | null>(null)

  // Códigos modal
  const [showCodigoModal, setShowCodigoModal] = useState(false)
  const [newCodigo, setNewCodigo] = useState({
    codigo: '',
    descripcion: '',
    tipo: 'PORCENTAJE' as 'PORCENTAJE' | 'IMPORTE_FIJO',
    valor: '',
    usosMaximos: '',
    expira: '',
    minImporte: '',
    soloNuevas: false,
  })

  // Hover state for campaign cards
  const [hoveredCampana, setHoveredCampana] = useState<string | null>(null)
  const [enviandoId, setEnviandoId] = useState<string | null>(null)
  const [resultadoEnvio, setResultadoEnvio] = useState<string | null>(null)

  async function handleEnviarCampana(c: Campana) {
    if (enviandoId) return
    setEnviandoId(c.id)
    setResultadoEnvio(null)
    try {
      const { enviados, total } = await enviarCampana(c)
      setResultadoEnvio(
        total === 0
          ? `"${c.nombre}": no hay destinatarias con email en ese segmento.`
          : `"${c.nombre}" enviada a ${enviados} de ${total} destinatarias.`
      )
    } catch {
      setResultadoEnvio(`No se pudo enviar "${c.nombre}". Revisa la configuración de email.`)
    } finally {
      setEnviandoId(null)
    }
  }

  // Campañas stats
  const campanasActivas = campanas.filter(c => c.estado === 'ACTIVA' || c.estado === 'PAUSADA').length
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
  // Utilización media (% de usos sobre el límite, solo códigos con límite).
  const codigosConLimite = codigos.filter(c => c.usosMax && c.usosMax > 0)
  const utilizacionMedia = codigosConLimite.length > 0
    ? Math.round(codigosConLimite.reduce((acc, c) => acc + Math.min(100, ((c.usos ?? 0) / (c.usosMax as number)) * 100), 0) / codigosConLimite.length)
    : 0
  const codigoTop = [...codigos].sort((a, b) => (b.usos ?? 0) - (a.usos ?? 0))[0]

  // Ingresos generados en los últimos 30 días (recibos cobrados).
  const hace30d = new Date(); hace30d.setDate(hace30d.getDate() - 30)
  const ingresos30d = recibos
    .filter(r => r.estado === 'COBRADO' && r.fechaCobro && new Date(r.fechaCobro) >= hace30d)
    .reduce((acc, r) => acc + (r.importe ?? 0), 0)

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

  function abrirNuevaCampana() {
    setEditCampanaId(null)
    setNewCampana(CAMPANA_VACIA)
    setPubsDisponibles(leerPublicacionesContenido().map(p => ({ id: p.id, titulo: p.titulo, plataformas: p.plataformas })))
    setSelectedTemplate(null)
    setShowPreview(false)
    setShowCampanaModal(true)
  }

  function abrirEditarCampana(c: Campana) {
    setEditCampanaId(c.id)
    setNewCampana({
      nombre: c.nombre, tipo: c.tipo, asunto: c.asunto ?? '', destinatarios: c.destinatarios,
      contenido: c.contenido ?? '', objetivo: c.objetivo ?? '',
      presupuesto: c.presupuesto != null ? String(c.presupuesto) : '',
      publicaciones: c.publicaciones ?? [],
    })
    setPubsDisponibles(leerPublicacionesContenido().map(p => ({ id: p.id, titulo: p.titulo, plataformas: p.plataformas })))
    setSelectedTemplate(null)
    setShowPreview(false)
    setShowCampanaModal(true)
  }

  function togglePubAsociada(p: PublicacionAsociada) {
    setNewCampana(prev => {
      const yaEsta = prev.publicaciones.some(x => x.id === p.id)
      return { ...prev, publicaciones: yaEsta ? prev.publicaciones.filter(x => x.id !== p.id) : [...prev.publicaciones, p] }
    })
  }

  function handleAddCampana() {
    if (!newCampana.nombre.trim()) return
    const campos = {
      nombre: newCampana.nombre,
      tipo: newCampana.tipo,
      asunto: newCampana.asunto,
      destinatarios: newCampana.destinatarios as any,
      contenido: newCampana.contenido,
      objetivo: newCampana.objetivo.trim() || null,
      presupuesto: newCampana.presupuesto ? parseFloat(newCampana.presupuesto) : null,
      publicaciones: newCampana.publicaciones.length ? newCampana.publicaciones : null,
    }
    if (editCampanaId) {
      updateCampana(editCampanaId, campos)
    } else {
      addCampana({ ...campos, estado: 'BORRADOR', enviadaEn: null, programadaEn: null })
    }
    setNewCampana(CAMPANA_VACIA)
    setEditCampanaId(null)
    setSelectedTemplate(null)
    setShowPreview(false)
    setObjetivoIA('')
    setErrorIA(null)
    setRazonSegmentoIA(null)
    setShowCampanaModal(false)
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
      minImporte: newCodigo.minImporte ? parseFloat(newCodigo.minImporte) : null,
      soloNuevas: newCodigo.soloNuevas,
    })
    setNewCodigo({ codigo: '', descripcion: '', tipo: 'PORCENTAJE', valor: '', usosMaximos: '', expira: '', minImporte: '', soloNuevas: false })
    setShowCodigoModal(false)
  }

  function handleSelectTemplate(key: TemplateKey) {
    setSelectedTemplate(key)
    setNewCampana(p => ({ ...p, contenido: TEMPLATES[key].text }))
    setShowPreview(false)
  }

  async function handleGenerarIA() {
    if (!objetivoIA.trim() || generandoIA) return
    setGenerandoIA(true)
    setErrorIA(null)
    setRazonSegmentoIA(null)
    try {
      const segmentos = Object.entries(destinatariosLabel).map(([value, label]) => ({
        value, label, count: recipientCount[value] ?? 0,
      }))
      const res = await fetch('/api/ai/campana-asistente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({ objetivo: objetivoIA, tipo: newCampana.tipo, segmentos }),
      })
      const data = await res.json()
      if (!res.ok) {
        setErrorIA(data.error ?? 'No se pudo generar la campaña')
        return
      }
      setNewCampana(p => ({
        ...p,
        nombre: data.nombre || p.nombre,
        asunto: data.asunto || p.asunto,
        contenido: data.contenido || p.contenido,
        destinatarios: data.destinatariosSugeridos || p.destinatarios,
      }))
      setRazonSegmentoIA(data.razonSegmento ?? null)
      setSelectedTemplate(null)
      setShowPreview(false)
    } catch {
      setErrorIA('Error de conexión con el asistente IA')
    } finally {
      setGenerandoIA(false)
    }
  }

  const tipoBadge = (tipo: string) => {
    if (tipo === 'EMAIL') return 'bg-[#DBEAFE] text-[#1D4ED8]'
    if (tipo === 'WHATSAPP') return 'bg-[#D1FAE5] text-[#065F46]'
    return 'bg-[#FEF3C7] text-[#92400E]'
  }

  const accionBadge = (accion: string) => {
    if (accion === 'EMAIL') return 'bg-[#DBEAFE] text-[#1D4ED8]'
    if (accion === 'WHATSAPP') return 'bg-[#D1FAE5] text-[#065F46]'
    return 'bg-muted text-muted-foreground'
  }

  const accionIcon = (accion: string) => {
    if (accion === 'EMAIL') return <Mail className="w-3 h-3" />
    if (accion === 'WHATSAPP') return <MessageSquare className="w-3 h-3" />
    return <Bell className="w-3 h-3" />
  }

  return (
    <div className="min-h-screen bg-background p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">Marketing</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1 flex-nowrap">
        {(['resumen', 'campanas', 'automatizaciones', 'codigos'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'px-4 py-2 text-sm rounded-lg transition-colors',
              tab === t
                ? 'bg-card border border-border text-foreground font-medium'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {t === 'resumen' ? 'Resumen' : t === 'campanas' ? 'Campañas' : t === 'automatizaciones' ? 'Automatizaciones' : 'Códigos de descuento'}
          </button>
        ))}
      </div>

      {/* ==================== TAB 0: RESUMEN ==================== */}
      {tab === 'resumen' && (
        <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: 'Ingresos (30 días)', value: `${ingresos30d.toLocaleString('es-ES', { maximumFractionDigits: 0 })} €`, sub: 'recibos cobrados' },
            { label: 'Campañas activas', value: String(campanasActivas), sub: `${enviadas.length} enviadas` },
            { label: 'Conversión a socia', value: `${Math.round(tasaConversion)}%`, sub: `${activas} de ${totalConLeadStage} leads` },
            { label: 'Automatizaciones activas', value: String(autoActivas), sub: `${totalEjecuciones} ejecuciones` },
            { label: 'Apertura media (envíos)', value: `${tasaApertura}%`, sub: `${enviadas.length} campañas` },
            { label: 'Usos de códigos', value: String(totalUsos), sub: `${codigosActivos} activos` },
          ].map(k => (
            <div key={k.label} className="bg-card border border-border rounded-2xl p-4">
              <p className="text-[12px] text-muted-foreground mb-1">{k.label}</p>
              <p className="text-2xl font-bold text-foreground tabular-nums leading-none">{k.value}</p>
              <p className="text-[11px] text-muted-foreground mt-1.5">{k.sub}</p>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <ConversionFunnelCard socios={socios} />
          <KpiTrendCard
            title="Leads captados (este mes)"
            value={String(totalLeadsActual)}
            deltaPct={leadsDeltaPct}
            points={leadsPorMes.map(m => m.count)}
            color="var(--brand)"
            axisLabels={leadsPorMes.map(m => m.label)}
          />
          <ConversionRatioCard activas={activas} total={totalConLeadStage} />
          <TopClasesCard sesiones={sesiones} reservas={reservas} tiposClase={tiposClase} />
          <RevenueDonutCard recibos={recibos} suscripciones={suscripciones} planesTarifa={planesTarifa} />
        </div>
        </div>
      )}

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
                <div key={s.label} className="bg-card border border-border rounded-xl px-4 py-3 min-w-[110px]">
                  <p className="text-xs text-muted-foreground mb-1">{s.label}</p>
                  <p className="text-xl font-bold text-foreground">{s.value}</p>
                </div>
              ))}
            </div>
            <button
              onClick={abrirNuevaCampana}
              className="flex items-center gap-2 bg-brand text-brand-foreground rounded-lg px-4 py-2 text-sm font-medium hover:brightness-95 transition-colors shrink-0"
            >
              <Plus className="w-4 h-4" />
              Nueva campaña
            </button>
          </div>

          {resultadoEnvio && (
            <div className="mb-3 flex items-center justify-between gap-3 rounded-lg bg-[#D1FAE5] text-[#065F46] text-sm px-4 py-2.5">
              <span>{resultadoEnvio}</span>
              <button onClick={() => setResultadoEnvio(null)} className="text-[#065F46]/70 hover:text-[#065F46]">✕</button>
            </div>
          )}

          {/* Campaign list */}
          {campanas.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">Sin campañas</div>
          ) : (
            <div className="space-y-3">
              {campanas.map(c => (
                <div
                  key={c.id}
                  className="bg-card border border-border rounded-xl p-5 relative group"
                  onMouseEnter={() => setHoveredCampana(c.id)}
                  onMouseLeave={() => setHoveredCampana(null)}
                >
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        <span className="font-semibold text-foreground">{c.nombre}</span>
                        <span className={cn('px-2 py-0.5 rounded-md text-xs font-medium', tipoBadge(c.tipo))}>{c.tipo}</span>
                        <EstadoBadge estado={c.estado} programadaEn={c.programadaEn} enviadaEn={c.enviadaEn} />
                      </div>
                      <p className="text-xs text-muted-foreground mb-2">{destinatariosLabel[c.destinatarios] ?? c.destinatarios}</p>
                      {(c.objetivo || (c.presupuesto != null && c.presupuesto > 0) || (c.publicaciones && c.publicaciones.length > 0)) && (
                        <div className="flex items-center gap-1.5 flex-wrap mb-2">
                          {c.objetivo && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-muted text-muted-foreground rounded-md px-2 py-0.5">
                              🎯 {c.objetivo}
                            </span>
                          )}
                          {c.presupuesto != null && c.presupuesto > 0 && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-muted text-muted-foreground rounded-md px-2 py-0.5">
                              Presupuesto: {c.presupuesto.toLocaleString('es-ES')} €
                            </span>
                          )}
                          {c.publicaciones && c.publicaciones.length > 0 && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-muted text-muted-foreground rounded-md px-2 py-0.5">
                              <Sparkles className="w-3 h-3" /> {c.publicaciones.length} publicacion{c.publicaciones.length === 1 ? '' : 'es'}
                            </span>
                          )}
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Enviados: {c.enviados} · Abiertos: {c.abiertos}{c.enviados > 0 ? ` (${Math.round((c.abiertos / c.enviados) * 100)}%)` : ''} · Clics: {c.clics}{c.enviados > 0 ? ` (${Math.round((c.clics / c.enviados) * 100)}%)` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {(c.estado === 'BORRADOR' || c.estado === 'PROGRAMADA') && (
                        <button
                          onClick={() => handleEnviarCampana(c)}
                          disabled={enviandoId === c.id}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-[#333] disabled:opacity-60 transition-colors"
                          title="Enviar campaña ahora"
                        >
                          {enviandoId === c.id
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <Send className="w-3.5 h-3.5" />}
                          {enviandoId === c.id ? 'Enviando…' : 'Enviar'}
                        </button>
                      )}
                      {(c.estado === 'BORRADOR' || c.estado === 'PROGRAMADA') && (
                        <button
                          onClick={() => updateCampana(c.id, { estado: 'ACTIVA' })}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-foreground text-xs font-medium hover:bg-muted transition-colors"
                          title="Activar como campaña en curso"
                        >
                          <Play className="w-3.5 h-3.5" /> Activar
                        </button>
                      )}
                      {c.estado === 'ACTIVA' && (
                        <button
                          onClick={() => updateCampana(c.id, { estado: 'PAUSADA' })}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-foreground text-xs font-medium hover:bg-muted transition-colors"
                          title="Pausar campaña"
                        >
                          <Pause className="w-3.5 h-3.5" /> Pausar
                        </button>
                      )}
                      {c.estado === 'PAUSADA' && (
                        <button
                          onClick={() => updateCampana(c.id, { estado: 'ACTIVA' })}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-foreground text-xs font-medium hover:bg-muted transition-colors"
                          title="Reanudar campaña"
                        >
                          <Play className="w-3.5 h-3.5" /> Reanudar
                        </button>
                      )}
                      {(c.estado === 'ACTIVA' || c.estado === 'PAUSADA') && (
                        <button
                          onClick={() => updateCampana(c.id, { estado: 'ENVIADA', enviadaEn: c.enviadaEn ?? new Date().toISOString() })}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground text-xs font-medium hover:bg-muted transition-colors"
                          title="Finalizar campaña"
                        >
                          <Flag className="w-3.5 h-3.5" /> Finalizar
                        </button>
                      )}
                      <span className="text-xs text-muted-foreground">{formatDateEs(c.creadaEn)}</span>
                      <div className={cn('flex gap-1 transition-opacity', hoveredCampana === c.id ? 'opacity-100' : 'opacity-0')}>
                        <button
                          onClick={() => abrirEditarCampana(c)}
                          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                          title="Editar"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => duplicateCampana(c)}
                          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                          title="Duplicar"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => deleteCampana(c.id)}
                          className="p-1.5 rounded-lg hover:bg-[#FEE2E2] text-muted-foreground hover:text-[#DC2626] transition-colors"
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
                <div key={s.label} className="bg-card border border-border rounded-xl px-5 py-3 min-w-[130px]">
                  <p className="text-xs text-muted-foreground mb-1">{s.label}</p>
                  <p className="text-xl font-bold text-foreground">{s.value}</p>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="flex items-center rounded-lg border border-border p-0.5">
                {(['flujo', 'tabla'] as const).map(v => (
                  <button
                    key={v}
                    onClick={() => setAutoView(v)}
                    className={cn('px-3 py-1.5 text-xs font-medium rounded-md capitalize transition-colors', autoView === v ? 'bg-card border border-border text-foreground' : 'text-muted-foreground hover:text-foreground')}
                  >
                    {v}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setFlowBuilder({ auto: null })}
                className="flex items-center gap-2 bg-brand text-brand-foreground rounded-lg px-4 py-2 text-sm font-medium hover:brightness-95 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Nuevo flujo
              </button>
            </div>
          </div>

          {automatizaciones.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">Sin automatizaciones</div>
          ) : autoView === 'flujo' ? (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              {automatizaciones.map(a => {
                const pasos = a.pasos && a.pasos.length ? a.pasos : null
                return (
                <div key={a.id} className={cn('bg-card border rounded-2xl p-4', a.activa ? 'border-border' : 'border-border opacity-70')}>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span className="font-semibold text-foreground text-[14px]">{a.nombre}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => setFlowBuilder({ auto: a })} title="Editar flujo" className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => deleteAutomatizacion(a.id)} title="Eliminar" className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-rose-600 hover:bg-rose-500/10 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                      <button
                        onClick={() => toggleAutomatizacion(a.id)}
                        className={cn('w-10 h-[22px] rounded-full transition-colors relative shrink-0 ml-1', a.activa ? 'bg-primary' : 'bg-muted-foreground/40')}
                        aria-label={a.activa ? 'Desactivar' : 'Activar'}
                      >
                        <span className={cn('absolute top-0.5 w-[18px] h-[18px] rounded-full bg-card shadow transition-all', a.activa ? 'left-[calc(100%-1.25rem-0.125rem)]' : 'left-0.5')} />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-stretch gap-2 overflow-x-auto no-scrollbar pb-1">
                    {/* Desencadenante */}
                    <div className="min-w-[150px] shrink-0 rounded-xl border border-border bg-muted/40 p-3">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Zap className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Cuando</span>
                      </div>
                      <p className="text-[13px] font-semibold text-foreground leading-snug">{triggerLabel[a.trigger] ?? a.trigger}</p>
                    </div>
                    {pasos ? pasos.map((paso, idx) => {
                      const meta = ACCIONES[paso.accion]
                      const Icon = meta.icon
                      const resumen = paso.config[meta.campos[0]?.key] || meta.label
                      return (
                        <div key={paso.id ?? idx} className="flex items-stretch gap-2 shrink-0">
                          <div className="flex items-center text-muted-foreground"><ArrowRight className="w-4 h-4" /></div>
                          <div className="min-w-[150px] rounded-xl border border-border bg-muted/40 p-3">
                            <div className="flex items-center gap-1.5 mb-1">
                              <span className="w-4 h-4 rounded-full flex items-center justify-center text-white" style={{ background: meta.color }}><Icon className="w-2.5 h-2.5" /></span>
                              <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{meta.label}</span>
                            </div>
                            <p className="text-[11px] text-foreground leading-snug line-clamp-2">{resumen}</p>
                          </div>
                        </div>
                      )
                    }) : (
                      <div className="flex items-stretch gap-2 shrink-0">
                        <div className="flex items-center text-muted-foreground"><ArrowRight className="w-4 h-4" /></div>
                        <div className="min-w-[150px] rounded-xl border border-border bg-muted/40 p-3">
                          <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Entonces</span>
                          <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium mt-1', accionBadge(a.accion))}>
                            {accionIcon(a.accion)}{a.accion}
                          </span>
                        </div>
                      </div>
                    )}
                    <div className="flex items-center text-muted-foreground shrink-0"><ArrowRight className="w-4 h-4" /></div>
                    <div className="w-[92px] shrink-0 rounded-xl border border-border p-3 flex flex-col justify-center items-center text-center">
                      <span className="text-lg font-bold text-foreground tabular-nums leading-none">{a.ejecutadas ?? 0}</span>
                      <span className="text-[10px] text-muted-foreground mt-1">ejecuciones</span>
                    </div>
                  </div>
                </div>
              )})}
            </div>
          ) : (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              {/* Desktop table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm min-w-[700px]">
                  <thead>
                    <tr className="border-b border-border">
                      {['Automatización', 'Cuándo se activa', 'Qué hace', 'Ejecuciones', 'Última ejecución', 'Estado'].map(col => (
                        <th key={col} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {automatizaciones.map((a, i) => (
                      <tr key={a.id} className={cn('border-b border-border last:border-0', i % 2 === 0 ? 'bg-card' : 'bg-muted')}>
                        <td className="px-4 py-4">
                          <span className="font-semibold text-foreground">{a.nombre}</span>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-start gap-1.5">
                            <Zap className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                            <div>
                              <p className="text-sm text-foreground font-medium leading-snug">{triggerLabel[a.trigger] ?? a.trigger}</p>
                              <p className="text-xs text-muted-foreground leading-snug mt-0.5">{triggerDesc[a.trigger] ?? ''}</p>
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
                          <p className="text-xs text-muted-foreground mt-1">{accionDesc[a.accion] ?? ''}</p>
                        </td>
                        <td className="px-4 py-4">
                          <span className="text-foreground font-medium">{a.ejecutadas ?? 0}</span>
                        </td>
                        <td className="px-4 py-4">
                          <span className={cn('text-sm', (a.ejecutadas ?? 0) === 0 ? 'text-muted-foreground italic' : 'text-muted-foreground')}>
                            {(a.ejecutadas ?? 0) === 0 ? 'Nunca' : 'Reciente'}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <button
                            onClick={() => toggleAutomatizacion(a.id)}
                            className={cn(
                              'w-10 h-[22px] rounded-full transition-colors relative shrink-0',
                              a.activa ? 'bg-primary' : 'bg-muted-foreground/40'
                            )}
                            aria-label={a.activa ? 'Desactivar' : 'Activar'}
                          >
                            <span
                              className={cn(
                                'absolute top-0.5 w-[18px] h-[18px] rounded-full bg-card shadow transition-all',
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

              {/* Mobile cards */}
              <div className="sm:hidden divide-y divide-border">
                {automatizaciones.map(a => (
                  <div key={a.id} className="p-4 space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-semibold text-foreground text-[14px]">{a.nombre}</span>
                      <button
                        onClick={() => toggleAutomatizacion(a.id)}
                        className={cn('w-10 h-[22px] rounded-full transition-colors relative shrink-0', a.activa ? 'bg-primary' : 'bg-muted-foreground/40')}
                        aria-label={a.activa ? 'Desactivar' : 'Activar'}
                      >
                        <span className={cn('absolute top-0.5 w-[18px] h-[18px] rounded-full bg-card shadow transition-all', a.activa ? 'left-[calc(100%-1.25rem-0.125rem)]' : 'left-0.5')} />
                      </button>
                    </div>
                    <div className="flex items-start gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                      <p className="text-[13px] text-foreground font-medium leading-snug">{triggerLabel[a.trigger] ?? a.trigger}</p>
                    </div>
                    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium', accionBadge(a.accion))}>
                      {accionIcon(a.accion)}
                      {a.accion}
                    </span>
                    <p className="text-[11px] text-muted-foreground">
                      {a.ejecutadas ?? 0} ejecuciones · {(a.ejecutadas ?? 0) === 0 ? 'nunca ejecutada' : 'ejecución reciente'}
                    </p>
                  </div>
                ))}
              </div>
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
                { label: 'Total códigos', value: String(codigos.length), sub: '' },
                { label: 'Activos', value: String(codigosActivos), sub: '' },
                { label: 'Conversiones (usos)', value: String(totalUsos), sub: 'canjes totales' },
                { label: 'Utilización media', value: `${utilizacionMedia}%`, sub: `${codigosConLimite.length} con límite` },
                { label: 'Código top', value: codigoTop ? codigoTop.codigo : '—', sub: codigoTop ? `${codigoTop.usos ?? 0} usos` : '' },
              ].map(s => (
                <div key={s.label} className="bg-card border border-border rounded-xl px-5 py-3 min-w-[120px]">
                  <p className="text-xs text-muted-foreground mb-1">{s.label}</p>
                  <p className="text-xl font-bold text-foreground truncate max-w-[140px]">{s.value}</p>
                  {s.sub && <p className="text-[11px] text-muted-foreground mt-0.5">{s.sub}</p>}
                </div>
              ))}
            </div>
            <button
              onClick={() => setShowCodigoModal(true)}
              className="flex items-center gap-2 bg-brand text-brand-foreground rounded-lg px-4 py-2 text-sm font-medium hover:brightness-95 transition-colors shrink-0"
            >
              <Plus className="w-4 h-4" />
              Nuevo código
            </button>
          </div>

          {codigos.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">Sin códigos</div>
          ) : (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              {/* Desktop table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm min-w-[650px]">
                  <thead>
                    <tr className="border-b border-border">
                      {['Código', 'Descripción', 'Descuento', 'Usos', 'Expira', 'Estado', 'Acciones'].map(col => (
                        <th key={col} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {codigos.map((cod, i) => (
                      <tr key={cod.id} className={cn('border-b border-border last:border-0', i % 2 === 0 ? 'bg-card' : 'bg-muted')}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-foreground text-sm">{cod.codigo}</span>
                            <CopyButton text={cod.codigo} />
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          <span>{cod.descripcion || '—'}</span>
                          {(cod.soloNuevas || (cod.minImporte != null && cod.minImporte > 0)) && (
                            <div className="flex items-center gap-1 flex-wrap mt-1">
                              {cod.minImporte != null && cod.minImporte > 0 && (
                                <span className="text-[10px] font-medium bg-muted text-muted-foreground rounded px-1.5 py-0.5">mín. {cod.minImporte.toLocaleString('es-ES')} €</span>
                              )}
                              {cod.soloNuevas && (
                                <span className="text-[10px] font-medium bg-muted text-muted-foreground rounded px-1.5 py-0.5">solo nuevas</span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-foreground font-medium">
                          {cod.tipo === 'PORCENTAJE' ? `${cod.valor}%` : `${cod.valor} €`}
                        </td>
                        <td className="px-4 py-3">
                          <UsageBar usos={cod.usos} usosMax={cod.usosMax} />
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{formatDateEs(cod.expira)}</td>
                        <td className="px-4 py-3">
                          <span className={cn('px-2 py-0.5 rounded-md text-xs font-medium', cod.activo ? 'bg-[#D1FAE5] text-[#065F46]' : 'bg-muted text-muted-foreground')}>
                            {cod.activo ? 'Activo' : 'Inactivo'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => toggleCodigoDescuento(cod.id)}
                              className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                              title={cod.activo ? 'Desactivar' : 'Activar'}
                            >
                              {cod.activo ? <ToggleRight className="w-4 h-4 text-[#059669]" /> : <ToggleLeft className="w-4 h-4" />}
                            </button>
                            <button
                              onClick={() => deleteCodigoDescuento(cod.id)}
                              className="p-1.5 rounded-lg hover:bg-[#FEE2E2] text-muted-foreground hover:text-[#DC2626] transition-colors"
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

              {/* Mobile cards */}
              <div className="sm:hidden divide-y divide-border">
                {codigos.map(cod => (
                  <div key={cod.id} className="p-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-foreground text-sm">{cod.codigo}</span>
                        <CopyButton text={cod.codigo} />
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => toggleCodigoDescuento(cod.id)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground" title={cod.activo ? 'Desactivar' : 'Activar'}>
                          {cod.activo ? <ToggleRight className="w-4 h-4 text-[#059669]" /> : <ToggleLeft className="w-4 h-4" />}
                        </button>
                        <button onClick={() => deleteCodigoDescuento(cod.id)} className="p-1.5 rounded-lg hover:bg-[#FEE2E2] text-muted-foreground" title="Eliminar">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    {cod.descripcion && <p className="text-[12px] text-muted-foreground">{cod.descripcion}</p>}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[12px] font-semibold text-foreground bg-muted px-2 py-0.5 rounded-md">
                        {cod.tipo === 'PORCENTAJE' ? `${cod.valor}%` : `${cod.valor} €`}
                      </span>
                      <span className={cn('px-2 py-0.5 rounded-md text-xs font-medium', cod.activo ? 'bg-[#D1FAE5] text-[#065F46]' : 'bg-muted text-muted-foreground')}>
                        {cod.activo ? 'Activo' : 'Inactivo'}
                      </span>
                      <span className="text-[11px] text-muted-foreground">Expira {formatDateEs(cod.expira)}</span>
                      {cod.minImporte != null && cod.minImporte > 0 && (
                        <span className="text-[10px] font-medium bg-muted text-muted-foreground rounded px-1.5 py-0.5">mín. {cod.minImporte.toLocaleString('es-ES')} €</span>
                      )}
                      {cod.soloNuevas && (
                        <span className="text-[10px] font-medium bg-muted text-muted-foreground rounded px-1.5 py-0.5">solo nuevas</span>
                      )}
                    </div>
                    <UsageBar usos={cod.usos} usosMax={cod.usosMax} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ==================== MODAL: NUEVA CAMPAÑA ==================== */}
      <Dialog open={showCampanaModal} onOpenChange={(open) => {
        setShowCampanaModal(open)
        if (!open) { setEditCampanaId(null); setNewCampana(CAMPANA_VACIA); setSelectedTemplate(null); setShowPreview(false); setObjetivoIA(''); setErrorIA(null); setRazonSegmentoIA(null) }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editCampanaId ? 'Editar campaña' : 'Nueva campaña'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {/* Asistente IA */}
            <div className="rounded-xl border border-[#F0D5E3] bg-[#FFF7FB] p-3.5 space-y-2.5">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-brand-secondary" />
                <span className="text-[12px] font-bold text-foreground">Escribe la campaña con IA</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  className={cn(inputCls, 'bg-card')}
                  placeholder="Ej. recuérdales que se les acaba el bono y ofréceles 10% en la renovación"
                  value={objetivoIA}
                  onChange={e => setObjetivoIA(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleGenerarIA() } }}
                />
                <button
                  onClick={handleGenerarIA}
                  disabled={!objetivoIA.trim() || generandoIA}
                  className="shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-40"
                >
                  {generandoIA ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  Generar
                </button>
              </div>
              {errorIA && <p className="text-[11px] text-[#DC2626]">{errorIA}</p>}
              {razonSegmentoIA && (
                <p className="text-[11px] text-muted-foreground">
                  <span className="font-semibold text-brand-secondary">Segmento elegido: </span>{razonSegmentoIA}
                </p>
              )}
            </div>

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
                <span className="shrink-0 text-xs font-medium text-muted-foreground bg-muted px-2.5 py-1.5 rounded-lg whitespace-nowrap">
                  ~{recipientCount[newCampana.destinatarios] ?? 0} destinatarias
                </span>
              </div>
            </FF>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FF label="Objetivo (opcional)">
                <input
                  className={inputCls}
                  placeholder="Ej. recuperar socias inactivas"
                  value={newCampana.objetivo}
                  onChange={e => setNewCampana(p => ({ ...p, objetivo: e.target.value }))}
                />
              </FF>
              <FF label="Presupuesto (opcional)">
                <div className="relative">
                  <input
                    type="number" min="0" step="0.01"
                    className={cn(inputCls, 'pr-7')}
                    placeholder="0"
                    value={newCampana.presupuesto}
                    onChange={e => setNewCampana(p => ({ ...p, presupuesto: e.target.value }))}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">€</span>
                </div>
              </FF>
            </div>

            {/* Publicaciones asociadas (módulo Contenido) */}
            <FF label={`Publicaciones asociadas${newCampana.publicaciones.length ? ` (${newCampana.publicaciones.length})` : ''}`}>
              {pubsDisponibles.length === 0 ? (
                <p className="text-[12px] text-muted-foreground">No hay publicaciones en el módulo de Contenido para asociar.</p>
              ) : (
                <div className="max-h-36 overflow-y-auto rounded-lg border border-border divide-y divide-border">
                  {pubsDisponibles.map(pub => {
                    const sel = newCampana.publicaciones.some(x => x.id === pub.id)
                    return (
                      <label key={pub.id} className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/50 transition-colors">
                        <input type="checkbox" className="w-4 h-4 rounded border-border accent-[var(--brand)]" checked={sel} onChange={() => togglePubAsociada(pub)} />
                        <span className="text-[13px] text-foreground truncate flex-1">{pub.titulo}</span>
                        {pub.plataformas && pub.plataformas.length > 0 && (
                          <span className="text-[10px] text-muted-foreground uppercase">{pub.plataformas.join(', ')}</span>
                        )}
                      </label>
                    )
                  })}
                </div>
              )}
            </FF>

            {/* Content section */}
            <div className="space-y-3 pt-1">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Contenido</label>

              {/* Template picker */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {(Object.entries(TEMPLATES) as [TemplateKey, typeof TEMPLATES[TemplateKey]][]).map(([key, tpl]) => (
                  <button
                    key={key}
                    onClick={() => handleSelectTemplate(key)}
                    className={cn(
                      'flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all text-center',
                      selectedTemplate === key
                        ? 'border-foreground bg-muted'
                        : 'border-border hover:border-muted-foreground bg-card'
                    )}
                  >
                    <span className="text-2xl">{tpl.emoji}</span>
                    <span className="text-xs font-semibold text-foreground">{tpl.label}</span>
                    <span className="text-[10px] text-muted-foreground">Plantilla</span>
                  </button>
                ))}
              </div>

              {/* Preview toggle */}
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">Variables: {'{nombre}'}, {'{fecha}'}, {'{plan}'}</p>
                {newCampana.contenido && (
                  <button
                    onClick={() => setShowPreview(p => !p)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    {showPreview ? 'Editar' : 'Vista previa'}
                  </button>
                )}
              </div>

              {showPreview ? (
                /* Email preview card */
                <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
                  <div className="border-b border-muted pb-3 mb-3">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Vista previa</p>
                    {newCampana.asunto && (
                      <p className="text-sm font-semibold text-foreground mt-1">{newCampana.asunto}</p>
                    )}
                  </div>
                  <div className="text-sm text-foreground whitespace-pre-line leading-relaxed">
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
                className="px-4 py-2 text-sm rounded-lg bg-card border border-border text-foreground hover:bg-muted transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleAddCampana}
                className="px-4 py-2 text-sm rounded-lg bg-brand text-brand-foreground hover:brightness-95 transition-colors font-medium"
              >
                {editCampanaId ? 'Guardar cambios' : 'Crear campaña'}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ==================== CONSTRUCTOR DE FLUJOS ==================== */}
      {flowBuilder && (
        <FlowBuilder key={flowBuilder.auto?.id ?? 'nuevo'} open onClose={() => setFlowBuilder(null)} automatizacion={flowBuilder.auto} />
      )}

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
            {/* Restricciones */}
            <div className="grid grid-cols-2 gap-4 items-end">
              <FF label="Importe mínimo (opcional)">
                <div className="relative">
                  <input
                    className={cn(inputCls, 'pr-7')}
                    type="number" min={0} step="0.01"
                    placeholder="Sin mínimo"
                    value={newCodigo.minImporte}
                    onChange={e => setNewCodigo(p => ({ ...p, minImporte: e.target.value }))}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">€</span>
                </div>
              </FF>
              <label className="flex items-center gap-2 h-[38px] cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded border-border accent-[var(--brand)]"
                  checked={newCodigo.soloNuevas}
                  onChange={e => setNewCodigo(p => ({ ...p, soloNuevas: e.target.checked }))}
                />
                <span className="text-sm text-foreground">Solo clientas nuevas</span>
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowCodigoModal(false)}
                className="px-4 py-2 text-sm rounded-lg bg-card border border-border text-foreground hover:bg-muted transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleAddCodigo}
                className="px-4 py-2 text-sm rounded-lg bg-brand text-brand-foreground hover:brightness-95 transition-colors font-medium"
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
