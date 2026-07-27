'use client';

import { useState, useEffect, useCallback, useRef, useId } from 'react';
import { RotateCcw, AlertTriangle, ExternalLink, Calendar as CalendarLinkIcon, Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStudio } from '@/lib/studio-context';
import { subirLogoEstudio, eliminarLogoEstudio } from '@/lib/portal-storage';
import { authHeader } from '@/lib/api-client';
import { tieneFeature } from '@/lib/billing/entitlements';
import { faltanDatosFiscales } from '@/lib/legal-textos';
import { nifValido } from '@/lib/nif';
import type { Studio } from '@/lib/types';
import { Toggle, inputCls, labelCls, btnPrimary, btnSecondary, cardCls } from '@/app/(dashboard)/configuracion/page';

type StudioForm = {
  nombre: string; razonSocial: string; nif: string;
  direccion: string; ciudad: string; codigoPostal: string;
  telefono: string; email: string;
  sepaAcreedorId: string; sepaIban: string; sepaTitular: string;
};

function studioToForm(s: Studio | null): StudioForm {
  return {
    nombre: s?.nombre ?? '',
    razonSocial: s?.razonSocial ?? '',
    nif: s?.nif ?? '',
    direccion: s?.direccion ?? '',
    ciudad: s?.ciudad ?? '',
    codigoPostal: s?.codigoPostal ?? '',
    telefono: s?.telefono ?? '',
    email: s?.email ?? '',
    sepaAcreedorId: s?.sepaAcreedorId ?? '',
    sepaIban: s?.sepaIban ?? '',
    sepaTitular: s?.sepaTitular ?? '',
  };
}

type PoliticaForm = {
  cancelacionVentanaHoras: number;
  cancelacionDevolverBonoTardia: boolean;
  reservaExigirPlan: boolean;
  reservaMaxSimultaneas: number | null;
  compraPublicaModo: 'EXIGIR_REGISTRO' | 'CREAR_FICHA';
};

function studioToPolitica(s: Studio | null): PoliticaForm {
  return {
    cancelacionVentanaHoras: s?.cancelacionVentanaHoras ?? 12,
    cancelacionDevolverBonoTardia: s?.cancelacionDevolverBonoTardia ?? true,
    reservaExigirPlan: s?.reservaExigirPlan ?? true,
    reservaMaxSimultaneas: s?.reservaMaxSimultaneas ?? null,
    compraPublicaModo: s?.compraPublicaModo ?? 'EXIGIR_REGISTRO',
  };
}

export function TabEstudio({ showToast }: { showToast: (m: string) => void }) {
  const { resetDatosPilates, studioConfig, updateStudioConfig, studio, updateStudio } = useStudio();
  const [politica, setPolitica] = useState(studioConfig.politicaPrivacidad);
  const [terminos, setTerminos] = useState(studioConfig.terminosServicio);
  // Estos textos se inicializaban UNA vez al montar. Si el componente montaba
  // antes de que `studioConfig` llegara de la BD, el textarea enseñaba el texto
  // por defecto y "Guardar" machacaba con él el texto propio del estudio.
  // Mientras no se toque a mano, seguimos al contexto. Se ajusta DURANTE el
  // render (el patrón de React para estado derivado), no en un efecto: así no
  // hay un primer pintado con el valor viejo.
  const [tocadoPolitica, setTocadoPolitica] = useState(false);
  const [tocadoTerminos, setTocadoTerminos] = useState(false);
  const [configVista, setConfigVista] = useState(studioConfig);
  if (configVista !== studioConfig) {
    setConfigVista(studioConfig);
    if (!tocadoPolitica) setPolitica(studioConfig.politicaPrivacidad);
    if (!tocadoTerminos) setTerminos(studioConfig.terminosServicio);
  }
  const [form, setForm] = useState<StudioForm>(() => studioToForm(studio));
  // NIF/CIF inválido. Vacío se permite (es opcional); pero si hay algo escrito,
  // tiene que ser un identificador fiscal real y no cualquier cosa con el
  // formato correcto (P4: aceptaba B67891234 sin comprobar el control).
  const nifInvalido = form.nif.trim() !== '' && !nifValido(form.nif);
  // Política de reservas/cancelaciones (C-2/C-4). Estado propio, tarjeta aparte.
  const [pol, setPol] = useState(() => studioToPolitica(studio));
  // Marca (logo) e IVA — Tanda 1.
  const [subiendoLogo, setSubiendoLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Añadir sede (plan CADENA — soporte multi-sede). Solo visible con
  // multiCentro activo; el gate real (cadena_id + suscripción vigente) lo
  // hace app/api/cadena/sedes, esto es solo la UI.
  const puedeAnadirSedes = !!studio && tieneFeature({ plan: studio.plan, subscriptionStatus: studio.subscriptionStatus }, 'multiCentro');
  const [nuevaSede, setNuevaSede] = useState({ nombre: '', ciudad: '', telefono: '' });
  const [creandoSede, setCreandoSede] = useState(false);
  async function anadirSede() {
    if (!nuevaSede.nombre.trim()) { showToast('Ponle un nombre a la sede'); return; }
    setCreandoSede(true);
    try {
      const res = await fetch('/api/cadena/sedes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify(nuevaSede),
      });
      const data = await res.json();
      if (!res.ok) { showToast(`Error: ${data.error ?? 'no se pudo crear la sede'}`); return; }
      showToast(`Sede "${nuevaSede.nombre}" creada — cámbiate a ella desde el menú de perfil`);
      setNuevaSede({ nombre: '', ciudad: '', telefono: '' });
    } finally {
      setCreandoSede(false);
    }
  }

  useEffect(() => { setForm(studioToForm(studio)); }, [studio]);
  useEffect(() => { setPol(studioToPolitica(studio)); }, [studio]);

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !studio) return;
    if (!file.type.startsWith('image/')) { showToast('Elige un archivo de imagen'); return; }
    if (file.size > 5 * 1024 * 1024) { showToast('La imagen no puede superar 5 MB'); return; }
    setSubiendoLogo(true);
    const result = await subirLogoEstudio(studio.id, file);
    setSubiendoLogo(false);
    if ('error' in result) { showToast(result.error); return; }
    await updateStudio({ logoUrl: result.url });
    showToast('Logo actualizado');
  }

  async function handleEliminarLogo() {
    if (!studio) return;
    setSubiendoLogo(true);
    const result = await eliminarLogoEstudio(studio.id);
    setSubiendoLogo(false);
    if ('error' in result) { showToast(result.error); return; }
    await updateStudio({ logoUrl: null });
    showToast('Logo eliminado');
  }

  function guardarIva(tipo: number) {
    updateStudio({ ivaPorDefecto: tipo });
    showToast(`IVA general fijado en ${tipo}%`);
  }

  const handleReset = useCallback(() => {
    resetDatosPilates();
    showToast('Datos recargados');
  }, [resetDatosPilates, showToast]);

  function guardarEstudio() {
    if (nifInvalido) { showToast('El NIF/CIF no es válido: revisa la letra o el dígito de control.'); return; }
    updateStudio(form);
    showToast('Datos del estudio guardados');
  }

  function guardarPolitica() {
    updateStudio(pol);
    showToast('Política de reservas guardada');
  }

  function guardarSepa() {
    updateStudio({
      sepaAcreedorId: form.sepaAcreedorId.trim() || null,
      sepaIban: form.sepaIban.replace(/\s+/g, '').toUpperCase() || null,
      sepaTitular: form.sepaTitular.trim() || null,
    });
    showToast('Datos SEPA guardados');
  }

  return (
    <div className="space-y-5 max-w-2xl">
      {/* Studio info — editable */}
      <div className={cn(cardCls, 'p-6')}>
        <h3 className="text-[14px] font-semibold text-foreground mb-4">Información del estudio</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className={labelCls}>Nombre del estudio</p>
            <input className={inputCls} value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
          </div>
          <div>
            <p className={labelCls}>Razón social</p>
            <input className={inputCls} value={form.razonSocial} onChange={e => setForm(f => ({ ...f, razonSocial: e.target.value }))} />
          </div>
          <div>
            <p className={labelCls}>NIF / CIF</p>
            <input className={cn(inputCls, nifInvalido && 'border-destructive')} value={form.nif} onChange={e => setForm(f => ({ ...f, nif: e.target.value }))} />
            {nifInvalido && <p className="text-[11px] text-destructive mt-1">Revisa el NIF/CIF: la letra o el dígito de control no cuadran.</p>}
          </div>
          <div>
            <p className={labelCls}>Teléfono</p>
            <input className={inputCls} value={form.telefono} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} />
          </div>
          <div>
            <p className={labelCls}>Dirección</p>
            <input className={inputCls} value={form.direccion} onChange={e => setForm(f => ({ ...f, direccion: e.target.value }))} />
          </div>
          <div>
            <p className={labelCls}>Ciudad</p>
            <input className={inputCls} value={form.ciudad} onChange={e => setForm(f => ({ ...f, ciudad: e.target.value }))} />
          </div>
          <div>
            <p className={labelCls}>Código postal</p>
            <input className={inputCls} value={form.codigoPostal} onChange={e => setForm(f => ({ ...f, codigoPostal: e.target.value }))} />
          </div>
          <div>
            <p className={labelCls}>Email de contacto</p>
            <input className={inputCls} type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
          </div>
        </div>
        <button onClick={guardarEstudio} className="mt-4 px-4 py-2 rounded-lg bg-brand text-brand-foreground text-[12px] font-medium hover:brightness-95 transition-colors">
          Guardar datos del estudio
        </button>
      </div>

      {/* Datos de acreedor SEPA (cuaderno 19.14) */}
      <div className={cn(cardCls, 'p-6')}>
        <h3 className="text-[14px] font-semibold text-foreground mb-1">Domiciliaciones SEPA (cuaderno 19.14)</h3>
        <p className="text-[12px] text-muted-foreground mb-4">Para generar la remesa que subes al banco (Cobros → Generar remesa SEPA). Tu banco te da el identificador de acreedor al darte de alta.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className={labelCls}>Identificador de acreedor SEPA</p>
            <input className={inputCls} value={form.sepaAcreedorId} onChange={e => setForm(f => ({ ...f, sepaAcreedorId: e.target.value }))} placeholder="ES00ZZZ00000000000" />
          </div>
          <div>
            <p className={labelCls}>IBAN de la cuenta del estudio</p>
            <input className={inputCls} value={form.sepaIban} onChange={e => setForm(f => ({ ...f, sepaIban: e.target.value }))} placeholder="ES00 0000 0000 0000 0000 0000" />
          </div>
          <div>
            <p className={labelCls}>Titular de la cuenta</p>
            <input className={inputCls} value={form.sepaTitular} onChange={e => setForm(f => ({ ...f, sepaTitular: e.target.value }))} />
          </div>
        </div>
        <button onClick={guardarSepa} className="mt-4 px-4 py-2 rounded-lg bg-brand text-brand-foreground text-[12px] font-medium hover:brightness-95 transition-colors">
          Guardar datos SEPA
        </button>
      </div>

      {/* Añadir sede (plan CADENA) */}
      {puedeAnadirSedes && (
        <div className={cn(cardCls, 'p-6')}>
          <h3 className="text-[14px] font-semibold text-foreground mb-1 flex items-center gap-2">
            <Building2 size={15} className="text-muted-foreground" /> Añadir sede
          </h3>
          <p className="text-[12px] text-muted-foreground mb-4">
            Tu plan Cadena cubre todas tus sedes con una sola suscripción. La sede nueva queda operativa
            al momento — cámbiate a ella desde el menú de perfil (arriba a la derecha).
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <p className={labelCls}>Nombre</p>
              <input className={inputCls} value={nuevaSede.nombre} onChange={e => setNuevaSede(s => ({ ...s, nombre: e.target.value }))} />
            </div>
            <div>
              <p className={labelCls}>Ciudad</p>
              <input className={inputCls} value={nuevaSede.ciudad} onChange={e => setNuevaSede(s => ({ ...s, ciudad: e.target.value }))} />
            </div>
            <div>
              <p className={labelCls}>Teléfono</p>
              <input className={inputCls} value={nuevaSede.telefono} onChange={e => setNuevaSede(s => ({ ...s, telefono: e.target.value }))} />
            </div>
          </div>
          <button onClick={anadirSede} disabled={creandoSede} className={cn(btnPrimary, 'mt-4', creandoSede && 'opacity-50')}>
            {creandoSede ? 'Creando…' : 'Añadir sede'}
          </button>
        </div>
      )}

      {/* Marca — logo del estudio */}
      <div className={cn(cardCls, 'p-6')}>
        <h3 className="text-[14px] font-semibold text-foreground mb-1">Marca</h3>
        <p className="text-[12px] text-muted-foreground mb-4">
          Tu logo aparece en la página pública de reservas. El color de la app de
          clientas se elige desde <span className="font-medium text-foreground">Apariencia</span> (menú de perfil).
        </p>
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-xl border border-border bg-muted flex items-center justify-center overflow-hidden shrink-0">
            {studio?.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={studio.logoUrl} alt="Logo del estudio" className="w-full h-full object-contain" />
            ) : (
              <span className="text-[11px] text-muted-foreground text-center px-2">Sin logo</span>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoChange} className="hidden" />
            <button
              type="button"
              disabled={subiendoLogo}
              onClick={() => logoInputRef.current?.click()}
              className={cn(btnSecondary, 'disabled:opacity-40')}
            >
              {subiendoLogo ? 'Subiendo…' : studio?.logoUrl ? 'Cambiar logo' : 'Subir logo'}
            </button>
            {studio?.logoUrl && (
              <button
                type="button"
                disabled={subiendoLogo}
                onClick={handleEliminarLogo}
                className="text-[12px] font-medium text-destructive hover:underline text-left disabled:opacity-40"
              >
                Quitar logo
              </button>
            )}
            <p className="text-[11px] text-muted-foreground">PNG o JPG, máx. 5 MB.</p>
          </div>
        </div>
      </div>

      {/* Facturación e impuestos — tipo de IVA general */}
      <div className={cn(cardCls, 'p-6')}>
        <h3 className="text-[14px] font-semibold text-foreground mb-1">Facturación e impuestos</h3>
        <p className="text-[12px] text-muted-foreground mb-4">
          Tipo de IVA aplicado al emitir facturas. Los precios se tratan como <span className="font-medium text-foreground">IVA incluido</span>:
          este tipo solo cambia el desglose base/cuota, nunca el total cobrado.
        </p>
        <div className="max-w-xs">
          <p className={labelCls}>IVA general</p>
          <select
            className={cn(inputCls, 'cursor-pointer')}
            value={studio?.ivaPorDefecto ?? 21}
            onChange={e => guardarIva(Number(e.target.value))}
          >
            <option value={21}>21 % — General</option>
            <option value={10}>10 % — Reducido</option>
            <option value={4}>4 % — Superreducido</option>
            <option value={0}>0 % — Exento</option>
          </select>
          <p className="text-[11px] text-muted-foreground mt-2">
            Se aplica a las próximas facturas. Las ya emitidas y selladas (Veri*Factu) no cambian.
          </p>
        </div>
      </div>

      {/* Reservas y cancelaciones (C-2/C-4) */}
      <div className={cn(cardCls, 'p-6')}>
        <h3 className="text-[14px] font-semibold text-foreground mb-1">Reservas y cancelaciones</h3>
        <p className="text-[12px] text-muted-foreground mb-4">
          Reglas que se aplican cuando una clienta reserva o cancela desde el portal público.
        </p>
        <div className="space-y-4">
          <div>
            <p className={labelCls}>Ventana de cancelación (horas)</p>
            <input
              type="number" min={0} max={168} className={inputCls}
              value={pol.cancelacionVentanaHoras}
              onChange={e => setPol(p => ({ ...p, cancelacionVentanaHoras: Math.max(0, Number(e.target.value)) }))}
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Cancelar con menos antelación se considera tardío. 0 = sin penalización.
            </p>
          </div>
          <label className="flex items-center justify-between gap-4 cursor-pointer">
            <span className="text-[13px] text-foreground">
              Devolver la sesión del bono en cancelaciones tardías
              <span className="block text-[11px] text-muted-foreground">Activado (recomendado): la sesión del bono se devuelve aunque la cancelación sea tardía. Desactívalo si prefieres que la pierda.</span>
            </span>
            <Toggle on={pol.cancelacionDevolverBonoTardia} onChange={v => setPol(p => ({ ...p, cancelacionDevolverBonoTardia: v }))} />
          </label>
          <label className="flex items-center justify-between gap-4 cursor-pointer">
            <span className="text-[13px] text-foreground">
              Exigir plan o bono activo para reservar
              <span className="block text-[11px] text-muted-foreground">La clienta necesita una suscripción activa o bono con sesiones para reservar.</span>
            </span>
            <Toggle on={pol.reservaExigirPlan} onChange={v => setPol(p => ({ ...p, reservaExigirPlan: v }))} />
          </label>
          {/* Quién puede comprar desde el enlace público sin tener ficha. Antes
              no había ajuste: se cobraba y no se entregaba nada (el webhook
              ignoraba el plan comprado). */}
          <div>
            <p className={labelCls}>Si alguien compra un bono desde tu enlace público y aún no es clienta</p>
            <div className="space-y-2 mt-1.5">
              {([
                ['EXIGIR_REGISTRO', 'Que se registre antes de pagar',
                 'Le pedimos su email y que acepte tus condiciones, y luego paga. Es lo más limpio: nadie paga sin haber aceptado el contrato.'],
                ['CREAR_FICHA', 'Que pague directamente',
                 'Cobras primero y le creamos la ficha con el email de su tarjeta. Vendes con menos pasos; a cambio entra sin contrato aceptado y se lo pediremos cuando entre a reservar.'],
              ] as const).map(([valor, titulo, detalle]) => (
                <label
                  key={valor}
                  className={cn(
                    'flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition-colors',
                    pol.compraPublicaModo === valor ? 'border-brand bg-brand/5' : 'border-border hover:bg-muted',
                  )}
                >
                  <input
                    type="radio"
                    name="compra-publica-modo"
                    className="mt-0.5 accent-[var(--brand)]"
                    checked={pol.compraPublicaModo === valor}
                    onChange={() => setPol(p => ({ ...p, compraPublicaModo: valor }))}
                  />
                  <span>
                    <span className="block text-[13px] font-medium text-foreground">{titulo}</span>
                    <span className="block text-[11px] text-muted-foreground mt-0.5">{detalle}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <p className={labelCls}>Máximo de reservas simultáneas por clienta</p>
            <input
              type="number" min={0} max={99} className={inputCls}
              placeholder="Sin límite"
              value={pol.reservaMaxSimultaneas ?? ''}
              onChange={e => setPol(p => ({ ...p, reservaMaxSimultaneas: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) }))}
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Reservas activas en clases futuras. Vacío = sin límite.
            </p>
          </div>
        </div>
        <button onClick={guardarPolitica} className="mt-4 px-4 py-2 rounded-lg bg-brand text-brand-foreground text-[12px] font-medium hover:brightness-95 transition-colors">
          Guardar política de reservas
        </button>
      </div>

      {/* Enlaces públicos */}
      <div className={cn(cardCls, 'p-6')}>
        <h3 className="text-[14px] font-semibold text-foreground mb-1">Enlaces públicos</h3>
        <p className="text-[12px] text-muted-foreground mb-3">
          Páginas de tu estudio para compartir con tus clientas.
        </p>
        <div className="space-y-2">
          {/* F4·E5: enlace derivado de la sede activa; sin slug no se pinta (nunca un /reservar/ roto). */}
          {studio?.slug && (
          <a
            href={`/reservar/${studio.slug}`}
            target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border border-border hover:bg-muted transition-colors"
          >
            <CalendarLinkIcon size={15} className="text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-foreground">Portal de reservas</p>
              <p className="text-[11px] text-muted-foreground">Página pública para que cualquiera reserve una clase</p>
            </div>
            <ExternalLink size={13} className="text-muted-foreground shrink-0" />
          </a>
          )}
          {/* CONGELADO (feature-freeze PMF): se quitó el enlace "Modo quiosco" →
              /kiosk/[slug]. Ver lib/frozen-features.ts. */}
        </div>
      </div>

      {/* Privacy policy */}
      <div className={cn(cardCls, 'p-6')}>
        <h3 className="text-[14px] font-semibold text-foreground mb-1">Política de privacidad</h3>
        <p className="text-[12px] text-muted-foreground mb-3">
          Este texto se muestra a las clientas al registrarse y deben aceptarlo antes de completar la inscripción.
        </p>
        {/* Sin razón social / nombre no se puede identificar al responsable del
            tratamiento, y lo que firme la clienta no sirve (RGPD art. 13.1.a).
            Se avisa aquí, que es donde se arregla. */}
        {faltanDatosFiscales(studio ?? {}) && (
          <p className="flex items-start gap-2 mb-3 p-2.5 rounded-lg bg-warning/10 text-[12px] text-warning">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            <span>
              Rellena arriba la razón social y el NIF: sin ellos este documento no dice quién
              es el responsable de los datos y no cumple el RGPD.
            </span>
          </p>
        )}
        <textarea
          rows={8}
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-[12px] font-mono text-foreground focus:outline-none focus:border-muted-foreground transition-colors resize-y"
          value={politica}
          onChange={(e) => { setTocadoPolitica(true); setPolitica(e.target.value); }}
        />
        <button
          onClick={async () => { const r = await updateStudioConfig({ politicaPrivacidad: politica }); showToast(r.ok ? 'Política de privacidad guardada' : r.error); }}
          className="mt-3 px-4 py-2 rounded-lg bg-brand text-brand-foreground text-[12px] font-medium hover:brightness-95 transition-colors"
        >
          Guardar política
        </button>
      </div>

      {/* Terms of service */}
      <div className={cn(cardCls, 'p-6')}>
        <h3 className="text-[14px] font-semibold text-foreground mb-1">Términos y condiciones</h3>
        <p className="text-[12px] text-muted-foreground mb-3">
          Contrato que acepta cada clienta al inscribirse. Queda registrado con su firma digital.
        </p>
        <textarea
          rows={8}
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-[12px] font-mono text-foreground focus:outline-none focus:border-muted-foreground transition-colors resize-y"
          value={terminos}
          onChange={(e) => { setTocadoTerminos(true); setTerminos(e.target.value); }}
        />
        <button
          onClick={async () => { const r = await updateStudioConfig({ terminosServicio: terminos }); showToast(r.ok ? 'Términos y condiciones guardados' : r.error); }}
          className="mt-3 px-4 py-2 rounded-lg bg-brand text-brand-foreground text-[12px] font-medium hover:brightness-95 transition-colors"
        >
          Guardar términos
        </button>
      </div>

      {/* Recargar datos: NO borra nada, solo vuelve a leer del servidor. Antes se
          llamaba "Restablecer datos de demo" y avisaba de una pérdida irreversible
          que nunca ocurría — el pánico lo causaba el texto, no la acción. */}
      <div className={cn(cardCls, 'p-6')}>
        <h3 className="text-[14px] font-semibold text-foreground mb-1">Recargar datos</h3>
        <p className="text-[13px] text-muted-foreground mb-4">
          Vuelve a leer socias, sesiones y pagos desde el servidor. No borra ni cambia nada.
        </p>
        <div className="flex items-center justify-between p-4 bg-muted/40 border border-border rounded-xl">
          <div>
            <p className="text-[13px] font-semibold text-foreground">Sincronizar con el servidor</p>
            <p className="text-[12px] text-muted-foreground mt-0.5">
              Útil si algo no se ha actualizado en pantalla.
            </p>
          </div>
          <button
            onClick={handleReset}
            className={cn(btnSecondary, 'flex items-center gap-1.5 shrink-0 ml-4')}
          >
            <RotateCcw size={12} />
            Recargar
          </button>
        </div>
      </div>
    </div>
  );
}
