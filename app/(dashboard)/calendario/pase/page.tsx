'use client';

// Control de acceso: escanear el QR de una alumna en la puerta.
//
// Vive bajo /calendario porque la lista blanca de rutas del panel se compara
// por prefijo (lib/permisos-reglas.ts) y es donde vive todo lo de las clases de
// hoy. Pensada para el iPad de recepción: la cámara se queda encendida, cada
// lectura enseña un resultado grande, y un 🟢 se cierra solo para leer a la
// siguiente. Escanear → resultado, sin buscar a nadie ni elegir la clase.
//
// La clase: por defecto, «cualquiera de las de ahora» — Tentare mira en cuál
// tiene plaza ella. Si se llega desde una clase (`?sesion=<id>`), o se toca una
// de la fila de arriba, se comprueba contra ESA.
//
// Si la cámara no lee, no hay código que teclear (se retiró con el pase de 2
// minutos): se marca en la lista de la clase, que ya existía.

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Camera, QrCode } from 'lucide-react';
import { authHeader } from '@/lib/api-client';
import { useStudio } from '@/lib/studio-context';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useLectorQr } from '@/components/acceso/lector-qr';
import { ResultadoAcceso } from '@/components/acceso/resultado-acceso';
import { leerTokenQr } from '@/lib/acceso/qr-formato';
import { horaAcceso } from '@/lib/acceso/textos-acceso';
import type { AccionAcceso, ClaseDetalle, RespuestaDecision, RespuestaEscaneo } from '@/lib/acceso/escanear-servidor';

/** El pase de 2 minutos (lib/pase-acceso.ts): `payload.firma` en base64url. Se retira con él. */
const esPaseAntiguo = (v: string) => /^[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}$/.test(v.trim());

/** Un 🟢 se cierra solo: en la puerta hay cola. Un 🟠 o un 🔴 esperan a que alguien lo lea, y
 *  un 🟢 con la puerta de Kisi por abrir espera a que alguien pulse el botón. */
const CIERRE_PERMITIDO_MS = 5000;

function resultadoDeError(texto: string): RespuestaEscaneo {
  return {
    escaneoId: null, veredicto: 'DENEGADO', motivo: 'QR_NO_RECONOCIDO', alumna: null, clase: null, otraClase: null,
    candidatas: [], tipoAcceso: null, plazaFija: null, estadoReserva: null, reservaId: null, avisos: [], yaEntroEn: null,
    asistenciaMarcada: false, asistenciaAlTerminar: false, errorAsistencia: texto, puerta: 'sin-kisi', acciones: [], claseEmpezada: false,
  };
}

export default function ControlDeAccesoPage() {
  const { studio, dataLoaded, deshacerCheckin } = useStudio();
  const [clases, setClases] = useState<ClaseDetalle[]>([]);
  const [fijada, setFijada] = useState<string | null>(null);
  const [resultado, setResultado] = useState<RespuestaEscaneo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [decidiendo, setDecidiendo] = useState<AccionAcceso | null>(null);
  const [errorDecision, setErrorDecision] = useState<string | null>(null);
  const [abriendoPuerta, setAbriendoPuerta] = useState(false);
  const ultimaLectura = useRef<string>('');
  const tarjetaRef = useRef<HTMLElement>(null);

  // `?sesion=` (se llega desde una clase del calendario) se lee de
  // window.location, como en /calendario: `useSearchParams` suspendería la
  // página entera. Se aplica cuando llegan las clases de ahora.
  const sesionDelEnlace = useRef<string | null>(null);
  useEffect(() => {
    sesionDelEnlace.current = new URLSearchParams(window.location.search).get('sesion');
  }, []);

  // Las clases de ahora, y otra vez cada dos minutos: la fila tiene que seguir
  // al reloj en un iPad que se queda toda la mañana abierto.
  useEffect(() => {
    let vivo = true;
    const cargar = () => {
      authHeader()
        .then(h => fetch('/api/acceso/escanear', { headers: h }))
        .then(r => (r.ok ? r.json() as Promise<{ clases?: ClaseDetalle[] }> : null))
        .then(d => {
          if (!vivo || !d) return;
          setClases(d.clases ?? []);
          if (sesionDelEnlace.current) { setFijada(sesionDelEnlace.current); sesionDelEnlace.current = null; }
        })
        .catch(() => { /* sin la fila de clases se sigue pudiendo escanear contra «todas» */ });
    };
    cargar();
    const id = setInterval(cargar, 120_000);
    return () => { vivo = false; clearInterval(id); };
  }, []);

  const escanear = useCallback(async (lectura: string, sesionId: string | null) => {
    ultimaLectura.current = lectura;
    setEnviando(true);
    setError(null);
    setErrorDecision(null);
    try {
      // ⚠️ TRANSICIÓN: el pase antiguo de 2 minutos (payload.firma) sigue valiendo
      // mientras quede alguna app sin recargar. Se retira con /api/checkin/pase.
      if (!leerTokenQr(lectura) && esPaseAntiguo(lectura)) {
        const res = await fetch('/api/checkin/pase', {
          method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
          body: JSON.stringify({ token: lectura }),
        });
        const data = await res.json().catch(() => null) as { quien?: string; yaEstaba?: boolean; error?: string } | null;
        setResultado(res.ok
          ? { ...resultadoDeError(''), veredicto: 'PERMITIDO', motivo: data?.yaEstaba ? 'YA_ENTRO' : 'RESERVA_CONFIRMADA', alumna: { nombre: data?.quien ?? '', foto: null }, errorAsistencia: null, asistenciaMarcada: !data?.yaEstaba }
          : resultadoDeError(data?.error ?? 'No hemos podido leer el pase.'));
        return;
      }
      const res = await fetch('/api/acceso/escanear', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({ lectura, sesionId }),
      });
      const data = await res.json().catch(() => null) as (RespuestaEscaneo & { error?: string }) | null;
      if (!res.ok || !data) { setError(data?.error ?? 'No hemos podido comprobar el QR. Inténtalo otra vez.'); return; }
      setResultado(data);
    } catch {
      setError('Sin conexión. Inténtalo otra vez.');
    } finally {
      setEnviando(false);
    }
  }, []);

  const { videoRef, camara, encender, olvidarUltimo } = useLectorQr({
    pausado: resultado !== null || enviando,
    onLectura: (valor) => {
      // Solo van al servidor los QR de acceso de Tentare (y, en la transición,
      // el pase antiguo). Cualquier otro código que vea la cámara —el de una
      // caja, el de la web del estudio— se contesta aquí: no es un intento de
      // entrar y no tiene por qué llenar el historial de accesos.
      if (!leerTokenQr(valor) && !esPaseAntiguo(valor)) {
        setError('Ese código no es un QR de acceso de Tentare. Pídele que abra Perfil → QR de acceso en su app.');
        return;
      }
      void escanear(valor, fijada);
    },
  });

  const cerrar = useCallback(() => {
    setResultado(null);
    setError(null);
    setErrorDecision(null);
    olvidarUltimo();
  }, [olvidarUltimo]);

  // Quien apunta la cámara puede tener la página bajada: el resultado se trae a la vista.
  useEffect(() => {
    if (resultado) tarjetaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [resultado]);

  // 🟢: se cierra solo para la siguiente de la cola.
  useEffect(() => {
    if (resultado?.veredicto !== 'PERMITIDO' || resultado.motivo === 'YA_ENTRO' || resultado.puerta === 'disponible') return;
    const id = setTimeout(cerrar, CIERRE_PERMITIDO_MS);
    return () => clearTimeout(id);
  }, [resultado, cerrar]);

  const decidir = async (accion: AccionAcceso) => {
    if (!resultado?.escaneoId) return;
    setDecidiendo(accion);
    setErrorDecision(null);
    try {
      const res = await fetch('/api/acceso/decidir', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({ escaneoId: resultado.escaneoId, decision: accion }),
      });
      const data = await res.json().catch(() => null) as (RespuestaDecision & { error?: string }) | null;
      if (!res.ok || !data) { setErrorDecision(data?.error ?? 'No se ha podido guardar. Inténtalo otra vez.'); return; }
      // La decisión es un escaneo nuevo en el historial: la tarjeta pasa a contar
      // lo que ha pasado de verdad (aprobada sin plaza, clase ya empezada…).
      setResultado(r => r && {
        ...r, ...data, acciones: [],
        estadoReserva: data.veredicto === 'PERMITIDO' ? (data.asistenciaMarcada ? 'ASISTIDA' : 'CONFIRMADA') : r.estadoReserva,
      });
    } catch {
      setErrorDecision('Sin conexión. Inténtalo otra vez.');
    } finally {
      setDecidiendo(null);
    }
  };

  const abrirPuerta = async () => {
    if (!resultado?.escaneoId) return;
    setAbriendoPuerta(true);
    setErrorDecision(null);
    try {
      const res = await fetch('/api/acceso/puerta', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({ escaneoId: resultado.escaneoId }),
      });
      const data = await res.json().catch(() => null) as { puerta?: 'abierta' | 'fallo'; error?: string } | null;
      if (!res.ok || !data?.puerta) { setErrorDecision(data?.error ?? 'No se ha podido abrir la puerta.'); return; }
      setResultado(x => x && { ...x, puerta: data.puerta! });
    } catch {
      setErrorDecision('Sin conexión. Ábrela a mano.');
    } finally {
      setAbriendoPuerta(false);
    }
  };

  const deshacer = async () => {
    if (!resultado?.reservaId) return;
    const r = await deshacerCheckin(resultado.reservaId);
    if (r.ok) setResultado(x => x && { ...x, asistenciaMarcada: false, estadoReserva: 'CONFIRMADA' });
    else setErrorDecision(r.error);
  };

  const cabecera = <PageHeader title="Control de acceso" description="Escanea el QR de la alumna: Tentare comprueba en el momento si puede entrar a su clase." back={{ href: '/calendario', label: 'Volver al calendario' }} />;

  if (dataLoaded && studio && studio.controlAccesoQr === false) {
    return (
      <div className="p-4 max-w-xl mx-auto flex flex-col gap-4">
        {cabecera}
        <div className="rounded-2xl border bg-card flex flex-col items-center gap-3 text-center px-6 py-10">
          <QrCode className="size-7 text-muted-foreground" aria-hidden />
          <p className="text-sm font-semibold">El control de acceso con QR está desactivado</p>
          <p className="text-sm text-muted-foreground text-pretty">
            Tus alumnas no ven su QR en la app. Puedes activarlo en Configuración → Cómo reservan mis alumnas → Asistencia y acceso.
          </p>
          <Link href="/configuracion?tab=reservas#asistencia" className="text-sm font-bold underline mt-1">Ir a Configuración</Link>
        </div>
      </div>
    );
  }

  const claseFijada = clases.find(c => c.id === fijada) ?? null;

  return (
    <div className="p-4 max-w-xl mx-auto flex flex-col gap-4">
      {cabecera}

      {/* La clase contra la que se comprueba. «Todas las de ahora» es lo normal
          en recepción; fijar una sirve cuando dos coinciden en hora. */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4" role="radiogroup" aria-label="Clase que se comprueba">
        {[{ id: null as string | null, texto: 'Todas las de ahora' }, ...clases.map(c => ({ id: c.id as string | null, texto: `${c.nombre} · ${horaAcceso(c.inicio)}${c.sala ? ` · ${c.sala}` : ''}` }))].map(o => (
          <button
            key={o.id ?? 'todas'}
            type="button"
            role="radio"
            aria-checked={fijada === o.id}
            onClick={() => setFijada(o.id)}
            className={cn(
              'shrink-0 rounded-full border px-3.5 py-2 text-sm font-semibold transition-colors',
              fijada === o.id ? 'bg-foreground text-background border-foreground' : 'bg-card text-foreground hover:bg-muted',
            )}
          >
            {o.texto}
          </button>
        ))}
        {fijada && !claseFijada && clases.length > 0 && (
          <span className="shrink-0 self-center text-xs text-muted-foreground">Esa clase no es de ahora</span>
        )}
      </div>

      {/* El resultado va ENCIMA de la cámara: en el iPad del mostrador la cámara
          ocupa casi toda la pantalla, y debajo quedaba fuera de la vista justo
          lo que hay que leer. */}
      {error && (
        <div role="alert" className="rounded-2xl border-2 border-destructive/40 bg-card p-4 flex flex-col gap-2">
          <p className="text-sm font-semibold text-foreground">{error}</p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void escanear(ultimaLectura.current, fijada)}>Reintentar</Button>
            <Button variant="ghost" onClick={cerrar}>Escanear otra</Button>
          </div>
        </div>
      )}

      {resultado && (
        <ResultadoAcceso
          ref={tarjetaRef}
          r={resultado}
          decidiendo={decidiendo}
          errorDecision={errorDecision}
          onDecidir={a => void decidir(a)}
          onElegirClase={id => { setFijada(id); void escanear(ultimaLectura.current, id); }}
          onDeshacer={() => void deshacer()}
          onAbrirPuerta={() => void abrirPuerta()}
          abriendoPuerta={abriendoPuerta}
          onCerrar={cerrar}
        />
      )}

      <div className="relative rounded-2xl overflow-hidden bg-black aspect-square">
        <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
        {camara === 'activa' && !resultado && (
          <div aria-hidden className="pointer-events-none absolute inset-[18%] rounded-3xl border-4 border-white/80" />
        )}
        {camara !== 'activa' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-6 bg-muted">
            <Camera className="size-7 text-muted-foreground" aria-hidden />
            {camara === 'sin-permiso' && (
              <p className="text-sm text-muted-foreground text-pretty">No hay permiso para usar la cámara. Actívalo en los ajustes del navegador, o marca la asistencia en la lista de la clase.</p>
            )}
            {camara === 'apagada' && <Button size="lg" onClick={() => void encender()}>Encender la cámara</Button>}
            {camara === 'pidiendo' && <p className="text-sm text-muted-foreground">Pidiendo permiso…</p>}
          </div>
        )}
        {enviando && (
          <div className="absolute inset-x-0 bottom-0 bg-black/60 py-2 text-center text-sm font-semibold text-white">Comprobando…</div>
        )}
      </div>

      <p className="text-xs text-muted-foreground text-center text-pretty">
        ¿La cámara no lee su QR?{' '}
        <Link href={fijada ? `/calendario?sesion=${encodeURIComponent(fijada)}` : '/calendario'} className="font-semibold underline">
          Márcala en la lista de la clase
        </Link>
        .
      </p>
    </div>
  );
}
