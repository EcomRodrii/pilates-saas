'use client';

import { cn } from '@/lib/utils';
import type { Studio } from '@/lib/types';
import { tarjetaPorId } from '@/lib/configuracion/secciones';
import { inputCls } from '@/components/configuracion/estilos';
import { BarraGuardar } from '@/components/configuracion/shell/barra-guardar';
import { Campo, useFormularioEstudio } from '@/components/configuracion/formulario-estudio';

// Los textos que leen tus alumnas, en Configuración › Marca.
//
// Eran SIETE campos en una sola tarjeta («Textos de tu app») y un cajón lleva
// como mucho seis. Partido en dos por dónde se lee cada frase (16-sep, v2):
//   · «Cómo te presentas» (`textos-de-tu-app`, su id y su ancla no cambian):
//     quién eres y qué pides — tu página de reservas y «Mi centro» en su app;
//   · «Textos de bienvenida» (`textos-de-bienvenida`): las tres frases del
//     Inicio de la app de la alumna.
// Cada uno manda SOLO sus campos (#2027, ver formulario-estudio.tsx).

type FormPresentacion = { descripcion: string; lema: string; anioFundacion: string; normasTexto: string };
type FormBienvenida = { subtituloHeroe: string; fraseHeroe: string; fraseManuscrita: string };

function aPresentacion(s: Studio | null): FormPresentacion {
  return {
    descripcion: s?.descripcion ?? '',
    lema: s?.lema ?? '',
    anioFundacion: s?.anioFundacion ? String(s.anioFundacion) : '',
    normasTexto: s?.normasTexto ?? '',
  };
}

function aBienvenida(s: Studio | null): FormBienvenida {
  return {
    subtituloHeroe: s?.subtituloHeroe ?? '',
    fraseHeroe: s?.fraseHeroe ?? '',
    fraseManuscrita: s?.fraseManuscrita ?? '',
  };
}

// Vacío se guarda como NULL, no como cadena vacía: el portal distingue «no lo ha
// escrito» (no pinta ese bloque) de «lo ha escrito y está en blanco», que no
// significaría nada. La home de la alumna decide con eso si pinta la línea o si
// el héroe se queda como estaba.
const oNulo = (v: string) => v.trim() || null;

export function DetallePresentacion({ showToast, onGuardado }: {
  showToast: (m: string) => void;
  onGuardado: (texto: string) => void;
}) {
  const { form, setForm, hayCambios, guardar, descartar } = useFormularioEstudio(aPresentacion, showToast);
  const anioInvalido = form.anioFundacion.trim() !== '' && !/^\d{4}$/.test(form.anioFundacion.trim());

  async function alGuardar(): Promise<string | null> {
    if (anioInvalido) return 'El año de apertura tiene que ser de cuatro cifras.';
    const res = await guardar({
      descripcion: oNulo(form.descripcion),
      lema: oNulo(form.lema),
      normasTexto: oNulo(form.normasTexto),
      anioFundacion: form.anioFundacion.trim() ? Number(form.anioFundacion.trim()) : null,
    }, null);
    if (!res) return 'Ya se estaba guardando';
    if (!res.ok) return res.error;
    onGuardado('Tu presentación, guardada');
    return null;
  }

  return (
    <>
      <div className="flex flex-col gap-5 pb-6">
        <Campo label="Cómo te presentas" ayuda="Sale en tu página de reservas, debajo del nombre del estudio.">
          {id => (
            <textarea
              id={id}
              className={cn(inputCls, 'min-h-[76px] resize-y')}
              value={form.descripcion}
              maxLength={400}
              placeholder="Estudio boutique especializado en pilates reformer. Grupos de ocho para que nadie pase desapercibida."
              onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
            />
          )}
        </Campo>
        <Campo label="Tu lema" ayuda="Una línea corta bajo el nombre del estudio, en la app de tus alumnas. Va en mayúsculas.">
          {id => (
            <input
              id={id}
              className={inputCls}
              value={form.lema}
              maxLength={44}
              placeholder="Cuerpo · Mente · Equilibrio"
              onChange={e => setForm(f => ({ ...f, lema: e.target.value }))}
            />
          )}
        </Campo>
        <Campo label="Normas del centro" ayuda="Una norma por línea. Las ven tus alumnas en la app, en «Mi centro».">
          {id => (
            <textarea
              id={id}
              className={cn(inputCls, 'min-h-[96px] resize-y')}
              value={form.normasTexto}
              maxLength={800}
              placeholder={'Llega 5 minutos antes: las clases empiezan puntuales.\nCalcetines antideslizantes obligatorios en todas las salas.\nCancela con 6 h de antelación para recuperar tu clase.'}
              onChange={e => setForm(f => ({ ...f, normasTexto: e.target.value }))}
            />
          )}
        </Campo>
        <Campo
          label="Año de apertura"
          ayuda={anioInvalido ? undefined : 'Para el «desde 2016» de tu página. Déjalo vacío si prefieres no decirlo.'}
          error={anioInvalido ? 'Tienen que ser cuatro cifras.' : null}
        >
          {id => (
            <input
              id={id}
              className={cn(inputCls, 'w-32', anioInvalido && 'border-destructive')}
              value={form.anioFundacion}
              inputMode="numeric"
              maxLength={4}
              placeholder="2016"
              aria-invalid={anioInvalido}
              onChange={e => setForm(f => ({ ...f, anioFundacion: e.target.value.replace(/\D/g, '') }))}
            />
          )}
        </Campo>
      </div>
      <BarraGuardar
        seccion="marca"
        cambios={hayCambios ? [tarjetaPorId('textos-de-tu-app').titulo] : []}
        onGuardar={alGuardar}
        onDescartar={descartar}
      />
    </>
  );
}

export function DetalleTextosBienvenida({ showToast, onGuardado }: {
  showToast: (m: string) => void;
  onGuardado: (texto: string) => void;
}) {
  const { form, setForm, hayCambios, guardar, descartar } = useFormularioEstudio(aBienvenida, showToast);

  async function alGuardar(): Promise<string | null> {
    const res = await guardar({
      subtituloHeroe: oNulo(form.subtituloHeroe),
      fraseHeroe: oNulo(form.fraseHeroe),
      fraseManuscrita: oNulo(form.fraseManuscrita),
    }, null);
    if (!res) return 'Ya se estaba guardando';
    if (!res.ok) return res.error;
    onGuardado('Tus textos de bienvenida, guardados');
    return null;
  }

  return (
    <>
      <div className="flex flex-col gap-5 pb-6">
        <Campo
          label="Tu frase de bienvenida"
          ayuda="Va justo debajo del saludo, al abrir la app. Si la dejas vacía sale «¿Qué te apetece hoy?»."
        >
          {id => (
            <input
              id={id}
              className={inputCls}
              value={form.subtituloHeroe}
              maxLength={60}
              placeholder="Disciplina hoy, resultados mañana."
              onChange={e => setForm(f => ({ ...f, subtituloHeroe: e.target.value }))}
            />
          )}
        </Campo>
        <Campo
          label="Frase de la portada"
          // ⚠️ La FOTO de la portada no se cambia desde aquí: su editor está en
          // mantenimiento (app/(dashboard)/configuracion/apariencia). Pedir una
          // frase «al lado de la foto» sin decirlo era prometer media cosa.
          ayuda="Se lee en vertical al lado de la foto grande, al abrir la app. Cuatro o cinco palabras. La foto todavía no se cambia desde aquí."
        >
          {id => (
            <input
              id={id}
              className={inputCls}
              value={form.fraseHeroe}
              maxLength={44}
              placeholder="Más fuerte cada semana"
              onChange={e => setForm(f => ({ ...f, fraseHeroe: e.target.value }))}
            />
          )}
        </Campo>
        <Campo
          label="Tu frase, a mano"
          ayuda="Se escribe con letra manuscrita en la pantalla de inicio de tus alumnas. Una frase corta, tuya."
        >
          {id => (
            <input
              id={id}
              className={inputCls}
              value={form.fraseManuscrita}
              maxLength={72}
              placeholder="Un cuerpo feliz hace una mente tranquila"
              onChange={e => setForm(f => ({ ...f, fraseManuscrita: e.target.value }))}
            />
          )}
        </Campo>
      </div>
      <BarraGuardar
        seccion="marca"
        cambios={hayCambios ? [tarjetaPorId('textos-de-bienvenida').titulo] : []}
        onGuardar={alGuardar}
        onDescartar={descartar}
      />
    </>
  );
}
