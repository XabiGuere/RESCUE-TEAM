# Línea de Fuego — notas del proyecto

Nombre definitivo: **Línea de Fuego**. El nombre provisional era «Rescue Team», y así se sigue llamando el repositorio de GitHub (RESCUE-TEAM).
Juego 3D de extinción de incendios forestales en el navegador, hecho con Three.js 0.160.0 (se carga desde cdn.jsdelivr). Todo el texto del juego y las respuestas al usuario van **en castellano**.

## Dónde se juega
- **Web pública (GitHub Pages):** https://xabiguere.github.io/RESCUE-TEAM/
  - Se sirve desde el repositorio público XabiGuere/RESCUE-TEAM, rama `main`, carpeta raíz.
  - Para actualizarla, el usuario arrastra los archivos cambiados a la página de subida de GitHub. La web se actualiza sola en uno o dos minutos.
- **App instalable (PWA):** `manifest.webmanifest`, los iconos `icono-192.png`, `icono-512.png`, `apple-touch-icon.png` y `favicon.png`, y `sw.js`.
  - `sw.js` guarda el juego y Three.js para jugar sin conexión. Los archivos del juego van primero por red; Three.js se sirve primero desde la copia guardada.
  - Si se añade un archivo nuevo al juego, hay que incluirlo en `CORE` de `sw.js`. Para forzar que se borre todo lo guardado, se sube la versión de `CACHE`.
  - Los iconos se generan con un script de PowerShell (System.Drawing): una llama sobre montes oscuros.
- Antes también se publicaba como artefacto de Claude. El progreso (XP) se guarda por separado en cada dirección.

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

### Mejora gráfica, bloque 1: terreno y luz (18/11/2026)
Plan pactado con el usuario, en este orden: 1) terreno y luz, 2) fuego y humo, 3) vegetación, 4) vehículos, pueblos y **animales** (ahora parecen cubos). Al acabar cada bloque se le enseña el antes y el después.
- **Terreno (`TERRAIN_COLOR`):** la consulta a la rejilla se deforma con ruido (`wc`), así que las zonas tienen bordes orgánicos. La textura `bioTex` lleva R bosque, G cultivo, B roca y A relieve (hondonada o loma, calculado con medias de `H`).
  - Capas del sombreador: pasto con briznas de cerca, suelo de bosque, surcos en los cultivos y roca con cárcavas ladera abajo, vetas y líquenes.
  - Las hondonadas se oscurecen. Lo quemado tiene ceniza con vetas y un borde chamuscado (`burntAt`, que no cuenta el agua).
  - `makeBreak` borra el bosque de `bioTex`.
- **Fuera del mapa (`buildSkirt`):** anillos de terreno hasta `SKIRT` = 1400 que empiezan con los mismos vértices que el borde, así que no hay costura. Lejos aparecen montes.
  - La vegetación del borde continúa unos 100 m hacia fuera, con los modelos detallados cerca y los simples lejos. En calidad media hay un 45 % menos de árboles.
  - El plano del agua llega también fuera. Usa su propio generador aleatorio, así que no cambia la partida.
- **Atmósfera (`atmo(m)`):** reemplaza la niebla de cada material. Hacia el sol la niebla toma su color, y hay neblina en los valles (`ATM.uMist`) al amanecer, al anochecer y con lluvia.
  - Se aplica a todo lo que crea `buildScene`. Ojo: guarda la clave de programa anterior (`customProgramCacheKey`) para no mezclar sombreadores.
- **Cielo:** nubes altas que se mueven y resplandor del horizonte del lado del sol (`uDusk`).
- **Luz:** sol dorado al amanecer y al atardecer, y sombras suaves (`PCFSoftShadowMap`) en calidad alta. El pase `grade` va tras `OutputPass` y aplica saturación, curva en S, tono cálido con humo o atardecer, y viñeta.
- **Rendimiento:** medido con el panel oculto, cada fotograma tarda unos 40–47 ms frente a 30–44 ms antes (incluye etiquetas y minimapa). Falta medirlo con la ventana visible y en un móvil.

### Mejora gráfica, bloque 2: fuego y humo (18/11/2026)
- **Láminas de llamas (`flameCards`):** cada celda que arde levanta de 2 a 3 láminas que miran a la cámara. Se rehacen en cada fotograma desde `burning`, con un tope de `FLAME_MAX` = 3200 láminas.
  - El sombreador (`flameU`) hace subir lenguas con la textura de ruido `detTex`, que tiene 4, 8 y 64 celdas por vuelta en R, G y B. Con escalas grandes salen rayas finas, así que hay que mantenerlas pequeñas.
  - Las llamas se inclinan con el viento y se desvanecen con la niebla. Las de árbol son más altas (21) que las de matorral (8) y las de pasto (3,6).
- **Partículas sueltas:** quedan menos lenguas que antes, algo más altas, y más chispas, que el viento empuja.
- **Humo:** columnas más altas y grandes, 7000 como máximo. Con `windH`, el viento crece con la altura sobre el punto donde nació cada bocanada (`y0`), así que la columna se tumba.
  - Aparece despacio (`fin` = 0,3) para no tapar las llamas. Es oscuro en el bosque y blanquecino en el pasto. De noche es tenue y anaranjado.
  - Los bordes cuadrados de las partículas se difuminan.
- **Copas que arden:** el color de instancia lleva el rojo por encima de 1,6 (`treeState`). `swayMaterial` lo detecta (`vHot`), ennegrece la copa y le añade brasas que suben con el ruido. Brillan más de noche (`uGlowK`).
- **Luces del fuego:** se reparten por el frente, eligiendo la celda más alejada de las demás. Se mueven suave y titilan.
- **Azar visual:** las partículas usan `vr` (`Math.random`) en vez de `rr`, así que lo que se dibuja ya no cambia el azar de la partida. `fireStep` sigue igual.
- **Rendimiento:** con el panel oculto, unos 54 ms por fotograma con 405 celdas ardiendo, frente a 55 ms con 607 en el bloque 1. Es un coste parecido.

### Mejora gráfica, bloque 3: vegetación (18/11/2026)
- **Pinos:** `pineGeo(false)` es un pino de copa cónica con 6 pisos en estrella (`starTier`): puntas caídas y huecos entre ellas. `pineGeo(true)`, el antiguo «pine2», es ahora un pino piñonero con tronco alto y copa en sombrilla. `pineLo(umbrella)` tiene versiones simples de los dos.
- **Robles:** bultos con más caras solo en los grandes. Las normales salen del centro de la copa, que así se ilumina como un solo volumen, y el interior es más oscuro. Lleva una rama más. El matorral tiene 4 bultos.
- **Sombreador de hojas (`swayMaterial`):**
  - `vLeaf` distingue hoja de corteza por el color del vértice (verde mayor que rojo).
  - Las hojas tienen racimos con claros, huecos y hojas sueltas, sacados de `detTex` con la posición local más la de la instancia (`vLeafP`).
  - Solo con `NEARLEAF` (`swayMaterial(r, true)`), el contorno de las copas se deshilacha con `discard`.
  - De lejos, el material `far` no lleva texturas ni `discard`. El nivel de detalle cambia geometría y material (`userData.mhi` y `mlo`) y su distancia baja a 300 en calidad alta y 210 en media.
- **Quemados:** `treeState` pone el azul de instancia por encima de 1,6 y el sombreador deja tronco y restos negros, recortando la copa con `discard` (solo cerca). Las sombras siguen siendo de la copa entera; queda pendiente.
- **Rocas sueltas (`buildRocks`):** bloques en los roquedos (la mitad de las celdas), en las laderas fuertes y algunas en el pasto. Usan su propio generador aleatorio.
- **Rendimiento (panel oculto, nivel 30):** los árboles cuestan unos 7 ms de lejos y 17 ms de cerca, frente a 4 y 13 ms antes.

### Mejora gráfica, bloque 4: animales, vehículos y pueblos (18/11/2026)
- **Animales (`sheepGeo`, `cowGeo`, `deerGeo`, `boarGeo`):** modelos con cuerpo, cabeza y patas que miran hacia +z. Llevan el color en los vértices y la instancia los tiñe (negro si mueren).
  - Las vacas tienen manchas y cuernos, las ovejas lana con cabeza oscura, los ciervos cornamenta y rabo blanco, y los jabalíes hocico y colmillos.
  - `wildMesh` es ahora un grupo con dos `InstancedMesh`. Cada animal guarda su malla y su índice (`a.im`, `a.ii`) y brinca al correr.
  - En las granjas, los animales pisan el terreno (`a.y`).
- **Granjas:** cerca de postes con dos travesaños que siguen el terreno, y establo con tejado a dos aguas, esquinas blancas y portón. Se quitan los árboles dentro del corral con `clearTrees`; es solo visual, y el monte sigue ardiendo igual.
- **Coches civiles (`carGeo`):** carrocería del color de la instancia, cabina con cristales, ruedas, faros y pilotos.
- **Vehículos (`makeVehicle`):** las cajas grandes pasan a `softBox` (aristas redondeadas). Se añaden faros, pilotos, parachoques, espejos y ruedas con llanta. Los materiales llevan menos metal para que el techo blanco no deslumbre.
- **Casas (`houseGeo`, `roofGeo`, `winPanes`):** zócalo, puerta, ventanas con alféizar, tejado a dos aguas (`gableGeo`) y chimenea. Algunas tienen dos plantas, y los tejados varían de tono (hay alguna pizarra). De noche se encienden los cristales.
- **Pueblos:** árboles y matas junto a las casas, con su propio azar. Se registran en `trees` y `cellTrees`, así que arden con su celda.
- **Parque de bomberos:** nave con tres portones, franjas rojas y torre de mangueras. Se coloca en un hueco seco y llano junto al aparcamiento, sin agua ni carretera, y quita los árboles que la atraviesan.
- **Comprobado:** con los niveles 1, 60, 100 y 60, en ese orden, arden las mismas celdas que con el bloque 3. Nada de esto cambia el azar de la partida.

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

## Tráfico, escoltas e ingenieros (18/11/2026)
- **Tráfico civil** (`G.traffic`, sección «Tráfico civil» de `juego.js`):
  - Coches que van entre pueblos y salidas por rutas fijas (`G.troutes`). Hay `4 + 9p` coches, 4 más si hay policía.
  - Usa su propio azar (`RTF`), así que no altera el fuego calibrado de cada nivel.
  - Evitan el fuego, los cortes de la policía y los accidentes; si no pueden pasar, rodean o dan la vuelta. No van a pueblos con alarma.
  - Si el fuego alcanza un coche particular, los ocupantes huyen a pie: 60 mil € de daños, no se pierde la partida.
- **Atascos** (`trafficFactor`, llamado en `moveUnit`):
  - Los vehículos con sirena (`SIREN`: autobombas, cisterna, ambulancia, policía, brigada y bulldozer) no se frenan, y los coches se apartan al arcén a su paso.
  - El autobús, el camión de ganado y el equipo eléctrico no adelantan al coche que llevan delante (×0,5, ×0,2 si está parado) y se frenan con la densidad (`TRAF`).
  - Medido en el nivel 30: un viaje largo tarda un 20–30 % menos con escolta.
- **Escolta** (tarea `escort` de la patrulla): la patrulla va 3 celdas por delante del escoltado; a menos de 3 celdas le marca `escUntil` y el tráfico se aparta. Se da seleccionando la patrulla y tocando el vehículo, o con «Pedir escolta policial».
- **Curiosos** (solo con policía): un coche para a mirar el fuego (a 6–11 celdas) y estorba. Una patrulla a 3 celdas lo desaloja. Si el fuego llega a 3 celdas, huye; la mitad de las veces choca.
- **Accidentes** (`G.accs`, `G.accMask`, solo con ambulancia o policía):
  - Probabilidad mayor cerca del humo, como mucho 2 a la vez y al menos 120 s entre uno y otro.
  - Cortan la carretera a los coches y los camiones pasan a ×0,25. Suman 300 € por herido y segundo.
  - Se despejan con una ambulancia (8 s) o una patrulla (16 s) parada a 2 celdas. Si llega el fuego: 90 mil €.
- **Equipo eléctrico** (`elec`, niveles 4 y 45), tarea `elec`:
  - Aislar un tramo cuesta 5 mil € y tarda 12 s: estado `iso`, sin corriente, y los pueblos siguen con luz (`s.bypass`).
  - Reconectar tarda 6 s. Reparar una línea derribada cuesta 20 mil € y tarda 25 s, cuando el fuego está a 4 celdas o más de la línea.
  - No trabaja con el fuego a menos de 5 celdas. El corte general de 50 mil € sigue disponible.

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
- El nivel 6 (semilla 152243) se apaga solo hacia los 145 s de partida sin hacer nada (visto el 18/11/2026; no lo causa el tráfico).
