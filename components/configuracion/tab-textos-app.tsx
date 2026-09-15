'use client';

import { cn } from '@/lib/utils';
import type { Studio } from '@/lib/types';
import { inputCls } from '@/components/configuracion/estilos';
import { TarjetaAjuste } from '@/components/configuracion/shell/tarjeta-ajuste';
import { BarraGuardar } from '@/components/configuracion/shell/barra-guardar';
import { Campo, useFormularioEstudio } from '@/components/configuracion/formulario-estudio';

// «Textos de tu app», en Mi app y mi web: lo que leen tus alumnas. Guarda SOLO
// estos siete campos (ver formulario-estudio.tsx).

type TextosAppForm = {
  descripcion: string; lema: string; subtituloHeroe: string;
  fraseHeroe: string; fraseManuscrita: string; normasTexto: string;
  anioFundacion: string;
};

function aFormulario(s: Studio | null): TextosAppForm {
  return {
    descripcion: s?.descripcion ?? '',
    lema: s?.lema ?? '',
    subtituloHeroe: s?.subtituloHeroe ?? '',
    fraseHeroe: s?.fraseHeroe ?? '',
    fraseManuscrita: s?.fraseManuscrita ?? '',
    normasTexto: s?.normasTexto ?? '',
    anioFundacion: s?.anioFundacion ? String(s.anioFundacion) : '',
  };
}

export function TabTextosApp({ showToast }: { showToast: (m: string) => void }) {
  const { form, setForm, hayCambios, guardar, descartar } = useFormularioEstudio(aFormulario, showToast);

  const anioInvalido = form.anioFundacion.trim() !== '' && !/^\d{4}$/.test(form.anioFundacion.trim());

  async function guardarTextos(): Promise<string | null> {
    if (anioInvalido) return 'El año de apertura tiene que ser de cuatro cifras.';
    // Vacío se guarda como NULL, no como cadena vacía: el portal distingue «no
    // lo ha escrito» (no pinta ese bloque) de «lo ha escrito y está en blanco»,
    // que no significaría nada. La home de la alumna decide con eso si pinta la
    // línea o si el héroe se queda como estaba.
    const res = await guardar({
      descripcion: form.descripcion.trim() || null,
      lema: form.lema.trim() || null,
      subtituloHeroe: form.subtituloHeroe.trim() || null,
      fraseHeroe: form.fraseHeroe.trim() || null,
      fraseManuscrita: form.fraseManuscrita.trim() || null,
      normasTexto: form.normasTexto.trim() || null,
      anioFundacion: form.anioFundacion.trim() ? Number(form.anioFundacion.trim()) : null,
    }, null);
    if (!res) return 'Ya se estaba guardando';
    if (!res.ok) return res.error;
    showToast('Textos de tu app guardados');
    return null;
  }

  return (
    <div className="max-w-2xl space-y-3">
      <TarjetaAjuste id="textos-de-tu-app">
        <div className="space-y-5">
          <Campo
            label="Cómo te presentas"
            ayuda="Sale en tu página de reservas, debajo del nombre del estudio."
          >
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
          <Campo
            label="Tu lema"
            ayuda="Una línea corta bajo el nombre del estudio, en la app de tus alumnas. Va en mayúsculas."
          >
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
            ayuda="Se lee en vertical al lado de la foto grande, al abrir la app. Cuatro o cinco palabras."
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
          <Campo
            label="Normas del centro"
            ayuda="Una norma por línea. Las ven tus alumnas en la app, en «Mi centro»."
          >
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
      </TarjetaAjuste>

      <BarraGuardar
        seccion="marca"
        cambios={hayCambios ? ['Textos de tu app'] : []}
        onGuardar={guardarTextos}
        onDescartar={descartar}
      />
    </div>
  );
}
