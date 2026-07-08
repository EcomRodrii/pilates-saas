'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Plus, Copy, Trash2, ToggleLeft, ToggleRight, Mail, MessageSquare, Bell, Zap, Eye, EyeOff, Check, Filter, BarChart3, PieChart, MoreVertical, Sparkles, Loader2, Send } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useStudio } from '@/lib/studio-context'
import { authHeader } from '@/lib/api-client'
import type { Campana, Automatizacion, CodigoDescuento, TipoCampana, TriggerAutomatizacion, LeadStage } from '@/lib/types'


function FF({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-semibold uppercase tracking-wide text-[#8E8E86]">{label}</label>
      {children}
    </div>
  )
}

const inputCls = 'w-full rounded-lg border border-[#E7E7E0] px-3 py-2 text-sm text-[#1A1A1A] placeholder-[#A8A89F] focus:outline-none focus:ring-2 focus:ring-[#1A1A1A]/10'
const selectCls = 'w-full rounded-lg border border-[#E7E7E0] px-3 py-2 text-sm text-[#1A1A1A] bg-white focus:outline-none focus:ring-2 focus:ring-[#1A1A1A]/10'

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
    estado === 'BORRADOR' ? 'bg-[#A8A89F]' :
    estado === 'ACTIVA' ? 'bg-[#7AA80E]' :
    estado === 'PAUSADA' ? 'bg-[#EA580C]' :
    'bg-[#A8A89F]'

  const bgColor =
    estado === 'ENVIADA' ? 'bg-[#D1FAE5] text-[#065F46]' :
    estado === 'PROGRAMADA' ? 'bg-[#FEF3C7] text-[#92400E]' :
    estado === 'BORRADOR' ? 'bg-[#F1F1EC] text-[#8E8E86]' :
    estado === 'ACTIVA' ? 'bg-[#DBEAFE] text-[#1D4ED8]' :
    estado === 'PAUSADA' ? 'bg-[#FFEDD5] text-[#C2410C]' :
    'bg-[#F1F1EC] text-[#8E8E86]'

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
            : 'bg-white border-[#E7E7E0] text-[#8E8E86] hover:text-[#1A1A1A] hover:border-[#D1D5DB]'
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
    <div className={cn('bg-white border border-[#E7E7E0] rounded-3xl p-5', className)}>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-full border border-[#E7E7E0] flex items-center justify-center shrink-0">
            <Icon size={14} className="text-[#1A1A1A]" />
          </span>
          <h3 className="text-[15px] font-bold text-[#1A1A1A]">{title}</h3>
        </div>
        <div className="flex items-center gap-2">
          {action}
          <span className="w-7 h-7 rounded-full flex items-center justify-center text-[#A8A89F]">
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
    <div className="bg-white border border-[#E7E7E0] rounded-3xl p-5 flex flex-col">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[26px] font-extrabold text-[#1A1A1A] leading-none tabular-nums">{value}</span>
        {deltaPct !== null && (
          <span className={cn(
            'text-[11px] font-bold px-2 py-0.5 rounded-full',
            positive ? 'bg-[#FFF2F7] text-[#B57A8E]' : 'bg-[#FEF3C7] text-[#92400E]'
          )}>
            {positive ? '+' : ''}{deltaPct.toFixed(1)}%
          </span>
        )}
      </div>
      <p className="text-[12px] text-[#8E8E86] mb-2">{title}</p>
      <MiniSparkline points={points} color={color} />
      <div className="flex justify-between mt-1">
        {axisLabels.map((l, i) => <span key={i} className="text-[10px] text-[#C6C6BE]">{l}</span>)}
      </div>
    </div>
  )
}

function ConversionRatioCard({ activas, total }: { activas: number; total: number }) {
  const pct = total > 0 ? Math.round((activas / total) * 100) : 0
  return (
    <div className="bg-white border border-[#E7E7E0] rounded-3xl p-5 flex flex-col">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[26px] font-extrabold text-[#1A1A1A] leading-none tabular-nums">{pct}%</span>
      </div>
      <p className="text-[12px] text-[#8E8E86] mb-3">Tasa de conversión</p>
      <div className="h-2.5 bg-[#F1F1EC] rounded-full overflow-hidden mt-auto">
        <div className="h-full rounded-full bg-[#F7A6C4]" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[11px] text-[#A8A89F] mt-2">{activas} activas de {total} con etapa asignada</p>
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
          <p className="text-[14px] font-semibold text-[#1A1A1A]">Aún no hay leads en el embudo</p>
          <p className="text-[12px] text-[#A8A89F] mt-1">Asigna una etapa (lead, interesada, prueba…) a tus socias en su ficha para ver la conversión real aquí.</p>
        </div>
      </WidgetCard>
    )
  }

  return (
    <WidgetCard icon={Filter} title="Embudo de captación" action={<span className="text-[11px] font-semibold text-[#A8A89F] px-2">Todo el histórico</span>} className="lg:col-span-2">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {counts.map((c, i) => {
          const widthPct = total > 0 ? Math.max(8, (c.value / total) * 100) : 0
          const pctOfPrev = i === 0 ? 100 : counts[i - 1].value > 0 ? Math.round((c.value / counts[i - 1].value) * 100) : 0
          return (
            <div key={c.label}>
              <p className="text-[22px] font-extrabold text-[#1A1A1A] leading-none tabular-nums">{c.value}</p>
              <p className="text-[11px] text-[#8E8E86] mt-1 mb-3">{c.label}</p>
              <div className="h-16 flex items-end">
                <div
                  className={cn('w-full rounded-t-md', i === counts.length - 1 ? 'bg-[#F7A6C4]' : 'bg-[#E7E7E0]')}
                  style={{ height: `${widthPct}%` }}
                />
              </div>
              <p className="text-[11px] font-semibold text-[#A8A89F] mt-1.5">{i === 0 ? '100%' : `${pctOfPrev}%`}</p>
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
    <WidgetCard icon={BarChart3} title="Clases más demandadas" action={<span className="text-[11px] font-semibold text-[#A8A89F] px-2">Todo el histórico</span>} className="lg:col-span-2">
      {total === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-10">
          <p className="text-[14px] font-semibold text-[#1A1A1A]">Aún no hay reservas</p>
          <p className="text-[12px] text-[#A8A89F] mt-1">Cuando tus socias empiecen a reservar clases, verás aquí el ranking real de demanda.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {ranking.map(r => (
            <div key={r.id} className="flex items-center gap-3">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: r.color }} />
              <span className="text-[13px] font-semibold text-[#1A1A1A] w-36 truncate shrink-0">{r.nombre}</span>
              <div className="flex-1 h-2.5 bg-[#F1F1EC] rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${(r.reservas / max) * 100}%`, backgroundColor: r.color }} />
              </div>
              <span className="text-[12px] font-bold text-[#1A1A1A] tabular-nums w-8 text-right shrink-0">{r.reservas}</span>
            </div>
          ))}
        </div>
      )}
    </WidgetCard>
  )
}

// ─── Desglose de ingresos por tipo de plan (donut, importes reales cobrados) ──

const PLAN_TIPO_COLOR: Record<string, string> = { MENSUAL: '#F7A6C4', BONO: '#F5D97A', PUNTUAL: '#A6D8F0' }
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
          <p className="text-[14px] font-semibold text-[#1A1A1A]">Aún no hay cobros registrados</p>
          <p className="text-[12px] text-[#A8A89F] mt-1">El desglose aparecerá en cuanto se cobren recibos.</p>
        </div>
      ) : (
        <>
          <div className="relative w-full flex items-center justify-center py-4">
            <svg viewBox="0 0 180 180" className="w-44 h-44 -rotate-90">
              <circle cx="90" cy="90" r={R} fill="none" stroke="#F1F1EC" strokeWidth="16" />
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
              <p className="text-[24px] font-extrabold text-[#1A1A1A] leading-none">{total.toLocaleString('es-ES', { maximumFractionDigits: 0 })} €</p>
              <p className="text-[11px] text-[#8E8E86] mt-1">Ingresos cobrados</p>
            </div>
          </div>
          <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 mt-2">
            {Object.entries(totals).filter(([, v]) => v > 0).map(([tipo, v]) => (
              <div key={tipo} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: PLAN_TIPO_COLOR[tipo] }} />
                <div>
                  <p className="text-[12px] font-bold text-[#1A1A1A] leading-tight">{v.toLocaleString('es-ES', { maximumFractionDigits: 0 })} €</p>
                  <p className="text-[10px] text-[#A8A89F] leading-tight">{PLAN_TIPO_LABEL[tipo]}</p>
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
    return <span className="text-[#8E8E86]">{usos} usos</span>
  }
  const pct = Math.min(100, Math.round((usos / usosMax) * 100))
  const barColor = pct >= 90 ? 'bg-[#DC2626]' : pct >= 60 ? 'bg-[#D97706]' : 'bg-[#059669]'
  return (
    <div className="flex flex-col gap-1 min-w-[80px]">
      <span className="text-xs text-[#8E8E86]">{usos} / {usosMax}</span>
      <div className="w-full h-1.5 bg-[#F1F1EC] rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', barColor)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export default function MarketingPage() {
  const {
    campanas, addCampana, deleteCampana, duplicateCampana, enviarCampana,
    automatizaciones, addAutomatizacion, toggleAutomatizacion,
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
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateKey | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [newCampana, setNewCampana] = useState({
    nombre: '',
    tipo: 'EMAIL' as TipoCampana,
    asunto: '',
    destinatarios: 'TODAS',
    contenido: '',
  })

  // Asistente IA de campañas
  const [objetivoIA, setObjetivoIA] = useState('')
  const [generandoIA, setGenerandoIA] = useState(false)
  const [errorIA, setErrorIA] = useState<string | null>(null)
  const [razonSegmentoIA, setRazonSegmentoIA] = useState<string | null>(null)

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
    setObjetivoIA('')
    setErrorIA(null)
    setRazonSegmentoIA(null)
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
    return 'bg-[#F1F1EC] text-[#8E8E86]'
  }

  const accionIcon = (accion: string) => {
    if (accion === 'EMAIL') return <Mail className="w-3 h-3" />
    if (accion === 'WHATSAPP') return <MessageSquare className="w-3 h-3" />
    return <Bell className="w-3 h-3" />
  }

  return (
    <div className="min-h-screen bg-[#EEEEE8] p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[#1A1A1A]">Marketing</h1>
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
                ? 'bg-white border border-[#E7E7E0] text-[#1A1A1A] font-medium'
                : 'text-[#8E8E86] hover:text-[#1A1A1A]'
            )}
          >
            {t === 'resumen' ? 'Resumen' : t === 'campanas' ? 'Campañas' : t === 'automatizaciones' ? 'Automatizaciones' : 'Códigos de descuento'}
          </button>
        ))}
      </div>

      {/* ==================== TAB 0: RESUMEN ==================== */}
      {tab === 'resumen' && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <ConversionFunnelCard socios={socios} />
          <KpiTrendCard
            title="Leads captados (este mes)"
            value={String(totalLeadsActual)}
            deltaPct={leadsDeltaPct}
            points={leadsPorMes.map(m => m.count)}
            color="#F7A6C4"
            axisLabels={leadsPorMes.map(m => m.label)}
          />
          <ConversionRatioCard activas={activas} total={totalConLeadStage} />
          <TopClasesCard sesiones={sesiones} reservas={reservas} tiposClase={tiposClase} />
          <RevenueDonutCard recibos={recibos} suscripciones={suscripciones} planesTarifa={planesTarifa} />
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
                <div key={s.label} className="bg-white border border-[#E7E7E0] rounded-xl px-4 py-3 min-w-[110px]">
                  <p className="text-xs text-[#8E8E86] mb-1">{s.label}</p>
                  <p className="text-xl font-bold text-[#1A1A1A]">{s.value}</p>
                </div>
              ))}
            </div>
            <button
              onClick={() => setShowCampanaModal(true)}
              className="flex items-center gap-2 bg-[#FFC8E2] text-[#171717] rounded-lg px-4 py-2 text-sm font-medium hover:bg-[#F7B3D2] transition-colors shrink-0"
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
            <div className="flex items-center justify-center py-16 text-[#8E8E86]">Sin campañas</div>
          ) : (
            <div className="space-y-3">
              {campanas.map(c => (
                <div
                  key={c.id}
                  className="bg-white border border-[#E7E7E0] rounded-xl p-5 relative group"
                  onMouseEnter={() => setHoveredCampana(c.id)}
                  onMouseLeave={() => setHoveredCampana(null)}
                >
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        <span className="font-semibold text-[#1A1A1A]">{c.nombre}</span>
                        <span className={cn('px-2 py-0.5 rounded-md text-xs font-medium', tipoBadge(c.tipo))}>{c.tipo}</span>
                        <EstadoBadge estado={c.estado} programadaEn={c.programadaEn} enviadaEn={c.enviadaEn} />
                      </div>
                      <p className="text-xs text-[#8E8E86] mb-2">{destinatariosLabel[c.destinatarios] ?? c.destinatarios}</p>
                      <p className="text-xs text-[#8E8E86]">
                        Enviados: {c.enviados} · Abiertos: {c.abiertos}{c.enviados > 0 ? ` (${Math.round((c.abiertos / c.enviados) * 100)}%)` : ''} · Clics: {c.clics}{c.enviados > 0 ? ` (${Math.round((c.clics / c.enviados) * 100)}%)` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {(c.estado === 'BORRADOR' || c.estado === 'PROGRAMADA') && (
                        <button
                          onClick={() => handleEnviarCampana(c)}
                          disabled={enviandoId === c.id}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1A1A1A] text-white text-xs font-medium hover:bg-[#333] disabled:opacity-60 transition-colors"
                          title="Enviar campaña ahora"
                        >
                          {enviandoId === c.id
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <Send className="w-3.5 h-3.5" />}
                          {enviandoId === c.id ? 'Enviando…' : 'Enviar'}
                        </button>
                      )}
                      <span className="text-xs text-[#A8A89F]">{formatDateEs(c.creadaEn)}</span>
                      <div className={cn('flex gap-1 transition-opacity', hoveredCampana === c.id ? 'opacity-100' : 'opacity-0')}>
                        <button
                          onClick={() => duplicateCampana(c)}
                          className="p-1.5 rounded-lg hover:bg-[#F1F1EC] text-[#8E8E86] hover:text-[#1A1A1A] transition-colors"
                          title="Duplicar"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => deleteCampana(c.id)}
                          className="p-1.5 rounded-lg hover:bg-[#FEE2E2] text-[#8E8E86] hover:text-[#DC2626] transition-colors"
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
                <div key={s.label} className="bg-white border border-[#E7E7E0] rounded-xl px-5 py-3 min-w-[130px]">
                  <p className="text-xs text-[#8E8E86] mb-1">{s.label}</p>
                  <p className="text-xl font-bold text-[#1A1A1A]">{s.value}</p>
                </div>
              ))}
            </div>
            <button
              onClick={() => setShowAutoModal(true)}
              className="flex items-center gap-2 bg-[#FFC8E2] text-[#171717] rounded-lg px-4 py-2 text-sm font-medium hover:bg-[#F7B3D2] transition-colors shrink-0"
            >
              <Plus className="w-4 h-4" />
              Nueva automatización
            </button>
          </div>

          {automatizaciones.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-[#8E8E86]">Sin automatizaciones</div>
          ) : (
            <div className="bg-white border border-[#E7E7E0] rounded-xl overflow-hidden">
              {/* Desktop table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm min-w-[700px]">
                  <thead>
                    <tr className="border-b border-[#E7E7E0]">
                      {['Automatización', 'Cuándo se activa', 'Qué hace', 'Ejecuciones', 'Última ejecución', 'Estado'].map(col => (
                        <th key={col} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[#8E8E86]">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {automatizaciones.map((a, i) => (
                      <tr key={a.id} className={cn('border-b border-[#E7E7E0] last:border-0', i % 2 === 0 ? 'bg-white' : 'bg-[#F5F5F1]')}>
                        <td className="px-4 py-4">
                          <span className="font-semibold text-[#1A1A1A]">{a.nombre}</span>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-start gap-1.5">
                            <Zap className="w-3.5 h-3.5 text-[#A8A89F] mt-0.5 shrink-0" />
                            <div>
                              <p className="text-sm text-[#1A1A1A] font-medium leading-snug">{triggerLabel[a.trigger] ?? a.trigger}</p>
                              <p className="text-xs text-[#A8A89F] leading-snug mt-0.5">{triggerDesc[a.trigger] ?? ''}</p>
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
                          <p className="text-xs text-[#A8A89F] mt-1">{accionDesc[a.accion] ?? ''}</p>
                        </td>
                        <td className="px-4 py-4">
                          <span className="text-[#1A1A1A] font-medium">{a.ejecutadas ?? 0}</span>
                        </td>
                        <td className="px-4 py-4">
                          <span className={cn('text-sm', (a.ejecutadas ?? 0) === 0 ? 'text-[#A8A89F] italic' : 'text-[#8E8E86]')}>
                            {(a.ejecutadas ?? 0) === 0 ? 'Nunca' : 'Reciente'}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <button
                            onClick={() => toggleAutomatizacion(a.id)}
                            className={cn(
                              'w-10 h-[22px] rounded-full transition-colors relative shrink-0',
                              a.activa ? 'bg-[#1A1A1A]' : 'bg-[#D1D5DB]'
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

              {/* Mobile cards */}
              <div className="sm:hidden divide-y divide-[#E7E7E0]">
                {automatizaciones.map(a => (
                  <div key={a.id} className="p-4 space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-semibold text-[#1A1A1A] text-[14px]">{a.nombre}</span>
                      <button
                        onClick={() => toggleAutomatizacion(a.id)}
                        className={cn('w-10 h-[22px] rounded-full transition-colors relative shrink-0', a.activa ? 'bg-[#1A1A1A]' : 'bg-[#D1D5DB]')}
                        aria-label={a.activa ? 'Desactivar' : 'Activar'}
                      >
                        <span className={cn('absolute top-0.5 w-[18px] h-[18px] rounded-full bg-white shadow transition-all', a.activa ? 'left-[calc(100%-1.25rem-0.125rem)]' : 'left-0.5')} />
                      </button>
                    </div>
                    <div className="flex items-start gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-[#A8A89F] mt-0.5 shrink-0" />
                      <p className="text-[13px] text-[#1A1A1A] font-medium leading-snug">{triggerLabel[a.trigger] ?? a.trigger}</p>
                    </div>
                    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium', accionBadge(a.accion))}>
                      {accionIcon(a.accion)}
                      {a.accion}
                    </span>
                    <p className="text-[11px] text-[#A8A89F]">
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
                { label: 'Total códigos', value: codigos.length },
                { label: 'Activos', value: codigosActivos },
                { label: 'Usos totales', value: totalUsos },
              ].map(s => (
                <div key={s.label} className="bg-white border border-[#E7E7E0] rounded-xl px-5 py-3 min-w-[120px]">
                  <p className="text-xs text-[#8E8E86] mb-1">{s.label}</p>
                  <p className="text-xl font-bold text-[#1A1A1A]">{s.value}</p>
                </div>
              ))}
            </div>
            <button
              onClick={() => setShowCodigoModal(true)}
              className="flex items-center gap-2 bg-[#FFC8E2] text-[#171717] rounded-lg px-4 py-2 text-sm font-medium hover:bg-[#F7B3D2] transition-colors shrink-0"
            >
              <Plus className="w-4 h-4" />
              Nuevo código
            </button>
          </div>

          {codigos.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-[#8E8E86]">Sin códigos</div>
          ) : (
            <div className="bg-white border border-[#E7E7E0] rounded-xl overflow-hidden">
              {/* Desktop table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm min-w-[650px]">
                  <thead>
                    <tr className="border-b border-[#E7E7E0]">
                      {['Código', 'Descripción', 'Descuento', 'Usos', 'Expira', 'Estado', 'Acciones'].map(col => (
                        <th key={col} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[#8E8E86]">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {codigos.map((cod, i) => (
                      <tr key={cod.id} className={cn('border-b border-[#E7E7E0] last:border-0', i % 2 === 0 ? 'bg-white' : 'bg-[#F5F5F1]')}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-[#1A1A1A] text-sm">{cod.codigo}</span>
                            <CopyButton text={cod.codigo} />
                          </div>
                        </td>
                        <td className="px-4 py-3 text-[#8E8E86]">{cod.descripcion || '—'}</td>
                        <td className="px-4 py-3 text-[#1A1A1A] font-medium">
                          {cod.tipo === 'PORCENTAJE' ? `${cod.valor}%` : `${cod.valor} €`}
                        </td>
                        <td className="px-4 py-3">
                          <UsageBar usos={cod.usos} usosMax={cod.usosMax} />
                        </td>
                        <td className="px-4 py-3 text-[#8E8E86]">{formatDateEs(cod.expira)}</td>
                        <td className="px-4 py-3">
                          <span className={cn('px-2 py-0.5 rounded-md text-xs font-medium', cod.activo ? 'bg-[#D1FAE5] text-[#065F46]' : 'bg-[#F1F1EC] text-[#8E8E86]')}>
                            {cod.activo ? 'Activo' : 'Inactivo'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => toggleCodigoDescuento(cod.id)}
                              className="p-1.5 rounded-lg hover:bg-[#F1F1EC] text-[#8E8E86] hover:text-[#1A1A1A] transition-colors"
                              title={cod.activo ? 'Desactivar' : 'Activar'}
                            >
                              {cod.activo ? <ToggleRight className="w-4 h-4 text-[#059669]" /> : <ToggleLeft className="w-4 h-4" />}
                            </button>
                            <button
                              onClick={() => deleteCodigoDescuento(cod.id)}
                              className="p-1.5 rounded-lg hover:bg-[#FEE2E2] text-[#8E8E86] hover:text-[#DC2626] transition-colors"
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
              <div className="sm:hidden divide-y divide-[#E7E7E0]">
                {codigos.map(cod => (
                  <div key={cod.id} className="p-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-[#1A1A1A] text-sm">{cod.codigo}</span>
                        <CopyButton text={cod.codigo} />
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => toggleCodigoDescuento(cod.id)} className="p-1.5 rounded-lg hover:bg-[#F1F1EC] text-[#8E8E86]" title={cod.activo ? 'Desactivar' : 'Activar'}>
                          {cod.activo ? <ToggleRight className="w-4 h-4 text-[#059669]" /> : <ToggleLeft className="w-4 h-4" />}
                        </button>
                        <button onClick={() => deleteCodigoDescuento(cod.id)} className="p-1.5 rounded-lg hover:bg-[#FEE2E2] text-[#8E8E86]" title="Eliminar">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    {cod.descripcion && <p className="text-[12px] text-[#8E8E86]">{cod.descripcion}</p>}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[12px] font-semibold text-[#1A1A1A] bg-[#F1F1EC] px-2 py-0.5 rounded-md">
                        {cod.tipo === 'PORCENTAJE' ? `${cod.valor}%` : `${cod.valor} €`}
                      </span>
                      <span className={cn('px-2 py-0.5 rounded-md text-xs font-medium', cod.activo ? 'bg-[#D1FAE5] text-[#065F46]' : 'bg-[#F1F1EC] text-[#8E8E86]')}>
                        {cod.activo ? 'Activo' : 'Inactivo'}
                      </span>
                      <span className="text-[11px] text-[#A8A89F]">Expira {formatDateEs(cod.expira)}</span>
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
        if (!open) { setSelectedTemplate(null); setShowPreview(false); setObjetivoIA(''); setErrorIA(null); setRazonSegmentoIA(null) }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nueva campaña</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {/* Asistente IA */}
            <div className="rounded-xl border border-[#F0D5E3] bg-[#FFF7FB] p-3.5 space-y-2.5">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#B57A8E]" />
                <span className="text-[12px] font-bold text-[#1A1A1A]">Escribe la campaña con IA</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  className={cn(inputCls, 'bg-white')}
                  placeholder="Ej. recuérdales que se les acaba el bono y ofréceles 10% en la renovación"
                  value={objetivoIA}
                  onChange={e => setObjetivoIA(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleGenerarIA() } }}
                />
                <button
                  onClick={handleGenerarIA}
                  disabled={!objetivoIA.trim() || generandoIA}
                  className="shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#171717] text-white text-sm font-medium disabled:opacity-40"
                >
                  {generandoIA ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  Generar
                </button>
              </div>
              {errorIA && <p className="text-[11px] text-[#DC2626]">{errorIA}</p>}
              {razonSegmentoIA && (
                <p className="text-[11px] text-[#8E8E86]">
                  <span className="font-semibold text-[#B57A8E]">Segmento elegido: </span>{razonSegmentoIA}
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
                <span className="shrink-0 text-xs font-medium text-[#8E8E86] bg-[#F1F1EC] px-2.5 py-1.5 rounded-lg whitespace-nowrap">
                  ~{recipientCount[newCampana.destinatarios] ?? 0} destinatarias
                </span>
              </div>
            </FF>

            {/* Content section */}
            <div className="space-y-3 pt-1">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-[#8E8E86]">Contenido</label>

              {/* Template picker */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {(Object.entries(TEMPLATES) as [TemplateKey, typeof TEMPLATES[TemplateKey]][]).map(([key, tpl]) => (
                  <button
                    key={key}
                    onClick={() => handleSelectTemplate(key)}
                    className={cn(
                      'flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all text-center',
                      selectedTemplate === key
                        ? 'border-[#1A1A1A] bg-[#F5F5F1]'
                        : 'border-[#E7E7E0] hover:border-[#D1D5DB] bg-white'
                    )}
                  >
                    <span className="text-2xl">{tpl.emoji}</span>
                    <span className="text-xs font-semibold text-[#1A1A1A]">{tpl.label}</span>
                    <span className="text-[10px] text-[#A8A89F]">Plantilla</span>
                  </button>
                ))}
              </div>

              {/* Preview toggle */}
              <div className="flex items-center justify-between">
                <p className="text-xs text-[#A8A89F]">Variables: {'{nombre}'}, {'{fecha}'}, {'{plan}'}</p>
                {newCampana.contenido && (
                  <button
                    onClick={() => setShowPreview(p => !p)}
                    className="flex items-center gap-1 text-xs text-[#8E8E86] hover:text-[#1A1A1A] transition-colors"
                  >
                    {showPreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    {showPreview ? 'Editar' : 'Vista previa'}
                  </button>
                )}
              </div>

              {showPreview ? (
                /* Email preview card */
                <div className="bg-white border border-[#E7E7E0] rounded-xl p-5 shadow-sm">
                  <div className="border-b border-[#F1F1EC] pb-3 mb-3">
                    <p className="text-xs text-[#A8A89F] uppercase tracking-wide">Vista previa</p>
                    {newCampana.asunto && (
                      <p className="text-sm font-semibold text-[#1A1A1A] mt-1">{newCampana.asunto}</p>
                    )}
                  </div>
                  <div className="text-sm text-[#3A3A34] whitespace-pre-line leading-relaxed">
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
                className="px-4 py-2 text-sm rounded-lg bg-white border border-[#E7E7E0] text-[#1A1A1A] hover:bg-[#F5F5F1] transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleAddCampana}
                className="px-4 py-2 text-sm rounded-lg bg-[#FFC8E2] text-[#171717] hover:bg-[#F7B3D2] transition-colors font-medium"
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
                className="px-4 py-2 text-sm rounded-lg bg-white border border-[#E7E7E0] text-[#1A1A1A] hover:bg-[#F5F5F1] transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleAddAuto}
                className="px-4 py-2 text-sm rounded-lg bg-[#FFC8E2] text-[#171717] hover:bg-[#F7B3D2] transition-colors font-medium"
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
                className="px-4 py-2 text-sm rounded-lg bg-white border border-[#E7E7E0] text-[#1A1A1A] hover:bg-[#F5F5F1] transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleAddCodigo}
                className="px-4 py-2 text-sm rounded-lg bg-[#FFC8E2] text-[#171717] hover:bg-[#F7B3D2] transition-colors font-medium"
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
