'use client';

/* eslint-disable @next/next/no-img-element -- fotos del estudio (Storage) y estáticos ya en su tamaño */
import { useMemo } from 'react';
import Link from 'next/link';
import {
  ChevronRight, ExternalLink, Image as ImageIcon, ImagePlus, Megaphone, Palette, PenLine, ScrollText, Smartphone,
} from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { pasosMiApp, type DatosMiApp, type IdPasoMiApp, type PasoMiApp } from '@/lib/configuracion/mi-app-pasos';
import { hrefDeLugar } from '@/lib/configuracion/destino';
import { Barra, BotonAccion, Etiqueta, Fila, Telefono, Tema, type Accion, type Tono } from './piezas';
import e from './escaparate.module.css';

// «Mi app» como la «Tienda online» de Shopify (maqueta aprobada por el fundador el 27-nov-2026). Los mismos
// siete pasos, estados y cajones que la guiada (lib/configuracion/mi-app-pasos.ts), sin numeración: la app en
// grande, compartirla, sus pantallas y tu marca. Nada se guarda en un sitio nuevo.

const POR_DEFECTO = ['/por-defecto/clase-reformer.webp', '/por-defecto/clase-mat.webp', '/por-defecto/clase-yoga.webp', '/por-defecto/clase-maquina.webp'];

const tonoDe = (p: PasoMiApp): Tono => (p.tono === 'hecho' ? 'ok' : p.tono === 'falta' ? 'falta' : 'neutra');

export function MiAppEscaparate({ datos, acciones, slug, hrefPresentacion }: {
  datos: DatosMiApp;
  acciones: Record<IdPasoMiApp, Accion | null>;
  slug: string | null;
  hrefPresentacion: string;
}) {
  const { studio, tiposClase, instructores } = useStudio();
  const pasos = useMemo(() => pasosMiApp(datos), [datos]);
  const paso = (id: IdPasoMiApp) => pasos.find(p => p.id === id)!;
  const url = slug ? `/portal/${encodeURIComponent(slug)}` : null;
  // Lo primero que falta, para la píldora de la vista previa.
  const pendiente = datos.sinPublicar
    ? { texto: 'Tienes cambios sin publicar', accion: acciones.estilo }
    : (['logo', 'entrada', 'fotos'] as const).map(paso).filter(p => p.tono === 'falta')
        .map(p => ({ texto: `Te falta: ${p.titulo.toLowerCase()}`, accion: acciones[p.id] }))[0] ?? null;
  const fotosClase = tiposClase.map(t => t.fotoUrl).filter((f): f is string => !!f);
  const mosaico = [...fotosClase, ...POR_DEFECTO].slice(0, 4);
  const equipo = instructores.filter(i => i.activo && i.rol === 'INSTRUCTOR').slice(0, 6);
  const editar = (id: IdPasoMiApp): Accion | null => acciones[id];

  return (
    <div className={e.raiz} data-testid="mi-app-escaparate" data-escaparate>
      <Barra titulo="Mi app" Icono={Smartphone} ruta={hrefDeLugar({ tab: 'marca' })}>
        {datos.sinPublicar && <Etiqueta tono="falta">Cambios sin publicar</Etiqueta>}
        {url && (
          <a href={url} target="_blank" rel="noreferrer" className={e.boton}><ExternalLink size={14} aria-hidden />Abrir mi app</a>
        )}
      </Barra>

      <div className={e.escaparate}>
        <img src={studio?.imagenBienvenidaUrl || '/por-defecto/estudio-hero.webp'} alt="" className={e.fondo} />
        {url && (
          <div className={e.escena} aria-hidden>
            <Telefono src={`${url}/acceso`} titulo="La entrada a tu app" ancho={226} clase={e.movilEntrada} />
            <Telefono src={url} titulo="El inicio de tu app" ancho={244} clase={e.movilInicio} />
            <div className={`${e.telefono} ${e.movilReservar}`} style={{ '--w': '188px' } as React.CSSProperties}>
              <div className={e.pantalla}>
                <img src="/landing/capturas/app-alumna-reservar-manana-390.webp" alt="Vista de ejemplo del horario para reservar" />
              </div>
              <span className={e.isla} aria-hidden />
            </div>
          </div>
        )}
        <div className={e.velo} />
        <div className={e.pie}>
          <div style={{ minWidth: 0 }}>
            <p className={e.nombre}>{studio?.nombre}</p>
            {/* Sin el código del color: aquí se lee el estilo, no un hexadecimal. */}
            <p className={e.detalle}>{datos.apariencia?.resumen.replace(/\s*·\s*#[0-9a-f]{3,8}\b/i, '') || (url ? 'La app de tus clientes' : 'Ponle una dirección para compartirla')}</p>
          </div>
          {pendiente?.accion ? (
            <BotonAccion accion={pendiente.accion} clase={e.pastilla} texto={pendiente.texto}><ImagePlus size={16} aria-hidden /></BotonAccion>
          ) : <span />}
          <div className={e.pieDerecha}>
            {acciones.estilo && <BotonAccion accion={acciones.estilo} clase={e.boton} texto="Editar app" />}
          </div>
        </div>
      </div>

      <section className={`${e.tarjeta} ${e.promo}`} aria-labelledby="mi-app-compartir" id="paso-compartir">
        <div>
          <h3 id="mi-app-compartir">{paso('compartir').titulo}</h3>
          <p className={e.suave}>{paso('compartir').porque}</p>
          <div className={e.acciones}>
            {acciones.compartir && <BotonAccion accion={acciones.compartir} />}
            <span className={e.suave}>{paso('compartir').estado}</span>
          </div>
        </div>
        <div className={e.ilustracion} aria-hidden>
          {slug && (
            <span style={{ position: 'absolute', left: 111, top: 16, width: 110, height: 110, padding: 8, borderRadius: 14, background: '#fff', rotate: '-6deg', boxShadow: '0 12px 26px rgba(0,0,0,0.14)' }}>
              <img src={`/api/public/qr-app/${encodeURIComponent(slug)}`} alt="" loading="lazy" style={{ width: '100%' }} />
            </span>
          )}
        </div>
      </section>

      <div className={e.seccion}><h2>Pantallas de tu app</h2></div>
      <ul className={e.rejilla} style={{ '--columnas': 4, margin: 0, padding: 0, listStyle: 'none' } as React.CSSProperties}>
        <Tema id="paso-entrada" nombre="Entrada" detalle="Foto y frase" accion={editar('entrada')} estado={paso('entrada').tono === 'falta' ? paso('entrada').estado : null} tono="falta">
          {url && <Marco402 src={`${url}/acceso`} titulo="Vista previa de la entrada" />}
        </Tema>
        <Tema id="paso-inicio" nombre="Inicio" detalle="Mensaje y tarjetas" accion={editar('inicio')} estado={paso('inicio').estado}>
          {url && <Marco402 src={url} titulo="Vista previa del inicio" />}
        </Tema>
        <Tema id="paso-reservar" nombre="Reservar" detalle="El horario de tus clases" accion={editar('fotos')}
          estado={datos.clases.total > 0 ? `${datos.clases.conFoto} de ${datos.clases.total} con foto` : null}
          tono={datos.clases.conFoto >= datos.clases.total ? 'ok' : 'falta'}>
          <div className={e.previewHorario} aria-hidden>
            <div className={e.previewDias}><span>HOY</span><b>27</b><b>28</b><b>29</b><b className={e.previewDiaActivo}>30</b><b>1</b></div>
            <div className={e.previewFiltros}><span>Todos</span><span>Pilates Suelo</span><span>Yoga</span></div>
            {mosaico.slice(0, 2).map((f, i) => (
              <div className={e.previewClase} key={i}>
                <img src={f} alt="" loading="lazy" />
                <span><b>{i === 0 ? 'Pilates Suelo' : 'Pilates Reformer'}</b><small>{i === 0 ? '10:00 · 50 min' : '11:00 · 55 min'}</small></span>
              </div>
            ))}
          </div>
        </Tema>
        <Tema nombre="Ficha de clase" detalle="Tu equipo, la sala y los detalles" accion={editar('fotos')}
          estado={datos.equipo.total > 0 ? `${datos.equipo.conFoto} de ${datos.equipo.total} con foto` : null}
          tono={datos.equipo.conFoto >= datos.equipo.total ? 'ok' : 'falta'}>
          <div className={e.previewFicha} aria-hidden>
            <img className={e.previewPortada} src={mosaico[0]} alt="" loading="lazy" />
            <div className={e.previewFichaTexto}>
              <small>PILATES SUELO</small><b>Muévete con calma</b>
              <span>10:00 · 50 min · Sala Suelo</span>
              <span className={e.previewInstructora}>
                {equipo[0] && (equipo[0].fotoUrl || equipo[0].avatar)
                  ? <img src={equipo[0].fotoUrl ?? equipo[0].avatar!} alt="" loading="lazy" />
                  : <i>{equipo[0]?.nombre.slice(0, 1).toUpperCase() ?? 'I'}</i>}
                {equipo[0]?.nombre ?? 'Tu instructora'}
              </span>
              <strong>Reservar</strong>
            </div>
          </div>
        </Tema>
      </ul>

      <div className={e.seccion}><h2>Tu marca y tus textos</h2></div>
      <ul className={`${e.tarjeta} ${e.filas}`}>
        <Fila id="paso-logo" cuadro={studio?.logoUrl ? <img src={studio.logoUrl} alt="" /> : <ImageIcon size={18} />}
          titulo={paso('logo').titulo} detalle={paso('logo').donde} accion={acciones.logo} etiqueta={paso('logo').estado} tono={tonoDe(paso('logo'))} />
        <Fila id="paso-estilo" cuadro={<Palette size={18} />} titulo={paso('estilo').titulo} detalle={paso('estilo').donde}
          accion={acciones.estilo} etiqueta={paso('estilo').estado} tono={tonoDe(paso('estilo'))} />
        {(['inicio', 'frase'] as const).map(id => (
          <Fila key={id} id={id === 'frase' ? 'paso-frase' : undefined} cuadro={id === 'frase' ? <PenLine size={18} /> : <Megaphone size={18} />}
            titulo={paso(id).titulo} detalle={paso(id).donde} accion={acciones[id]} etiqueta={paso(id).estado} tono={tonoDe(paso(id))} />
        ))}
        <Fila cuadro={<ScrollText size={18} />} titulo="Normas del centro y descripción" detalle="Tus normas salen en Ayuda, dentro de la app"
          accion={{ tipo: 'enlace', href: hrefPresentacion, texto: 'Editar' }} />
      </ul>
      <p className={e.pieDePagina}>
        <span className={e.suave}>¿Tu página de reservas? </span>
        <Link href="/configuracion?tab=web">Mi web<ChevronRight size={13} aria-hidden style={{ display: 'inline' }} /></Link>
      </p>
    </div>
  );
}

/** Una pantalla de la app (402 de ancho) recortada a la tarjeta: se ve su parte de arriba. */
function Marco402({ src, titulo }: { src: string; titulo: string }) {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'grid', justifyContent: 'center' }}>
      <div style={{ position: 'relative', width: 180, height: 391, marginTop: 24 }}>
        <Telefono src={src} titulo={titulo} ancho={180} estilo={{ left: 0, top: 0 }} />
      </div>
    </div>
  );
}
