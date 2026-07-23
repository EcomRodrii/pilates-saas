'use client';

import { useState, useEffect, useId } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Check,
  AlertTriangle,
  FileSpreadsheet,
  ExternalLink,
  KeyRound,
  BellRing,
  Mail,
  Megaphone,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStudio } from '@/lib/studio-context';
import { dbInsertSoporteSolicitud } from '@/lib/supabase-data';
import { StripeIcon, WhatsAppIcon, ZoomIcon, GoogleCalendarIcon, ResendIcon } from '@/components/icons/brand-icons';
import { authHeader } from '@/lib/api-client';
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
  // Pasos numerados que se enseñan en el modal ANTES de los campos — cada
  // negocio pega su propia credencial (su propia cuenta de Kisi, su propio
  // número de WhatsApp Business), así que necesita saber dónde conseguirla,
  // no solo un enlace a documentación en inglés.
  instrucciones?: string[];
  // Si está definida, cuando la integración está conectada aparece un botón
  // "Probar conexión" que llama a esta ruta (POST autenticado) — la ruta lee
  // la credencial guardada de ESE estudio y la valida contra la API real.
  probarUrl?: string;
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
    descripcion: 'Envía recordatorios de clase por WhatsApp desde tu propio número de WhatsApp Business.',
    Icon: WhatsAppIcon,
    color: '#25D366',
    bg: '#F5F5F5',
    categoria: 'Mensajería',
    campos: [
      { key: 'token', label: 'Token de acceso', placeholder: 'EAAxxxxxxxxxxxx...', tipo: 'password' },
      { key: 'phoneId', label: 'ID de número de teléfono', placeholder: '109xxxxxxxxxxx' },
    ],
    instrucciones: [
      'Entra en developers.facebook.com/apps y crea (o abre) una app de tipo "Business".',
      'Añade el producto "WhatsApp" a tu app.',
      'En WhatsApp → Introducción, copia el "ID del número de teléfono".',
      'En la misma pantalla, genera un token de acceso permanente (token de usuario del sistema — no el token temporal de 24h de prueba).',
      'Pega aquí el token y el ID del número, y pulsa Guardar.',
    ],
    docsUrl: 'https://developers.facebook.com/docs/whatsapp/cloud-api/get-started',
    probarUrl: '/api/integrations/whatsapp/probar',
  },
  {
    tipo: 'EXCEL',
    nombre: 'Exportar a Excel',
    descripcion: 'Descarga tus clientas, suscripciones y recibos en un archivo compatible con Excel.',
    Icon: FileSpreadsheet,
    color: '#1D6F42',
    bg: '#E7F4EC',
    campos: [],
    accion: 'exportar',
  },
  {
    tipo: 'GMAIL',
    nombre: 'Gmail',
    descripcion: 'Envía emails desde el Gmail de la propietaria y trae sus contactos como clientas nuevas. Conexión OAuth — no necesitas pegar ninguna clave.',
    Icon: Mail,
    color: '#EA4335',
    bg: '#F5F5F5',
    categoria: 'Correo',
    campos: [],
  },
  {
    tipo: 'ZOOM',
    nombre: 'Zoom',
    descripcion: 'Lleva tus clases más allá del estudio y ofrece sesiones en cualquier momento y lugar. Conexión OAuth — no necesitas pegar ninguna clave.',
    Icon: ZoomIcon,
    color: '#0B5CFF',
    bg: '#F5F5F5',
    categoria: 'Contenido digital',
    campos: [],
  },
  {
    tipo: 'KISI',
    nombre: 'Kisi',
    descripcion: 'Ofrece acceso seguro y rápido a tu estudio. Gestiona el estado de tus clientes en tiempo real.',
    Icon: KeyRound,
    color: '#4F46E5',
    bg: '#EEF0FE',
    categoria: 'Control de acceso',
    campos: [
      { key: 'apiKey', label: 'Clave API', placeholder: 'kisi_xxxxxxxxxxxxxxxx', tipo: 'password' },
    ],
    instrucciones: [
      'Inicia sesión en tu panel de Kisi (kisi.io).',
      'Arriba a la derecha, haz clic en tu email y entra en "Mi cuenta".',
      'En el menú de la izquierda, entra en "API".',
      'Pulsa "Agregar clave API" (si ya tenías una para Tentare, bórrala antes).',
      'Ponle de nombre "Tentare" y confirma con tu contraseña de Kisi.',
      'Copia la clave que te genera Kisi.',
      'Pégala aquí abajo y pulsa Guardar.',
    ],
    docsUrl: 'https://api.kisi.io/docs',
    probarUrl: '/api/integrations/kisi/probar',
  },
  {
    tipo: 'MAILCHIMP',
    nombre: 'Mailchimp / Brevo',
    descripcion: 'Sincroniza clientas, leads, etiquetas y campañas con tu lista de email marketing. Muy útil si vienes de otra plataforma.',
    Icon: Megaphone,
    color: '#B08A00',
    bg: '#FFF9E0',
    categoria: 'Marketing',
    campos: [],
    proximamente: true,
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
  // Declarado en el componente, NO dentro del modal: ese modal es una IIFE
  // dentro del JSX y un hook no puede llamarse ahí. El sufijo por campo.key
  // hace único cada id.
  const uid = useId();
  const { studio, updateStudio, integraciones, upsertIntegracion, socios, suscripciones, planesTarifa, recibos } = useStudio();
  const [editando, setEditando] = useState<TipoIntegracion | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [probando, setProbando] = useState<TipoIntegracion | null>(null);
  // Kisi/WhatsApp: "Probar conexión" contra la credencial que ESE estudio
  // pegó y guardó (no hay secreto de plataforma que consultar).
  const probarCampos = async (cat: CatalogoIntegracion) => {
    if (!cat.probarUrl) return;
    setProbando(cat.tipo);
    try {
      const res = await fetch(cat.probarUrl, { method: 'POST', headers: await authHeader() });
      const data = await res.json();
      showToast(res.ok && data.ok ? `Conexión con ${cat.nombre} correcta ✓` : `Error: ${data.error ?? 'no se pudo conectar'}`);
    } finally {
      setProbando(null);
    }
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
  // CONGELADO (feature-freeze PMF): se quitó la generación del token de kiosko
  // (estado + fetch a /api/kiosk/token). La API sigue viva pero sin llamadas.
  // Reactivar = ver lib/frozen-features.ts.

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

  // Gmail: mismo patrón OAuth que Google Calendar (misma app, distinto scope
  // y distinta ruta de callback — ver lib/gmail.ts). Un estudio puede tener
  // las dos conectadas a la vez, o solo una.
  const gmailConectado = !!studio?.gmailEmail;
  const puedeConectarGmail = !!(googleClientId && studio);
  async function conectarGmail() {
    if (!googleClientId) return;
    const res = await fetch('/api/integrations/oauth-state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ provider: 'gmail' }),
    });
    if (!res.ok) { showToast('No se pudo iniciar la conexión con Gmail'); return; }
    const { state } = await res.json() as { state: string };
    const redirect = encodeURIComponent(`${appUrl}/api/integrations/gmail/callback`);
    const scope = encodeURIComponent('https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/contacts.readonly https://www.googleapis.com/auth/userinfo.email');
    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${googleClientId}&redirect_uri=${redirect}&response_type=code&scope=${scope}&access_type=offline&prompt=consent&state=${encodeURIComponent(state)}`;
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('gmail_connected')) {
      showToast('Gmail conectado');
      window.history.replaceState({}, '', '/configuracion');
    } else if (params.get('gmail_error')) {
      showToast(`Error al conectar Gmail: ${params.get('gmail_error')}`);
      window.history.replaceState({}, '', '/configuracion');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const desconectarGmail = async () => {
    const res = await fetch('/api/integrations/gmail/disconnect', { method: 'POST', headers: await authHeader() });
    if (res.ok) {
      updateStudio({ gmailEmail: null });
      showToast('Gmail desconectado');
    } else {
      const data = await res.json().catch(() => null);
      showToast(`No se pudo desconectar: ${data?.error ?? 'error desconocido'}`);
    }
  };

  const [sincronizandoContactos, setSincronizandoContactos] = useState(false);
  const sincronizarContactosGmail = async () => {
    setSincronizandoContactos(true);
    try {
      const res = await fetch('/api/integrations/gmail/sync-contacts', { method: 'POST', headers: await authHeader() });
      const data = await res.json();
      if (!res.ok) { showToast(`Error al sincronizar contactos: ${data.error}`); return; }
      showToast(`${data.creadas} clientas nuevas desde tus contactos de Gmail (${data.yaExistian} ya existían)`);
    } finally {
      setSincronizandoContactos(false);
    }
  };

  const [probandoGmail, setProbandoGmail] = useState(false);
  const enviarPruebaGmail = async () => {
    setProbandoGmail(true);
    try {
      const res = await fetch('/api/integrations/gmail/test', { method: 'POST', headers: await authHeader() });
      const data = await res.json();
      showToast(res.ok ? 'Email de prueba enviado — revisa tu bandeja de entrada' : `Error: ${data.error}`);
    } finally {
      setProbandoGmail(false);
    }
  };

  // Zoom: mismo patrón OAuth que Google Calendar/Gmail, pero con una app de
  // Zoom Marketplace propia (NEXT_PUBLIC_ZOOM_CLIENT_ID/ZOOM_CLIENT_SECRET) —
  // ver lib/zoom.ts. Sustituye a la cuenta única de operador de antes.
  const zoomConectado = !!studio?.zoomEmail;
  const zoomClientId = process.env.NEXT_PUBLIC_ZOOM_CLIENT_ID;
  const puedeConectarZoom = !!(zoomClientId && studio);
  async function conectarZoom() {
    if (!zoomClientId) return;
    const res = await fetch('/api/integrations/oauth-state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ provider: 'zoom' }),
    });
    if (!res.ok) { showToast('No se pudo iniciar la conexión con Zoom'); return; }
    const { state } = await res.json() as { state: string };
    const redirect = encodeURIComponent(`${appUrl}/api/integrations/zoom/callback`);
    window.location.href = `https://zoom.us/oauth/authorize?response_type=code&client_id=${zoomClientId}&redirect_uri=${redirect}&state=${encodeURIComponent(state)}`;
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('zoom_connected')) {
      showToast('Zoom conectado');
      window.history.replaceState({}, '', '/configuracion');
    } else if (params.get('zoom_error')) {
      showToast(`Error al conectar Zoom: ${params.get('zoom_error')}`);
      window.history.replaceState({}, '', '/configuracion');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const desconectarZoom = async () => {
    const res = await fetch('/api/integrations/zoom/disconnect', { method: 'POST', headers: await authHeader() });
    if (res.ok) {
      updateStudio({ zoomEmail: null });
      showToast('Zoom desconectado');
    } else {
      const data = await res.json().catch(() => null);
      showToast(`No se pudo desconectar: ${data?.error ?? 'error desconocido'}`);
    }
  };

  const probarZoomConexion = async () => {
    setProbando('ZOOM');
    try {
      const res = await fetch('/api/integrations/zoom/probar', { method: 'POST', headers: await authHeader() });
      const data = await res.json();
      showToast(res.ok && data.ok ? 'Conexión con Zoom correcta ✓' : `Error: ${data.error ?? 'no se pudo conectar'}`);
    } finally {
      setProbando(null);
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
    descargarCsv(`tentare-clientas-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows));

    // Hoja recibos
    const rRows: (string | number | null)[][] = [
      ['Concepto', 'Clienta', 'Importe (€)', 'Estado', 'Vencimiento', 'Cobro'],
    ];
    for (const r of recibos) {
      const s = r.socioId ? socioById.get(r.socioId) : undefined;
      rRows.push([
        r.concepto, s ? `${s.nombre} ${s.apellidos}` : '', fmtEur(r.importe),
        r.estado, r.fechaVencimiento?.slice(0, 10) ?? '', r.fechaCobro?.slice(0, 10) ?? '',
      ]);
    }
    descargarCsv(`tentare-recibos-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rRows));
    showToast('Exportación descargada (clientas y recibos)');
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
          const conectado = cat.tipo === 'STRIPE' ? stripeConectado : cat.tipo === 'GOOGLE_CALENDAR' ? googleConectado : cat.tipo === 'GMAIL' ? gmailConectado : cat.tipo === 'ZOOM' ? zoomConectado : !!intg?.activo;
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
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FFF7ED] text-warning">
                        Próximamente
                      </span>
                    ) : cat.accion !== 'exportar' && (
                      <span className={cn(
                        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold',
                        conectado ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground',
                      )}>
                        <span className={cn('w-1.5 h-1.5 rounded-full', conectado ? 'bg-success' : 'bg-muted-foreground')} />
                        {conectado ? 'Conectado' : 'No conectado'}
                      </span>
                    )}
                  </div>
                  {cat.categoria && <p className="text-[10px] font-bold uppercase tracking-wide text-[#B8B8AE] mt-0.5">{cat.categoria}</p>}
                  <p className="text-[12px] text-muted-foreground mt-1 leading-snug">{cat.descripcion}</p>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-[#F1F1F4] flex items-center gap-2">
                {cat.proximamente ? (
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
                ) : cat.tipo === 'GMAIL' ? (
                  gmailConectado ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <button onClick={sincronizarContactosGmail} disabled={sincronizandoContactos} className={cn(btnPrimary, sincronizandoContactos && 'opacity-50')}>
                        {sincronizandoContactos ? 'Sincronizando…' : 'Sincronizar contactos'}
                      </button>
                      <button onClick={enviarPruebaGmail} disabled={probandoGmail} className={cn(btnSecondary, probandoGmail && 'opacity-50')}>
                        {probandoGmail ? 'Enviando…' : 'Enviar email de prueba'}
                      </button>
                      <button onClick={desconectarGmail} className={btnSecondary}>Desconectar</button>
                    </div>
                  ) : puedeConectarGmail ? (
                    <button type="button" onClick={conectarGmail} className={cn(btnPrimary, 'no-underline')}>Conectar con Gmail</button>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">
                      Falta configurar <code className="font-mono bg-muted px-1 rounded">NEXT_PUBLIC_GOOGLE_CLIENT_ID</code>
                    </p>
                  )
                ) : cat.tipo === 'ZOOM' ? (
                  zoomConectado ? (
                    <>
                      <button onClick={probarZoomConexion} disabled={probando === 'ZOOM'} className={cn(btnSecondary, probando === 'ZOOM' && 'opacity-50')}>
                        {probando === 'ZOOM' ? 'Probando…' : 'Probar conexión'}
                      </button>
                      <button onClick={desconectarZoom} className={btnSecondary}>Desconectar</button>
                    </>
                  ) : puedeConectarZoom ? (
                    <button type="button" onClick={conectarZoom} className={cn(btnPrimary, 'no-underline')}>Conectar cuenta de Zoom</button>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">
                      Falta configurar <code className="font-mono bg-muted px-1 rounded">NEXT_PUBLIC_ZOOM_CLIENT_ID</code>
                    </p>
                  )
                ) : (
                  <>
                    <button onClick={() => abrirConfig(cat)} className={conectado ? btnSecondary : btnPrimary}>
                      {conectado ? 'Gestionar' : 'Conectar'}
                    </button>
                    {conectado && cat.probarUrl && (
                      <button onClick={() => probarCampos(cat)} disabled={probando === cat.tipo} className={cn(btnSecondary, probando === cat.tipo && 'opacity-50')}>
                        {probando === cat.tipo ? 'Probando…' : 'Probar conexión'}
                      </button>
                    )}
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

        {/* CONGELADO (feature-freeze PMF): se quitó la tarjeta "Kiosko de check-in"
            (generación del token del dispositivo). La ruta /api/kiosk/token sigue
            existiendo pero ya no se llama desde el frontend. Ver lib/frozen-features.ts. */}
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
                {cat.instrucciones && cat.instrucciones.length > 0 && (
                  <ol className="space-y-1.5 text-[12px] text-muted-foreground bg-muted/50 rounded-lg p-3 list-decimal list-inside">
                    {cat.instrucciones.map((paso, i) => <li key={i}>{paso}</li>)}
                  </ol>
                )}
                {cat.campos.map(campo => (
                  <div key={campo.key}>
                    <label htmlFor={`${uid}-${campo.key}`} className={labelCls}>{campo.label}</label>
                    <input
                      id={`${uid}-${campo.key}`}
                      className={inputCls}
                      type={campo.tipo ?? 'text'}
                      value={form[campo.key] ?? ''}
                      placeholder={campo.placeholder}
                      onChange={e => setForm(p => ({ ...p, [campo.key]: e.target.value }))}
                    />
                  </div>
                ))}
                {cat.secretoEnv && (
                  <div className="flex items-start gap-2 bg-warning/10 border border-[#FDE68A] rounded-lg p-3">
                    <AlertTriangle size={14} className="text-warning shrink-0 mt-0.5" />
                    <p className="text-[11px] text-warning leading-snug">
                      El proveedor de envío lo gestiona Tentare a nivel de plataforma — aquí solo
                      configuras tu remitente. Para enviar desde tu propio dominio, verifícalo con
                      nosotros primero; te avisamos cuando esté listo.
                    </p>
                  </div>
                )}
                <div className="flex items-center justify-between pt-1">
                  {conectado ? (
                    <button onClick={() => desconectar(cat)} className="text-[13px] font-medium text-destructive hover:underline">
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
