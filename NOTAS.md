# Línea de Fuego — notas del proyecto

Nombre definitivo: **Línea de Fuego**. El nombre provisional era «Rescue Team», y así se sigue llamando el repositorio de GitHub (RESCUE-TEAM).
Juego 3D de extinción de incendios forestales en el navegador, hecho con Three.js 0.160.0 (se carga desde cdn.jsdelivr). Todo el texto del juego y las respuestas al usuario van **en castellano**.

## Cómo trabajar con el usuario
- **Preguntar antes de construir.** Proponer ideas, preguntar y no programar hasta que diga «adelante». Mejor avanzar por fases pequeñas y validarlas con él.
- Quiere gráficos lo más realistas posible y jugar solo con el ratón (clic, arrastrar el mapa, girar la cámara).

## Archivos
- `index.html`: interfaz, CSS, superposiciones (portada, pantalla final, hangar) e importmap de three.
- `juego.js` (~2100 líneas): todo el juego.
- `sonido.js`: sonido sintetizado con Web Audio, sin archivos de audio.
  - Ambiente: `ambient()` (viento, rugido y crepitar del fuego, lluvia, grillos).
  - Voces de los medios: `voice()`.
  - Efectos: `ui()`, `thunder()`, `splash()`.
  - juego.js decide el volumen en `soundFrame()`: un medio solo suena si está en pantalla o a punto de entrar (`screenVis`). El volumen sube según se acerca al borde y el sonido se reparte entre los altavoces según su posición.
- No funciona abriendo el archivo con doble clic, porque los módulos ES necesitan servidor. Hay que servir la carpeta con cualquier servidor estático. Por ejemplo:
  ```
  npx serve incendios
  ```
  En el ordenador original estaba la configuración «incendios» en `.claude/launch.json` (puerto 4530).

## Estructura de juego.js
- **Mundo:** rejilla de 128×128 celdas (`CELL` = 6 unidades, unos 30 m por celda).
- **Arrays de estado:** `H`, `VEG`, `FUEL`, `STATE` (0 sin quemar, 1 ardiendo, 2 quemado, 3 apagado), `INT`, `BT`, `WET`, `MOI`, `ROADF`, `AFF`, `DIST`, `BC`.
- **Vegetación** (`VP`): agua, roca, pasto, matorral, pinar, robledal, cultivos, pueblo, carretera y cortafuegos (`V.BREAK` = 9).
- **`LEVELS`:** 5 niveles. Cada uno define focos, viento, sequía, roladas, lluvia, tormentas, límite de daños, autobombas, hora de inicio y `k`.
- **`generate(seed)`:**
  - Terreno con ruido de Perlin.
  - Base de bomberos, 3 pueblos con carreteras (A*), casas aisladas, granjas y fauna.
  - Focos del incendio.
  - Puntos de agua (`G.waterCells` y `G.lakes`).
  - Tendido eléctrico (`G.lines`, `G.lineMask`).
- **Fuego:** autómata celular en `fireStep`. Influyen el viento, la pendiente, la humedad y las pavesas. Hay rebrotes.
- **Clima** (`weatherStep`): frentes de lluvia, tormentas secas con rayos, roladas avisadas 15 s antes, rachas y ciclo de día y noche. 1 s de simulación equivale a 2 min de juego.
- **Unidades** (`G.units`):
  - `bomba`: autobomba.
  - `ganado`: camión de ganado.
  - `brigada`: va a pie, usa `footCost`.
  - `bulldozer`.
  - `heli` y `avion`: tienen `u.air` y se mueven con `airStep`, `airOrder` y `doDrop`. Hacen rotaciones automáticas.
- **Cortafuegos:** `startCut` y `cutStep` siguen una línea 4-conexa (`line4`, máximo 40 celdas); `makeBreak` convierte cada celda.
- **Tendido eléctrico:** `linesTick`, `updatePower` y `cutPower`.
  - Con corriente impide las descargas aéreas cercanas.
  - Con viento fuerte puede provocar chispazos.
  - Si el fuego lo alcanza, cae.
- **Progreso:** `localStorage['rt-prof']` = `{ xp, maxLvl, own }`. La tienda se define en `SHOP` y se pinta con `renderShop`.
- **Depuración:** `window.RT`. Con `RT.sim(segundos)` se simula sin depender de `requestAnimationFrame`.

## Gráficos (versión mejorada)
- **Terreno:** malla 3 veces más fina que la rejilla del fuego. `hAt` aplica Catmull-Rom más microrrelieve (`AMP`, `detN`). Los colores de cada celda van en la textura `colTex`, en la que el canal alfa es el brillo de las brasas. El detalle (hierba, tierra, roca, ceniza) sale de la textura repetible `detTex`.
- **Árboles:** modelos fusionados (`pineGeo`, `oakGeo`, `shrubGeo`) con colores por vértice y balanceo con el viento. Se agrupan por zonas de 32×32 celdas para que no se dibujen los que no se ven. Lejos se cambian a versiones simples (`pineLo`, `oakLo`…).
- **Agua y cielo:** sombreadores propios (`WATER_FS` y la esfera `sky`) con oleaje, reflejos, espuma, disco solar y luna.
- **Fuego:** las partículas tienen formas de llama y de humo. Además hay chispas, ceniza a sotavento, brasas que siguen rojas un rato (`smold`) y bruma parda con mucho fuego.
- **Posproceso:** `EffectComposer` encadena el render, el resplandor (`UnrealBloomPass`) y `OutputPass`. Las partículas escriben el color en lineal (`pow 2.2`) porque `OutputPass` lo convierte después.
- **Rendimiento:** sombras recalculadas cada 0,5 s y botón HD (calidad alta o media). La calidad baja sola si el equipo va por debajo de unos 22 fps. En una gráfica Intel UHD un fotograma tarda unos 12 ms en calidad alta.
- **Tutorial guiado:** `startTutorial`, con 11 pasos que se comprueban solos.
- **Móvil:** `IS_TOUCH` añade la clase `touch` a `<html>`.
  - Gestos: un dedo mueve el mapa, pellizcar hace zoom, girar dos dedos cambia el rumbo y deslizar dos dedos inclina la vista. Se gestionan con `ptrs` y `pinch`.
  - `tactil()` cambia «clic» por «toca» en paneles y mensajes.
  - La interfaz compacta está en `@media (max-width:640px)` de index.html.
  - En móvil la partida empieza en calidad media.

## Fases
1. ✅ Mundo, fuego, clima, autobombas y cámara.
2. ✅ Pueblos y evacuación, casas aisladas, granjas y ganado, fauna salvaje, noche y lluvia.
3. ✅ Hangar con XP, niveles bloqueados, helicóptero, hidroavión, brigada, bulldozer, cortafuegos y tendido eléctrico.
4. ✅ Sonido (ambiente, medios con volumen según la cercanía a la pantalla, avisos), nombre «Línea de Fuego», portada cinemática (`demoStep`: el incendio de fondo arde y la cámara lo rodea), récords por nivel (`prof.rec`) y flechas de aviso en el borde de la pantalla (`updateArrows`, con focos nuevos en `G.alerts`). Sin música, por decisión del usuario.

### Después de la fase 4
- **Camión cisterna (nodriza)** (`cisterna`):
  - Se desbloquea en el nivel 2 y cuesta 900 / 1400 XP; se pueden tener 2.
  - Lleva 400 de agua (4 autobombas). Las autobombas lo incluyen en `nearestWater` si les queda más cerca que un lago, y reciben el agua con `task.tk`.
  - Con una autobomba seleccionada, clic en la cisterna = repostar en ella.
  - Vacía, va sola a llenarse y vuelve a su puesto (`task.post`).
- **Ataque preciso:** `standCell` y `goStand` colocan la autobomba en el punto pinchado, o en la celda sin llamas más cercana a ese punto.
- **Viento:**
  - A sotavento el calor sobre la dotación es mayor, con radio 2 en la dirección del viento.
  - Con el viento a la espalda el chorro rinde más (hasta +45 %); de cara, menos. El estado de la autobomba lo indica.
  - La retirada automática salta con 40 de salud y el aviso de calor con 55.

- **Zonas mojadas:**
  - La humedad (`WET`) ya no bloquea del todo el avance: multiplica la sequedad por `max(.1, 1 − WET·1,1)`, así que el fuego avanza más lento (hasta un 90 %) mientras dura y se va secando con el calor.
  - Orden «💦 Mojar zona» en las autobombas (`startWet` y `wetStep`): moja un círculo de unas 3 celdas de radio sin fuego y, si llega el fuego, lo ataca.
  - Las descargas aéreas sobre zonas sin fuego también sirven de barrera húmeda.
  - Con el bot siguen ganándose los niveles 1–2 con el equipo inicial y el nivel 3 con equipo medio.

Ideas que el usuario ha mencionado y no están hechas: ambulancias y policía como medios nuevos.

## Equilibrio (16/11/2026)
Calibrado con partidas automáticas: un bot que ataca el fuego más cercano a los pueblos, activa alarmas y saca casas y ganado.
- **`TUNE`:** K .1, W .11, spot .6. Valores `k` por nivel: .95 / .95 / .78 / .75 / .62.
- **Ventaja inicial del fuego:** cuando llega el aviso, el fuego ya lleva 8 + 4×nivel s ardiendo.
- **Medios aéreos:** tardan en despegar (helicóptero 18 s, hidroavión 30 s). Una orden dada antes se guarda.
- **Pueblos y casas:** en niveles altos los focos nacen más lejos de ellos. El aviso a los pueblos llega a 28 celdas y la evacuación tarda 2–12 s.
- **Mangueras:** mojan 3×3 celdas.
- **Resultados del bot:**
  - Equipo inicial: niveles 1 y 2 4/4; nivel 3 1/4.
  - Equipo medio: niveles 3 y 4 2/4 y 1/4.
  - Equipo completo: niveles 3 y 4 4/4; nivel 5 2/4.
  - Un jugador humano debería hacerlo mejor que el bot.

## Pendiente o por revisar
- No se ha medido el rendimiento (FPS) en otros equipos.
