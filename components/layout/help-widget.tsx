'use client';

import { useState } from 'react';
import { X, ChevronDown, Search, Send, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStudio } from '@/lib/studio-context';
import { dbInsertSoporteSolicitud } from '@/lib/supabase-data';
import type { TipoSoporte } from '@/lib/types';
import { DashboardSheet } from '@/components/ui/dashboard-sheet';

interface FaqItem {
  pregunta: string;
  respuesta: string;
  categoria: string;
}

const FAQS: FaqItem[] = [
  { categoria: 'Reservas', pregunta: '¿Cómo reservan clase mis socias?', respuesta: 'Desde el portal de miembros (Calendario > Portal de reservas en el menú) o desde tu propia página de reservas pública. También puedes reservarles clase tú desde el Calendario del panel.' },
  { categoria: 'Reservas', pregunta: '¿Qué pasa si una clase está completa?', respuesta: 'La socia entra automáticamente en lista de espera. Si se libera una plaza (cancelación), sube la primera de la lista y se le notifica.' },
  { categoria: 'Reservas', pregunta: '¿Puedo cancelar una clase y avisar a los inscritos?', respuesta: 'Sí, desde Calendario > clase > Cancelar. Se marca como cancelada y las socias con reserva reciben una notificación en el portal.' },
  { categoria: 'Planes y cobros', pregunta: '¿Cómo creo un nuevo plan o bono?', respuesta: 'En Configuración > Planes y tarifas > Nuevo plan. Define nombre, tipo (mensual, bono o puntual), precio y sesiones incluidas.' },
  { categoria: 'Planes y cobros', pregunta: '¿Cómo cobro a una socia?', respuesta: 'Desde Transacciones puedes marcar un recibo como cobrado manualmente, o conectar Stripe en Configuración > Integraciones para cobros automáticos con tarjeta guardada.' },
  { categoria: 'Planes y cobros', pregunta: '¿Se generan facturas automáticamente?', respuesta: 'Sí, cada cobro genera su factura correspondiente, disponible en Facturas y descargable en PDF.' },
  { categoria: 'Portal de socias', pregunta: '¿Qué ven mis socias en su app/portal?', respuesta: 'Su próxima clase, su plan y sesiones restantes, vídeos on-demand, su progreso, créditos, logros y nivel — todo desde el enlace de Portal miembros del menú.' },
  { categoria: 'Portal de socias', pregunta: '¿Cómo entra una socia por primera vez?', respuesta: 'Con su email, desde /portal/tu-estudio/login. No necesita contraseña — es un acceso simplificado pensado para el día a día del estudio.' },
  { categoria: 'Gamificación', pregunta: '¿Qué son los créditos y cómo se ganan?', respuesta: 'Recompensan acciones como asistir a clase, completar una semana o renovar un plan. Tú decides cuántos créditos vale cada una en Configuración > Recompensas.' },
  { categoria: 'Gamificación', pregunta: '¿Para qué sirven los créditos?', respuesta: 'Las socias los canjean por recompensas de tu catálogo (Configuración > Recompensas > Catálogo) — una clase gratis, merchandising, lo que tú ofrezcas.' },
  { categoria: 'Gamificación', pregunta: '¿Cómo funcionan los logros?', respuesta: 'Se desbloquean automáticamente al alcanzar un umbral (ej. 10 clases asistidas). Los defines en Configuración > Logros, con su icono y créditos de regalo.' },
  { categoria: 'Gamificación', pregunta: '¿Y los niveles (Bronce, Plata...)?', respuesta: 'Se calculan sobre el total histórico de créditos ganados por la socia. Configúralos en Configuración > Niveles — nombres, colores y umbrales son totalmente tuyos.' },
  { categoria: 'Gamificación', pregunta: '¿Qué es la racha?', respuesta: 'Cuenta las semanas consecutivas en las que la socia ha asistido a al menos una clase. Se muestra en su Home y le avisa si está en riesgo de perderla.' },
  { categoria: 'Automatización', pregunta: '¿Qué hace el sistema autónomo / Automatizaciones IA?', respuesta: 'Detecta situaciones (socias inactivas, bonos a punto de acabar, pagos pendientes...) y sugiere o ejecuta acciones automáticas como recordatorios.' },
  { categoria: 'Equipo', pregunta: '¿Puedo dar acceso a mi equipo?', respuesta: 'Sí, en Equipo puedes invitar instructoras o recepción con permisos distintos a los tuyos como propietaria.' },
  { categoria: 'Cuenta', pregunta: '¿Cómo cambio los datos de mi estudio?', respuesta: 'En Configuración > Estudio: nombre, NIF, dirección, color de marca y logo.' },
];

const CATEGORIAS = [...new Set(FAQS.map(f => f.categoria))];

export function HelpWidget({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { studio } = useStudio();
  const [query, setQuery] = useState('');
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [tipo, setTipo] = useState<TipoSoporte>('DUDA');
  const [mensaje, setMensaje] = useState('');
  const [contacto, setContacto] = useState('');
  const [enviado, setEnviado] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const q = query.trim().toLowerCase();
  const faqsFiltrados = q
    ? FAQS.filter(f => `${f.pregunta} ${f.respuesta} ${f.categoria}`.toLowerCase().includes(q))
    : FAQS;

  async function enviarSolicitud() {
    if (!mensaje.trim() || enviando) return;
    setEnviando(true);
    const solicitud = {
      id: `sup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      tipo,
      mensaje: mensaje.trim(),
      contacto: contacto.trim() || null,
      creadoEn: new Date().toISOString(),
    };
    await dbInsertSoporteSolicitud(solicitud);
    setEnviando(false);
    setEnviado(true);
    setMensaje('');
    setContacto('');
    setTimeout(() => setEnviado(false), 4000);
  }

  return (
    <DashboardSheet
      open={open}
      onClose={onClose}
      label="Preguntas frecuentes"
      portal
      backdropClassName="fixed inset-0 z-50 flex items-end lg:items-center justify-center px-0 lg:px-4 bg-black/30"
      backdropStyle={{}}
      sheetClassName="w-full lg:w-[420px] bg-card rounded-t-3xl lg:rounded-3xl shadow-2xl flex flex-col"
      sheetStyle={{ maxHeight: '85vh' }}
    >
      <>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <p className="text-[15px] font-extrabold text-foreground">Preguntas frecuentes</p>
            <p className="text-[12px] text-muted-foreground">Y contacto directo con {studio?.nombre ?? 'Tentare'}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted">
            <X size={16} className="text-muted-foreground" />
          </button>
        </div>

            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-6">
              {/* FAQ search */}
              <div>
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-muted mb-3">
                  <Search size={14} className="text-muted-foreground shrink-0" />
                  <input
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Busca en las preguntas frecuentes…"
                    className="flex-1 bg-transparent text-[13px] focus:outline-none placeholder:text-muted-foreground"
                  />
                </div>

                <div className="space-y-4">
                  {CATEGORIAS.map(cat => {
                    const items = faqsFiltrados.filter(f => f.categoria === cat);
                    if (items.length === 0) return null;
                    return (
                      <div key={cat}>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-1.5">{cat}</p>
                        <div className="space-y-1.5">
                          {items.map((f, i) => {
                            const key = `${cat}-${i}`;
                            const isOpen = openFaq === FAQS.indexOf(f);
                            return (
                              <div key={key} className="rounded-xl border border-border overflow-hidden">
                                <button
                                  onClick={() => setOpenFaq(isOpen ? null : FAQS.indexOf(f))}
                                  className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left"
                                >
                                  <span className="text-[13px] font-semibold text-foreground">{f.pregunta}</span>
                                  <ChevronDown size={14} className={cn('shrink-0 text-muted-foreground transition-transform', isOpen && 'rotate-180')} />
                                </button>
                                {isOpen && (
                                  <p className="px-3 pb-3 text-[12.5px] text-muted-foreground leading-relaxed">{f.respuesta}</p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                  {faqsFiltrados.length === 0 && (
                    <p className="text-[13px] text-muted-foreground text-center py-6">Sin resultados para "{query}"</p>
                  )}
                </div>
              </div>

              {/* Contact form */}
              <div className="border-t border-border pt-4">
                <p className="text-[13px] font-bold text-foreground mb-2">¿No encuentras lo que buscas?</p>
                <p className="text-[12px] text-muted-foreground mb-3">Cuéntanos tu duda, sugerencia de mejora o un problema — nos llega directamente.</p>

                {enviado ? (
                  <div className="flex items-center gap-2 px-3 py-3 rounded-xl bg-[#EFFAF3] text-[#2E7D4F]">
                    <CheckCircle2 size={16} />
                    <span className="text-[13px] font-semibold">Enviado. ¡Gracias!</span>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    <div className="flex gap-1.5">
                      {([['DUDA', 'Duda'], ['MEJORA', 'Mejora'], ['BUG', 'Problema']] as [TipoSoporte, string][]).map(([val, label]) => (
                        <button
                          key={val}
                          onClick={() => setTipo(val)}
                          className={cn(
                            'px-3 py-1.5 rounded-full text-[11px] font-bold transition-all',
                            tipo === val ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <textarea
                      value={mensaje}
                      onChange={e => setMensaje(e.target.value)}
                      placeholder="Escribe aquí..."
                      rows={3}
                      className="w-full px-3 py-2.5 rounded-xl border border-border text-[13px] focus:outline-none focus:border-brand-secondary resize-none"
                    />
                    <input
                      value={contacto}
                      onChange={e => setContacto(e.target.value)}
                      placeholder="Email de contacto (opcional)"
                      className="w-full px-3 py-2.5 rounded-xl border border-border text-[13px] focus:outline-none focus:border-brand-secondary"
                    />
                    <button
                      onClick={enviarSolicitud}
                      disabled={!mensaje.trim() || enviando}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-[13px] font-bold disabled:opacity-40"
                    >
                      <Send size={14} />
                      {enviando ? 'Enviando…' : 'Enviar'}
                    </button>
                  </div>
                )}
              </div>
            </div>
      </>
    </DashboardSheet>
  );
}
