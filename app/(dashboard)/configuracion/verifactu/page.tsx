'use client';

// Envío de tus registros de facturación a la AEAT (Veri*Factu): el alta.
//
// Solo la propietaria. Tres pasos, y el importante NO pasa aquí: el poder se
// otorga en la sede de la AEAT, con su certificado o Cl@ve. Tentare nunca pide
// ni ve esas credenciales; solo recoge la prueba (el CSV que da la sede) y el
// apoderado la verifica en su «Consulta de apoderamientos recibidos».
//
// Mientras el estudio no esté en producción (lo activa Tentare, a mano, con el
// poder verificado), no se envía nada. La pantalla lo dice tal cual.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ExternalLink, FileCheck2, ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authHeader } from '@/lib/api-client';

type EstadoEstudio = 'SIN_CONFIGURAR' | 'PENDIENTE_AUTORIZACION' | 'AUTORIZACION_EN_REVISION' | 'VERIFICADO' | 'PRODUCCION' | 'PAUSADO' | 'SUSPENDIDO_AEAT';

interface Estado {
  estado: EstadoEstudio;
  motivo: string | null;
  nifEstudio: string | null;
  nifValido: boolean;
  nombreFiscal: string | null;
  tipoEmisor: 'persona_fisica' | 'sociedad' | 'otra' | null;
  esDemo: boolean;
  apoderado: { nombre: string; nif: string } | null;
  tramite: { codigo: string; nombre: string };
  urls: { registro: string; ayuda: string };
  mandato: { version: string; texto: string } | null;
  representacion: { estado: string; estado_motivo: string | null; vigente_hasta: string; tramite: string } | null;
  habilitadoParaEnviar: boolean;
}

const TEXTO_ESTADO: Record<EstadoEstudio, { titulo: string; detalle: string }> = {
  SIN_CONFIGURAR: { titulo: 'Sin dar de alta', detalle: 'Tentare solo emite tus facturas cuando el envío a la AEAT está activo. Hasta entonces, tus cobros dejan su justificante de pago.' },
  PENDIENTE_AUTORIZACION: { titulo: 'Falta tu autorización', detalle: 'Otorga el poder en la AEAT y trae aquí su justificante. Hasta que se active el envío, Tentare no emite tus facturas.' },
  AUTORIZACION_EN_REVISION: { titulo: 'Comprobando tu autorización', detalle: 'Tentare está comprobando en la AEAT el poder que otorgaste. Todavía no se emiten facturas desde Tentare.' },
  VERIFICADO: { titulo: 'Autorización comprobada', detalle: 'Tu poder está verificado. Tentare activará el envío: desde ese día, cada cobro genera su factura y su registro se envía a la AEAT.' },
  PRODUCCION: { titulo: 'Enviando a la AEAT', detalle: 'Tus facturas se emiten desde Tentare y sus registros se envían a la AEAT.' },
  PAUSADO: { titulo: 'Envío en pausa', detalle: 'Tus facturas se siguen emitiendo, pero ahora no se envían.' },
  SUSPENDIDO_AEAT: { titulo: 'Envío suspendido por la AEAT', detalle: 'La AEAT ha suspendido temporalmente el envío. Tentare se está ocupando.' },
};

const hoyIso = () => new Date().toISOString().slice(0, 10);
const masAnos = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + n);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

export default function VerifactuAltaPage() {
  const [e, setE] = useState<Estado | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errores, setErrores] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);

  const [nombreFiscal, setNombreFiscal] = useState('');
  const [tipoEmisor, setTipoEmisor] = useState<'persona_fisica' | 'sociedad' | 'otra'>('persona_fisica');
  const [csv, setCsv] = useState('');
  const [otorgadoEn, setOtorgadoEn] = useState(hoyIso());
  const [vigenteHasta, setVigenteHasta] = useState(masAnos(hoyIso(), 5));
  const [tramite, setTramite] = useState<'IZ860' | 'GENERAL_46_2'>('IZ860');
  const [otorganteNombre, setOtorganteNombre] = useState('');
  const [otorganteNif, setOtorganteNif] = useState('');
  const [otorganteCargo, setOtorganteCargo] = useState<'titular' | 'representante_legal' | 'apoderado_con_poder_suficiente'>('titular');
  const [aceptaMandato, setAceptaMandato] = useState(false);

  const aplicar = (d: Estado) => {
    setE(d);
    setNombreFiscal(d.nombreFiscal ?? '');
    if (d.tipoEmisor) setTipoEmisor(d.tipoEmisor);
  };

  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const res = await fetch('/api/verifactu/estudio', { headers: await authHeader(), cache: 'no-store' });
        const cuerpo = await res.json().catch(() => null);
        if (!vivo) return;
        if (!res.ok) setError((cuerpo as { error?: string } | null)?.error ?? 'No se ha podido cargar.');
        else aplicar(cuerpo as Estado);
      } catch {
        if (vivo) setError('No se ha podido cargar.');
      }
    })();
    return () => { vivo = false; };
  }, []);

  async function enviar(cuerpo: Record<string, unknown>) {
    setEnviando(true);
    setErrores([]);
    setError(null);
    try {
      const res = await fetch('/api/verifactu/estudio', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeader()) }, body: JSON.stringify(cuerpo),
      });
      const r = await res.json().catch(() => null) as (Estado & { error?: string; errores?: string[] }) | null;
      if (!res.ok) {
        setErrores(r?.errores?.length ? r.errores : [r?.error ?? 'No se ha podido guardar.']);
        return;
      }
      if (r) aplicar(r);
    } catch {
      setError('No se ha podido guardar. Revisa la conexión.');
    } finally {
      setEnviando(false);
    }
  }

  const estado = e ? TEXTO_ESTADO[e.estado] : null;
  const puedeConfigurar = e && !e.esDemo && e.estado !== 'PRODUCCION';
  const pideAutorizacion = e?.estado === 'PENDIENTE_AUTORIZACION';
  const tieneRepresentacionViva = e?.representacion && ['EN_REVISION', 'VERIFICADA'].includes(e.representacion.estado);

  return (
    <div className="space-y-6 pb-10">
      <PageHeader
        title="Envío a la AEAT"
        description="Tentare solo emite tus facturas enviando su registro a la AEAT (Veri*Factu), y ese envío tienes que autorizarlo en la propia AEAT. Aquí te decimos cómo y guardamos la prueba."
      />

      {error && <p role="alert" className="rounded-2xl border border-red-500/30 bg-red-500/[0.05] px-4 py-3 text-[13.5px]">{error}</p>}
      {!e && !error && <p className="text-[13.5px] text-muted-foreground">Cargando…</p>}

      {e && estado && (
        <>
          <section className="rounded-2xl border border-border bg-card px-4 py-4 sm:px-5" aria-live="polite">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-muted-foreground" aria-hidden />
              <h2 className="text-[15px] font-bold">{estado.titulo}</h2>
            </div>
            <p className="mt-1 text-[13.5px] text-muted-foreground">{estado.detalle}</p>
            {e.motivo && <p className="mt-2 text-[13px]">Motivo: {e.motivo}</p>}
            {e.representacion?.estado_motivo && e.representacion.estado === 'RECHAZADA_REVISION' && (
              <p className="mt-2 text-[13px]">No se pudo comprobar tu autorización: {e.representacion.estado_motivo}</p>
            )}
            {e.representacion?.estado === 'VERIFICADA' && (
              <p className="mt-2 text-[13px]">Tu poder vale hasta el {e.representacion.vigente_hasta.split('-').reverse().join('/')}.</p>
            )}
          </section>

          {e.esDemo && (
            <p className="rounded-2xl border border-border bg-muted/40 px-4 py-3 text-[13.5px]">Este es el estudio de demostración: su envío a la AEAT no se puede activar, así que no emite facturas nuevas. Las que tiene no son reales.</p>
          )}

          {errores.length > 0 && (
            <div role="alert" className="rounded-2xl border border-red-500/30 bg-red-500/[0.05] px-4 py-3 text-[13.5px]">
              <ul className="list-disc pl-5 space-y-0.5">{errores.map(x => <li key={x}>{x}</li>)}</ul>
            </div>
          )}

          {puedeConfigurar && (
            <section className="rounded-2xl border border-border bg-card px-4 py-4 sm:px-5 space-y-3">
              <h2 className="text-[15px] font-bold">1 · Tus datos fiscales</h2>
              <p className="text-[13px] text-muted-foreground">
                NIF: <strong className="text-foreground">{e.nifEstudio ?? 'sin configurar'}</strong>
                {!e.nifValido && <> · <Link href="/configuracion" className="underline">configúralo en Datos fiscales</Link></>}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="vf-nombre">Nombre o razón social EXACTOS (como en la AEAT)</Label>
                  <Input id="vf-nombre" value={nombreFiscal} onChange={ev => setNombreFiscal(ev.target.value)} maxLength={120} autoComplete="off" />
                </div>
                <div>
                  <Label htmlFor="vf-tipo">Facturas como</Label>
                  <select id="vf-tipo" value={tipoEmisor} onChange={ev => setTipoEmisor(ev.target.value as typeof tipoEmisor)}
                    className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-[14px]">
                    <option value="persona_fisica">Persona física (autónoma)</option>
                    <option value="sociedad">Sociedad</option>
                    <option value="otra">Otra entidad (comunidad de bienes…)</option>
                  </select>
                </div>
              </div>
              <p className="text-[12.5px] text-muted-foreground">Si cambias estos datos más adelante, tendrás que volver a autorizar: el poder de la AEAT es para un NIF concreto.</p>
              <Button disabled={enviando || !e.nifValido || !nombreFiscal.trim()} onClick={() => void enviar({ accion: 'configurar', nombreFiscal, tipoEmisor })}>
                Confirmar mis datos
              </Button>
            </section>
          )}

          {pideAutorizacion && e.apoderado && (
            <section className="rounded-2xl border border-border bg-card px-4 py-4 sm:px-5 space-y-3">
              <h2 className="text-[15px] font-bold">2 · Autoriza el envío en la AEAT</h2>
              <ol className="list-decimal pl-5 space-y-1.5 text-[13.5px]">
                <li>Entra en el <a href={e.urls.registro} target="_blank" rel="noopener noreferrer" className="underline inline-flex items-center gap-1">Registro de apoderamientos de la AEAT<ExternalLink className="size-3.5" aria-hidden /></a> con tu certificado o Cl@ve{tipoEmisor === 'sociedad' ? ' (el representante legal de la sociedad)' : ''}.</li>
                <li>Elige «Alta de poder para trámites tributarios específicos» → «Sistemas Informáticos de Facturación y VERI*FACTU».</li>
                <li>
                  Otorga a <strong>{e.apoderado.nombre}</strong>, NIF <strong>{e.apoderado.nif}</strong>, el poder <strong>{e.tramite.codigo}</strong> «{e.tramite.nombre}».
                </li>
                <li>Al terminar, la AEAT te enseña un <strong>CSV</strong> (código seguro de verificación) de ese apoderamiento. Cópialo aquí abajo.</li>
              </ol>
              <p className="text-[12.5px] text-muted-foreground">
                Tentare nunca te pedirá tu certificado ni tu Cl@ve. <a href={e.urls.ayuda} target="_blank" rel="noopener noreferrer" className="underline">Ayuda oficial de la AEAT para dar de alta un poder</a>.
              </p>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="vf-csv">CSV del apoderamiento</Label>
                  <Input id="vf-csv" value={csv} onChange={ev => setCsv(ev.target.value)} autoComplete="off" spellCheck={false} />
                </div>
                <div>
                  <Label htmlFor="vf-tramite">Qué poder otorgaste</Label>
                  <select id="vf-tramite" value={tramite} onChange={ev => setTramite(ev.target.value as typeof tramite)}
                    className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-[14px]">
                    <option value="IZ860">IZ860 (específico, recomendado)</option>
                    <option value="GENERAL_46_2">Poder general (art. 46.2 LGT)</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="vf-desde">Fecha en que lo otorgaste</Label>
                  <Input id="vf-desde" type="date" value={otorgadoEn} max={hoyIso()} onChange={ev => { setOtorgadoEn(ev.target.value); setVigenteHasta(masAnos(ev.target.value, 5)); }} />
                </div>
                <div>
                  <Label htmlFor="vf-hasta">Vale hasta (la AEAT pone 5 años si no cambias la fecha)</Label>
                  <Input id="vf-hasta" type="date" value={vigenteHasta} onChange={ev => setVigenteHasta(ev.target.value)} />
                </div>
                <div>
                  <Label htmlFor="vf-otorgante">Quién lo otorgó (nombre)</Label>
                  <Input id="vf-otorgante" value={otorganteNombre} onChange={ev => setOtorganteNombre(ev.target.value)} autoComplete="name" />
                </div>
                <div>
                  <Label htmlFor="vf-otorgante-nif">Su NIF</Label>
                  <Input id="vf-otorgante-nif" value={otorganteNif} onChange={ev => setOtorganteNif(ev.target.value.toUpperCase())} maxLength={9} autoComplete="off" />
                </div>
                <div>
                  <Label htmlFor="vf-cargo">En calidad de</Label>
                  <select id="vf-cargo" value={otorganteCargo} onChange={ev => setOtorganteCargo(ev.target.value as typeof otorganteCargo)}
                    className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-[14px]">
                    <option value="titular">Titular (persona física)</option>
                    <option value="representante_legal">Representante legal de la sociedad</option>
                    <option value="apoderado_con_poder_suficiente">Apoderado con poder suficiente</option>
                  </select>
                </div>
              </div>

              {e.mandato && (
                <details className="rounded-xl border border-border px-3 py-2">
                  <summary className="cursor-pointer text-[13px] font-semibold">Leer el mandato (versión {e.mandato.version})</summary>
                  <pre className="mt-2 whitespace-pre-wrap font-sans text-[12.5px] leading-relaxed">{e.mandato.texto}</pre>
                </details>
              )}
              <label className="flex items-start gap-2 text-[13px]">
                <input type="checkbox" checked={aceptaMandato} onChange={ev => setAceptaMandato(ev.target.checked)} className="mt-0.5" />
                <span>He leído el mandato y confirmo que los datos del poder son ciertos. Sé que lo que autoriza el envío es el poder de la AEAT, no esta casilla.</span>
              </label>
              <Button
                disabled={enviando || !csv.trim() || !aceptaMandato || !e.mandato}
                onClick={() => void enviar({
                  accion: 'autorizar', csv, otorgadoEn, vigenteHasta, tramite,
                  otorgante: { nombre: otorganteNombre, nif: otorganteNif, cargo: otorganteCargo },
                  aceptaMandato, mandatoVersion: e.mandato?.version,
                })}
              >
                Enviar para comprobar
              </Button>
            </section>
          )}

          {pideAutorizacion && !e.apoderado && (
            <p className="rounded-2xl border border-border bg-muted/40 px-4 py-3 text-[13.5px]">Tentare todavía no ha preparado el envío a la AEAT. Vuelve más adelante.</p>
          )}

          {tieneRepresentacionViva && (
            <section className="rounded-2xl border border-border bg-card px-4 py-4 sm:px-5 space-y-2">
              <h2 className="text-[15px] font-bold">¿Has revocado el poder en la AEAT?</h2>
              <p className="text-[13px] text-muted-foreground">Si lo has retirado en la sede, díselo también a Tentare: dejamos de enviar al momento.</p>
              <Button variant="outline" disabled={enviando} onClick={() => void enviar({ accion: 'revocar' })}>He revocado el poder</Button>
            </section>
          )}

          <p className="text-[13px]">
            <Link href="/verifactu/declaracion-responsable" className="inline-flex items-center gap-1.5 underline">
              <FileCheck2 className="size-4" aria-hidden /> Declaración responsable del sistema de facturación
            </Link>
          </p>
        </>
      )}
    </div>
  );
}
