'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Check,
  AlertTriangle,
  FileSpreadsheet,
  ExternalLink,
  Ticket,
  Dumbbell,
  HeartPulse,
  Activity,
  Users2,
  KeyRound,
  BellRing,
  MessageCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStudio } from '@/lib/studio-context';
import { dbInsertSoporteSolicitud } from '@/lib/supabase-data';
import { StripeIcon, PayPalIcon, WhatsAppIcon, ZoomIcon, GoogleCalendarIcon, ResendIcon } from '@/components/icons/brand-icons';
import { authHeader, fetchIntegracionesEstado, probarIntegracion, type IntegracionesEstado } from '@/lib/api-client';
import type { TipoIntegracion } from '@/lib/types';
import { inputCls, labelCls, btnPrimary, btnSecondary, cardCls } from '@/app/(dashboard)/configuracion/page';

type CampoIntegracion = { key: string; label: string; placeholder: string; tipo?: 'text' | 'password' };

type CatalogoIntegracion = {
  tipo: TipoIntegracion;
  nombre: string;
  descripcion: string;
  Icon: React.ElementType;
  color: string;
  bg: string;
  campos: CampoIntegracion[];
  secretoEnv?: string;
  docsUrl?: string;
  accion?: 'exportar';
  categoria?: string;
  proximamente?: boolean;
  // Integración de plataforma: el operador pone los secretos por ENV y el
  // estudio la activa/desactiva. El estado real se consulta a /api/integrations/estado.
  plataforma?: boolean;
  envVars?: string[];
};

const CATALOGO_INTEGRACIONES: CatalogoIntegracion[] = [
  {
    tipo: 'STRIPE',
    nombre: 'Stripe',
    descripcion: 'Cobra suscripciones y bonos con tarjeta o SEPA. El dinero va directo a tu propia cuenta de Stripe — conéctala con un clic, sin claves.',
    Icon: StripeIcon,
    color: '#635BFF',
    bg: '#F5F5F5',
    campos: [],
  },
  {
    tipo: 'RESEND',
    nombre: 'Resend',
    descripcion: 'Envía emails de bienvenida, recibos y campañas desde tu propio dominio.',
    Icon: ResendIcon,
    color: 'var(--foreground)',
    bg: '#F5F5F5',
    campos: [
      { key: 'fromEmail', label: 'Email remitente', placeholder: 'hola@tentare.es' },
      { key: 'fromName', label: 'Nombre remitente', placeholder: 'Tentare' },
    ],
    secretoEnv: 'RESEND_API_KEY',
    docsUrl: 'https://resend.com/api-keys',
  },
  {
    tipo: 'GOOGLE_CALENDAR',
    nombre: 'Google Calendar',
    descripcion: 'Sincroniza las clases del estudio con el calendario de Google de la propietaria. Conexión OAuth — no necesitas pegar ninguna clave.',
    Icon: GoogleCalendarIcon,
    color: '#4285F4',
    bg: '#F5F5F5',
    categoria: 'Calendario',
    campos: [],
  },
  {
    tipo: 'WHATSAPP',
    nombre: 'WhatsApp Business',
    descripcion: 'Envía recordatorios y automatizaciones por WhatsApp con la API de Meta.',
    Icon: WhatsAppIcon,
    color: '#25D366',
    bg: '#F5F5F5',
    categoria: 'Mensajería',
    campos: [],
    plataforma: true,
    envVars: ['WHATSAPP_TOKEN', 'WHATSAPP_PHONE_ID'],
  },
  {
    tipo: 'TWILIO',
    nombre: 'Twilio (WhatsApp / SMS)',
    descripcion: 'Los recordatorios y avisos de Sustituciones también por WhatsApp y SMS. Sin esto, el escalado avisa solo por email.',
    Icon: MessageCircle,
    color: '#F22F46',
    bg: '#FEECEC',
    categoria: 'Mensajería',
    campos: [],
    envVars: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_WHATSAPP_FROM', 'TWILIO_SMS_FROM'],
    docsUrl: 'https://console.twilio.com',
  },
  {
    tipo: 'EXCEL',
    nombre: 'Exportar a Excel',
    descripcion: 'Descarga tus socias, suscripciones y recibos en un archivo compatible con Excel.',
    Icon: FileSpreadsheet,
    color: '#1D6F42',
    bg: '#E7F4EC',
    campos: [],
    accion: 'exportar',
  },
  {
    tipo: 'PAYPAL',
    nombre: 'PayPal',
    descripcion: 'Acepta pagos con una de las soluciones FinTech más usadas del mundo.',
    Icon: PayPalIcon,
    color: '#003087',
    bg: '#F5F5F5',
    categoria: 'Pagos',
    campos: [],
    plataforma: true,
    envVars: ['PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET'],
  },
  {
    tipo: 'CLASSPASS',
    nombre: 'ClassPass',
    descripcion: 'Gana visibilidad entre miles de usuarios con la mayor red de fitness y bienestar.',
    Icon: Ticket,
    color: '#8B5CF6',
    bg: '#F3EEFF',
    categoria: 'Agregadores',
    campos: [],
    proximamente: true,
  },
  {
    tipo: 'URBAN_SPORTS_CLUB',
    nombre: 'Urban Sports Club',
    descripcion: 'Forma parte de una de las suscripciones deportivas más populares de Europa.',
    Icon: Dumbbell,
    color: '#111827',
    bg: '#F1F1EC',
    categoria: 'Agregadores',
    campos: [],
    proximamente: true,
  },
  {
    tipo: 'WELLHUB',
    nombre: 'Wellhub',
    descripcion: 'Conecta con una red global de profesionales del bienestar y atrae clientes vía programas corporativos.',
    Icon: HeartPulse,
    color: '#EE5A6F',
    bg: '#FFF0F2',
    categoria: 'Agregadores',
    campos: [],
    proximamente: true,
  },
  {
    tipo: 'EGYM_WELLPASS',
    nombre: 'EGYM Wellpass',
    descripcion: 'Accede a una red en crecimiento de profesionales preocupados por su salud.',
    Icon: Activity,
    color: '#059669',
    bg: '#E7F7F0',
    categoria: 'Agregadores',
    campos: [],
    proximamente: true,
  },
  {
    tipo: 'MYCLUBS',
    nombre: 'myclubs',
    descripcion: 'Integra tu estudio con uno de los principales agregadores de fitness en Austria y Suiza.',
    Icon: Users2,
    color: '#EA580C',
    bg: '#FFF1E7',
    categoria: 'Agregadores',
    campos: [],
    proximamente: true,
  },
  {
    tipo: 'ZOOM',
    nombre: 'Zoom',
    descripcion: 'Lleva tus clases más allá del estudio y ofrece sesiones en cualquier momento y lugar.',
    Icon: ZoomIcon,
    color: '#0B5CFF',
    bg: '#F5F5F5',
    categoria: 'Contenido digital',
    campos: [],
    plataforma: true,
    envVars: ['ZOOM_ACCOUNT_ID', 'ZOOM_CLIENT_ID', 'ZOOM_CLIENT_SECRET'],
  },
  {
    tipo: 'KISI',
    nombre: 'Kisi',
    descripcion: 'Ofrece acceso seguro y rápido a tu estudio. Gestiona el estado de tus clientes en tiempo real.',
    Icon: KeyRound,
    color: '#4F46E5',
    bg: '#EEF0FE',
    categoria: 'Control de acceso',
    campos: [],
    plataforma: true,
    envVars: ['KISI_API_KEY'],
  },
];

function toCsv(rows: (string | number | null)[][]): string {
  const esc = (v: string | number | null) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map(r => r.map(esc).join(';')).join('\r\n');
}

function descargarCsv(nombre: string, contenido: string) {
  // BOM para que Excel reconozca UTF-8
  const blob = new Blob(['﻿' + contenido], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function TabIntegraciones({ showToast }: { showToast: (m: string) => void }) {
  const { studio, updateStudio, integraciones, upsertIntegracion, socios, suscripciones, planesTarifa, recibos } = useStudio();
  const [editando, setEditando] = useState<TipoIntegracion | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  // Integraciones de plataforma: qué tiene ENV configurada en el servidor.
  const [estadoPlataforma, setEstadoPlataforma] = useState<IntegracionesEstado | null>(null);
  const [probando, setProbando] = useState<TipoIntegracion | null>(null);
  useEffect(() => {
    let vivo = true;
    fetchIntegracionesEstado().then((e) => { if (vivo) setEstadoPlataforma(e); });
    return () => { vivo = false; };
  }, []);
  const activarPlataforma = (cat: CatalogoIntegracion, activar: boolean) => {
    upsertIntegracion(cat.tipo, activar, {});
    showToast(`${cat.nombre} ${activar ? 'activado' : 'desactivado'}`);
  };
  const probarPlataforma = async (cat: CatalogoIntegracion) => {
    setProbando(cat.tipo);
    const r = await probarIntegracion(cat.tipo);
    setProbando(null);
    showToast(r.ok ? `Conexión con ${cat.nombre} correcta ✓` : `Error: ${r.error ?? 'no se pudo conectar'}`);
  };

  const getIntegracion = (tipo: TipoIntegracion) => integraciones.find(i => i.tipo === tipo) ?? null;

  // Stripe no usa el modal genérico de API keys: se conecta vía OAuth (Stripe
  // Connect) para que cada estudio cobre en su propia cuenta, sin tocar
  // ninguna clave.
  const stripeConectado = !!studio?.stripeAccountId;
  const stripeClientId = process.env.NEXT_PUBLIC_STRIPE_CONNECT_CLIENT_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? (typeof window !== 'undefined' ? window.location.origin : '');
  // C-8: el `state` ya no es el studioId en claro; lo emite firmado una ruta de
  // servidor autenticada y el callback lo verifica. El botón lo pide y redirige.
  const puedeConectarStripe = !!(stripeClientId && studio);
  async function conectarStripe() {
    if (!stripeClientId) return;
    const res = await fetch('/api/integrations/oauth-state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ provider: 'stripe' }),
    });
    if (!res.ok) { showToast('No se pudo iniciar la conexión con Stripe'); return; }
    const { state } = await res.json() as { state: string };
    const redirect = encodeURIComponent(`${appUrl}/api/stripe/connect/callback`);
    window.location.href = `https://connect.stripe.com/oauth/authorize?response_type=code&client_id=${stripeClientId}&scope=read_write&redirect_uri=${redirect}&state=${encodeURIComponent(state)}`;
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('stripe_connected')) {
      showToast('Stripe conectado — ya puedes cobrar en tu propia cuenta');
      window.history.replaceState({}, '', '/configuracion');
    } else if (params.get('stripe_connect_error')) {
      showToast(`Error al conectar Stripe: ${params.get('stripe_connect_error')}`);
      window.history.replaceState({}, '', '/configuracion');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const desconectarStripe = () => {
    updateStudio({ stripeAccountId: null });
    showToast('Stripe desconectado');
  };

  // Google Calendar: OAuth real (ver lib/google-calendar.ts). A diferencia de
  // Stripe, desconectar y sincronizar pasan por rutas de servidor
  // autenticadas (no solo estado local) — ver app/api/integrations/google-calendar/*.
  const googleConectado = !!studio?.googleCalendarEmail;
  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const puedeConectarGoogle = !!(googleClientId && studio);
  async function conectarGoogle() {
    if (!googleClientId) return;
    const res = await fetch('/api/integrations/oauth-state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ provider: 'google' }),
    });
    if (!res.ok) { showToast('No se pudo iniciar la conexión con Google'); return; }
    const { state } = await res.json() as { state: string };
    const redirect = encodeURIComponent(`${appUrl}/api/integrations/google-calendar/callback`);
    const scope = encodeURIComponent('https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email');
    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${googleClientId}&redirect_uri=${redirect}&response_type=code&scope=${scope}&access_type=offline&prompt=consent&state=${encodeURIComponent(state)}`;
  }
  // C-2: token de dispositivo del kiosko. Se genera aquí (PROPIETARIO) y se
  // pega en el dispositivo de recepción; /api/public/checkin lo exige.
  const [kioskToken, setKioskToken] = useState<string | null>(null);
  const [generandoKiosk, setGenerandoKiosk] = useState(false);
  async function generarKioskToken() {
    setGenerandoKiosk(true);
    try {
      const res = await fetch('/api/kiosk/token', { method: 'POST', headers: await authHeader() });
      if (!res.ok) { showToast('No se pudo generar el token de kiosko'); return; }
      const { token } = await res.json() as { token: string };
      setKioskToken(token);
      showToast('Token de kiosko generado — cópialo al dispositivo');
    } finally {
      setGenerandoKiosk(false);
    }
  }

  const [sincronizando, setSincronizando] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('google_calendar_connected')) {
      showToast('Google Calendar conectado');
      window.history.replaceState({}, '', '/configuracion');
    } else if (params.get('google_calendar_error')) {
      showToast(`Error al conectar Google Calendar: ${params.get('google_calendar_error')}`);
      window.history.replaceState({}, '', '/configuracion');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const desconectarGoogle = async () => {
    const res = await fetch('/api/integrations/google-calendar/disconnect', { method: 'POST', headers: await authHeader() });
    if (res.ok) {
      updateStudio({ googleCalendarEmail: null });
      showToast('Google Calendar desconectado');
    } else {
      const data = await res.json().catch(() => null);
      showToast(`No se pudo desconectar: ${data?.error ?? 'error desconocido'}`);
    }
  };

  const sincronizarGoogle = async () => {
    setSincronizando(true);
    try {
      const res = await fetch('/api/integrations/google-calendar/sync', { method: 'POST', headers: await authHeader() });
      const data = await res.json();
      if (!res.ok) { showToast(`Error al sincronizar: ${data.error}`); return; }
      showToast(`Sincronizado: ${data.creadas} clases nuevas, ${data.actualizadas} actualizadas, ${data.borradas} eliminadas`);
    } finally {
      setSincronizando(false);
    }
  };

  const abrirConfig = (cat: CatalogoIntegracion) => {
    const actual = getIntegracion(cat.tipo);
    setForm(actual?.config ?? {});
    setEditando(cat.tipo);
  };

  const guardar = (cat: CatalogoIntegracion) => {
    const rellenos = cat.campos.some(c => (form[c.key] ?? '').trim() !== '');
    upsertIntegracion(cat.tipo, rellenos, form);
    setEditando(null);
    showToast(`${cat.nombre} ${rellenos ? 'conectado' : 'actualizado'}`);
  };

  const desconectar = (cat: CatalogoIntegracion) => {
    upsertIntegracion(cat.tipo, false, {});
    setEditando(null);
    showToast(`${cat.nombre} desconectado`);
  };

  const [avisado, setAvisado] = useState<Set<TipoIntegracion>>(new Set());
  const avisarme = (cat: CatalogoIntegracion) => {
    dbInsertSoporteSolicitud({
      id: `sup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      tipo: 'MEJORA',
      mensaje: `Quiero que se avise cuando esté disponible la integración con ${cat.nombre}.`,
      contacto: null,
      creadoEn: new Date().toISOString(),
    });
    setAvisado(prev => new Set(prev).add(cat.tipo));
    showToast(`Te avisaremos cuando ${cat.nombre} esté disponible`);
  };

  // Agregadores (ClassPass, Urban Sports, Wellhub…): no se conectan por API sin
  // un alta como partner. "Solicitar acceso" registra el interés para que el
  // equipo de Tentare gestione el alta con el agregador.
  const solicitarAcceso = (cat: CatalogoIntegracion) => {
    dbInsertSoporteSolicitud({
      id: `sup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      tipo: 'MEJORA',
      mensaje: `Solicito acceso al agregador ${cat.nombre} (requiere alta como partner). Estudio interesado en aparecer en su red.`,
      contacto: null,
      creadoEn: new Date().toISOString(),
    });
    setAvisado(prev => new Set(prev).add(cat.tipo));
    showToast(`Solicitud enviada — te contactamos para el alta en ${cat.nombre}`);
  };

  const exportarExcel = () => {
    const fmtEur = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    // P0-35: índices por socio en UNA pasada, en vez de suscripciones.find/filter
    // por cada socio y socios.find por cada recibo (doble bucle O(N×M)).
    const planById = new Map(planesTarifa.map(p => [p.id, p]));
    const susPorSocio = new Map<string, typeof suscripciones>();
    for (const x of suscripciones) {
      const arr = susPorSocio.get(x.socioId);
      if (arr) arr.push(x); else susPorSocio.set(x.socioId, [x]);
    }
    const socioById = new Map(socios.map(s => [s.id, s]));
    // Hoja socias con su plan y estado de suscripción
    const rows: (string | number | null)[][] = [
      ['Nombre', 'Apellidos', 'Email', 'Teléfono', 'NIF', 'Alta', 'Activa', 'Plan', 'Estado suscripción', 'Sesiones restantes'],
    ];
    for (const s of socios) {
      const lista = susPorSocio.get(s.id) ?? [];
      const sus = lista.find(x => x.estado === 'ACTIVA') ?? lista[lista.length - 1] ?? null;
      const plan = sus ? planById.get(sus.planId) ?? null : null;
      rows.push([
        s.nombre, s.apellidos, s.email, s.telefono ?? '', s.nif ?? '',
        s.fechaAlta?.slice(0, 10) ?? '', s.activo ? 'Sí' : 'No',
        plan?.nombre ?? '', sus?.estado ?? '', sus?.sesionesRestantes ?? '',
      ]);
    }
    descargarCsv(`tentare-socias-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows));

    // Hoja recibos
    const rRows: (string | number | null)[][] = [
      ['Concepto', 'Socia', 'Importe (€)', 'Estado', 'Vencimiento', 'Cobro'],
    ];
    for (const r of recibos) {
      const s = r.socioId ? socioById.get(r.socioId) : undefined;
      rRows.push([
        r.concepto, s ? `${s.nombre} ${s.apellidos}` : '', fmtEur(r.importe),
        r.estado, r.fechaVencimiento?.slice(0, 10) ?? '', r.fechaCobro?.slice(0, 10) ?? '',
      ]);
    }
    descargarCsv(`tentare-recibos-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rRows));
    showToast('Exportación descargada (socias y recibos)');
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h3 className="text-[14px] font-semibold text-foreground">Integraciones del negocio</h3>
        <p className="text-[12px] text-muted-foreground mt-0.5">
          Conecta Tentare con las herramientas que ya usas. Cada negocio configura las suyas.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {CATALOGO_INTEGRACIONES.map(cat => {
          const intg = getIntegracion(cat.tipo);
          const conectado = cat.tipo === 'STRIPE' ? stripeConectado : cat.tipo === 'GOOGLE_CALENDAR' ? googleConectado : cat.tipo === 'TWILIO' ? !!estadoPlataforma?.TWILIO : !!intg?.activo;
          return (
            <div key={cat.tipo} className={cn(cardCls, 'p-4 flex flex-col')}>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: cat.bg }}>
                  <cat.Icon size={20} style={{ color: cat.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-[14px] font-semibold text-foreground">{cat.nombre}</p>
                    {cat.proximamente ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FFF7ED] text-[#B45309]">
                        Próximamente
                      </span>
                    ) : cat.accion !== 'exportar' && (
                      <span className={cn(
                        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold',
                        conectado ? 'bg-[#DCFCE7] text-[#059669]' : 'bg-muted text-muted-foreground',
                      )}>
                        <span className={cn('w-1.5 h-1.5 rounded-full', conectado ? 'bg-[#059669]' : 'bg-muted-foreground')} />
                        {conectado ? 'Conectado' : 'No conectado'}
                      </span>
                    )}
                  </div>
                  {cat.categoria && <p className="text-[10px] font-bold uppercase tracking-wide text-[#B8B8AE] mt-0.5">{cat.categoria}</p>}
                  <p className="text-[12px] text-muted-foreground mt-1 leading-snug">{cat.descripcion}</p>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-[#F1F1F4] flex items-center gap-2">
                {cat.proximamente && cat.categoria === 'Agregadores' ? (
                  <button
                    onClick={() => solicitarAcceso(cat)}
                    disabled={avisado.has(cat.tipo)}
                    className={cn(btnPrimary, avisado.has(cat.tipo) && 'opacity-50')}
                  >
                    <Ticket size={14} /> {avisado.has(cat.tipo) ? 'Solicitud enviada' : 'Solicitar acceso'}
                  </button>
                ) : cat.proximamente ? (
                  <button
                    onClick={() => avisarme(cat)}
                    disabled={avisado.has(cat.tipo)}
                    className={cn(btnSecondary, avisado.has(cat.tipo) && 'opacity-50')}
                  >
                    <BellRing size={14} /> {avisado.has(cat.tipo) ? 'Ya te avisaremos' : 'Avísame cuando esté disponible'}
                  </button>
                ) : cat.accion === 'exportar' ? (
                  <button onClick={exportarExcel} className={btnPrimary}>
                    <FileSpreadsheet size={14} /> Descargar Excel
                  </button>
                ) : cat.tipo === 'STRIPE' ? (
                  stripeConectado ? (
                    <button onClick={desconectarStripe} className={btnSecondary}>Desconectar</button>
                  ) : puedeConectarStripe ? (
                    <button type="button" onClick={conectarStripe} className={cn(btnPrimary, 'no-underline')}>Conectar con Stripe</button>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">
                      Falta configurar <code className="font-mono bg-muted px-1 rounded">NEXT_PUBLIC_STRIPE_CONNECT_CLIENT_ID</code>
                    </p>
                  )
                ) : cat.tipo === 'GOOGLE_CALENDAR' ? (
                  googleConectado ? (
                    <>
                      <button onClick={sincronizarGoogle} disabled={sincronizando} className={cn(btnPrimary, sincronizando && 'opacity-50')}>
                        {sincronizando ? 'Sincronizando…' : 'Sincronizar ahora'}
                      </button>
                      <button onClick={desconectarGoogle} className={btnSecondary}>Desconectar</button>
                    </>
                  ) : puedeConectarGoogle ? (
                    <button type="button" onClick={conectarGoogle} className={cn(btnPrimary, 'no-underline')}>Conectar con Google</button>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">
                      Falta configurar <code className="font-mono bg-muted px-1 rounded">NEXT_PUBLIC_GOOGLE_CLIENT_ID</code>
                    </p>
                  )
                ) : cat.tipo === 'TWILIO' ? (
                  // El escalado usa Twilio globalmente (por ENV), no con un toggle
                  // por estudio → solo estado + prueba, sin activar/desactivar.
                  !estadoPlataforma ? (
                    <span className="text-[11px] text-muted-foreground">Comprobando…</span>
                  ) : estadoPlataforma.TWILIO ? (
                    <button onClick={() => probarPlataforma(cat)} disabled={probando === cat.tipo} className={cn(btnSecondary, probando === cat.tipo && 'opacity-50')}>
                      {probando === cat.tipo ? 'Probando…' : 'Probar conexión'}
                    </button>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">
                      Falta configurar en el servidor:{' '}
                      {cat.envVars?.map((v, i) => (
                        <span key={v}>{i > 0 ? ', ' : ''}<code className="font-mono bg-muted px-1 rounded">{v}</code></span>
                      ))}
                    </p>
                  )
                ) : cat.plataforma ? (
                  estadoPlataforma && !estadoPlataforma[cat.tipo as keyof IntegracionesEstado] ? (
                    <p className="text-[11px] text-muted-foreground">
                      Falta configurar en el servidor:{' '}
                      {cat.envVars?.map((v, i) => (
                        <span key={v}>{i > 0 ? ', ' : ''}<code className="font-mono bg-muted px-1 rounded">{v}</code></span>
                      ))}
                    </p>
                  ) : conectado ? (
                    <>
                      <button onClick={() => probarPlataforma(cat)} disabled={probando === cat.tipo} className={cn(btnSecondary, probando === cat.tipo && 'opacity-50')}>
                        {probando === cat.tipo ? 'Probando…' : 'Probar conexión'}
                      </button>
                      <button onClick={() => activarPlataforma(cat, false)} className={btnSecondary}>Desactivar</button>
                    </>
                  ) : (
                    <button onClick={() => activarPlataforma(cat, true)} className={btnPrimary}>Activar</button>
                  )
                ) : (
                  <>
                    <button onClick={() => abrirConfig(cat)} className={conectado ? btnSecondary : btnPrimary}>
                      {conectado ? 'Gestionar' : 'Conectar'}
                    </button>
                    {cat.docsUrl && (
                      <a href={cat.docsUrl} target="_blank" rel="noopener noreferrer"
                        className="text-[12px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                        Docs <ExternalLink size={11} />
                      </a>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}

        {/* C-2: token de dispositivo del kiosko de check-in */}
        <div className={cn(cardCls, 'p-4 flex flex-col')}>
          <p className="text-sm font-bold mb-1">Kiosko de check-in</p>
          <p className="text-[12px] text-muted-foreground mb-3 flex-1">
            Token del dispositivo de recepción. Genéralo y pégalo en el kiosko (<code className="font-mono bg-muted px-1 rounded">/kiosk/tu-slug</code>) la primera vez. El check-in solo funciona desde un dispositivo con este token.
          </p>
          {kioskToken && (
            <div className="rounded-lg bg-muted p-2.5 mb-2">
              <p className="text-[10px] text-muted-foreground mb-1">Cópialo ahora — no se vuelve a mostrar:</p>
              <code className="text-[12px] font-mono break-all select-all">{kioskToken}</code>
            </div>
          )}
          <button onClick={generarKioskToken} disabled={generandoKiosk} className={cn(btnPrimary, generandoKiosk && 'opacity-50')}>
            {generandoKiosk ? 'Generando…' : kioskToken ? 'Regenerar token' : 'Generar token de kiosko'}
          </button>
        </div>
      </div>

      {/* Config modal */}
      {editando && (() => {
        const cat = CATALOGO_INTEGRACIONES.find(c => c.tipo === editando)!;
        const conectado = !!getIntegracion(cat.tipo)?.activo;
        return (
          <Dialog open onOpenChange={() => setEditando(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: cat.bg }}>
                    <cat.Icon size={15} style={{ color: cat.color }} />
                  </span>
                  Configurar {cat.nombre}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {cat.campos.map(campo => (
                  <div key={campo.key}>
                    <label className={labelCls}>{campo.label}</label>
                    <input
                      className={inputCls}
                      type={campo.tipo ?? 'text'}
                      value={form[campo.key] ?? ''}
                      placeholder={campo.placeholder}
                      onChange={e => setForm(p => ({ ...p, [campo.key]: e.target.value }))}
                    />
                  </div>
                ))}
                {cat.secretoEnv && (
                  <div className="flex items-start gap-2 bg-[#FFFBEB] border border-[#FDE68A] rounded-lg p-3">
                    <AlertTriangle size={14} className="text-[#D97706] shrink-0 mt-0.5" />
                    <p className="text-[11px] text-[#92400E] leading-snug">
                      El proveedor de envío lo gestiona Tentare a nivel de plataforma — aquí solo
                      configuras tu remitente. Para enviar desde tu propio dominio, verifícalo con
                      nosotros primero; te avisamos cuando esté listo.
                    </p>
                  </div>
                )}
                <div className="flex items-center justify-between pt-1">
                  {conectado ? (
                    <button onClick={() => desconectar(cat)} className="text-[13px] font-medium text-[#DC2626] hover:underline">
                      Desconectar
                    </button>
                  ) : <span />}
                  <div className="flex gap-2">
                    <button onClick={() => setEditando(null)} className={btnSecondary}>Cancelar</button>
                    <button onClick={() => guardar(cat)} className={btnPrimary}>
                      <Check size={14} /> Guardar
                    </button>
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        );
      })()}
    </div>
  );
}
