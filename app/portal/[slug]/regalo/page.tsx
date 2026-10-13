'use client';

import { useCallback, useEffect, useState } from 'react';
import { StudentShell } from '@/components/student/shell/StudentShell';
import { PageHeader } from '@/components/student/shell/PageHeader';
import { useEstudio } from '@/components/student/contexto';
import { Input } from '@/components/student/ui/Input';
import { Button } from '@/components/student/ui/Button';
import { Badge } from '@/components/student/ui/Badge';
import { Icono } from '@/components/student/ui/Icono';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/student/ui/States';
import { useToast } from '@/components/student/ui/Toast';
import { useCaptcha, ERROR_CAPTCHA } from '@/components/auth/turnstile-widget';
import { portalAuthHeader } from '@/lib/student/api-publica';
import { euros, hoyISO } from '@/lib/student/formato';
import { NOMBRE_ESTADO_REGALO, diasParaCaducar, type EstadoRegalo } from '@/lib/regalo/reglas';

interface Tarjeta { id: string; importeInicial: number; saldo: number; caducaEn: string; estado: EstadoRegalo }

const AVISO_DIAS = 30;
const fecha = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
const TONO: Record<EstadoRegalo, 'ok' | 'neutral' | 'few' | 'full'> = { ACTIVA: 'ok', AGOTADA: 'neutral', CADUCADA: 'few', ANULADA: 'full' };

// Tarjeta regalo (alumna): canjear el código y ver el saldo. Canjear la vincula a su cuenta,
// no mueve dinero. Nada optimista: el saldo que se enseña es el que contesta el servidor.
// El saldo se gasta con el estudio (mostrador) en esta versión: el texto lo dice tal cual.
export default function RegaloPage() {
  const { estudio } = useEstudio();
  const { toast } = useToast();
  const { widget, pedirToken } = useCaptcha();
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [tarjetas, setTarjetas] = useState<Tarjeta[] | null>(null);
  const [fallo, setFallo] = useState(false);
  const [nuevaId, setNuevaId] = useState<string | null>(null);

  const cargar = useCallback(async (): Promise<Tarjeta[] | null> => {
    try {
      const r = await fetch(`/api/public/regalo/mis-tarjetas?studioId=${encodeURIComponent(estudio.id)}`, { headers: await portalAuthHeader() });
      if (!r.ok) throw new Error(String(r.status));
      const lista = ((await r.json()) as { tarjetas: Tarjeta[] }).tarjetas;
      setTarjetas(lista);
      setFallo(false);
      return lista;
    } catch { setFallo(true); return null; }
  }, [estudio.id]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial de datos del servidor; el estado se actualiza al llegar la respuesta
  useEffect(() => { void cargar(); }, [cargar]);

  async function canjear() {
    if (enviando || !codigo.trim()) return;
    setEnviando(true); setError(null); // el estado de carga ANTES de pedir el token: tarda segundos
    try {
      const token = await pedirToken();
      if (token === null) { setError(ERROR_CAPTCHA); return; }
      const r = await fetch('/api/public/regalo/canjear', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(await portalAuthHeader()) },
        body: JSON.stringify({ studioId: estudio.id, codigo, captchaToken: token }),
      });
      const j = (await r.json().catch(() => ({}))) as { error?: string; saldo?: number };
      if (!r.ok) { setError(j.error ?? 'No hemos podido canjear la tarjeta.'); return; }
      setCodigo('');
      toast(`Tarjeta añadida a tu cuenta · ${euros(j.saldo ?? 0)}`);
      const antes = new Set((tarjetas ?? []).map(t => t.id));
      const lista = await cargar();
      setNuevaId(lista?.find(t => !antes.has(t.id))?.id ?? null);
    } catch { setError('No hemos podido canjear la tarjeta. Inténtalo de nuevo.'); }
    finally { setEnviando(false); }
  }

  const hoy = hoyISO();
  const hayActiva = !!tarjetas?.some(t => t.estado === 'ACTIVA');
  const sinTarjetas = !!tarjetas && tarjetas.length === 0;

  const canje = (
    <section aria-labelledby="rg-canje" className="card stack" style={{ ['--gap' as string]: 'var(--s-3)', padding: 'var(--s-4)' }}>
      <div>
        <p id="rg-canje" className="t-card-title">{sinTarjetas || !tarjetas ? 'Tengo un código' : 'Canjear otra tarjeta'}</p>
        <p className="t-small t-dim" style={{ marginTop: 2 }}>Escríbelo tal como viene en el correo del regalo.</p>
      </div>
      <Input
        label="Código de la tarjeta" value={codigo} onChange={(e) => { setCodigo(e.target.value); setError(null); }}
        placeholder="RG-XXXX-XXXX-XXXX-XXXX" autoCapitalize="characters" autoComplete="off" spellCheck={false}
        style={{ textTransform: 'uppercase', letterSpacing: '.04em', fontFamily: 'var(--font-mono)' }}
        error={error ?? undefined} hint="Lo tienes en el correo del regalo."
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void canjear(); } }}
      />
      {widget}
      <Button full onClick={canjear} loading={enviando} disabled={!codigo.trim()}>Canjear</Button>
    </section>
  );

  return (
    <StudentShell>
      <PageHeader titulo="Tarjeta regalo" sub="Tu saldo para gastar en el estudio" back />
      <div className="px" style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 12, paddingBottom: 24 }}>
        {!tarjetas && !fallo && <ListSkeleton n={2} h={150} />}
        {fallo && !tarjetas && <ErrorState titulo="No hemos podido cargar tus tarjetas" cuerpo="Revisa tu conexión e inténtalo de nuevo." onRetry={() => void cargar()} />}
        {fallo && tarjetas && (
          <p className="t-meta" role="alert">No hemos podido actualizar tus tarjetas. <button type="button" className="tap" onClick={() => void cargar()} style={{ fontWeight: 800 }}>Reintentar</button></p>
        )}

        {sinTarjetas && !fallo && (
          <EmptyState
            ilustracion="tarjeta"
            titulo="Aún no tienes ninguna tarjeta regalo"
            cuerpo={`Si alguien te ha regalado una de ${estudio.nombre}, canjea aquí su código y el saldo quedará guardado en tu cuenta.`}
          />
        )}

        {tarjetas && tarjetas.length > 0 && (
          <section aria-label="Mis tarjetas" className="stack" style={{ ['--gap' as string]: 'var(--s-3)' }}>
            {tarjetas.map((t) => {
              const activa = t.estado === 'ACTIVA';
              const dias = diasParaCaducar(t.caducaEn, hoy);
              const pronto = activa && dias >= 0 && dias <= AVISO_DIAS;
              const pct = t.importeInicial > 0 ? Math.min(100, Math.max(0, (t.saldo / t.importeInicial) * 100)) : 0;
              return (
                <article
                  key={t.id} data-testid="tarjeta-regalo" className="a-up"
                  ref={t.id === nuevaId ? (el) => { el?.scrollIntoView({ block: 'center', behavior: 'smooth' }); } : undefined}
                  style={{
                    position: 'relative', overflow: 'hidden', borderRadius: 'var(--radius-hero)', padding: 'var(--s-5)',
                    background: activa ? 'var(--accent-deep)' : 'var(--card)',
                    color: activa ? 'var(--accent-deep-foreground)' : 'var(--foreground)',
                    border: activa ? 'none' : '1px solid var(--border)',
                    boxShadow: activa ? 'var(--shadow-hero)' : 'none',
                    outline: t.id === nuevaId ? '2px solid var(--accent)' : 'none', outlineOffset: 3,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <p className="t-label" style={{ color: activa ? 'var(--accent-deep-muted)' : undefined }}>Tarjeta regalo · {estudio.nombre}</p>
                    <Badge tone={TONO[t.estado]}>{NOMBRE_ESTADO_REGALO[t.estado] ?? t.estado}</Badge>
                  </div>
                  <p style={{ margin: 'var(--s-3) 0 0', fontSize: 'var(--t-display)', lineHeight: 1, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
                    {euros(t.saldo)}
                  </p>
                  <p className="t-small" style={{ margin: '6px 0 0', opacity: .85 }}>
                    {activa ? 'te quedan' : 'saldo'} · De {euros(t.importeInicial)}
                  </p>
                  <div
                    role="img" aria-label={`Te quedan ${euros(t.saldo)} de ${euros(t.importeInicial)}`}
                    style={{ height: 8, borderRadius: 99, marginTop: 'var(--s-3)', overflow: 'hidden', background: activa ? 'color-mix(in srgb, var(--accent-deep-foreground) 18%, transparent)' : 'var(--muted)' }}
                  >
                    <div style={{ width: `${pct}%`, height: '100%', borderRadius: 99, background: activa ? 'var(--accent-deep-muted)' : 'var(--muted-foreground)', transition: 'width .5s var(--ease)' }} />
                  </div>
                  <p className="t-meta" style={{ margin: 'var(--s-3) 0 0', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', opacity: .9 }}>
                    {pronto && <Badge tone="few">{dias === 0 ? 'Caduca hoy' : `Caduca en ${dias} ${dias === 1 ? 'día' : 'días'}`}</Badge>}
                    <span>{t.estado === 'CADUCADA' ? 'Caducó' : 'Válida hasta'} el {fecha(t.caducaEn)}</span>
                  </p>
                </article>
              );
            })}
          </section>
        )}

        {canje}

        {(hayActiva || sinTarjetas) && (
          <section aria-labelledby="rg-como" className="card stack" style={{ ['--gap' as string]: 'var(--s-3)', padding: 'var(--s-4)' }}>
            <p id="rg-como" className="t-card-title">Cómo se gasta</p>
            <ol className="stack" style={{ ['--gap' as string]: 'var(--s-3)', listStyle: 'none', margin: 0, padding: 0 }}>
              {[
                sinTarjetas ? 'Canjea el código de tu regalo para guardarlo en tu cuenta.' : 'Tu saldo está guardado en tu cuenta.',
                `Cuando vayas a pagar en ${estudio.nombre}, díselo al equipo.`,
                'Descuentan lo que uses de la tarjeta. Lo que sobre se queda para otro día, hasta que caduque.',
              ].map((txt, i) => (
                <li key={i} style={{ display: 'flex', gap: 'var(--s-3)', alignItems: 'flex-start' }}>
                  <span aria-hidden className="avatar" style={{ ['--size' as string]: '26px', flex: 'none', background: 'var(--accent-soft)', color: 'var(--accent-soft-foreground)', fontSize: 'var(--t-meta)', fontWeight: 800 }}>
                    {i === 2 ? <Icono nombre="hecho" tamano={14} /> : i + 1}
                  </span>
                  <p className="t-small" style={{ margin: 0 }}>{txt}</p>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </StudentShell>
  );
}
