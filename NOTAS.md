# Rescue Team — notas del proyecto

Nombre provisional: **Rescue Team**. El nombre definitivo se decide al final (fase 4).
Juego 3D de extinción de incendios forestales en el navegador, hecho con Three.js 0.160.0 (se carga desde cdn.jsdelivr). Todo el texto del juego y las respuestas al usuario van **en castellano**.

## Cómo trabajar con el usuario
- **Preguntar antes de construir.** Proponer ideas, preguntar y no programar hasta que diga «adelante». Mejor avanzar por fases pequeñas y validarlas con él.
- Quiere gráficos lo más realistas posible y jugar solo con el ratón (clic, arrastrar el mapa, girar la cámara).

## Archivos
- `index.html`: interfaz, CSS, superposiciones (portada, pantalla final, hangar) e importmap de three.
- `juego.js` (~1400 líneas): todo el juego.
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
4. ⏳ Pendiente: sonido, pulido visual y nombre definitivo.

## Pendiente o por revisar
- **Equilibrio:** desde el nivel 3 el fuego puede crecer muchísimo con algunas semillas (hasta unas 77 ha en 30 s). Falta ajustarlo según lo que diga el usuario al jugar.
- El hidroavión apaga casi al instante el foco inicial pequeño. No se ha cambiado porque solo se puede comprar a partir del nivel 3.
- No se ha medido el rendimiento (FPS) en otros equipos.
