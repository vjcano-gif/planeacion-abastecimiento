# FlujoLibre

Herramienta libre de planeación de inventarios por demanda, basada en la metodología DDMRP, para empresas de **producción** y de **distribución**.

Corre completa en el navegador: los datos que se cargan no salen del computador de quien la usa.

> DDMRP es una marca del Demand Driven Institute. Esta herramienta es independiente y no está certificada por esa entidad.

## Qué hace

- **Buffers**: zonas roja, amarilla y verde a partir del consumo promedio diario (ADU), el lead time desacoplado (DLT) y los factores de lead time y variabilidad. Tipos reposición, mín-máx y manual. Índice de flujo.
- **Perfiles de buffer**: tipo de artículo + categoría de lead time + categoría de variabilidad (por ejemplo PLL), con rangos de lead time por tipo y factores por perfil.
- **Ajustes planeados**: factores con fechas sobre la demanda, las zonas o el lead time.
- **Planeación**: ecuación de flujo neto, picos calificados, órdenes sugeridas con prioridad y descarga en CSV.
- **Ejecución**: alertas de inventario de hoy, inventario proyectado, sincronización de materiales y lead time.
- **En el tiempo**: comportamiento del buffer día a día, simulado o real.
- **Analítica**: integridad de los puntos de desacople, agotados y excesos, frecuencia de orden planeada frente a observada, integridad de la señal.
- **Proyección**: capital de trabajo, espacio, carga de recursos y frecuencia de orden ante un escenario de demanda.
- **Pronósticos**: trece métodos que compiten por artículo, incluidos ARIMA y regresión con estacionalidad; gana el de menor MAD en un tramo de prueba. Correlogramas de la serie y de los residuos. Solo alimentan el ADU.
- **Modelo preentrenado (opcional)**: un modelo fundacional de series de tiempo (t0-alpha) que corre en el navegador y entra a la misma competencia.
- **Armado de pedidos**: agrupa por proveedor y completa hasta el mínimo de compra o hasta llenar el camión, según la prioridad de buffer.
- **Descuentos por volumen**: compara el ahorro del siguiente escalón de precio con el costo de mantener el inventario adicional.
- **Programación de recursos**: rutas de varias operaciones, alistamientos, días laborables por recurso y festivos; las órdenes entran por prioridad de buffer.
- **Retail**: mínimo de exhibición y zonas en unidades enteras; artículos que se aceleran y artículos lentos.
- **Método**: listas de verificación de posicionamiento, de las pruebas de un buffer estratégico y de DDS&OP.
- **Posicionamiento**: efecto de poner un buffer nuevo sobre el lead time desacoplado.
- **Producción**: lista de materiales, puntos de desacople y demanda de componentes a partir de las órdenes de sus padres.
- **Distribución**: red origen–destino, demanda agregada en el origen y asignación priorizada cuando el inventario no alcanza.

- **Juego de la cadena**: simulación didáctica de tres eslabones (Tienda, Centro de distribución, Planta) para vivir el efecto látigo y comparar una regla reactiva con la reposición por buffers. No usa los datos de la empresa.

## Usarla

Abra `index.html` en un navegador o publíquela (ver abajo). Trae datos de ejemplo ficticios para ambos enfoques. En la pestaña **Datos** puede descargar esos datos como plantilla de Excel, reemplazarlos por los suyos y cargarlos.

La lectura y escritura de Excel usa la librería SheetJS desde su CDN, así que esa función necesita conexión a internet.

## Carpeta de trabajo: el repositorio local de cada empresa

En **Datos → Carpeta de trabajo** cada empresa elige una carpeta de su computador o de su red. La app lee y escribe ahí; nada sale a internet. Requiere Chrome o Edge en computador.

```
MiCarpeta/
  produccion/            (y otra igual llamada distribucion/)
    datos.xlsx           lo actualiza la empresa desde su sistema
    ordenes.json         órdenes aprobadas y cerradas; lo escribe la app
    historial/
      2026-11-20.json    una foto diaria de cada buffer; la escribe la app
```

- Cada vez que se lee la carpeta se guarda la foto del día. Con esas fotos, la pestaña **En el tiempo** muestra la historia real además de la simulación.
- En **Planeación**, una orden aprobada cuenta como suministro en tránsito y sigue pidiendo a sus componentes u origen hasta que se cierra.
- Si la carpeta está en una unidad compartida, todo el equipo trabaja sobre los mismos archivos. No hay bloqueo entre usuarios: si dos personas aprueban órdenes al mismo tiempo, gana el último que guarda.

## Publicarla gratis con GitHub Pages

1. Cree una cuenta en github.com y un repositorio público, por ejemplo `flujolibre`.
2. Suba `index.html`, `styles.css`, `README.md` y la carpeta `js`.
3. En el repositorio: **Settings → Pages → Branch: main → Save**.
4. En unos minutos queda disponible en `https://SU-USUARIO.github.io/flujolibre/`.

Para actualizarla, suba los archivos modificados al mismo repositorio; todos los usuarios reciben la versión nueva al recargar.

## Estructura

| Archivo | Contenido |
|---|---|
| `index.html`, `styles.css` | Página y estilos |
| `js/engine.js` | Motor de cálculo, sin dependencias |
| `js/sample.js` | Datos de ejemplo |
| `js/juego.js` | Simulador del Juego de la cadena |
| `js/app.js` | Interfaz |

## Alcance de esta versión

- Los artículos sin buffer no se planean: su demanda se traslada a sus componentes.
- La programación no maneja horas extra, solapes entre operaciones, recursos alternos ni secuencias que minimicen alistamientos.
- No incluye regresión múltiple con variables externas.

## Componentes externos

La app carga desde internet, solo cuando se usan:

- **SheetJS** (cdn.sheetjs.com), para leer y escribir Excel.
- **ONNX Runtime Web** (cdn.jsdelivr.net) y el modelo **t0-alpha** de The Forecasting Company, en la conversión no oficial `Siddharth899/tsfm-onnx` de Hugging Face (Apache 2.0, 103 MB). Solo se descargan si el usuario activa el modelo preentrenado; quedan guardados en el navegador. Los datos de la empresa no se envían: la inferencia corre localmente.
- Los rangos de lead time y variabilidad vienen con valores iniciales que cada empresa debe ajustar en **Ajustes**.

## Licencia

Defina la licencia antes de publicar. MIT es una opción habitual para que cualquiera pueda usarla y modificarla.
