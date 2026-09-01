# CHEATSHEET — recetas exactas (hex y px literales, cero interpretación)

Cada bloque de la Home, con sus valores EXACTOS. Usar con `portal-app.css`.

## Hero (Home, 314px)
```
contenedor: position:relative; height:314px; overflow:hidden
foto: object-fit:cover; object-position:center 32%; animation: apKen 22s infinite
gradiente: linear-gradient(185deg, rgba(8,8,8,.58), rgba(8,8,8,.18) 42%, rgba(8,8,8,.06) 58%, rgba(250,249,245,.35) 86%, #FAF9F5)
marca:  mono 9.5px, letter-spacing .2em, uppercase, color #A8D0A9
fecha:  mono 9.5px, letter-spacing .14em, uppercase, rgba(250,249,245,.65)
saludo: 13px/700, rgba(250,249,245,.9)
H1:     32px/800, -.035em, line-height 1, #FAF9F5
buscador: pill rgba(250,249,245,.94) + backdrop-blur 10px, padding 13px 16px,
          texto 13.5px #5A5A52, sombra 0 10px 26px rgba(8,8,8,.22)
campana: 40px circular, border 1px rgba(255,255,255,.45), bg rgba(250,249,245,.22) + blur,
         dot 8px #E8A13C con borde blanco 1.5px
```

## Card "Tu próxima clase"
```
margin 13px 18px 0 · radius 20px · padding 14px 15px
foto de fondo + overlay linear-gradient(100deg, rgba(18,41,26,.95), rgba(18,41,26,.68))
sombra: 0 18px 38px -16px rgba(18,41,26,.5)
etiqueta: mono 10px uppercase .16em #A8D0A9 · dot 6px #7BC488 pulsante
título clase: 15.5px/800 -.02em #FAF9F5
botón QR: pill #FAF9F5, texto #12291A 11.5px/800, mini-grid QR 3×3 de 3px
botones secundarios: border 1px rgba(234,240,231,.35), bg rgba(234,240,231,.12), texto #EAF0E7
```

## Card bono
```
ap-card · padding 12px 15px · flex space-between
"Bono 5 sesiones" 12.5px/700
barra: 66×5px, fondo #EFEDE4, relleno #4F8A5B, radius 99, transition width .6s
"quedan N": mono 11px #3E6B4A
```

## Semana (7 dots)
```
fila: "Tu semana" 11px/800 #5A5A52 + 7 columnas (letra 8.5px/700 #98A093 + dot)
dot asistido: 16px circular #4F8A5B · dot vacío: 16px #EFEDE4 · hoy: borde 2px #4F8A5B
racha: "🔥 3 sem." 10.5px/800 #C99A3C
```

## Banner "Invita a una amiga"
```
height 112px · radius 18px · foto + overlay linear-gradient(90deg, rgba(15,15,15,.68), rgba(15,15,15,.12))
titular: 16px/800 italic -.02em blanco · flecha: círculo 38px #FAF9F5 con → #1A1A1A
sombra 0 14px 30px -14px rgba(15,15,15,.35)
```

## Carrusel "Tu estudio"
```
scroll-x sin scrollbar · cards 236×280 radius 20px
foto full-bleed + gradiente (180deg, transparent 45%, rgba(15,15,15,.64))
badge sup-izq: pill rgba(250,249,245,.92), 10.5px/800 #2E5A3A
corazón: 32px circular rgba(250,249,245,.92); guardado → #C2503A + animation apHeart
nombre 17px/800 · meta 11.5px rgba(255,255,255,.85) · precio 13.5px/800
CTA: pill #FAF9F5 texto #1A1A1A 11.5px/800
```

## Fila de clase (Horario)
```
ap-card radius 16px · padding 12px 14px · gap 12px
hora: mono 14px + "50 min" 9.5px #98A093, columna 46px, divisor 1px #EFEDE4
nombre 13.5px/800 ellipsis · avatar 20px circular + "Marta G. · Studio Alma" 11px #5A5A52
badge plazas (ap-badge--*) + precio 11.5px/800 #5A5A52
entrada: apUp .4s, delay index*55ms
```

## Tabs día / filtros
```
día: 6px 14px, radius 13px, borde 1.5px #E5E3DA, bg #fff, 12.5px/800
  activo: borde/bg #1A1A1A, texto #F1ECE1
filtro: pill 7px 14px, borde 1px #D9D6C9, bg #fff, 12px/700 #5A5A52
  activo: borde #4F8A5B, bg #EAF0E7, texto #2E5A3A
```

## Bottom sheet (reserva)
```
radius 24px 24px 0 0 · handle 34×4px #D9D6C9 centrado a 9px
sombra 0 -18px 50px rgba(15,15,15,.25)
entrada: translateY(110%→0) .38s cubic-bezier(.34,1.3,.5,1)
velo: rgba(15,15,15,.42), fade .3s
aviso bono: bg #EAF0E7 radius 14px, check circular 22px #4F8A5B, texto 12px/700 #2E5A3A
CTA: ap-btn--primario height 50px
confirmación: check 64px #4F8A5B + anillo apRing .9s + 6 partículas confetti
              (7×11px, colores #4F8A5B #C99A3C #C2503A #1A1A1A, animaciones apConf* .9s)
```

## Nav inferior
```
bg rgba(250,249,245,.88) + backdrop-blur 16px + border-top 1px #EFEDE4
padding 9px 8px 24px (safe area)
icono 21px stroke 2 + label 9.5px/800
activo #1A1A1A · inactivo #98A093 · press: scale(.9)
badge: 15px circular #4F8A5B texto blanco 9px/800, animation apDot
```

## Toast
```
pill #1A1A1A texto #F1ECE1 12.5px/700, padding 10px 18px
top 58px centrado · sombra 0 14px 34px rgba(15,15,15,.35)
animation apToast .35s cubic-bezier(.34,1.4,.5,1) · autodismiss 2.3s
```
