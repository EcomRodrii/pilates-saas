'use client';

import { useCallback, useEffect, useState } from 'react';
import { StudentShell } from '@/components/student/shell/StudentShell';
import { PageHeader } from '@/components/student/shell/PageHeader';
import { useEstudio } from '@/components/student/contexto';
import { Input } from '@/components/student/ui/Input';
import { Button } from '@/components/student/ui/Button';
import { useToast } from '@/components/student/ui/Toast';
import { useCaptcha, ERROR_CAPTCHA } from '@/components/auth/turnstile-widget';
import { portalAuthHeader } from '@/lib/student/api-publica';
import { euros } from '@/lib/student/formato';
import { NOMBRE_ESTADO_REGALO, type EstadoRegalo } from '@/lib/regalo/reglas';

interface Tarjeta { id: string; importeInicial: number; saldo: number; caducaEn: string; estado: EstadoRegalo }

const fecha = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });

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

  const cargar = useCallback(async () => {
    try {
      const r = await fetch(`/api/public/regalo/mis-tarjetas?studioId=${encodeURIComponent(estudio.id)}`, { headers: await portalAuthHeader() });
      if (!r.ok) throw new Error(String(r.status));
      setTarjetas(((await r.json()) as { tarjetas: Tarjeta[] }).tarjetas);
      setFallo(false);
    } catch { setFallo(true); }
  }, [estudio.id]);
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
      await cargar();
    } catch { setError('No hemos podido canjear la tarjeta. Inténtalo de nuevo.'); }
    finally { setEnviando(false); }
  }

  return (
    <StudentShell>
      <PageHeader titulo="Tarjeta regalo" sub="Canjea el código que te han regalado" back />
      <div className="px" style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 12 }}>
        <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Input
            label="Código de la tarjeta" value={codigo} onChange={(e) => setCodigo(e.target.value)}
            placeholder="RG-XXXX-XXXX-XXXX-XXXX" autoCapitalize="characters" autoComplete="off" spellCheck={false}
            error={error ?? undefined} hint="Lo tienes en el correo del regalo."
          />
          {widget}
          <Button full onClick={canjear} loading={enviando} disabled={!codigo.trim()}>Canjear</Button>
        </section>

        <section style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          <p className="t-label">Mis tarjetas</p>
          {fallo && <p className="t-meta" role="alert">No hemos podido cargar tus tarjetas. <button type="button" className="tap" onClick={() => void cargar()} style={{ fontWeight: 800 }}>Reintentar</button></p>}
          {tarjetas && tarjetas.length === 0 && !fallo && <p className="t-meta">Todavía no has canjeado ninguna tarjeta.</p>}
          {tarjetas?.map((t) => (
            <article key={t.id} data-testid="tarjeta-regalo" style={{ border: '1px solid var(--border)', borderRadius: 16, background: 'var(--card)', padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <b style={{ fontSize: 'var(--t-h2, 20px)' }}>{euros(t.saldo)}</b>
                <span className="t-meta">{NOMBRE_ESTADO_REGALO[t.estado] ?? t.estado}</span>
              </div>
              <p className="t-meta" style={{ margin: '4px 0 0' }}>De {euros(t.importeInicial)} · válida hasta el {fecha(t.caducaEn)}</p>
            </article>
          ))}
          {tarjetas && tarjetas.some(t => t.estado === 'ACTIVA') && (
            <p className="t-meta">Para gastar el saldo, díselo al equipo de {estudio.nombre} al pagar tu próxima compra: lo descuentan de la tarjeta, y puedes usarlo en varias veces.</p>
          )}
        </section>
      </div>
    </StudentShell>
  );
}
