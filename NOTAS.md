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

### Arreglos del 17/11/2026
- **Móvil:** el giro con dos dedos iba al revés; ahora el mapa gira con los dedos (`cam.yaw += da`). El alejamiento máximo depende de la forma de la pantalla (`maxDist()`: 900, y hasta ×2,4 en vertical), y la niebla se aparta al alejarse.
- **Reloj:** antes 1 s = 2 min, y anochecía a los 3 minutos incluso en el nivel 1, con los aviones en tierra casi toda la partida. Ahora 1 s = 30 s (`TIME_K = .5`).
  - Horas de inicio: 11, 16, 10, 12 y 10 h. Solo el nivel 2 anochece a propósito.
  - NVG se desbloquea en el nivel 2 y cuesta 1200.
  - Los récords antiguos se pasan a la nueva escala (`prof.recV`).
- **Fuego más lento:**
  - `TUNE.K` vale .085. Valores `k`: .9 / .9 / .72 / .6 / .46.
  - Las pavesas también se multiplican por `k`.
  - Viento de los niveles 4 y 5: 33 y 40.
  - Ventaja inicial del fuego: 8 + 3×nivel s.
  - Sin intervenir, en el nivel 5 quema la mitad que antes en los dos primeros minutos.
- En el nivel 1 la lluvia apaga a veces el fuego sola, y eso ya pasaba antes.

### 100 niveles, partida libre y recompensas (17/11/2026)
El usuario quería que cada mapa de un nivel tuviera siempre las mismas condiciones. Con mapas al azar, unos eran imposibles y otros se apagaban solos.
- **Campaña de 100 niveles:**
  - `makeLevel(n, tema, p, semilla)`: la dificultad `p` va de 0 a 1.
  - Focos: 1 hasta el nivel 12, 2 hasta el 40, 3 hasta el 75 y 4 después.
  - Viento de 12 a 44 km/h (tope 44). Sequía de .42 a .87; `k` de .9 a .4.
  - Autobombas: 2, luego 3 y luego 4.
- **Temas** (`THEMES`):
  - Ventarrón, Ola de calor, Viento loco (roladas), Frente de lluvia (llueve a los 300 s; si no, nunca llueve en la campaña), Frentes múltiples, Tormenta seca.
  - Anochecer: niveles 5, 15, 25…
- **Mapa fijo:** cada nivel usa su semilla `LSEED`.
  - Las semillas se eligieron con `RT.probe`: de 8 candidatos, el más cercano a la curva objetivo de celdas quemadas sin intervenir a los 180 s (`120 + 900·p^1.1`), descartando los que se apagan solos.
- **Tiempo fijo:** usa su propio generador (`RW`, sembrado con la semilla del nivel), así que no depende de lo que haga el jugador.
- **Partida libre** (`makeFree`, `FREE_DIFF`):
  - Cuatro dificultades, con mapa y tiempo al azar.
  - Da el 60 % de la XP y no cuenta para récords ni desbloqueos.
- **Recompensas:**
  - Estrellas: 1 por ganar, 2 con daños por debajo del 50 % del límite, 3 por debajo del 25 % y sin casas perdidas. Cada estrella nueva da XP extra.
  - Medalla cada 10 niveles (`MEDALS`, `prof.medals`), con 800 × n XP.
  - XP por victoria: `300 + 40·n + …`.
- **Hangar nuevo:**
  - Autobomba pesada (`pesada`, nivel 22): 2,5× agua, chorro ×1,3 y velocidad ×0,8.
  - Helicóptero pesado (`kamov`, nivel 35): descarga ×1,8 en un radio mayor.
  - Torres de vigilancia (`vigia`): −35 % de ventaja inicial del fuego.
  - Red de comunicaciones (`radio`): los aviones despegan en la mitad de tiempo.
  - Segundo hidroavión, tercer helicóptero, 2 brigadas, 2 bulldozers y más niveles de mejoras.
  - Las variantes pesadas son `heavy(u)`: mismo tipo con `u.heavy`, `u.spk` y `u.dropK`.
- **Carreteras visibles:**
  - Textura propia `roadTex`, 8 veces más fina que la rejilla. Canal R = asfalto, G = pista, B = arcén.
  - La dibuja un canvas en `buildScene` y la mezcla `TERRAIN_COLOR`.
- **Pistas forestales:** 3 por mapa (`ROADF = 2`), de tierra clara.
  - Los camiones las usan un poco más despacio que la carretera.
  - En el minimapa se ven ocres.
- Los récords antiguos se borraron (`recV = 3`) porque eran de otros mapas.

### Servicios de emergencia (17/11/2026)
No se compran: se incorporan solos según el nivel (`SERVICES`, `svcCount`). También aparecen en el hangar y en la ficha del nivel.
- **Gente que no puede irse sola** (`h.dep`, desde el nivel 6):
  - Al sonar la alarma, cada coche se lleva `people − dep`; los demás se quedan esperando en casa.
  - Si arde la casa con ellos dentro, se pierde la partida.
  - `townWaiting(t)` y `townLeft(t)` cuentan cuánta gente queda.
- **Autobús** (niveles 6 y 40), tarea `evac`:
  - Recoge 40 personas a 3 por segundo (`takePerson`), los recogidos ya cuentan como evacuados y los lleva a la base (`taskBase`).
  - En casas aisladas, encadena las cercanas.
- **Ambulancia** (niveles 3 y 30):
  - Evacúa casas aisladas en 1,5 s y recoge 4 personas en un pueblo.
  - Tarea `heal`: +10 de salud por segundo. Si está libre, atiende sola a dotaciones por debajo de 65.
- **Patrulla de policía** (niveles 8 y 25):
  - Tarea `block` en una carretera: `updateBlocks` corta 3×3 celdas y `carCost` las trata como intransitables. Los coches se desvían con `carRoute`.
  - Parada junto a un pueblo con alarma, adelanta la salida de los vecinos.
- **Helicóptero de rescate** (`hres`, nivel 12):
  - Funciona en `airStep` y `hresStep`, con las tareas `hlift`, `hback`, `hheal` y `hmove`.
  - Iza una persona cada 2 s, con 8 plazas, y hace viajes de ida y vuelta solo. No vuela de noche sin NVG.
- **Capacidades** (`CAP`): las autobombas siguen pudiendo evacuar (5 plazas).
- **Botones nuevos:** «Enviar a recoger» en el pueblo, «Vehículo más adecuado» en las casas (`bestRescuer`), «Pedir atención sanitaria» en las unidades y «Levantar el corte» en la patrulla.
- **Etiquetas:** con un medio seleccionado, tocar la etiqueta de un pueblo, casa o granja da la orden.
- **Sirenas:** la ambulancia tiene un bitonal agudo y la policía un aullido (`sonido.js`).

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
