/* Planeación de Abastecimiento — interfaz. */
(function () {
  'use strict';
  var E = window.DDEngine, KEY = 'flujolibre.v1', MAXF = 300;
  var TABS = [['resumen', 'Resumen'], ['buffers', 'Buffers'], ['plan', 'Planeación'], ['ejec', 'Ejecución'], ['tiempo', 'En el tiempo'], ['anal', 'Analítica'], ['proy', 'Proyección'], ['pron', 'Pronósticos'], ['estr', 'Estructura'], ['metodo', 'Método'], ['juego', 'Juego'],['datos', 'Datos'], ['ajustes', 'Ajustes'], ['ayuda', 'Ayuda']];
  var NOMBRE = { oscuro: 'Agotado', rojo: 'Rojo', amarillo: 'Amarillo', verde: 'Verde', azul: 'Exceso', gris: 'Sin datos' };
  var HEX = { oscuro: '#6b1414', rojo: '#d64545', amarillo: '#e9b824', verde: '#3fa35b', azul: '#3b82c4', gris: '#a0a7b4' };
  var st = { modo: 'produccion', tab: 'resumen', settings: {}, datos: { produccion: null, distribucion: null }, filtro: '', sel: null, pronSel: null, msg: null, simSel: null, simDias: 180 };
  var R = null, simActual = null;

  /* ---------- Estado ---------- */
  function cargar() {
    try {
      var s = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (!s) return;
      st.modo = s.modo || st.modo; st.settings = s.settings || {}; st.checks = s.checks || {};
      if (s.datos) { st.datos.produccion = s.datos.produccion || null; st.datos.distribucion = s.datos.distribucion || null; }
    } catch (e) { /* almacenamiento no disponible */ }
  }
  function guardar() {
    var d = {};
    ['produccion', 'distribucion'].forEach(function (m) { var x = st.datos[m]; d[m] = x && !x.ejemplo ? x : null; });
    try { localStorage.setItem(KEY, JSON.stringify({ modo: st.modo, settings: st.settings, checks: st.checks || {}, datos: d })); }
    catch (e) {
      try { localStorage.setItem(KEY, JSON.stringify({ modo: st.modo, settings: st.settings, checks: st.checks || {} })); } catch (e2) { /* sin almacenamiento */ }
    }
  }
  function datos() {
    if (!st.datos[st.modo]) st.datos[st.modo] = window.DDSample[st.modo]();
    return st.datos[st.modo];
  }
  var carpeta = { h: null, pendiente: null, ordenes: [], ordenesMal: false, historial: [], sinDatos: false, error: '', avisos: [], leida: '' };
  function abiertas() { return carpeta.ordenes.filter(function (o) { return o.estado === 'aprobada'; }); }
  var ia = { estado: 'no', msg: '', ses: null, corriendo: false, cache: { produccion: new Map(), distribucion: new Map() } };
  function datosCalc() {
    var d = datos(), ab = carpeta.h ? abiertas() : [];
    d = Object.assign({}, d, { externos: ia.cache[st.modo] });
    if (ab.length) {
      d.suministro = (d.suministro || []).concat(ab.map(function (o) { return { sku: o.sku, ubicacion: o.ubicacion, fecha: o.fechaReq, cantidad: o.cantidad }; }));
      d.liberadas = ab.map(function (o) { return { sku: o.sku, ubicacion: o.ubicacion, cantidad: o.cantidad }; });
    }
    return d;
  }
  function recalc() { R = E.compute(datosCalc(), st.settings); }

  /* ---------- Utilidades ---------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var nf0 = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }), nf1 = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 }), nf2 = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 });
  function f0(n) { return n == null || isNaN(n) ? '—' : nf0.format(n); }
  function f1(n) { return n == null || isNaN(n) ? '—' : nf1.format(n); }
  function f2(n) { return n == null || isNaN(n) ? '—' : nf2.format(n); }
  function pc(n) { return n == null || isNaN(n) ? '—' : nf0.format(n * 100) + ' %'; }
  function fecha(iso) { return iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '—'; }
  function nombre(r) { return '<b>' + esc(r.sku) + '</b>' + (r.ubicacion ? ' · ' + esc(r.ubicacion) : '') + '<small>' + esc(r.descripcion) + '</small>'; }
  function chip(c, t) { return '<span class="chip c-' + c + '">' + esc(t) + '</span>'; }
  function conBuffer() { return R.items.filter(function (r) { return r.buffer; }); }
  function filtrar(rows) {
    var q = st.filtro.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(function (r) { return (r.sku + ' ' + r.ubicacion + ' ' + r.descripcion).toLowerCase().indexOf(q) >= 0; });
  }
  function buscador() { return '<input type="search" id="filtro" placeholder="Buscar artículo o ubicación" value="' + esc(st.filtro) + '">'; }
  function tope(rows) { return rows.length > MAXF ? '<p class="nota">Se muestran ' + MAXF + ' de ' + f0(rows.length) + ' artículos. Use el buscador para ver otros.</p>' : ''; }
  function barra(r) {
    var mx = Math.max(r.tog, r.inventario, r.flujoNeto, 1e-9) * 1.03;
    function w(v) { return (Math.max(0, Math.min(v, mx)) / mx * 100).toFixed(2) + '%'; }
    return '<div class="bbar" title="Disponible ' + f0(r.inventario) + ' · Flujo neto ' + f0(r.flujoNeto) + ' · Tope verde ' + f0(r.tog) + '">' +
      '<i class="z r" style="width:' + w(r.roja) + '"></i><i class="z y" style="width:' + w(r.amarilla) + '"></i><i class="z g" style="width:' + w(r.verde) + '"></i>' +
      '<span class="mk nf" style="left:' + w(r.flujoNeto) + '"></span><span class="mk" style="left:' + w(r.inventario) + '"></span></div>';
  }
  var LEY = '<div class="leyenda"><span><i style="background:#1c2430"></i>Inventario disponible</span><span><i style="border-left:2px dashed #1f5fbf;width:0;height:12px;border-radius:0"></i>Flujo neto</span></div>';
  function dist(rows, campo) {
    var c = {}, tot = rows.length || 1;
    rows.forEach(function (r) { c[r[campo]] = (c[r[campo]] || 0) + 1; });
    var h = '<div class="dist">', l = '<div class="leyenda">';
    ['oscuro', 'rojo', 'amarillo', 'verde', 'azul', 'gris'].forEach(function (k) {
      if (!c[k]) return;
      h += '<span style="width:' + (c[k] / tot * 100) + '%;background:' + HEX[k] + '">' + c[k] + '</span>';
      l += '<span><i style="background:' + HEX[k] + '"></i>' + NOMBRE[k] + ': ' + c[k] + '</span>';
    });
    return h + '</div>' + l + '</div>';
  }

  /* ---------- Gráficas ---------- */
  var GW = 900, GL = 58, GR = 14;
  // Buffer en el tiempo: bandas de zonas, inventario disponible y flujo neto día a día
  function chartTiempo(sim, alto, mini) {
    var d = sim.dias, n = d.length, H = alto, T = 14, B = mini ? 22 : 34, mx = 0, i;
    d.forEach(function (p) { mx = Math.max(mx, p.tog, p.oh, p.nfp); });
    mx = mx * 1.06 || 1;
    function X(i) { return GL + (GW - GL - GR) * (n > 1 ? i / (n - 1) : 0); }
    function Y(v) { return T + (H - T - B) * (1 - Math.max(0, v) / mx); }
    function banda(lo, hi, color) {
      var s = '', k;
      for (k = 0; k < n; k++) s += (k ? 'L' : 'M') + X(k).toFixed(1) + ' ' + Y(hi(d[k])).toFixed(1);
      for (k = n - 1; k >= 0; k--) s += 'L' + X(k).toFixed(1) + ' ' + Y(lo(d[k])).toFixed(1);
      return '<path d="' + s + 'Z" fill="' + color + '"/>';
    }
    function linea(campo) { var s = ''; for (var k = 0; k < n; k++) s += (k ? 'L' : 'M') + X(k).toFixed(1) + ' ' + Y(d[k][campo]).toFixed(1); return s; }
    var s = '<svg class="' + (mini ? '' : 'tsim') + '" viewBox="0 0 ' + GW + ' ' + H + '" width="100%" role="img" aria-label="Buffer en el tiempo">';
    s += banda(function () { return 0; }, function (p) { return p.roja; }, '#ef9a9a') +
      banda(function (p) { return p.roja; }, function (p) { return p.toy; }, '#f6dc7c') +
      banda(function (p) { return p.toy; }, function (p) { return p.tog; }, '#a5d6b1');
    for (i = 0; i <= 4; i++) { var v = mx * i / 4; s += '<line x1="' + GL + '" x2="' + (GW - GR) + '" y1="' + Y(v) + '" y2="' + Y(v) + '" stroke="rgba(255,255,255,.55)"/><text x="' + (GL - 6) + '" y="' + (Y(v) + 4) + '" text-anchor="end">' + f0(v) + '</text>'; }
    var ult = -100;
    for (i = 0; i < n; i++) {
      var f = d[i].f, marca = n > 75 ? f.slice(8) === '01' : i % 7 === 0;
      if (!marca || X(i) - ult < 52) continue;
      ult = X(i);
      s += '<line x1="' + X(i) + '" x2="' + X(i) + '" y1="' + (H - B) + '" y2="' + (H - B + 4) + '" stroke="#98a1b0"/><text x="' + X(i) + '" y="' + (H - B + 16) + '" text-anchor="middle">' + (n > 75 ? f.slice(5, 7) + '/' + f.slice(0, 4) : f.slice(8) + '/' + f.slice(5, 7)) + '</text>';
    }
    if (!mini) d.forEach(function (p, k) { if (p.pide) s += '<path d="M' + X(k) + ' ' + (H - B) + 'l-4 7h8z" fill="#1f5fbf"/>'; });
    s += '<path d="' + linea('nfp') + '" fill="none" stroke="#1f5fbf" stroke-width="1.6" stroke-dasharray="5 3"/>';
    s += '<path d="' + linea('oh') + '" fill="none" stroke="#1c2430" stroke-width="' + (mini ? 1.6 : 2) + '" stroke-linejoin="round"/>';
    if (!mini) s += '<line id="guia" x1="0" x2="0" y1="' + T + '" y2="' + (H - B) + '" stroke="#1c2430" stroke-width="1" visibility="hidden"/>';
    return s + '</svg>';
  }
  var LEYT = '<div class="leyenda"><span><i style="background:#1c2430"></i>Inventario disponible</span><span><i style="border-left:2px dashed #1f5fbf;width:0;height:12px;border-radius:0"></i>Flujo neto</span><span><i style="background:#a5d6b1"></i>Verde</span><span><i style="background:#f6dc7c"></i>Amarilla</span><span><i style="background:#ef9a9a"></i>Roja</span><span><i style="background:#1f5fbf;clip-path:polygon(50% 0,0 100%,100% 100%)"></i>Orden generada</span></div>';

  // Tablero: una columna por artículo, zonas en proporción y marcas de inventario y flujo neto
  function tablero(rows) {
    if (!rows.length) return '';
    var cw = Math.max(52, Math.min(86, (GW - 40) / rows.length)), H = 250, T = 22, B = 46, W = 40 + cw * rows.length;
    var s = '<div class="tw"><svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" style="min-width:' + (W * 0.75) + 'px;max-width:' + (W * 1.15) + 'px" role="img" aria-label="Tablero de buffers">';
    [0, 0.5, 1].forEach(function (p) { var yy = T + (H - T - B) * (1 - p / 1.25); s += '<line x1="34" x2="' + W + '" y1="' + yy + '" y2="' + yy + '" stroke="#e8eaee"/><text x="30" y="' + (yy + 4) + '" text-anchor="end">' + p * 100 + '%</text>'; });
    rows.forEach(function (r, k) {
      var x = 40 + cw * k + cw * 0.2, bw = cw * 0.6, tog = r.tog || 1;
      function Y(v) { return T + (H - T - B) * (1 - Math.max(0, Math.min(v / tog, 1.25)) / 1.25); }
      s += '<g data-item="' + esc(r.id) + '" style="cursor:pointer"><title>' + esc(r.id + ' — disponible ' + f0(r.inventario) + ', flujo neto ' + f0(r.flujoNeto) + ', tope verde ' + f0(r.tog)) + '</title>' +
        '<rect x="' + x + '" y="' + Y(r.tog) + '" width="' + bw + '" height="' + (Y(r.toy) - Y(r.tog)) + '" fill="#3fa35b" rx="2"/>' +
        '<rect x="' + x + '" y="' + Y(r.toy) + '" width="' + bw + '" height="' + (Y(r.tor) - Y(r.toy)) + '" fill="#e9b824"/>' +
        '<rect x="' + x + '" y="' + Y(r.tor) + '" width="' + bw + '" height="' + (Y(0) - Y(r.tor)) + '" fill="#d64545"/>' +
        '<line x1="' + (x - 5) + '" x2="' + (x + bw + 5) + '" y1="' + Y(r.flujoNeto) + '" y2="' + Y(r.flujoNeto) + '" stroke="#1f5fbf" stroke-width="2" stroke-dasharray="4 3"/>' +
        '<line x1="' + (x - 5) + '" x2="' + (x + bw + 5) + '" y1="' + Y(r.inventario) + '" y2="' + Y(r.inventario) + '" stroke="#1c2430" stroke-width="3"/>' +
        '<circle cx="' + (x + bw / 2) + '" cy="11" r="6" fill="' + HEX[r.colorPlan] + '"/>' +
        '<text x="' + (x + bw / 2) + '" y="' + (H - B + 15) + '" text-anchor="middle" style="font-weight:600;fill:#1c2430">' + esc(r.sku.length > 10 ? r.sku.slice(0, 9) + '…' : r.sku) + '</text>' +
        '<text x="' + (x + bw / 2) + '" y="' + (H - B + 29) + '" text-anchor="middle">' + esc(r.ubicacion ? (r.ubicacion.length > 11 ? r.ubicacion.slice(0, 10) + '…' : r.ubicacion) : pc(r.prioridad)) + '</text></g>';
    });
    return s + '</svg></div>';
  }

  function vTiempo() {
    var b = conBuffer();
    if (!b.length) return '<h2>Buffer en el tiempo</h2><p class="sub">No hay artículos con buffer.</p>';
    var r = R.byId.get(st.simSel); if (!r || !r.buffer) r = b.slice().sort(function (x, y) { return x.prioridad - y.prioridad; })[0];
    var real = serieReal(r.id), usaReal = st.simFuente === 'real' && real.length >= 2;
    var sim = usaReal ? resumenReal(real.slice(-st.simDias)) : E.simular(r, R, st.simDias);
    simActual = sim;
    var h = '<h2>Buffer en el tiempo</h2><p class="sub">Simulación con la demanda real de los últimos días: las zonas se recalculan cada día con el ADU móvil, se pide cuando el flujo neto llega al tope amarillo y la orden llega al cumplirse el DLT. Supone que el proveedor y los componentes siempre cumplen; no es el inventario que usted tuvo en realidad.</p>' +
      '<div class="barra"><select id="simSel">' + b.map(function (c) { return '<option value="' + esc(c.id) + '"' + (c.id === r.id ? ' selected' : '') + '>' + esc(c.id + ' — ' + c.descripcion) + '</option>'; }).join('') + '</select>' +
      '<select id="simDias">' + [90, 180, 365, 730].map(function (v) { return '<option value="' + v + '"' + (v === st.simDias ? ' selected' : '') + '>Últimos ' + v + ' días</option>'; }).join('') + '</select>' +
      (real.length >= 2 ? '<select id="simFuente"><option value="sim">Simulación</option><option value="real"' + (usaReal ? ' selected' : '') + '>Historia real (' + real.length + ' fotos guardadas)</option></select>' : '') + '</div>';
    if (usaReal) h += '<div class="aviso ok">Está viendo el estado real que la app guardó en la carpeta de trabajo cada día que se leyeron los datos.</div>';
    if (!sim) return h + '<div class="aviso">No hay historia suficiente para simular este artículo.</div>';
    if (sim.real) h += '<div class="kpis"><div class="kpi"><b>' + f0(sim.invProm) + '</b><span>inventario disponible promedio</span></div>' +
      '<div class="kpi"><b>' + f0(sim.bajoRoja) + '</b><span>fotos con inventario dentro de la zona roja, de ' + sim.dias.length + '</span></div>' +
      '<div class="kpi"><b>' + f0(sim.ordenes) + '</b><span>fotos con orden sugerida</span></div></div>';
    else h += '<div class="kpis"><div class="kpi"><b>' + f0(sim.invProm) + '</b><span>inventario promedio simulado (objetivo ' + f0(sim.objetivo) + ')</span></div>' +
      '<div class="kpi"><b>' + pc(sim.servicio) + '</b><span>de las unidades demandadas se habrían atendido</span></div>' +
      '<div class="kpi"><b>' + f0(sim.agotados) + '</b><span>días con inventario agotado, de ' + sim.dias.length + '</span></div>' +
      '<div class="kpi"><b>' + f0(sim.ordenes) + '</b><span>órdenes generadas</span></div></div>';
    h += '<div class="card"><div class="gcont">' + chartTiempo(sim, 360, false) + '<div class="tip" id="tip" hidden></div></div>' + LEYT + '</div>';
    if (sim.real) return h;
    var dm = sim.dias, mxD = 0; dm.forEach(function (p) { if (p.dem > mxD) mxD = p.dem; });
    var bw = (GW - GL - GR) / dm.length, bars = '';
    dm.forEach(function (p, k) { var hh = mxD ? p.dem / mxD * 80 : 0; bars += '<rect x="' + (GL + bw * k).toFixed(1) + '" y="' + (92 - hh).toFixed(1) + '" width="' + Math.max(0.6, bw * 0.8).toFixed(1) + '" height="' + hh.toFixed(1) + '" fill="#8fa3bf"/>'; });
    h += '<div class="card"><h3>Demanda diaria del mismo periodo (máximo ' + f0(mxD) + ')</h3><svg viewBox="0 0 ' + GW + ' 96" width="100%" role="img" aria-label="Demanda diaria">' + bars + '<line x1="' + GL + '" x2="' + (GW - GR) + '" y1="92" y2="92" stroke="#c9ced6"/></svg></div>';
    return h;
  }

  /* ---------- Vistas ---------- */
  function vResumen() {
    var b = conBuffer(), ord = b.filter(function (r) { return r.orden > 0; });
    var vInv = 0, vObj = 0;
    b.forEach(function (r) { vInv += r.inventario * r.costo; vObj += r.objetivo * r.costo; });
    var top = b.slice().sort(function (x, y) { return x.prioridad - y.prioridad; }).slice(0, 8);
    var h = '<h2>Resumen · ' + (st.modo === 'produccion' ? 'Producción' : 'Distribución') + '</h2>' +
      '<p class="sub">Estado al ' + fecha(R.hoy) + (datos().ejemplo ? '. Está viendo datos de ejemplo ficticios; cargue los suyos en la pestaña Datos.' : '.') + '</p>';
    h += '<div class="kpis">' +
      '<div class="kpi"><b>' + f0(b.length) + '</b><span>artículos con buffer, de ' + f0(R.items.length) + '</span></div>' +
      '<div class="kpi"><b>' + f0(ord.length) + '</b><span>órdenes sugeridas hoy</span></div>' +
      '<div class="kpi"><b>$ ' + f0(vInv) + '</b><span>inventario disponible valorizado</span></div>' +
      '<div class="kpi"><b>$ ' + f0(vObj) + '</b><span>inventario promedio objetivo (rojo + verde/2)</span></div></div>';
    h += '<div class="grid2"><div class="card"><h3>Planeación: color del flujo neto</h3>' + dist(b, 'colorPlan') + '</div>' +
      '<div class="card"><h3>Ejecución: color del inventario disponible</h3>' + dist(b, 'colorEjec') + '</div></div>';
    h += '<div class="card"><h3>Tablero de buffers: los ' + Math.min(14, b.length) + ' más urgentes</h3>' + tablero(b.slice().sort(function (x, y) { return x.prioridad - y.prioridad; }).slice(0, 14)) +
      '<div class="leyenda"><span><i style="background:#1c2430"></i>Inventario disponible</span><span><i style="border-left:2px dashed #1f5fbf;width:0;height:12px;border-radius:0"></i>Flujo neto</span><span>El punto superior es el color de planeación. Cada columna está en proporción a su tope verde.</span></div></div>';
    h += '<div class="card"><h3>Prioridades más urgentes</h3><div class="tw"><table><tr><th>Artículo</th><th>Prioridad</th><th>Flujo neto</th><th>Tope verde</th><th>Orden sugerida</th><th class="l">Buffer</th></tr>' +
      top.map(function (r) { return '<tr data-item="' + esc(r.id) + '"><td>' + nombre(r) + '</td><td>' + chip(r.colorPlan, pc(r.prioridad)) + '</td><td>' + f0(r.flujoNeto) + '</td><td>' + f0(r.tog) + '</td><td>' + (r.orden ? f0(r.orden) : '—') + '</td><td class="l">' + barra(r) + '</td></tr>'; }).join('') +
      '</table></div>' + LEY + '</div>';
    return h;
  }

  // Índice de flujo: cuántos artículos comparten cada frecuencia de orden planeada (zona verde ÷ ADU)
  function frec(r) { return r.adu > 0 ? r.verde / r.adu : null; }
  function indiceFlujo(rows) {
    var con = rows.filter(function (r) { return frec(r) != null; });
    if (!con.length) return '';
    var bins = new Array(51).fill(0), mx = 0, i;
    con.forEach(function (r) { var b = Math.min(51, Math.max(1, Math.ceil(frec(r) - 1e-9))); bins[b - 1]++; });
    bins.forEach(function (v) { if (v > mx) mx = v; });
    var H = 190, T = 12, B = 30, bw = (GW - GL - GR) / 51, s = '<svg viewBox="0 0 ' + GW + ' ' + H + '" width="100%" role="img" aria-label="Índice de flujo">';
    for (i = 0; i <= mx; i += Math.max(1, Math.ceil(mx / 4))) { var yy = T + (H - T - B) * (1 - i / mx); s += '<line x1="' + GL + '" x2="' + (GW - GR) + '" y1="' + yy + '" y2="' + yy + '" stroke="#e8eaee"/><text x="' + (GL - 6) + '" y="' + (yy + 4) + '" text-anchor="end">' + i + '</text>'; }
    bins.forEach(function (v, k) {
      var hh = (H - T - B) * v / mx, x = GL + bw * k;
      if (v) s += '<rect x="' + (x + 1).toFixed(1) + '" y="' + (H - B - hh).toFixed(1) + '" width="' + (bw - 2).toFixed(1) + '" height="' + hh.toFixed(1) + '" fill="' + (k === 50 ? '#d64545' : '#1f5fbf') + '" rx="2"><title>' + (k === 50 ? 'Más de 50 días' : (k + 1) + ' días') + ': ' + v + ' artículos</title></rect>';
      if (k === 0 || (k + 1) % 5 === 0 || k === 50) s += '<text x="' + (x + bw / 2).toFixed(1) + '" y="' + (H - B + 14) + '" text-anchor="middle">' + (k === 50 ? 'Más' : k + 1) + '</text>';
    });
    s += '<text x="' + ((GW + GL) / 2) + '" y="' + (H - 2) + '" text-anchor="middle">Días entre órdenes (zona verde ÷ ADU)</text></svg>';
    var ord = con.slice().sort(function (a, b) { return frec(b) - frec(a); });
    function lista(arr) { return '<table><tr><th>Artículo</th><th>ADU</th><th>Zona verde</th><th>Días entre órdenes</th><th class="l">La verde sale de</th></tr>' + arr.map(function (r) { return '<tr data-item="' + esc(r.id) + '"><td>' + nombre(r) + '</td><td>' + f1(r.adu) + '</td><td>' + f0(r.verde) + '</td><td><b>' + f1(frec(r)) + '</b></td><td class="l">' + esc(r.verdePor) + '</td></tr>'; }).join('') + '</table>'; }
    return '<div class="card"><h3>Índice de flujo</h3><p class="nota" style="margin-top:-4px">Cada barra cuenta los artículos que se piden con esa frecuencia planeada. A la derecha quedan los lentos, casi siempre por un pedido mínimo grande; a la izquierda, los que se piden tan seguido que generan muchas órdenes y alistamientos.</p>' + s +
      '<div class="grid2" style="margin-top:12px"><div class="tw"><h3>Los más lentos</h3>' + lista(ord.slice(0, 5)) + '</div><div class="tw"><h3>Los más rápidos</h3>' + lista(ord.slice(-5).reverse()) + '</div></div></div>';
  }

  var TIPOB = { R: 'Reposición', MM: 'Mín-máx', RO: 'Manual' };
  var PT = { M: 'Fabricado', P: 'Comprado', D: 'Distribuido', I: 'Intermedio' }, PL = { L: 'lead time largo', M: 'lead time medio', S: 'lead time corto' }, PV = { H: 'variabilidad alta', M: 'variabilidad media', L: 'variabilidad baja' };
  function perfilTexto(p) { return PT[p[0]] + ', ' + PL[p[1]] + ', ' + PV[p[2]]; }
  // Perfiles de buffer: grupos de artículos que comparten tipo, categoría de lead time y de variabilidad
  function vPerfiles(rows) {
    var g = {}, d = datos(), rangos = {};
    rows.forEach(function (r) { var x = g[r.perfil] = g[r.perfil] || { n: 0, lt: {}, v: {}, cap: 0, min: Infinity, max: 0, propio: false, man: 0 }; x.n++; x.lt[f2(r.fLT)] = 1; x.v[f2(r.fVar)] = 1; x.cap += r.objetivo * r.costo; x.min = Math.min(x.min, r.dlt); x.max = Math.max(x.max, r.dlt); if (r.perfilPropio) x.propio = true; if (r.perfilManual) x.man++; });
    var ks = Object.keys(g).sort();
    if (!ks.length) return '';
    (d.rangos || []).forEach(function (x) { rangos[String(x.tipo).toUpperCase().charAt(0)] = x; });
    var S = R.settings, tipos = {}; ks.forEach(function (k) { tipos[k[0]] = 1; });
    return '<div class="card tw"><h3>Perfiles de buffer</h3><p class="nota" style="margin-top:-4px">El perfil junta los artículos que se comportan parecido: primera letra el tipo (M fabricado, P comprado, D distribuido, I intermedio), segunda el lead time (L largo, M medio, S corto) y tercera la variabilidad (H alta, M media, L baja). Los factores se asignan al perfil, no artículo por artículo.</p>' +
      '<table><tr><th class="l">Perfil</th><th class="l">Significado</th><th>Artículos</th><th>DLT de sus artículos</th><th>Factor de lead time</th><th>Factor de variabilidad</th><th>Inventario promedio objetivo</th><th class="l">Origen de los factores</th></tr>' +
      ks.map(function (k) { var x = g[k]; return '<tr><td class="l"><b>' + k + '</b></td><td class="l">' + perfilTexto(k) + '</td><td>' + x.n + '</td><td>' + (x.min === x.max ? f0(x.min) : f0(x.min) + ' a ' + f0(x.max)) + ' días</td><td>' + Object.keys(x.lt).join(' / ') + '</td><td>' + Object.keys(x.v).join(' / ') + '</td><td>$ ' + f0(x.cap) + '</td><td class="l">' + (x.propio ? 'Hoja Perfiles' : 'Ajustes generales') + (x.man ? ' · ' + x.man + ' asignado a mano' : '') + '</td></tr>'; }).join('') + '</table>' +
      '<h3 style="margin-top:16px">Rangos de lead time por tipo de artículo</h3><table><tr><th class="l">Tipo</th><th>Corto: hasta</th><th>Medio: hasta</th><th>Largo: más de</th><th class="l">Origen</th></tr>' +
      Object.keys(tipos).sort().map(function (t) { var x = rangos[t], c = x && E.num(x.lt_corto_max, null) != null ? E.num(x.lt_corto_max, 0) : S.ltCortoMax, m = x && E.num(x.lt_medio_max, null) != null ? E.num(x.lt_medio_max, 0) : S.ltMedioMax; return '<tr><td class="l">' + t + ' — ' + PT[t] + '</td><td>' + f0(c) + ' días</td><td>' + f0(m) + ' días</td><td>' + f0(m) + ' días</td><td class="l">' + (x ? 'Hoja Rangos' : 'Ajustes generales') + '</td></tr>'; }).join('') + '</table>' +
      '<p class="nota" style="margin-top:8px">Para cambiar rangos o factores use las hojas Rangos y Perfiles de la plantilla. Para fijar el perfil de un artículo a criterio propio, escriba el código en la columna perfil de la hoja Articulos.</p></div>';
  }
  function vBuffers() {
    var rows = filtrar(conBuffer());
    return '<h2>Buffers</h2><p class="sub">«Cambio del ADU» compara la ventana actual con la anterior y se resalta cuando supera el ' + pc(R.settings.alertaADU) + '.Zonas calculadas con el consumo promedio diario (ADU), el lead time desacoplado (DLT) y los factores de lead time y variabilidad. Haga clic en un artículo para ver el cálculo.</p>' +
      '<div class="barra">' + buscador() + '</div><div class="card tw"><table><tr><th>Artículo</th><th>Perfil</th><th>Tipo</th><th>ADU</th><th>Cambio del ADU</th><th>DLT (días)</th><th>Factor LT</th><th>CV</th><th>Factor var.</th><th>Roja</th><th>Amarilla</th><th>Verde</th><th>Tope verde</th><th>Días entre órdenes</th><th class="l">Buffer</th></tr>' +
      rows.slice(0, MAXF).map(function (r) {
        var ca = r.cambioADU, fuerte = ca != null && Math.abs(ca) >= R.settings.alertaADU;
        return '<tr data-item="' + esc(r.id) + '"><td>' + nombre(r) + '</td><td>' + '<b title="' + esc(perfilTexto(r.perfil)) + '">' + r.perfil + '</b>' + (r.perfilManual ? ' <span class="nota">manual</span>' : '') + '</td><td>' + TIPOB[r.tipoBuf] + '</td><td>' + f1(r.adu) + (r.daf !== 1 ? ' <span class="nota">× ' + f2(r.daf) + '</span>' : '') + '</td><td>' + (ca == null ? '—' : '<span style="' + (fuerte ? 'color:#d64545;font-weight:600' : '') + '">' + (ca >= 0 ? '+' : '−') + nf0.format(Math.abs(ca) * 100) + ' %</span>') + '</td><td>' + f0(r.dlt) + '</td><td>' + f2(r.fLT) + ' <span class="nota">' + r.catLT + '</span></td><td>' + f2(r.cv) + '</td><td>' + f2(r.fVar) + ' <span class="nota">' + r.catVar + '</span></td><td>' + f0(r.roja) + '</td><td>' + f0(r.amarilla) + '</td><td>' + f0(r.verde) + '</td><td>' + f0(r.tog) + '</td><td>' + f1(frec(r)) + '</td><td class="l">' + barra(r) + '</td></tr>';
      }).join('') + '</table></div>' + tope(rows) + LEY + '<div style="height:16px"></div>' + vPerfiles(rows) + '<div style="height:0"></div>' + indiceFlujo(rows);
  }

  function vPlan() {
    var rows = filtrar(conBuffer()).sort(function (x, y) { return x.prioridad - y.prioridad; });
    var n = rows.filter(function (r) { return r.orden > 0; }).length;
    var h = '<h2>Planeación</h2><p class="sub">Flujo neto = disponible + en tránsito − demanda calificada (pedidos vencidos y de hoy, picos calificados y demanda de los artículos que lo consumen). Se sugiere orden cuando el flujo neto llega al tope amarillo o menos; la cantidad lleva el flujo neto al tope verde.</p>' +
      '<div class="barra">' + buscador() + '<button class="btn pri" data-act="csv">Descargar órdenes sugeridas (' + n + ')</button></div>';
    h += '<div class="card tw"><table><tr><th>Artículo</th><th>Prioridad</th><th>Disponible</th><th>En tránsito</th><th>Demanda calif.</th><th>Flujo neto</th><th>Tope amarillo</th><th>Tope verde</th><th>Orden sugerida</th><th>Fecha requerida</th><th>Acción</th></tr>' +
      rows.slice(0, MAXF).map(function (r) {
        return '<tr data-item="' + esc(r.id) + '"><td>' + nombre(r) + '</td><td>' + chip(r.colorPlan, pc(r.prioridad)) + '</td><td>' + f0(r.inventario) + '</td><td>' + f0(r.enTransito) + '</td><td>' + f0(r.demCalificada) + '</td><td>' + f0(r.flujoNeto) + '</td><td>' + f0(r.toy) + '</td><td>' + f0(r.tog) + '</td><td><b>' + (r.orden ? f0(r.orden) : '—') + '</b></td><td>' + (r.orden ? fecha(r.fechaReq) : '—') + '</td><td>' + (r.orden && carpeta.h && !carpeta.ordenesMal ? '<button class="btn" data-act="aprobar" data-id="' + esc(r.id) + '">Aprobar</button>' : '') + '</td></tr>';
      }).join('') + '</table></div>' + tope(rows);
    if (!carpeta.h) h += '<p class="nota">Para aprobar órdenes y llevarles seguimiento, conecte una carpeta de trabajo en la pestaña Datos.</p>';
    var ab = abiertas();
    if (carpeta.h && ab.length) {
      h += '<h2>Órdenes aprobadas abiertas</h2><p class="sub">Cuentan como suministro en tránsito y siguen pidiendo a sus componentes u origen. Cierre cada una cuando se reciba o cuando ya aparezca en la hoja «Suministro» de su sistema, para no contarla dos veces.</p>' +
        '<div class="card tw"><table><tr><th>Artículo</th><th>Cantidad</th><th>Aprobada</th><th>Fecha requerida</th><th>Acción</th></tr>' +
        ab.map(function (o) { return '<tr><td><b>' + esc(o.sku) + '</b>' + (o.ubicacion ? ' · ' + esc(o.ubicacion) : '') + '<small>' + esc(o.descripcion) + '</small></td><td>' + f0(o.cantidad) + '</td><td>' + fecha(o.creada) + '</td><td>' + fecha(o.fechaReq) + '</td><td><button class="btn" data-act="cerrarOrden" data-oid="' + esc(o.oid) + '">Cerrar</button></td></tr>'; }).join('') + '</table></div>';
    }
    h += vArmado() + vDescuentos() + vSecuencia();
    if (R.asignaciones.length) {
      h += '<h2>Asignación priorizada</h2><p class="sub">El inventario del origen no alcanza para todas las órdenes de sus destinos. Se reparte de modo que todos queden con la misma prioridad de flujo neto, en lugar de atender por orden de llegada.</p>';
      R.asignaciones.forEach(function (a) {
        var o = R.byId.get(a.origen);
        h += '<div class="card tw"><h3>' + esc(o.sku) + (o.ubicacion ? ' · ' + esc(o.ubicacion) : '') + ' — disponible ' + f0(a.disponible) + ' frente a ' + f0(a.requerido) + ' requeridos</h3><table><tr><th>Destino</th><th>Orden sugerida</th><th>Cantidad asignada</th><th>Prioridad antes</th><th>Prioridad después</th></tr>' +
          a.destinos.map(function (d) { var x = R.byId.get(d.id); return '<tr data-item="' + esc(d.id) + '"><td>' + nombre(x) + '</td><td>' + f0(d.pedido) + '</td><td><b>' + f0(d.asignado) + '</b></td><td>' + pc(d.antes) + '</td><td>' + pc(d.despues) + '</td></tr>'; }).join('') + '</table></div>';
      });
    }
    return h;
  }

  function vEjec() {
    var rows = filtrar(conBuffer()).sort(function (x, y) { return x.pctRoja - y.pctRoja; });
    var h = '<h2>Ejecución</h2><p class="sub">Las alertas de ejecución sirven para decidir qué órdenes ya abiertas hay que acelerar; no generan órdenes nuevas. El color se mide contra la zona roja: rojo por debajo del ' + pc(R.settings.alertaOH) + ' de ella, amarillo dentro de ella.</p>' +
      '<div class="barra">' + buscador() + '</div><div class="card tw"><h3>Alertas de estado del buffer</h3><table><tr><th>Artículo</th><th>Inventario hoy</th><th>Disponible</th><th>Zona roja</th><th>% de la zona roja</th><th>Inventario proyectado</th><th>Mínimo proyectado</th><th>Día del mínimo</th><th>Próximo suministro</th><th>Cantidad</th></tr>' +
      rows.slice(0, MAXF).map(function (r) {
        var p = r.proxSuministro;
        return '<tr data-item="' + esc(r.id) + '"><td>' + nombre(r) + '</td><td>' + chip(r.colorEjec, NOMBRE[r.colorEjec]) + '</td><td>' + f0(r.inventario) + '</td><td>' + f0(r.tor) + '</td><td>' + pc(r.pctRoja) + '</td><td>' + chip(r.colorProy, NOMBRE[r.colorProy]) + '</td><td>' + f0(r.proyMin) + '</td><td>' + fecha(r.proyDia) + '</td><td>' + (p ? fecha(p.f) : 'Sin orden abierta') + '</td><td>' + (p ? f0(p.q) : '—') + '</td></tr>';
      }).join('') + '</table><p class="nota" style="margin-top:8px">El inventario proyectado avanza día a día durante un lead time desacoplado: suma los suministros esperados y resta la mayor entre el ADU y la demanda conocida de cada día.</p></div>' + tope(rows);
    var sin = conBuffer().filter(function (r) { return r.sincro; });
    h += '<div class="card tw"><h3>Alertas de sincronización de materiales</h3>' + (sin.length ?
      '<table><tr><th>Componente u origen</th><th>Disponible</th><th>Le piden hoy</th><th>Faltante</th><th class="l">Lo piden</th></tr>' + sin.map(function (r) {
        var quien = r.parents.map(function (p) { var x = R.byId.get(p.id); return (x.orden || x.liberada || !x.buffer) ? x.sku + (x.ubicacion ? ' · ' + x.ubicacion : '') : null; }).filter(Boolean).join(', ');
        return '<tr data-item="' + esc(r.id) + '"><td>' + nombre(r) + '</td><td>' + f0(r.inventario) + '</td><td>' + f0(r.sincro.requerido) + '</td><td><b style="color:#d64545">' + f0(r.sincro.faltante) + '</b></td><td class="l">' + esc(quien) + '</td></tr>';
      }).join('') + '</table>' : '<p class="nota">Ningún componente u origen tiene hoy menos disponible de lo que le piden las órdenes de quienes lo consumen.</p>') + '</div>';
    var lts = [];
    R.items.forEach(function (r) { (r.alertasLT || []).forEach(function (a) { lts.push({ r: r, a: a }); }); });
    var hayLT = R.items.some(function (r) { return !r.buffer && r.tipoBuf === 'LT'; });
    h += '<div class="card tw"><h3>Alertas de lead time</h3>' + (lts.length ?
      '<table><tr><th>Artículo sin buffer</th><th>Estado</th><th>Fecha esperada</th><th>Días que faltan</th><th>Cantidad</th></tr>' + lts.sort(function (x, y) { return x.a.dias - y.a.dias; }).map(function (x) {
        return '<tr data-item="' + esc(x.r.id) + '"><td>' + nombre(x.r) + '</td><td>' + chip(x.a.color, x.a.color === 'oscuro' ? 'Vencida' : NOMBRE[x.a.color]) + '</td><td>' + fecha(x.a.f) + '</td><td>' + x.a.dias + '</td><td>' + f0(x.a.q) + '</td></tr>';
      }).join('') + '</table>' : '<p class="nota">' + (hayLT ? 'Ninguna orden de los artículos vigilados por lead time está en su último tercio.' : 'Para vigilar un artículo sin buffer que suele causar problemas, póngale «LT» en la columna tipo_buffer. La alerta se enciende en el último tercio de su lead time.') + '</p>') + '</div>';
    return h;
  }

  /* ---------- Analítica: integridad de los puntos de desacople y de las señales ---------- */
  function serieAnalisis(r) {
    var real = serieReal(r.id);
    if (real.length >= 14) return { d: real, real: true };
    var s = E.simular(r, R, 180);
    return s ? { d: s.dias, real: false } : null;
  }
  function vAnalitica() {
    var rows = filtrar(conBuffer()), datos = [], hayReal = false, haySim = false;
    rows.slice(0, MAXF).forEach(function (r) {
      var s = serieAnalisis(r); if (!s) return;
      if (s.real) hayReal = true; else haySim = true;
      datos.push({ r: r, real: s.real, g: E.integridad(s.d, R.settings.alertaOH) });
    });
    var h = '<h2>Analítica</h2><p class="sub">Mide si cada buffer se mantuvo donde debe: entre el tope rojo y el tope rojo más la zona verde (rango óptimo). Por debajo hay riesgo de faltante; por encima hay inventario de más. ' +
      (hayReal && !haySim ? 'Se calcula con las fotos reales guardadas en la carpeta de trabajo.' : haySim && !hayReal ? 'Se calcula con la simulación de los últimos 180 días, porque aún no hay al menos 14 fotos reales por artículo.' : 'Usa las fotos reales donde hay al menos 14 y la simulación en el resto.') + '</p><div class="barra">' + buscador() + '</div>';
    if (!datos.length) return h + '<div class="aviso">No hay historia suficiente para analizar.</div>';
    var COLI = [['agotado', '#6b1414', 'Agotado'], ['bajoAlerta', '#d64545', 'Bajo la alerta'], ['enRoja', '#e9b824', 'En zona roja'], ['optimo', '#3fa35b', 'Rango óptimo'], ['sobre', '#3b82c4', 'Por encima']];
    var tot = { n: 0 }; COLI.forEach(function (c) { tot[c[0]] = 0; });
    datos.forEach(function (x) { tot.n += x.g.n; COLI.forEach(function (c) { tot[c[0]] += x.g[c[0]]; }); });
    function tira(g) { return '<div class="dist" style="height:14px;min-width:180px;margin:0">' + COLI.map(function (c) { return g[c[0]] ? '<span style="width:' + (g[c[0]] / g.n * 100) + '%;background:' + c[1] + '" title="' + c[2] + ': ' + pc(g[c[0]] / g.n) + '"></span>' : ''; }).join('') + '</div>'; }
    h += '<div class="kpis">' + COLI.map(function (c) { return '<div class="kpi"><b style="color:' + c[1] + '">' + pc(tot[c[0]] / tot.n) + '</b><span>' + c[2].toLowerCase() + '</span></div>'; }).join('') + '</div>';
    h += '<div class="card tw"><h3>Integridad de los puntos de desacople</h3><table><tr><th>Artículo</th><th class="l">Dónde estuvo el inventario</th><th>Rango óptimo</th><th>Veces agotado</th><th>Días agotado</th><th>Días bajo la alerta</th><th>Días por encima</th><th>Fuente</th></tr>' +
      datos.slice().sort(function (a, b) { return a.g.optimo / a.g.n - b.g.optimo / b.g.n; }).map(function (x) {
        var g = x.g;
        return '<tr data-item="' + esc(x.r.id) + '"><td>' + nombre(x.r) + '</td><td class="l">' + tira(g) + '</td><td>' + pc(g.optimo / g.n) + '</td><td>' + g.eventosAgotado + '</td><td>' + g.agotado + '</td><td>' + g.bajoAlerta + '</td><td>' + g.sobre + '</td><td>' + (x.real ? 'Real' : 'Simulación') + '</td></tr>';
      }).join('') + '</table><div class="leyenda">' + COLI.map(function (c) { return '<span><i style="background:' + c[1] + '"></i>' + c[2] + '</span>'; }).join('') + '</div></div>';
    h += '<div class="card tw"><h3>Velocidad: frecuencia de orden planeada frente a la observada</h3><table><tr><th>Artículo</th><th>Planeada (verde ÷ ADU)</th><th>Observada (días ÷ órdenes)</th><th>Diferencia</th><th>Órdenes</th></tr>' +
      datos.map(function (x) {
        var p = frec(x.r), o = x.g.frecReal;
        return '<tr data-item="' + esc(x.r.id) + '"><td>' + nombre(x.r) + '</td><td>' + f1(p) + ' días</td><td>' + (o ? f1(o) + ' días' : '—') + '</td><td>' + (o && p ? f1(o - p) : '—') + '</td><td>' + x.g.ordenes + '</td></tr>';
      }).join('') + '</table><p class="nota" style="margin-top:8px">Si la frecuencia observada es mucho menor que la planeada, se está pidiendo más seguido de lo previsto: el buffer puede estar corto o la demanda creció.</p></div>';
    // Movimiento: quién se aceleró y quién dejó de venderse (clave en retail y en productos de vida corta)
    var mov = rows.filter(function (r) { return r.directa; }).map(function (r) { return { r: r, ac: r.aduPasado > 0 && r.adu14 != null ? r.adu14 / r.aduPasado : null }; });
    var rap = mov.filter(function (x) { return x.ac != null && x.ac >= 1.5; }).sort(function (a, b) { return b.ac - a.ac; }).slice(0, 10);
    var len = mov.filter(function (x) { return x.r.diasSinVenta >= R.settings.diasLento; }).sort(function (a, b) { return b.r.diasSinVenta - a.r.diasSinVenta; }).slice(0, 10);
    function tm(arr, vacio) { return arr.length ? '<table><tr><th>Artículo</th><th>ADU de la ventana</th><th>ADU últimos 14 días</th><th>Días sin demanda</th><th>Inventario</th></tr>' + arr.map(function (x) { return '<tr data-item="' + esc(x.r.id) + '"><td>' + nombre(x.r) + '</td><td>' + f1(x.r.aduPasado) + '</td><td>' + f1(x.r.adu14) + '</td><td>' + x.r.diasSinVenta + '</td><td>' + f0(x.r.inventario) + '</td></tr>'; }).join('') + '</table>' : '<p class="nota">' + vacio + '</p>'; }
    h += '<div class="grid2"><div class="card tw"><h3>Se están acelerando</h3>' + tm(rap, 'Ningún artículo vende hoy al menos 1,5 veces su ritmo de la ventana.') + '</div><div class="card tw"><h3>Lentos: ' + R.settings.diasLento + ' días o más sin demanda</h3>' + tm(len, 'Ningún artículo lleva tanto tiempo sin demanda.') + '</div></div>' +
      '<p class="nota" style="margin:-6px 0 16px">Los que se aceleran piden reposición rápida y quizá un ajuste de demanda; los lentos son candidatos a no reponerse y a liberar su espacio.</p>';
    // Integridad de la señal: lo que la app recomendó cada día frente a lo que se aprobó
    var sen = [];
    if (carpeta.h) carpeta.historial.forEach(function (x) { Object.keys(x.m).forEach(function (id) { var a = x.m[id]; if (a[6] > 0 && a.length > 7) sen.push({ f: x.f, id: id, rec: a[6], apr: a[7] || 0 }); }); });
    h += '<div class="card tw"><h3>Integridad de la señal</h3>' + (sen.length ?
      '<table><tr><th>Fecha</th><th>Artículo</th><th>Recomendado</th><th>Aprobado ese día</th><th class="l">Lectura</th></tr>' + sen.slice(-60).reverse().map(function (s) {
        var x = R.byId.get(s.id), t = s.apr === 0 ? 'No se aprobó ese día' : s.apr > s.rec * 1.1 ? 'Se aprobó de más' : s.apr < s.rec * 0.9 ? 'Se aprobó de menos' : 'A tiempo y en cantidad';
        return '<tr><td>' + fecha(s.f) + '</td><td>' + (x ? nombre(x) : esc(s.id)) + '</td><td>' + f0(s.rec) + '</td><td>' + f0(s.apr) + '</td><td class="l">' + t + '</td></tr>';
      }).join('') + '</table>' : '<p class="nota">Compara cada día la orden recomendada con la que se aprobó. Necesita la carpeta de trabajo conectada y que las órdenes se aprueben desde la pestaña Planeación.</p>') + '</div>';
    return h;
  }

  /* ---------- Proyección táctica: capital de trabajo, espacio, capacidad y frecuencia de orden ---------- */
  function vProyeccion() {
    var modo = st.proyModo || 'pron', pct = st.proyPct == null ? 20 : st.proyPct;
    var S2 = Object.assign({}, st.settings, modo === 'pron' ? { modoADU: 'futuro' } : { escalaADU: 1 + pct / 100 });
    var d = datos(), ab = carpeta.h ? abiertas() : [];
    var P = E.compute(datosCalc(), S2), act = conBuffer();
    var h = '<h2>Proyección</h2><p class="sub">Compara los buffers de hoy con los que resultarían si cambia el consumo, con los mismos perfiles y lead times. Sirve para anticipar cuánto capital, espacio y capacidad pedirá el modelo antes de que ocurra.</p>' +
      '<div class="barra"><select id="proyModo"><option value="pron"' + (modo === 'pron' ? ' selected' : '') + '>ADU proyectado = pronóstico de cada artículo</option><option value="pct"' + (modo === 'pct' ? ' selected' : '') + '>ADU proyectado = ADU actual con un cambio porcentual</option></select>' +
      (modo === 'pct' ? '<input type="number" id="proyPct" step="1" value="' + pct + '" style="width:90px"> <span class="nota">% de cambio en la demanda</span>' : '') + '</div>';
    var t = { a: 0, p: 0, am: 0, pm: 0, ea: 0, ep: 0, eam: 0, epm: 0 }, filas = '', hayEst = false;
    act.forEach(function (r) {
      var x = P.byId.get(r.id); if (!x || !x.buffer) return;
      var a = r.objetivo * r.costo, p = x.objetivo * x.costo;
      t.a += a; t.p += p; t.am += r.rangoMax * r.costo; t.pm += x.rangoMax * x.costo;
      if (r.undEstiba > 0) { hayEst = true; t.ea += r.objetivo / r.undEstiba; t.ep += x.objetivo / r.undEstiba; t.eam += r.rangoMax / r.undEstiba; t.epm += x.rangoMax / r.undEstiba; }
      filas += '<tr data-item="' + esc(r.id) + '"><td>' + nombre(r) + '</td><td>' + f1(r.adu) + '</td><td>' + f1(x.adu) + '</td><td>' + f0(r.objetivo) + '</td><td>' + f0(x.objetivo) + '</td><td>$ ' + f0(a) + '</td><td>$ ' + f0(p) + '</td><td>' + (p - a >= 0 ? '+' : '−') + ' $ ' + f0(Math.abs(p - a)) + '</td><td>' + f1(frec(r)) + '</td><td>' + f1(frec(x)) + '</td></tr>';
    });
    h += '<div class="kpis"><div class="kpi"><b>$ ' + f0(t.a) + '</b><span>capital de trabajo promedio hoy</span></div><div class="kpi"><b>$ ' + f0(t.p) + '</b><span>capital de trabajo promedio proyectado</span></div>' +
      '<div class="kpi"><b style="color:' + (t.p > t.a ? '#d64545' : '#3fa35b') + '">' + (t.p >= t.a ? '+' : '−') + ' $ ' + f0(Math.abs(t.p - t.a)) + '</b><span>diferencia (' + pc(t.a ? t.p / t.a - 1 : 0) + ')</span></div>' +
      '<div class="kpi"><b>$ ' + f0(t.pm) + '</b><span>máximo proyectado, con todos en el tope del rango (hoy $ ' + f0(t.am) + ')</span></div></div>';
    h += '<div class="card tw"><h3>Capital de trabajo y frecuencia de orden por artículo</h3><table><tr><th>Artículo</th><th>ADU hoy</th><th>ADU proy.</th><th>Inv. promedio hoy</th><th>Inv. promedio proy.</th><th>Capital hoy</th><th>Capital proy.</th><th>Diferencia</th><th>Días entre órdenes hoy</th><th>Proy.</th></tr>' + filas + '</table>' +
      '<p class="nota" style="margin-top:8px">Inventario promedio = zona roja + mitad de la verde. Máximo del rango = zona roja + zona verde.</p></div>';
    h += '<div class="card"><h3>Espacio</h3>' + (hayEst ? '<div class="kpis" style="margin:0"><div class="kpi"><b>' + f0(Math.ceil(t.ea)) + '</b><span>estibas promedio hoy</span></div><div class="kpi"><b>' + f0(Math.ceil(t.ep)) + '</b><span>estibas promedio proyectadas</span></div><div class="kpi"><b>' + f0(Math.ceil(t.eam)) + '</b><span>estibas máximas hoy</span></div><div class="kpi"><b>' + f0(Math.ceil(t.epm)) + '</b><span>estibas máximas proyectadas</span></div></div>'
      : '<p class="nota">Llene la columna und_estiba de la hoja Articulos para proyectar posiciones de estiba.</p>') + '</div>';
    var rec = {}, cap = {};
    (d.recursos || []).forEach(function (x) { cap[x.recurso] = E.num(x.minutos_dia, 0); });
    R.items.forEach(function (r) { var x = P.byId.get(r.id); opsDe(r).forEach(function (op) { rec[op.recurso] = rec[op.recurso] || { a: 0, p: 0 }; rec[op.recurso].a += r.adu * op.min; rec[op.recurso].p += (x ? x.adu : r.adu) * op.min; }); });
    var nr = Object.keys(rec);
    h += '<div class="card tw"><h3>Carga de los recursos críticos</h3>' + (nr.length ? '<table><tr><th>Recurso</th><th>Minutos disponibles por día</th><th>Carga promedio hoy</th><th>% hoy</th><th>Carga proyectada</th><th>% proyectado</th></tr>' + nr.map(function (k) {
      var c = cap[k] || 0, x = rec[k], pp = c ? x.p / c : null;
      return '<tr><td>' + esc(k) + '</td><td>' + (c ? f0(c) : '—') + '</td><td>' + f0(x.a) + '</td><td>' + (c ? pc(x.a / c) : '—') + '</td><td>' + f0(x.p) + '</td><td>' + (pp == null ? '—' : '<b style="color:' + (pp > 1 ? '#d64545' : pp > 0.85 ? '#b8860b' : '#3fa35b') + '">' + pc(pp) + '</b>') + '</td></tr>';
    }).join('') + '</table><p class="nota" style="margin-top:8px">Carga promedio diaria = ADU × minutos por unidad, sumada por recurso. No incluye tiempos de alistamiento.</p>'
      : '<p class="nota">Llene las columnas recurso y min_und de la hoja Articulos, y la hoja Recursos, para proyectar la carga.</p>') + '</div>';
    if (ab.length) h += '<p class="nota">La proyección no considera las órdenes aprobadas abiertas; solo compara tamaños de buffer.</p>';
    return h;
  }

  function grafico(p) {
    var y = p.y, fc = p.fc, n = y.length, tot = n + fc.length;
    if (!n) return '<p class="nota">No hay periodos completos de historia para graficar.</p>';
    var W = 860, H = 280, L = 52, Rm = 12, T = 12, B = 30, mx = 0, i, ex = p.externo;
    y.concat(fc, ex ? ex.alto : []).forEach(function (v) { if (v > mx) mx = v; });
    mx = mx * 1.08 || 1;
    function X(i) { return L + (W - L - Rm) * (tot > 1 ? i / (tot - 1) : 0); }
    function Y(v) { return T + (H - T - B) * (1 - v / mx); }
    function linea(arr, off) { var s = '', ini = true; arr.forEach(function (v, k) { if (v == null || isNaN(v)) { ini = true; return; } s += (ini ? 'M' : 'L') + X(off + k).toFixed(1) + ' ' + Y(Math.max(0, v)).toFixed(1); ini = false; }); return s; }
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="Historia y pronóstico">';
    for (i = 0; i <= 4; i++) { var v = mx * i / 4; s += '<line x1="' + L + '" x2="' + (W - Rm) + '" y1="' + Y(v) + '" y2="' + Y(v) + '" stroke="#e8eaee"/><text x="' + (L - 6) + '" y="' + (Y(v) + 4) + '" text-anchor="end">' + f0(v) + '</text>'; }
    var lab = p.labels.concat(p.nextLabels), paso = Math.ceil(tot / 12);
    for (i = 0; i < tot; i += paso) s += '<text x="' + X(i) + '" y="' + (H - 10) + '" text-anchor="middle">' + esc(lab[i].length > 7 ? lab[i].slice(5) : lab[i]) + '</text>';
    s += '<line x1="' + X(n - 0.5) + '" x2="' + X(n - 0.5) + '" y1="' + T + '" y2="' + (H - B) + '" stroke="#c9ced6" stroke-dasharray="3 3"/>';
    if (ex && ex.fc.length) {
      var banda = '', k;
      for (k = 0; k < ex.alto.length; k++) banda += (k ? 'L' : 'M') + X(n + k).toFixed(1) + ' ' + Y(ex.alto[k]).toFixed(1);
      for (k = ex.bajo.length - 1; k >= 0; k--) banda += 'L' + X(n + k).toFixed(1) + ' ' + Y(ex.bajo[k]).toFixed(1);
      s += '<path d="' + banda + 'Z" fill="rgba(124,77,196,.16)"/><path d="' + linea(ex.fc, n) + '" fill="none" stroke="#7c4dc4" stroke-width="1.8"/>';
    }
    s += '<path d="' + linea(p.fit, 0) + '" fill="none" stroke="#e9a23b" stroke-width="1.3"/>';
    s += '<path d="' + linea(y, 0) + '" fill="none" stroke="#1c2430" stroke-width="1.8"/>';
    s += '<path d="' + linea([y[n - 1]].concat(fc), n - 1) + '" fill="none" stroke="#1f5fbf" stroke-width="2.2" stroke-dasharray="6 4"/>';
    return s + '</svg><div class="leyenda"><span><i style="background:#1c2430"></i>Demanda real</span><span><i style="background:#e9a23b"></i>Ajuste del método</span><span><i style="background:#1f5fbf"></i>Pronóstico del método ganador</span>' + (ex && ex.fc.length ? '<span><i style="background:#7c4dc4"></i>Modelo preentrenado, con su rango del 10 % al 90 %</span>' : '') + '</div>';
  }

  function vPron() {
    var cands = R.items.filter(function (r) { return r.pron.y.some(function (v) { return v > 0; }); });
    if (!cands.length) return '<h2>Pronósticos</h2><p class="sub">No hay historia de demanda suficiente.</p>';
    var r = R.byId.get(st.pronSel) || cands[0], p = r.pron, per = R.settings.periodo === 'semanal' ? 'semana' : 'mes';
    var h = '<h2>Pronósticos</h2><p class="sub">Cada método se ajusta con la historia y se evalúa sobre los últimos periodos, que no ve al ajustarse. Gana el de menor desviación absoluta media (MAD). El pronóstico solo alimenta el ADU; las órdenes salen de la demanda real.</p>' +
      '<div class="barra"><select id="pronSel">' + cands.map(function (c) { return '<option value="' + esc(c.id) + '"' + (c.id === r.id ? ' selected' : '') + '>' + esc(c.id + ' — ' + c.descripcion) + '</option>'; }).join('') + '</select>' +
      '<span class="nota">Agrupación por ' + per + ' · ' + p.y.length + ' periodos completos · ' + p.prueba + ' de prueba</span></div>';
    h += '<div class="kpis"><div class="kpi"><b>' + f1(r.aduPasado) + '</b><span>ADU pasado (últimos ' + R.settings.ventanaADU + ' días)</span></div>' +
      '<div class="kpi"><b>' + f1(r.aduFuturo) + '</b><span>ADU futuro (pronóstico)</span></div>' +
      '<div class="kpi"><b>' + f1(r.adu) + '</b><span>ADU usado en el buffer (modo ' + R.settings.modoADU + ')</span></div>' +
      '<div class="kpi"><b style="font-size:16px;line-height:32px">' + esc(p.mejor ? p.mejor.nombre : '—') + '</b><span>método ganador ' + esc(p.params || '') + '</span></div></div>';
    h += '<div class="card">' + grafico(p) + '</div>' + vIA(r);
    h += '<div class="card tw"><h3>Comparación de métodos en el tramo de prueba</h3><table><tr><th>Método</th><th>MAD</th><th>MSE</th><th>RMSE</th><th>MAPE</th><th>MPE (sesgo)</th></tr>' +
      p.metodos.map(function (m) { return '<tr' + (p.mejor && m.id === p.mejor.id ? ' class="gan"' : '') + '><td>' + esc(m.nombre) + '</td><td>' + f1(m.mad) + '</td><td>' + f0(m.mse) + '</td><td>' + f1(m.rmse) + '</td><td>' + (m.mape == null ? '—' : f1(m.mape) + ' %') + '</td><td>' + (m.mpe == null ? '—' : f1(m.mpe) + ' %') + '</td></tr>'; }).join('') + '</table>' +
      (p.metodos.length ? '<p class="nota" style="margin-top:8px">MAD: error promedio en unidades. MSE y RMSE castigan más los errores grandes. MAPE: error promedio en porcentaje. MPE cerca de cero indica que el método no sobrestima ni subestima de forma sistemática; negativo es que pronostica de más.</p>' : '<p class="nota">Historia insuficiente para comparar métodos.</p>') + '</div>';
    if (p.acf && p.acf.r.length) {
      var ar = p.acfRes, resOk = ar && ar.r.length ? ar.q <= ar.critico : null;
      h += '<div class="grid2"><div class="card"><h3>Autocorrelación de la demanda</h3><p class="nota" style="margin-top:-4px">Patrón detectado: <b>' + esc(p.patron) + '</b>. Las barras que salen de la franja gris son significativas.</p>' + correlograma(p.acf) + '</div>' +
        '<div class="card"><h3>Autocorrelación de los residuos del método ganador</h3>' + (ar && ar.r.length ? '<p class="nota" style="margin-top:-4px">' + (resOk ? 'Los residuos se comportan como ruido: el método ya capturó el patrón.' : 'Los residuos aún tienen patrón: queda información que el método no aprovecha.') + ' Q de Ljung-Box = ' + f1(ar.q) + ' (valor crítico ' + f1(ar.critico) + ').</p>' + correlograma(ar) : '<p class="nota">No hay suficientes residuos para evaluarlos.</p>') + '</div></div>';
    }
    return h;
  }
  function correlograma(a) {
    var W = 560, H = 190, L = 40, Rm = 10, T = 10, B = 26, K = a.r.length, bw = (W - L - Rm) / K, s = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="Correlograma">';
    function Y(v) { return T + (H - T - B) * (1 - (v + 1) / 2); }
    var arr = '', aba = '';
    a.se.forEach(function (e, k) { var x0 = L + bw * k, x1 = x0 + bw; arr += (k ? 'L' : 'M') + x0.toFixed(1) + ' ' + Y(1.96 * e).toFixed(1) + 'L' + x1.toFixed(1) + ' ' + Y(1.96 * e).toFixed(1); aba = 'L' + x0.toFixed(1) + ' ' + Y(-1.96 * e).toFixed(1) + 'L' + x1.toFixed(1) + ' ' + Y(-1.96 * e).toFixed(1) + aba; });
    s += '<path d="' + arr + aba.replace(/^L/, 'L') + 'Z" fill="#eceef2"/>';
    [-1, -0.5, 0, 0.5, 1].forEach(function (v) { s += '<line x1="' + L + '" x2="' + (W - Rm) + '" y1="' + Y(v) + '" y2="' + Y(v) + '" stroke="' + (v === 0 ? '#98a1b0' : '#e8eaee') + '"/><text x="' + (L - 5) + '" y="' + (Y(v) + 4) + '" text-anchor="end">' + f1(v) + '</text>'; });
    a.r.forEach(function (v, k) {
      var sig = Math.abs(v) > 1.96 * a.se[k], y0 = Y(Math.max(v, 0)), hh = Math.abs(Y(v) - Y(0));
      s += '<rect x="' + (L + bw * k + bw * 0.2).toFixed(1) + '" y="' + y0.toFixed(1) + '" width="' + (bw * 0.6).toFixed(1) + '" height="' + hh.toFixed(1) + '" fill="' + (sig ? '#1f5fbf' : '#a9b4c6') + '"><title>Rezago ' + (k + 1) + ': ' + f2(v) + '</title></rect>';
      if (k === 0 || (k + 1) % (K > 14 ? 3 : 2) === 0) s += '<text x="' + (L + bw * k + bw / 2).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle">' + (k + 1) + '</text>';
    });
    return s + '</svg>';
  }

  function vEstr() {
    var prod = st.modo === 'produccion';
    function hijos(r) { return prod ? r.comps : r.parents; }
    function nodo(r, q, prof) {
      var h = '<li><span data-item="' + esc(r.id) + '"><i class="' + (r.buffer ? 'bf' : 'nb') + '"></i><b>' + esc(r.sku) + '</b>' + (r.ubicacion ? ' · ' + esc(r.ubicacion) : '') + ' <span class="nota">' + esc(r.descripcion) + (q != null && prod ? ' · cantidad ' + f2(q) : '') + ' · lead time ' + f0(r.lt) + ' d' + (r.buffer ? ' · DLT ' + f0(r.dlt) + ' d' : '') + '</span></span>';
      var ch = hijos(r);
      if (ch.length && prof < 12) h += '<ul>' + ch.map(function (c) { return nodo(R.byId.get(c.id), c.q, prof + 1); }).join('') + '</ul>';
      return h + '</li>';
    }
    var raices = R.items.filter(function (r) { return prod ? !r.parents.length : !r.comps.length; });
    var pos = '';
    if (prod) {
      var ps = E.posicionar(datos()).slice(0, 15);
      pos = '<div class="card tw"><h3>Posicionamiento: ¿dónde conviene otro buffer?</h3>' + (ps.length ?
        '<p class="nota" style="margin-top:-4px">Para cada componente sin buffer, cuánto bajaría el lead time desacoplado de los artículos con buffer que dependen de él. Menos DLT es menos zona amarilla y roja en esos artículos, a cambio de mantener inventario del componente.</p>' +
        '<table><tr><th>Si le pone buffer a</th><th>Su propio DLT sería</th><th class="l">Artículos con buffer que mejoran (DLT antes → después)</th><th>Mayor reducción</th></tr>' + ps.map(function (x) {
          return '<tr data-item="' + esc(x.id) + '"><td><b>' + esc(x.sku) + '</b><small>' + esc(x.descripcion) + '</small></td><td>' + f0(x.dltPropio) + ' días</td><td class="l" style="white-space:normal">' + x.afectados.map(function (a) { return esc(a.id) + ' (' + f0(a.antes) + ' → ' + f0(a.despues) + ')'; }).join(', ') + '</td><td><b>' + f0(x.reduccion) + ' días</b></td></tr>';
        }).join('') + '</table>' : '<p class="nota">Ningún componente sin buffer alarga hoy el lead time desacoplado de un artículo con buffer.</p>') + '</div>';
    }
    // Tolerancia del cliente frente al plazo real de cada artículo que se vende
    var tol = R.items.filter(function (r) { return r.tolerancia != null && r.directa; });
    if (tol.length) pos += '<div class="card tw"><h3>Tolerancia del cliente</h3><p class="nota" style="margin-top:-4px">Un artículo con buffer se entrega desde el inventario. Uno sin buffer hace esperar al cliente todo su lead time acumulado; si eso supera lo que el cliente tolera, necesita buffer o un lead time más corto.</p>' +
      '<table><tr><th>Artículo</th><th>El cliente espera hasta</th><th>Plazo real</th><th class="l">Lectura</th></tr>' + tol.slice(0, MAXF).map(function (r) {
        var plazo = r.buffer ? 0 : r.dlt, ok = plazo <= r.tolerancia;
        return '<tr data-item="' + esc(r.id) + '"><td>' + nombre(r) + '</td><td>' + f0(r.tolerancia) + ' días</td><td>' + (r.buffer ? 'Inmediato (con buffer)' : f0(plazo) + ' días') + '</td><td class="l"><b style="color:' + (ok ? '#3fa35b' : '#d64545') + '">' + (ok ? 'Cumple' : 'No cumple: faltan ' + f0(plazo - r.tolerancia) + ' días') + '</b></td></tr>';
      }).join('') + '</table></div>';
    return '<h2>' + (prod ? 'Estructura de producto' : 'Red de distribución') + '</h2><p class="sub">' +
      (prod ? 'Lista de materiales con los puntos de desacople. El lead time desacoplado (DLT) de un artículo es su lead time más la ruta más larga de componentes sin buffer; un componente con buffer corta la acumulación.'
        : 'Cada origen abastece a sus destinos. El buffer del destino usa como lead time el tiempo de traslado; el del origen, el lead time del proveedor y la demanda sumada de sus destinos.') + '</p>' +
      '<div class="card"><ul class="arbol">' + raices.slice(0, 200).map(function (r) { return nodo(r, null, 0); }).join('') + '</ul>' +
      '<div class="leyenda"><span><i class="bf" style="width:10px;height:12px"></i>Con buffer</span><span><i class="nb" style="width:10px;height:12px"></i>Sin buffer</span></div></div>' + pos;
  }

  var COLS = {
    Articulos: [['sku', 'Código del artículo (obligatorio)'], ['descripcion', 'Nombre'], ['ubicacion', 'Bodega o sede; déjela vacía si solo hay una'], ['origen', 'Distribución: ubicación que abastece a esta'], ['tipo', 'Comprado, Fabricado o Trasladado (informativo)'], ['lead_time', 'Días de compra, fabricación o traslado'], ['moq', 'Pedido mínimo'], ['multiplo', 'Múltiplo de pedido'], ['ciclo_pedido', 'Días entre pedidos impuestos'], ['buffer', 'S si lleva buffer, N si no'], ['tipo_buffer', 'Vacío = reposición normal; MM = mín-máx (sin zona amarilla); RO = zonas manuales; LT = sin buffer pero vigilado por lead time'], ['zona_roja', 'Solo RO: valor manual de la zona roja'], ['zona_amarilla', 'Solo RO: valor manual de la zona amarilla'], ['zona_verde', 'Solo RO: valor manual de la zona verde'],['factor_lt', 'Opcional: reemplaza el factor de lead time automático'], ['factor_var', 'Opcional: reemplaza el factor de variabilidad automático'], ['daf', 'Factor de ajuste de demanda (1 = sin ajuste)'], ['inventario', 'Disponible hoy'], ['costo', 'Costo unitario'], ['und_estiba', 'Opcional: unidades por estiba, para proyectar espacio'], ['recurso', 'Opcional: recurso crítico que lo fabrica'], ['min_und', 'Opcional: minutos de ese recurso por unidad'], ['proveedor', 'Opcional: proveedor, para armar pedidos con mínimo de compra'], ['perfil', 'Opcional: perfil de buffer asignado a mano, por ejemplo PLH. Vacío = se calcula solo'], ['min_exhibicion', 'Opcional (retail): unidades mínimas de exhibición; la zona roja no baja de ahí y las zonas quedan en enteros'], ['tolerancia_cliente', 'Opcional: días que el cliente está dispuesto a esperar']],
    Rutas: [['sku', 'Código del artículo fabricado'], ['secuencia', 'Orden de la operación: 10, 20, 30…'], ['recurso', 'Recurso donde se hace'], ['min_und', 'Minutos por unidad'], ['alistamiento_min', 'Opcional: minutos de alistamiento; vacío = el del recurso']],
    Festivos: [['fecha', 'Día no laborable']],
    Descuentos: [['sku', 'Código'], ['ubicacion', 'Ubicación, si aplica'], ['cantidad_desde', 'Cantidad del pedido desde la que aplica'], ['descuento_pct', 'Descuento en porcentaje']],
    Rangos: [['tipo', 'Tipo de artículo: M fabricado, P comprado, D distribuido, I intermedio'], ['lt_corto_max', 'Hasta cuántos días el lead time es corto para ese tipo'], ['lt_medio_max', 'Hasta cuántos días es medio; por encima es largo']],
    Perfiles: [['perfil', 'Código de tres letras: tipo (M, P, D, I) + lead time (L largo, M medio, S corto) + variabilidad (H alta, M media, L baja)'], ['factor_lt', 'Factor de lead time para ese perfil'], ['factor_var', 'Factor de variabilidad para ese perfil']],
    Proveedores: [['proveedor', 'Nombre del proveedor'], ['minimo_valor', 'Valor mínimo de un pedido (condición comercial)'], ['minimo_estibas', 'Estibas para llenar el camión o contenedor (flete gratis o completo)']],
    Ajustes: [['sku', 'Código'], ['ubicacion', 'Ubicación, si aplica'], ['tipo', 'demanda, verde, amarilla, roja o lead_time'], ['factor', 'Multiplicador: 1,3 sube 30 %; 0,8 baja 20 %'], ['desde', 'Fecha desde la que aplica (vacía = siempre)'], ['hasta', 'Fecha hasta la que aplica (vacía = sin fin)']],
    Recursos: [['recurso', 'Nombre del recurso crítico'], ['minutos_dia', 'Minutos disponibles por día laborable'], ['dias_semana', 'Días que trabaja por semana: 5, 6 o 7 (vacío = 7)'], ['alistamiento_min', 'Minutos de alistamiento por orden']],
    Estructura: [['padre', 'Código del artículo que consume'], ['componente', 'Código del componente'], ['cantidad', 'Cantidad por unidad del padre']],
    Historia: [['fecha', 'Fecha de la venta o consumo'], ['sku', 'Código'], ['ubicacion', 'Ubicación, si aplica'], ['cantidad', 'Unidades']],
    Pedidos: [['sku', 'Código'], ['ubicacion', 'Ubicación, si aplica'], ['fecha', 'Fecha de entrega prometida'], ['cantidad', 'Unidades pendientes']],
    Suministro: [['sku', 'Código'], ['ubicacion', 'Ubicación, si aplica'], ['fecha', 'Fecha esperada de llegada'], ['cantidad', 'Unidades en tránsito o en proceso']]
  };
  function vDatos() {
    var d = datos();
    var h = '<h2>Datos · ' + (st.modo === 'produccion' ? 'Producción' : 'Distribución') + '</h2><p class="sub">Cargue un libro de Excel con las hojas descritas abajo. El archivo se lee en este navegador; nada se sube a internet. Cada enfoque guarda sus propios datos.</p>';
    if (st.msg) h += '<div class="aviso ' + st.msg.t + '">' + st.msg.h + '</div>';
    if (R.avisos.length) h += '<div class="aviso"><b>Avisos del cálculo</b><br>' + R.avisos.map(esc).join('<br>') + '</div>';
    h += vCarpeta();
    h += '<div class="card"><h3>Carga manual</h3><div class="barra"><label class="btn' + (carpeta.h ? '' : ' pri') + '">Cargar Excel<input type="file" id="archivo" accept=".xlsx,.xls" hidden></label>' +
      '<button class="btn" data-act="plantilla">Descargar los datos actuales como plantilla</button>' +
      '<button class="btn" data-act="ejemplo">Volver a los datos de ejemplo</button></div>' +
      '<p class="nota">' + (d.ejemplo ? 'Datos de ejemplo ficticios. ' : 'Datos cargados por usted. ') + f0(d.articulos.length) + ' artículos · ' + f0((d.estructura || []).length) + ' relaciones de estructura · ' + f0((d.historia || []).length) + ' filas de historia · ' + f0((d.pedidos || []).length) + ' pedidos · ' + f0((d.suministro || []).length) + ' órdenes de suministro.</p></div>';
    Object.keys(COLS).forEach(function (hoja) {
      if (['Estructura', 'Recursos', 'Rutas', 'Festivos'].indexOf(hoja) >= 0 && st.modo !== 'produccion') return;
      h += '<div class="card tw"><h3>Hoja «' + hoja + '»</h3><table><tr><th>Columna</th><th class="l">Contenido</th></tr>' +
        COLS[hoja].map(function (c) { return '<tr><td><code>' + c[0] + '</code></td><td class="l">' + c[1] + '</td></tr>'; }).join('') + '</table></div>';
    });
    return h;
  }

  var CAMPOS = [
    ['modoADU', 'ADU: de dónde sale', 'sel', [['pasado', 'Pasado (historia)'], ['futuro', 'Futuro (pronóstico)'], ['mixto', 'Mixto (promedio de ambos)']]],
    ['ventanaADU', 'ADU: días de la ventana', 'num'],
    ['periodo', 'Pronóstico: agrupar la historia por', 'sel', [['mensual', 'Mes (estacionalidad de 12)'], ['semanal', 'Semana (estacionalidad de 52)']]],
    ['hoy', 'Fecha de planeación (vacía = hoy)', 'date'],
    ['ltCortoMax', 'Lead time corto: hasta (días)', 'num'], ['ltMedioMax', 'Lead time medio: hasta (días)', 'num'],
    ['fLTcorto', 'Factor de lead time corto', 'num'], ['fLTmedio', 'Factor de lead time medio', 'num'], ['fLTlargo', 'Factor de lead time largo', 'num'],
    ['cvBajoMax', 'Variabilidad baja: CV hasta', 'num'], ['cvMedioMax', 'Variabilidad media: CV hasta', 'num'],
    ['fVarBaja', 'Factor de variabilidad baja', 'num'], ['fVarMedia', 'Factor de variabilidad media', 'num'], ['fVarAlta', 'Factor de variabilidad alta', 'num'],
    ['picoUmbral', 'Pico calificado: fracción de la zona roja', 'num'], ['alertaOH', 'Alerta roja de inventario: fracción de la zona roja', 'num'], ['alertaADU', 'Alerta de ADU: cambio que se resalta (0,25 = 25 %)', 'num'], ['tasaInv', 'Costo anual de mantener inventario (0,24 = 24 %)', 'num'], ['diasLento', 'Días sin demanda para marcar un artículo como lento', 'num']
  ];
  function vAjustes() {
    var S = R.settings;
    return '<h2>Ajustes</h2><p class="sub">Parámetros generales del cálculo. Los rangos de lead time y de variabilidad dependen de cada empresa: ajústelos a su realidad. Un artículo puede llevar sus propios factores en las columnas <code>factor_lt</code> y <code>factor_var</code>.</p>' +
      '<div class="card"><div class="form">' + CAMPOS.map(function (c) {
        var v = S[c[0]], inp;
        if (c[2] === 'sel') inp = '<select data-set="' + c[0] + '">' + c[3].map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === v ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>';
        else if (c[2] === 'date') inp = '<input type="date" data-set="' + c[0] + '" value="' + esc(v || '') + '">';
        else inp = '<input type="number" step="any" min="0" data-set="' + c[0] + '" value="' + esc(v) + '">';
        return '<label>' + c[1] + inp + '</label>';
      }).join('') + '</div><p style="margin:16px 0 0"><button class="btn" data-act="reset">Restablecer valores iniciales</button></p></div>';
  }

  function vAyuda() {
    return '<div class="ayuda"><h2>Cómo se calcula</h2><div class="card">' +
      '<h3>1. Consumo promedio diario (ADU)</h3><p>Promedio diario de la demanda en la ventana elegida. Para un componente o un centro de distribución, la demanda es la propia más la de todos los artículos que lo consumen, multiplicada por la cantidad de la estructura.</p>' +
      '<h3>2. Lead time desacoplado (DLT)</h3><p>Lead time propio más la ruta más larga de componentes sin buffer. Un componente con buffer está disponible y no suma tiempo.</p>' +
      '<h3>3. Zonas del buffer</h3><ul><li><b>Amarilla</b> = <code>ADU × DLT</code></li><li><b>Roja base</b> = <code>ADU × DLT × factor de lead time</code></li><li><b>Roja de seguridad</b> = <code>roja base × factor de variabilidad</code></li><li><b>Verde</b> = el mayor entre <code>ADU × DLT × factor de lead time</code>, el pedido mínimo y <code>ciclo de pedido × ADU</code></li></ul>' +
      '<p>Tope rojo = roja. Tope amarillo = roja + amarilla. Tope verde = roja + amarilla + verde.</p>' +
      '<p><b>Índice de flujo.</b> <code>Zona verde ÷ ADU</code> da la frecuencia de orden planeada, en días. La pestaña Buffers agrupa los artículos por esa frecuencia para ver cuáles se mueven muy lento (zona verde desproporcionada, casi siempre por el pedido mínimo) y cuáles muy rápido.</p>' +
      '<h3>4. Planeación</h3><p><code>Flujo neto = disponible + en tránsito − demanda calificada</code>. La demanda calificada suma los pedidos vencidos y de hoy, los picos futuros dentro del DLT que superan el umbral, y las órdenes sugeridas hoy para los artículos que consumen este. Si el flujo neto es menor o igual al tope amarillo, se sugiere una orden por <code>tope verde − flujo neto</code>, ajustada al pedido mínimo y al múltiplo. La prioridad es <code>flujo neto ÷ tope verde</code>.</p>' +
      '<h3>5. Ejecución</h3><p>Compara el inventario disponible con la zona roja para alertar sobre órdenes abiertas que conviene acelerar.</p>' +
      '<h3>6. Pronósticos</h3><p>Métodos clásicos de series de tiempo: ingenuo, ingenuo estacional, promedios móviles simples y doble, suavización exponencial simple, Holt, Winters aditivo y multiplicativo, descomposición multiplicativa y regresión de tendencia. Medidas de error: MAD, MSE, RMSE, MAPE y MPE. El correlograma muestra la autocorrelación de la demanda para reconocer tendencia o estacionalidad, y la de los residuos (con el estadístico Q de Ljung-Box) para saber si el método ya capturó el patrón.</p>' +
      '<h3>7. Carpeta de trabajo</h3><p>Al conectar una carpeta local en la pestaña Datos, la app lee de ahí <code>datos.xlsx</code>, guarda una foto diaria de los buffers y lleva el registro de órdenes aprobadas. Una orden aprobada cuenta como suministro en tránsito y sigue generando demanda en sus componentes u origen hasta que se cierra.</p>' +
      '<h3>Perfiles de buffer</h3><p>Cada artículo con buffer pertenece a un perfil de tres letras: tipo de artículo (M fabricado, P comprado, D distribuido, I intermedio), categoría de lead time (L, M, S) y categoría de variabilidad (H, M, L). Lo que cuenta como lead time corto o largo se define por tipo en la hoja Rangos, porque 15 días son muchos para un fabricado y pocos para un importado. Los factores se asignan por perfil en la hoja Perfiles; si un perfil no aparece ahí, usa los valores de la pestaña Ajustes. El perfil se calcula solo, o se fija a criterio propio en la columna perfil.</p>' +
      '<h3>8. Tipos de buffer y ajustes planeados</h3><ul><li><b>Reposición</b>: las tres zonas calculadas. <b>Mín-máx</b> (MM): solo roja y verde. <b>Manual</b> (RO): zonas fijadas por una restricción, como espacio o caja.</li>' +
      '<li><b>Ajustes planeados</b> (hoja Ajustes): factores con fecha de inicio y fin sobre la demanda, sobre cada zona o sobre el lead time, para temporadas, promociones, entradas y salidas de producto o interrupciones de una ruta.</li></ul>' +
      '<h3>9. Alertas de ejecución</h3><ul><li><b>Inventario hoy</b>: disponible frente a la zona roja.</li><li><b>Inventario proyectado</b>: día a día durante un DLT, sumando suministros esperados y restando la mayor entre el ADU y la demanda conocida.</li>' +
      '<li><b>Sincronización de materiales</b>: componentes u orígenes con menos disponible de lo que hoy les piden.</li><li><b>Lead time</b>: órdenes de artículos sin buffer marcados LT que entran al último tercio de su lead time, dividido en verde, amarillo y rojo.</li></ul>' +
      '<h3>10. Analítica y proyección</h3><p>La analítica mide cuánto tiempo estuvo cada buffer en su rango óptimo (tope rojo a tope rojo + verde), los agotados, el exceso, la frecuencia de orden planeada frente a la observada y, con carpeta de trabajo, la orden recomendada frente a la aprobada. La proyección compara capital de trabajo (<code>roja + verde ÷ 2</code> por costo), espacio, carga de recursos (<code>ADU × minutos por unidad</code>) y frecuencia de orden entre hoy y un escenario de demanda.</p>' +
      '<h3>11. Posicionamiento</h3><p>En Estructura, para cada componente sin buffer se calcula cuánto bajaría el DLT de los artículos con buffer si se le pusiera uno.</p>' +
      '<h3>12. Modelo preentrenado, ARIMA y regresión</h3><p>En Pronósticos compiten además un modelo ARIMA (se diferencia la serie, se prueban órdenes p y q de 0 a 2 y se elige por AIC corregido), una regresión con tendencia y variables estacionales, y, si usted lo activa, un modelo fundacional preentrenado (t0-alpha) que corre en este navegador. Todos se miden en el mismo tramo de prueba; el preentrenado solo se usa en los artículos donde gana.</p>' +
      '<h3>13. Armado de pedidos y secuencia</h3><p>En Planeación, los pedidos se agrupan por proveedor y, si no alcanzan el mínimo de compra, se completan con los artículos de menor prioridad de buffer sin pasar del tope verde. Las órdenes de cada recurso crítico se ordenan por prioridad de buffer y se cargan contra los minutos disponibles por día para estimar cuándo terminarían.</p>' +
      '<h3>14. Programación de recursos</h3><p>Con la hoja Rutas cada artículo fabricado puede pasar por varias operaciones. La programación es finita y hacia adelante: las órdenes entran por prioridad de buffer, cada operación empieza cuando terminó la anterior y el recurso está libre, y se respetan el alistamiento, los días que trabaja cada recurso y la hoja Festivos.</p>' +
      '<h3>15. Descuentos y llenado de camión</h3><p>Con la hoja Descuentos se compara el ahorro de subir al siguiente escalón de precio con el costo de mantener las unidades adicionales. Con <code>minimo_estibas</code> en la hoja Proveedores, el pedido se completa con estibas enteras del artículo de menor prioridad, sin pasar ninguno del tope verde.</p>' +
      '<h3>16. Retail</h3><p>Con <code>min_exhibicion</code> la zona roja no baja del mínimo de exhibición y las zonas quedan en unidades enteras: roja y verde se redondean hacia arriba y la amarilla al entero más cercano. El libro deja la regla exacta a cada empresa; esta es una regla razonable que usted puede discutir. La pestaña Analítica separa los artículos que se aceleran de los que dejaron de venderse.</p>' +
      '<h3>Alcance de esta versión</h3><p>Los artículos sin buffer no se planean aquí: su demanda se traslada a sus componentes. La programación no maneja horas extra, solapes entre operaciones, recursos alternos ni secuencias que minimicen alistamientos. La regresión múltiple con variables externas (precio, clima, promociones) no está incluida porque exige cargar esas variables.</p>' +
      '<p class="nota">DDMRP es una marca del Demand Driven Institute. Esta herramienta es independiente y no está certificada por esa entidad.</p></div></div>';
  }

  function vDetalle(r) {
    var h = '<button class="x" data-act="cerrar" aria-label="Cerrar">×</button><h2>' + esc(r.sku) + (r.ubicacion ? ' · ' + esc(r.ubicacion) : '') + '</h2><p class="sub">' + esc(r.descripcion) + (r.tipo ? ' · ' + esc(r.tipo) : '') + '</p>';
    if (!r.buffer) return h + '<div class="aviso">Artículo sin buffer. No se planea aquí; su demanda se traslada a sus componentes.</div><dl><dt>Lead time</dt><dd>' + f0(r.lt) + ' días</dd><dt>Lead time acumulado hasta el siguiente buffer</dt><dd>' + f0(r.dlt) + ' días</dd><dt>ADU</dt><dd>' + f1(r.adu) + '</dd></dl>';
    h += barra(r) + LEY + '<h3 style="margin-top:16px">Zonas</h3><div class="calc">' +
      '<div><span>ADU' + (r.daf !== 1 ? ' (con ajuste × ' + f2(r.daf) + ')' : '') + '</span><b>' + f2(r.adu) + '</b></div>' +
      '<div><span>DLT = lead time ' + f0(r.lt) + ' + componentes sin buffer ' + f0(r.dlt - r.lt) + '</span><b>' + f0(r.dlt) + ' días</b></div>' +
      '<div><span>Factor de lead time (' + (r.fLTmanual ? 'manual' : r.catLT) + ')</span><b>' + f2(r.fLT) + '</b></div>' +
      '<div><span>Factor de variabilidad (' + (r.fVarManual ? 'manual' : r.catVar + ', CV ' + f2(r.cv)) + ')</span><b>' + f2(r.fVar) + '</b></div><hr>' +
      '<div><span>Amarilla = ' + f2(r.adu) + ' × ' + f0(r.dlt) + '</span><b>' + f0(r.amarilla) + '</b></div>' +
      '<div><span>Roja base = amarilla × ' + f2(r.fLT) + '</span><b>' + f0(r.rojaBase) + '</b></div>' +
      '<div><span>Roja de seguridad = roja base × ' + f2(r.fVar) + '</span><b>' + f0(r.rojaSeg) + '</b></div>' +
      '<div><span>Verde (por ' + esc(r.verdePor) + ')</span><b>' + f0(r.verde) + '</b></div><hr>' +
      '<div><span>Tope rojo / amarillo / verde</span><b>' + f0(r.tor) + ' / ' + f0(r.toy) + ' / ' + f0(r.tog) + '</b></div></div>';
    h += '<h3>Flujo neto de hoy</h3><div class="calc"><div><span>Disponible</span><b>' + f0(r.inventario) + '</b></div><div><span>+ En tránsito</span><b>' + f0(r.enTransito) + '</b></div>' +
      '<div><span>− Pedidos vencidos y de hoy</span><b>' + f0(r.demVencida) + '</b></div>' +
      '<div><span>− Picos calificados (más de ' + f0(r.umbralPico) + ' en un día)</span><b>' + f0(r.demPicos) + '</b></div>' +
      '<div><span>− Demanda de artículos que lo consumen</span><b>' + f0(r.demDependiente) + '</b></div><hr>' +
      '<div><span>Flujo neto</span><b>' + f0(r.flujoNeto) + ' ' + chip(r.colorPlan, pc(r.prioridad)) + '</b></div>' +
      '<div><span>Orden sugerida</span><b>' + (r.orden ? f0(r.orden) + ' para el ' + fecha(r.fechaReq) : 'No requiere') + '</b></div></div>';
    var ajs = [];
    if (r.aj.demanda !== 1) ajs.push('demanda × ' + f2(r.aj.demanda));
    if (r.aj.roja !== 1) ajs.push('zona roja × ' + f2(r.aj.roja));
    if (r.aj.amarilla !== 1) ajs.push('zona amarilla × ' + f2(r.aj.amarilla));
    if (r.aj.verde !== 1) ajs.push('zona verde × ' + f2(r.aj.verde));
    if (r.aj.lead_time !== 1) ajs.push('lead time × ' + f2(r.aj.lead_time));
    h += '<dl><dt>Perfil de buffer' + (r.perfilManual ? ' (asignado a mano)' : '') + '</dt><dd><b>' + r.perfil + '</b> — ' + perfilTexto(r.perfil) + '</dd><dt>Tipo de buffer</dt><dd>' + TIPOB[r.tipoBuf] + '</dd>' + (r.minExh > 0 ? '<dt>Mínimo de exhibición</dt><dd>' + f0(r.minExh) + (r.rojaPorExh ? ' (define la zona roja)' : '') + ' · zonas en enteros</dd>' : '') + (ajs.length ? '<dt>Ajustes planeados vigentes</dt><dd>' + ajs.join(', ') + '</dd>' : '') +
      '<dt>Estado de ejecución</dt><dd>' + chip(r.colorEjec, NOMBRE[r.colorEjec]) + '</dd><dt>Inventario proyectado (mínimo ' + f0(r.proyMin) + ' el ' + fecha(r.proyDia) + ')</dt><dd>' + chip(r.colorProy, NOMBRE[r.colorProy]) + '</dd>' +
      '<dt>Rango promedio de inventario</dt><dd>' + f0(r.tor) + ' a ' + f0(r.rangoMax) + '</dd><dt>Días entre órdenes (verde ÷ ADU)</dt><dd>' + f1(r.frecuencia) + '</dd><dt>Órdenes abiertas en promedio (amarilla ÷ verde)</dt><dd>' + f1(r.ordenesAbiertasProm) + '</dd>' +
      '<dt>Inventario promedio objetivo</dt><dd>' + f0(r.objetivo) + '</dd><dt>Método de pronóstico ganador</dt><dd>' + esc(r.pron.mejor ? r.pron.mejor.nombre : '—') + '</dd></dl>';
    var sm = E.simular(r, R, 120);
    if (sm) h += '<h3>Últimos 120 días (simulación)</h3>' + chartTiempo(sm, 260, true) + '<p style="margin:8px 0 14px"><button class="btn pri" data-act="vertiempo" data-id="' + esc(r.id) + '">Ver en el tiempo</button></p>';
    if (r.pron.y.some(function (v) { return v > 0; })) h += '<button class="btn" data-act="verpron" data-id="' + esc(r.id) + '">Ver pronóstico</button>';
    return h;
  }

  /* ---------- Excel y CSV ---------- */
  function norm(s) { return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim().replace(/[\s\-]+/g, '_'); }
  function leerLibro(wb) {
    var hojas = {};
    wb.SheetNames.forEach(function (n) {
      hojas[norm(n)] = window.XLSX.utils.sheet_to_json(wb.Sheets[n], { defval: '' }).map(function (row) {
        var o = {}; Object.keys(row).forEach(function (k) { o[norm(k)] = row[k]; }); return o;
      });
    });
    if (!hojas.articulos || !hojas.articulos.length) throw new Error('El libro no tiene una hoja «Articulos» con filas.');
    function txt(v) { return String(v == null ? '' : v).trim(); }
    var err = [];
    var d = { modo: st.modo, ejemplo: false, pedidos: [], suministro: [], historia: [], estructura: [] };
    d.articulos = hojas.articulos.filter(function (a) { return txt(a.sku); }).map(function (a) {
      var b = norm(txt(a.buffer));
      return { sku: txt(a.sku), descripcion: txt(a.descripcion), ubicacion: txt(a.ubicacion), origen: txt(a.origen), tipo: txt(a.tipo),
        lead_time: E.num(a.lead_time, 0), moq: E.num(a.moq, 0), multiplo: E.num(a.multiplo, 0), ciclo_pedido: E.num(a.ciclo_pedido, 0),
        buffer: ['s', 'si', '1', 'x', 'true', 'y', 'yes'].indexOf(b) >= 0, factor_lt: a.factor_lt, factor_var: a.factor_var,
        daf: E.num(a.daf, 1), inventario: E.num(a.inventario, 0), costo: E.num(a.costo, 0),
        tipo_buffer: txt(a.tipo_buffer).toUpperCase(), zona_roja: a.zona_roja, zona_amarilla: a.zona_amarilla, zona_verde: a.zona_verde,
        und_estiba: a.und_estiba, recurso: txt(a.recurso), min_und: a.min_und, proveedor: txt(a.proveedor), perfil: txt(a.perfil).toUpperCase(), min_exhibicion: a.min_exhibicion, tolerancia_cliente: a.tolerancia_cliente };
    });
    d.rutas = (hojas.rutas || []).filter(function (x) { return txt(x.sku) && txt(x.recurso); }).map(function (x) { return { sku: txt(x.sku), secuencia: E.num(x.secuencia, 0), recurso: txt(x.recurso), min_und: E.num(x.min_und, 0), alistamiento_min: x.alistamiento_min }; });
    d.festivos = (hojas.festivos || []).map(function (x) { return { fecha: E.parseDate(x.fecha) }; }).filter(function (x) { return x.fecha; });
    d.descuentos = (hojas.descuentos || []).filter(function (x) { return txt(x.sku); }).map(function (x) { return { sku: txt(x.sku), ubicacion: txt(x.ubicacion), cantidad_desde: E.num(x.cantidad_desde, 0), descuento_pct: E.num(x.descuento_pct, 0) }; });
    d.rangos = (hojas.rangos || []).filter(function (x) { return txt(x.tipo); }).map(function (x) { return { tipo: txt(x.tipo), lt_corto_max: E.num(x.lt_corto_max, null), lt_medio_max: E.num(x.lt_medio_max, null) }; });
    d.perfiles = (hojas.perfiles || []).filter(function (x) { return txt(x.perfil); }).map(function (x) { return { perfil: txt(x.perfil).toUpperCase(), factor_lt: E.num(x.factor_lt, null), factor_var: E.num(x.factor_var, null) }; });
    d.proveedores = (hojas.proveedores || []).filter(function (x) { return txt(x.proveedor); }).map(function (x) { return { proveedor: txt(x.proveedor), minimo_valor: E.num(x.minimo_valor, 0), minimo_estibas: E.num(x.minimo_estibas, 0) }; });
    d.ajustes = (hojas.ajustes || []).filter(function (x) { return txt(x.sku) && txt(x.tipo); }).map(function (x) {
      return { sku: txt(x.sku), ubicacion: txt(x.ubicacion), tipo: norm(txt(x.tipo)), factor: E.num(x.factor, 1), desde: E.parseDate(x.desde) || '', hasta: E.parseDate(x.hasta) || '' };
    });
    d.recursos = (hojas.recursos || []).filter(function (x) { return txt(x.recurso); }).map(function (x) { return { recurso: txt(x.recurso), minutos_dia: E.num(x.minutos_dia, 0), dias_semana: x.dias_semana, alistamiento_min: x.alistamiento_min }; });
    if (st.modo === 'produccion') d.estructura = (hojas.estructura || []).filter(function (e) { return txt(e.padre) && txt(e.componente); }).map(function (e) { return { padre: txt(e.padre), componente: txt(e.componente), cantidad: E.num(e.cantidad, 1) }; });
    function mov(rows, nombreHoja) {
      var malas = 0, out = [];
      (rows || []).forEach(function (r) {
        var f = E.parseDate(r.fecha);
        if (!txt(r.sku)) return;
        if (!f) { malas++; return; }
        out.push({ sku: txt(r.sku), ubicacion: txt(r.ubicacion), fecha: f, cantidad: E.num(r.cantidad, 0) });
      });
      if (malas) err.push(malas + ' filas de «' + nombreHoja + '» sin fecha válida se omitieron.');
      return out;
    }
    d.historia = mov(hojas.historia, 'Historia'); d.pedidos = mov(hojas.pedidos, 'Pedidos'); d.suministro = mov(hojas.suministro, 'Suministro');
    if (!d.historia.length) err.push('No se encontró historia de demanda: los buffers quedarán en cero.');
    if (!d.articulos.some(function (a) { return a.buffer; })) err.push('Ningún artículo tiene «S» en la columna buffer.');
    return { d: d, err: err };
  }
  function importar(file) {
    if (!window.XLSX) { st.msg = { t: 'err', h: 'No se pudo cargar el lector de Excel. Revise la conexión a internet y recargue la página.' }; render(); return; }
    var rd = new FileReader();
    rd.onload = function (ev) {
      try {
        var x = leerLibro(window.XLSX.read(ev.target.result, { type: 'array', cellDates: true }));
        st.datos[st.modo] = x.d; guardar(); recalc();
        st.msg = { t: x.err.length ? '' : 'ok', h: '<b>Archivo cargado:</b> ' + esc(file.name) + (x.err.length ? '<br>' + x.err.map(esc).join('<br>') : '') };
      } catch (e) { st.msg = { t: 'err', h: '<b>No se pudo leer el archivo.</b> ' + esc(e.message) }; }
      render();
    };
    rd.readAsArrayBuffer(file);
  }
  function plantilla() {
    if (!window.XLSX) { st.msg = { t: 'err', h: 'No se pudo cargar el generador de Excel. Revise la conexión a internet y recargue la página.' }; render(); return; }
    window.XLSX.writeFile(libroActual(), 'planeacion-abastecimiento-' + st.modo + '.xlsx');
  }
  function libroActual() {
    var d = datos(), X = window.XLSX, wb = X.utils.book_new();
    function hoja(n, rows, cols) { X.utils.book_append_sheet(wb, X.utils.json_to_sheet(rows, { header: cols }), n); }
    hoja('Articulos', d.articulos.map(function (a) { return Object.assign({}, a, { buffer: a.buffer ? 'S' : 'N' }); }), COLS.Articulos.map(function (c) { return c[0]; }));
    if (st.modo === 'produccion') hoja('Estructura', d.estructura || [], ['padre', 'componente', 'cantidad']);
    hoja('Historia', d.historia || [], ['fecha', 'sku', 'ubicacion', 'cantidad']);
    hoja('Pedidos', d.pedidos || [], ['sku', 'ubicacion', 'fecha', 'cantidad']);
    hoja('Suministro', d.suministro || [], ['sku', 'ubicacion', 'fecha', 'cantidad']);
    hoja('Ajustes', d.ajustes || [], ['sku', 'ubicacion', 'tipo', 'factor', 'desde', 'hasta']);
    hoja('Proveedores', d.proveedores || [], ['proveedor', 'minimo_valor', 'minimo_estibas']);
    hoja('Descuentos', d.descuentos || [], ['sku', 'ubicacion', 'cantidad_desde', 'descuento_pct']);
    if (st.modo === 'produccion') { hoja('Rutas', d.rutas || [], ['sku', 'secuencia', 'recurso', 'min_und', 'alistamiento_min']); hoja('Festivos', d.festivos || [], ['fecha']); }
    hoja('Rangos', d.rangos || [], ['tipo', 'lt_corto_max', 'lt_medio_max']);
    hoja('Perfiles', d.perfiles || [], ['perfil', 'factor_lt', 'factor_var']);
    if (st.modo === 'produccion') hoja('Recursos', d.recursos || [], ['recurso', 'minutos_dia', 'dias_semana', 'alistamiento_min']);
    return wb;
  }

  /* ---------- Carpeta de trabajo: el repositorio local de cada empresa ---------- */
  var soportaCarpeta = typeof window.showDirectoryPicker === 'function';
  function idb(op, valor) {
    return new Promise(function (ok) {
      try {
        var rq = indexedDB.open('flujolibre', 1);
        rq.onupgradeneeded = function () { rq.result.createObjectStore('kv'); };
        rq.onerror = function () { ok(null); };
        rq.onsuccess = function () {
          var tx = rq.result.transaction('kv', op === 'get' ? 'readonly' : 'readwrite'), s = tx.objectStore('kv');
          if (op === 'get') { var g = s.get('carpeta'); g.onsuccess = function () { ok(g.result || null); }; g.onerror = function () { ok(null); }; return; }
          if (valor) s.put(valor, 'carpeta'); else s.delete('carpeta');
          tx.oncomplete = function () { ok(true); }; tx.onerror = function () { ok(null); };
        };
      } catch (e) { ok(null); }
    });
  }
  async function leerTexto(dir, nombre) { try { var fh = await dir.getFileHandle(nombre); return await (await fh.getFile()).text(); } catch (e) { return null; } }
  async function escribir(dir, nombre, contenido) {
    var fh = await dir.getFileHandle(nombre, { create: true }), w = await fh.createWritable();
    await w.write(contenido); await w.close();
  }
  function dirModo() { return carpeta.h.getDirectoryHandle(st.modo, { create: true }); }
  function aprobadoHoy(r) {
    var t = 0;
    carpeta.ordenes.forEach(function (o) { if (o.creada === R.hoy && o.sku === r.sku && (o.ubicacion || '') === r.ubicacion) t += o.cantidad; });
    return t;
  }
  function foto() {
    return { f: R.hoy, items: conBuffer().map(function (r) { return [r.id, Math.round(r.inventario), Math.round(r.flujoNeto), Math.round(r.tor), Math.round(r.toy), Math.round(r.tog), r.orden + aprobadoHoy(r), aprobadoHoy(r)]; }) };
  }
  function ponerFoto(o) {
    var m = {}; (o.items || []).forEach(function (a) { m[a[0]] = a; });
    carpeta.historial = carpeta.historial.filter(function (x) { return x.f !== o.f; });
    carpeta.historial.push({ f: o.f, m: m });
    carpeta.historial.sort(function (a, b) { return a.f < b.f ? -1 : 1; });
  }
  function serieReal(id) {
    if (!carpeta.h) return [];
    var out = [];
    carpeta.historial.forEach(function (x) { var a = x.m[id]; if (a) out.push({ f: x.f, oh: a[1], nfp: a[2], roja: a[3], toy: a[4], tog: a[5], pide: a[6] }); });
    return out;
  }
  function resumenReal(d) {
    var s = 0, b = 0, o = 0;
    d.forEach(function (p) { s += p.oh; if (p.oh < p.roja) b++; if (p.pide) o++; });
    return { real: true, dias: d, invProm: s / d.length, bajoRoja: b, ordenes: o };
  }
  // Lee datos.xlsx, ordenes.json y las fotos de la carpeta del enfoque activo, y guarda la foto de hoy
  async function sincronizar() {
    if (!carpeta.h) return;
    carpeta.error = ''; carpeta.sinDatos = false; carpeta.avisos = []; carpeta.ordenes = []; carpeta.ordenesMal = false; carpeta.historial = [];
    try {
      var dir = await dirModo(), hdir = await dir.getDirectoryHandle('historial', { create: true });
      var t = await leerTexto(dir, 'ordenes.json');
      if (t) { try { carpeta.ordenes = JSON.parse(t); if (!Array.isArray(carpeta.ordenes)) throw 0; } catch (e) { carpeta.ordenes = []; carpeta.ordenesMal = true; } }
      var fh = null;
      try { fh = await dir.getFileHandle('datos.xlsx'); } catch (e) { carpeta.sinDatos = true; }
      if (fh) {
        if (!window.XLSX) throw new Error('No se pudo cargar el lector de Excel. Revise la conexión a internet y recargue la página.');
        var x = leerLibro(window.XLSX.read(await (await fh.getFile()).arrayBuffer(), { type: 'array', cellDates: true }));
        st.datos[st.modo] = x.d; carpeta.avisos = x.err; guardar();
      }
      var nombres = [];
      for await (var ent of hdir.values()) if (ent.kind === 'file' && /^\d{4}-\d{2}-\d{2}\.json$/.test(ent.name)) nombres.push(ent.name);
      nombres.sort(); nombres = nombres.slice(-730);
      for (var i = 0; i < nombres.length; i++) { try { ponerFoto(JSON.parse(await leerTexto(hdir, nombres[i]))); } catch (e) { /* foto ilegible: se omite */ } }
      recalc();
      if (fh) { var ft = foto(); await escribir(hdir, ft.f + '.json', JSON.stringify(ft)); ponerFoto(ft); }
      carpeta.leida = new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
    } catch (e) { carpeta.error = (e && e.message) || String(e); recalc(); }
    render();
  }
  async function elegirCarpeta() {
    try { carpeta.h = await window.showDirectoryPicker({ mode: 'readwrite' }); } catch (e) { return; }
    carpeta.pendiente = null; await idb('set', carpeta.h); await sincronizar();
  }
  async function reconectar() {
    var h = carpeta.pendiente; if (!h) return;
    try { if ((await h.requestPermission({ mode: 'readwrite' })) !== 'granted') return; } catch (e) { return; }
    carpeta.h = h; carpeta.pendiente = null; await sincronizar();
  }
  async function restaurarCarpeta() {
    if (!soportaCarpeta) return;
    var h = await idb('get'); if (!h) return;
    try {
      if ((await h.queryPermission({ mode: 'readwrite' })) === 'granted') { carpeta.h = h; await sincronizar(); }
      else { carpeta.pendiente = h; render(); }
    } catch (e) { /* la carpeta ya no existe o no es accesible */ }
  }
  async function desconectar() {
    carpeta.h = null; carpeta.pendiente = null; carpeta.ordenes = []; carpeta.historial = [];
    await idb('set', null); recalc(); render();
  }
  async function guardarDatosEnCarpeta() {
    try {
      if (!window.XLSX) throw new Error('No se pudo cargar el generador de Excel.');
      await escribir(await dirModo(), 'datos.xlsx', window.XLSX.write(libroActual(), { type: 'array', bookType: 'xlsx' }));
      await sincronizar();
    } catch (e) { carpeta.error = (e && e.message) || String(e); render(); }
  }
  async function guardarOrdenes() {
    try {
      await escribir(await dirModo(), 'ordenes.json', JSON.stringify(carpeta.ordenes, null, 1));
      recalc();
      var ft = foto(), hdir = await (await dirModo()).getDirectoryHandle('historial', { create: true });
      await escribir(hdir, ft.f + '.json', JSON.stringify(ft)); ponerFoto(ft);
    } catch (e) { carpeta.error = 'No se pudo guardar en la carpeta: ' + ((e && e.message) || e); recalc(); }
    render();
  }
  function aprobar(id) {
    var r = R.byId.get(id); if (!r || !r.orden || !carpeta.h || carpeta.ordenesMal) return;
    carpeta.ordenes.push({ oid: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), sku: r.sku, ubicacion: r.ubicacion, descripcion: r.descripcion,
      cantidad: r.orden, fechaReq: r.fechaReq, creada: R.hoy, estado: 'aprobada' });
    guardarOrdenes();
  }
  function cerrarOrden(oid) {
    carpeta.ordenes.forEach(function (o) { if (o.oid === oid) { o.estado = 'cerrada'; o.cerrada = R.hoy; } });
    guardarOrdenes();
  }
  function vCarpeta() {
    var h = '<div class="card"><h3>Carpeta de trabajo</h3>';
    if (!soportaCarpeta) return h + '<p class="nota">Este navegador no permite trabajar con una carpeta local. Use Chrome o Edge en un computador, o cargue el Excel manualmente abajo.</p></div>';
    if (!carpeta.h) {
      h += '<p class="sub">Elija una carpeta de su computador o de la red de su empresa. La app leerá de ahí los datos y guardará ahí las órdenes aprobadas y una foto diaria de los buffers. Si la carpeta es compartida, todo el equipo ve lo mismo.</p><div class="barra">' +
        (carpeta.pendiente ? '<button class="btn pri" data-act="reconectar">Reconectar la carpeta «' + esc(carpeta.pendiente.name) + '»</button>' : '') +
        '<button class="btn' + (carpeta.pendiente ? '' : ' pri') + '" data-act="carpeta">Elegir carpeta</button></div>';
      return h + '</div>';
    }
    if (carpeta.error) h += '<div class="aviso err">' + esc(carpeta.error) + '</div>';
    if (carpeta.ordenesMal) h += '<div class="aviso err">El archivo ordenes.json no se pudo leer. No se aprobarán órdenes para no sobrescribirlo; revíselo o retírelo de la carpeta.</div>';
    if (carpeta.sinDatos) h += '<div class="aviso">En la carpeta «' + esc(st.modo) + '» todavía no hay un archivo <b>datos.xlsx</b>. Puede crearlo con los datos que ve ahora y después reemplazarlo por los suyos.</div>';
    if (carpeta.avisos.length) h += '<div class="aviso">' + carpeta.avisos.map(esc).join('<br>') + '</div>';
    h += '<p>Conectada a <b>' + esc(carpeta.h.name) + '</b>' + (carpeta.leida ? ' · leída a las ' + esc(carpeta.leida) : '') + ' · ' + f0(carpeta.historial.length) + ' fotos diarias · ' + f0(abiertas().length) + ' órdenes abiertas</p>' +
      '<div class="barra"><button class="btn pri" data-act="releer">Volver a leer la carpeta</button>' +
      '<button class="btn" data-act="guardarDatos">' + (carpeta.sinDatos ? 'Crear datos.xlsx con los datos actuales' : 'Sobrescribir datos.xlsx con los datos actuales') + '</button>' +
      '<button class="btn" data-act="desconectar">Desconectar</button></div>' +
      '<p class="nota">Estructura: <code>' + esc(carpeta.h.name) + '/' + st.modo + '/datos.xlsx</code> (lo que usted actualiza desde su sistema), <code>ordenes.json</code> (órdenes aprobadas) e <code>historial/AAAA-MM-DD.json</code> (una foto por día). Cada vez que se lee la carpeta se guarda la foto del día.</p>';
    return h + '</div>';
  }
  function csvOrdenes() {
    var rows = conBuffer().filter(function (r) { return r.orden > 0; }).sort(function (x, y) { return x.prioridad - y.prioridad; });
    function c(v) { v = String(v == null ? '' : v); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
    var lin = ['sku;descripcion;ubicacion;origen;tipo;cantidad;fecha_requerida;prioridad_pct;flujo_neto;tope_verde'];
    rows.forEach(function (r) { lin.push([r.sku, r.descripcion, r.ubicacion, r.origen, r.tipo, r.orden, r.fechaReq, Math.round(r.prioridad * 100), Math.round(r.flujoNeto), Math.round(r.tog)].map(c).join(';')); });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + lin.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    a.download = 'ordenes-sugeridas-' + R.hoy + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
  }

  /* ---------- Modelo preentrenado de series de tiempo: corre en el navegador, los datos no salen ---------- */
  var IA = { nombre: 't0-alpha (preentrenado)', ort: 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/',
    url: 'https://huggingface.co/Siddharth899/tsfm-onnx/resolve/main/t0-alpha-ctx512-h64-int8.onnx' };
  function iaMsg(t) { ia.msg = t; var el = $('iaMsg'); if (el) el.textContent = t; }
  function cargarScript(src) { return new Promise(function (ok, no) { var s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = function () { no(new Error('No se pudo cargar ' + src)); }; document.head.appendChild(s); }); }
  async function iaCargar() {
    if (ia.estado === 'cargando' || ia.ses) return;
    ia.estado = 'cargando'; ia.msg = 'Cargando el motor de inferencia…'; render();
    try {
      if (!window.ort) await cargarScript(IA.ort + 'ort.min.js');
      window.ort.env.wasm.wasmPaths = IA.ort;
      var buf = null, cache = null;
      try { cache = await caches.open('flujolibre-modelo'); var hit = await cache.match(IA.url); if (hit) { iaMsg('Leyendo el modelo guardado en este navegador…'); buf = new Uint8Array(await hit.arrayBuffer()); } } catch (e) { /* sin caché */ }
      if (!buf) {
        var resp = await fetch(IA.url); if (!resp.ok) throw new Error('No se pudo descargar el modelo (HTTP ' + resp.status + ').');
        var total = +resp.headers.get('content-length') || 0, rd = resp.body.getReader(), partes = [], got = 0;
        for (;;) { var x = await rd.read(); if (x.done) break; partes.push(x.value); got += x.value.length; iaMsg('Descargando el modelo: ' + Math.round(got / 1048576) + ' MB' + (total ? ' de ' + Math.round(total / 1048576) : '') + '…'); }
        buf = new Uint8Array(got); var o = 0; partes.forEach(function (c) { buf.set(c, o); o += c.length; });
        try { if (cache) await cache.put(IA.url, new Response(buf.slice().buffer)); } catch (e) { /* no se pudo guardar; se descargará otra vez */ }
      }
      iaMsg('Preparando el modelo…');
      ia.ses = await window.ort.InferenceSession.create(buf, { executionProviders: ['wasm'] });
      ia.estado = 'listo'; ia.msg = '';
    } catch (e) { ia.estado = 'error'; ia.msg = (e && e.message) || String(e); }
    render();
  }
  async function iaPredecir(y) {
    var ctx = new Float32Array(512).fill(NaN), k = Math.min(y.length, 512);
    ctx.set(y.slice(-k), 512 - k);
    var out = await ia.ses.run({ context: new window.ort.Tensor('float32', ctx, [1, 512]) }), q = out.quantiles.data, med = [], bajo = [], alto = [];
    for (var s = 0; s < 64; s++) { bajo.push(q[s * 5]); med.push(q[s * 5 + 2]); alto.push(q[s * 5 + 4]); }
    return { med: med, bajo: bajo, alto: alto };
  }
  // Pronostica el tramo de prueba y el futuro de cada artículo; el motor lo pone a competir con los demás métodos
  async function iaEvaluar() {
    if (!ia.ses || ia.corriendo) return;
    ia.corriendo = true; render();
    var modo = st.modo, mapa = ia.cache[modo], items = R.items.filter(function (r) { return r.pron.y.length >= 8 && r.pron.y.some(function (v) { return v > 0; }); });
    try {
      for (var k = 0; k < items.length; k++) {
        var r = items[k], y = r.pron.y, h0 = E.tramoPrueba(y.length, r.pron.s);
        var a = await iaPredecir(y.slice(0, y.length - h0)), b = await iaPredecir(y);
        mapa.set(r.id, { clave: E.claveSerie(y), nombre: IA.nombre, test: a.med, fc: b.med, bajo: b.bajo, alto: b.alto });
        iaMsg('Evaluando ' + (k + 1) + ' de ' + items.length + '…');
        if (k % 4 === 3) await new Promise(function (ok) { setTimeout(ok, 0); });
      }
      ia.msg = '';
    } catch (e) { ia.msg = 'Falló la evaluación: ' + ((e && e.message) || e); }
    ia.corriendo = false;
    if (st.modo === modo) recalc();
    render();
  }
  function vIA(r) {
    var h = '<div class="card"><h3>Modelo preentrenado de series de tiempo</h3>';
    if (ia.estado === 'no' || ia.estado === 'error') {
      h += '<p class="sub" style="margin-bottom:10px">Un modelo fundacional ya entrenado con muchísimas series distintas, que pronostica sin ajustarse a sus datos. Corre en este navegador: sus datos no se envían a ningún servidor. Se descarga una sola vez (103 MB) y queda guardado.</p>' +
        (ia.estado === 'error' ? '<div class="aviso err">' + esc(ia.msg) + '</div>' : '') +
        '<div class="barra" style="margin:0"><button class="btn pri" data-act="iaCargar">Descargar y activar el modelo</button></div>' +
        '<p class="nota" style="margin-top:10px">Modelo: t0-alpha, de The Forecasting Company (licencia Apache 2.0), en una conversión no oficial para navegador publicada en Hugging Face. La versión comprimida puede desviarse algunos puntos porcentuales en series cortas.</p>';
    } else if (ia.estado === 'cargando') h += '<p id="iaMsg">' + esc(ia.msg) + '</p>';
    else {
      var n = ia.cache[st.modo].size, fila = r.pron.metodos.filter(function (m) { return m.externo; })[0], pos = fila ? r.pron.metodos.indexOf(fila) + 1 : 0;
      var gana = R.items.filter(function (x) { return x.pron.mejor && x.pron.mejor.externo; }).length;
      h += (ia.corriendo ? '<p id="iaMsg">' + esc(ia.msg || 'Evaluando…') + '</p>' :
        '<p>' + (n ? 'Evaluado en ' + n + ' artículos; gana en ' + gana + ' de ellos y en esos alimenta el ADU futuro. ' + (fila ? 'En este artículo quedó en el puesto ' + pos + ' de ' + r.pron.metodos.length + '.' : 'Este artículo cambió desde la evaluación; vuelva a evaluar.') : 'Modelo activo. Falta evaluarlo contra los demás métodos.') + '</p>' +
        (ia.msg ? '<div class="aviso err">' + esc(ia.msg) + '</div>' : '') +
        '<div class="barra" style="margin:0"><button class="btn pri" data-act="iaEvaluar">' + (n ? 'Volver a evaluar todos los artículos' : 'Evaluar todos los artículos') + '</button></div>') +
        '<p class="nota" style="margin-top:10px">Compite en el mismo tramo de prueba que los demás métodos y solo se usa donde tiene el menor MAD. Si cambia los datos o la agrupación por mes o semana, hay que evaluarlo de nuevo.</p>';
    }
    return h + '</div>';
  }

  /* ---------- Secuencia en recursos y armado de pedidos ---------- */
  // Operaciones de un artículo: su ruta si la tiene; si no, el recurso único de la hoja Articulos
  function opsDe(r) {
    var d = datos(), setup = {}, ops = [];
    (d.recursos || []).forEach(function (x) { setup[x.recurso] = E.num(x.alistamiento_min, 0); });
    (d.rutas || []).forEach(function (x) { if (String(x.sku) === r.sku) ops.push({ sec: E.num(x.secuencia, 0), recurso: x.recurso, min: E.num(x.min_und, 0), setup: E.num(x.alistamiento_min, null) }); });
    if (!ops.length && r.recurso && r.minUnd) ops.push({ sec: 10, recurso: r.recurso, min: r.minUnd, setup: null });
    ops.sort(function (a, b) { return a.sec - b.sec; });
    ops.forEach(function (o) { if (o.setup == null) o.setup = setup[o.recurso] || 0; });
    return ops;
  }
  /* Programación finita hacia adelante: las órdenes entran por prioridad de buffer; cada operación empieza
     cuando terminó la anterior de la misma orden y el recurso está libre. Respeta días laborables y festivos. */
  function programar() {
    var d = datos(), rec = {}, fest = {}, ab = carpeta.h ? abiertas() : [], ordenes = [];
    (d.recursos || []).forEach(function (x) { rec[x.recurso] = { cap: E.num(x.minutos_dia, 0), dias: E.num(x.dias_semana, 7) || 7, d: 0, f: 0, filas: [], carga: 0 }; });
    (d.festivos || []).forEach(function (x) { if (x.fecha) fest[x.fecha] = 1; });
    function laborable(rc, dia) {
      var iso = E.addDays(R.hoy, dia), dow = new Date(iso + 'T12:00:00Z').getUTCDay();
      if (fest[iso]) return false;
      if (rc.dias <= 5 && (dow === 0 || dow === 6)) return false;
      if (rc.dias === 6 && dow === 0) return false;
      return true;
    }
    conBuffer().forEach(function (r) {
      var ops = opsDe(r); if (!ops.length) return;
      if (r.orden > 0) ordenes.push({ r: r, q: r.orden, tipo: 'Sugerida', req: r.fechaReq, ops: ops });
      ab.forEach(function (o) { if (o.sku === r.sku && (o.ubicacion || '') === r.ubicacion) ordenes.push({ r: r, q: o.cantidad, tipo: 'Aprobada', req: o.fechaReq, ops: ops }); });
    });
    ordenes.sort(function (a, b) { return a.r.prioridad - b.r.prioridad; });
    ordenes.forEach(function (o, k) {
      var listo = { d: 0, f: 0 }; o.n = k + 1; o.ok = true;
      o.ops.forEach(function (op) {
        var rc = rec[op.recurso];
        if (!rc) rc = rec[op.recurso] = { cap: 0, dias: 7, d: 0, f: 0, filas: [], carga: 0 };
        var min = op.setup + o.q * op.min;
        rc.carga += min;
        if (!rc.cap) { o.ok = false; rc.filas.push({ o: o, op: op, min: min }); return; }
        var dia = rc.d, fr = rc.f, guard = 0;
        if (listo.d > dia || (listo.d === dia && listo.f > fr)) { dia = listo.d; fr = listo.f; }
        while (!laborable(rc, dia) && guard++ < 400) { dia++; fr = 0; }
        var ini = dia, falta = min;
        while (falta > 1e-9 && guard++ < 4000) {
          if (!laborable(rc, dia)) { dia++; fr = 0; continue; }
          var disp = (1 - fr) * rc.cap;
          if (falta <= disp + 1e-9) { fr += falta / rc.cap; falta = 0; } else { falta -= disp; dia++; fr = 0; }
        }
        var fin = fr <= 1e-9 && dia > ini ? dia - 1 : dia;
        if (fr >= 1 - 1e-9) { dia++; fr = 0; }
        rc.d = dia; rc.f = fr; listo = { d: dia, f: fr };
        o.fin = fin;
        rc.filas.push({ o: o, op: op, min: min, ini: ini, fin: fin });
      });
      o.fechaFin = o.ok && o.fin != null ? E.addDays(R.hoy, o.fin) : null;
      o.tarde = o.fechaFin && o.fechaFin > o.req;
    });
    return { rec: rec, ordenes: ordenes };
  }
  function vSecuencia() {
    var P = programar();
    if (!P.ordenes.length) return '';
    var tarde = P.ordenes.filter(function (o) { return o.tarde; }).length;
    var h = '<h2>Programación de recursos</h2><p class="sub">Las órdenes entran por prioridad del buffer, no por fecha de entrega. Cada operación de la ruta empieza cuando terminó la anterior y el recurso está libre; se cuentan alistamientos, días laborables de cada recurso y festivos. No hay solapes ni horas extra.</p>' +
      '<div class="card tw"><h3>Órdenes: ' + P.ordenes.length + ' programadas, ' + tarde + ' terminarían después de lo requerido</h3><table><tr><th>#</th><th class="l">Artículo</th><th>Prioridad</th><th>Orden</th><th>Cantidad</th><th class="l">Ruta</th><th>Terminaría</th><th>Requerida</th><th>Estado</th></tr>' +
      P.ordenes.map(function (o) {
        return '<tr data-item="' + esc(o.r.id) + '"><td>' + o.n + '</td><td class="l">' + nombre(o.r) + '</td><td>' + chip(o.r.colorPlan, pc(o.r.prioridad)) + '</td><td>' + o.tipo + '</td><td>' + f0(o.q) + '</td><td class="l">' + esc(o.ops.map(function (x) { return x.recurso; }).join(' → ')) + '</td><td>' + (o.fechaFin ? fecha(o.fechaFin) : '—') + '</td><td>' + fecha(o.req) + '</td><td>' + (o.fechaFin ? (o.tarde ? '<b style="color:#d64545">Tarde</b>' : 'A tiempo') : 'Sin capacidad definida') + '</td></tr>';
      }).join('') + '</table></div>';
    Object.keys(P.rec).forEach(function (k) {
      var rc = P.rec[k]; if (!rc.filas.length) return;
      h += '<div class="card tw"><h3>' + esc(k) + (rc.cap ? ' — ' + f0(rc.cap) + ' minutos por día, ' + rc.dias + ' días por semana · carga ' + f0(rc.carga) + ' minutos (' + f1(rc.carga / rc.cap) + ' días laborables)' : ' — sin capacidad definida en la hoja Recursos') + '</h3><table><tr><th>Orden #</th><th class="l">Artículo</th><th>Operación</th><th>Cantidad</th><th>Alistamiento</th><th>Minutos totales</th><th>Empieza</th><th>Termina</th></tr>' +
        rc.filas.map(function (x) { return '<tr data-item="' + esc(x.o.r.id) + '"><td>' + x.o.n + '</td><td class="l">' + nombre(x.o.r) + '</td><td>' + x.op.sec + '</td><td>' + f0(x.o.q) + '</td><td>' + f0(x.op.setup) + '</td><td>' + f0(x.min) + '</td><td>' + (x.ini != null ? fecha(E.addDays(R.hoy, x.ini)) : '—') + '</td><td>' + (x.fin != null ? fecha(E.addDays(R.hoy, x.fin)) : '—') + '</td></tr>'; }).join('') + '</table></div>';
    });
    return h;
  }
  // Descuentos por volumen: ¿conviene subir el pedido hasta el siguiente escalón?
  function vDescuentos() {
    var esc2 = {}, filas = '';
    (datos().descuentos || []).forEach(function (x) { var id = E.idOf(x.sku, x.ubicacion); (esc2[id] = esc2[id] || []).push({ q: E.num(x.cantidad_desde, 0), p: E.num(x.descuento_pct, 0) / 100 }); });
    conBuffer().forEach(function (r) {
      var e = esc2[r.id]; if (!e || !r.orden) return;
      e.sort(function (a, b) { return a.q - b.q; });
      var actual = 0, sig = null;
      e.forEach(function (x) { if (r.orden >= x.q) actual = x.p; else if (!sig) sig = x; });
      if (!sig) { filas += '<tr data-item="' + esc(r.id) + '"><td class="l">' + nombre(r) + '</td><td>' + f0(r.orden) + '</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td class="l">Ya tiene el mayor descuento (' + pc(actual) + ')</td></tr>'; return; }
      var extra = sig.q - r.orden, ahorro = sig.q * r.costo * sig.p - r.orden * r.costo * actual;
      var dias = r.adu > 0 ? extra / r.adu : 0, mantener = extra * r.costo * (1 - sig.p) * R.settings.tasaInv * dias / 365;
      var desp = r.tog ? (r.flujoNeto + sig.q) / r.tog : null, neto = ahorro - mantener;
      var lectura = neto <= 0 ? 'No conviene: mantener el inventario extra cuesta más que el descuento' : desp > 1.0001 ? 'Conviene en dinero, pero deja el flujo neto por encima del tope verde' : 'Conviene';
      filas += '<tr data-item="' + esc(r.id) + '"><td class="l">' + nombre(r) + '</td><td>' + f0(r.orden) + '</td><td>' + f0(sig.q) + ' (' + pc(sig.p) + ')</td><td>+ ' + f0(extra) + '</td><td>$ ' + f0(ahorro) + '</td><td>$ ' + f0(mantener) + '</td><td>' + pc(desp) + '</td><td class="l"><b style="color:' + (neto > 0 && desp <= 1.0001 ? '#3fa35b' : neto > 0 ? '#b8860b' : '#d64545') + '">' + lectura + '</b></td></tr>';
    });
    if (!filas) return '';
    return '<h2>Descuentos por volumen</h2><p class="sub">Para cada orden sugerida con escalones de precio, compara lo que se ahorra al subir al siguiente escalón con lo que cuesta mantener las unidades adicionales hasta consumirlas (tasa anual del ' + pc(R.settings.tasaInv) + ', ajustable).</p>' +
      '<div class="card tw"><table><tr><th class="l">Artículo</th><th>Orden sugerida</th><th>Siguiente escalón</th><th>Unidades adicionales</th><th>Ahorro</th><th>Costo de mantenerlas</th><th>Flujo neto después</th><th class="l">Lectura</th></tr>' + filas + '</table></div>';
  }
  /* ---------- Método: listas de verificación de lo que no es cálculo sino criterio y proceso ---------- */
  var LISTAS = [
    { id: 'pos', titulo: 'Dónde poner los buffers: seis factores de posicionamiento', nota: 'Antes de marcar un artículo con buffer, revise estos seis factores. La app calcula el lead time desacoplado y el efecto de un buffer nuevo (pestaña Estructura); lo demás es conocimiento del negocio.', items: [
      ['Tolerancia del cliente', 'Sabemos cuánto está dispuesto a esperar el cliente antes de buscar otra opción.'],
      ['Lead time con potencial de mercado', 'Identificamos qué plazo de entrega nos haría ganar ventas o mejor precio.'],
      ['Horizonte de visibilidad de pedidos', 'Sabemos con cuánta anticipación conocemos normalmente los pedidos firmes.'],
      ['Variabilidad externa', 'Medimos qué tan errática es la demanda y qué tan confiable es cada proveedor.'],
      ['Apalancamiento y flexibilidad del inventario', 'Ubicamos los componentes compartidos por muchos productos, donde un solo buffer protege a varios.'],
      ['Protección de operaciones críticas', 'Protegemos con buffer los recursos cuello de botella para que no paren por falta de material.']] },
    { id: 'prueba', titulo: 'Seis pruebas para saber si un inventario es de verdad un buffer estratégico', nota: 'Un stock de seguridad tradicional no pasa la mayoría. Úselas para revisar cada posición que hoy tiene inventario.', items: [
      ['Desacople', 'La posición corta el lead time: lo que está aguas arriba ya no suma al plazo de lo que está aguas abajo.'],
      ['Beneficio en ambos sentidos', 'Protege al cliente de las demoras del suministro y también al proveedor o la planta de los saltos de la demanda.'],
      ['Independencia de la orden', 'El inventario no está reservado para un pedido en particular; lo puede consumir cualquiera.'],
      ['Mecanismo principal de planeación', 'Las órdenes de reposición salen del estado del buffer, no de un plan aparte que el buffer solo complementa.'],
      ['Prioridad relativa', 'El estado del buffer permite ordenar qué atender primero frente a las demás posiciones.'],
      ['Ajuste dinámico', 'El tamaño del buffer se recalcula cuando cambian la demanda, el lead time o la variabilidad.']] },
    { id: 'sop', titulo: 'Planeación de ventas y operaciones guiada por la demanda (DDS&OP)', nota: 'No son preguntas de sí o no: marque las que su empresa ya tiene resueltas y use el resto como plan de trabajo. La pestaña Proyección da los números para estas reuniones.', items: [
      ['Propósito claro', 'La dirección entiende para qué sirve el proceso y qué decisiones salen de él.'],
      ['Responsables', 'Hay un líder ejecutivo del proceso y un dueño para cada paso.'],
      ['Mirada al futuro', 'Las reuniones se concentran en lo que va a cambiar y su efecto, no en explicar el pasado.'],
      ['Problemas tácticos', 'Los problemas del día a día se discuten y se resuelven rápido, sin esperar el ciclo mensual.'],
      ['Volumen y finanzas integrados', 'Los planes en unidades y en dinero se reconcilian entre sí y con el presupuesto.'],
      ['Indicadores coherentes', 'Las medidas de desempeño premian el trabajo integrado y la disciplina de ejecución, no el resultado de un área.'],
      ['Datos confiables', 'Hay compromiso con la calidad de los datos y se distingue entre dato e información útil.'],
      ['Productos nuevos', 'Existe una revisión de lanzamientos y retiros que alimenta el plan de demanda.'],
      ['Demanda sin restricciones', 'Cada mes se revisa la demanda futura con mercadeo, ventas y finanzas.'],
      ['Plan de suministro válido', 'Cada planta o centro confirma que puede cumplir los pedidos y despachos previstos.'],
      ['Gestión por excepción', 'A la dirección se le presenta lo que cambió y requiere decisión, apoyado en gráficas.'],
      ['Proceso documentado', 'Cada paso está escrito y se actualiza con regularidad.']] }
  ];
  function vMetodo() {
    var ck = st.checks || {};
    var h = '<h2>Método</h2><p class="sub">Lo que el libro pide y ningún cálculo resuelve: criterio para ubicar los buffers y disciplina de proceso. Marque lo que ya tiene; queda guardado en este navegador.</p>';
    LISTAS.forEach(function (L) {
      var n = L.items.filter(function (x, i) { return ck[L.id + i]; }).length;
      h += '<div class="card"><h3>' + L.titulo + ' — ' + n + ' de ' + L.items.length + '</h3><p class="nota" style="margin-top:-4px">' + L.nota + '</p>' +
        '<div class="dist" style="height:8px;margin:8px 0 12px"><span style="width:' + (n / L.items.length * 100) + '%;background:#3fa35b"></span></div>' +
        L.items.map(function (x, i) { return '<label class="chk"><input type="checkbox" data-check="' + L.id + i + '"' + (ck[L.id + i] ? ' checked' : '') + '><span><b>' + x[0] + '.</b> ' + x[1] + '</span></label>'; }).join('') + '</div>';
    });
    return h;
  }

  function vArmado() {
    var mins = {}, grupos = {}, estibas = {};
    (datos().proveedores || []).forEach(function (x) { mins[x.proveedor] = E.num(x.minimo_valor, 0); estibas[x.proveedor] = E.num(x.minimo_estibas, 0); });
    conBuffer().forEach(function (r) { if (r.proveedor) (grupos[r.proveedor] = grupos[r.proveedor] || []).push(r); });
    var ks = Object.keys(grupos).filter(function (k) { return grupos[k].some(function (r) { return r.orden > 0; }); });
    if (!ks.length) return '';
    var h = '<h2>Armado de pedidos por proveedor</h2><p class="sub">Cuando el pedido de un proveedor no alcanza su mínimo de compra, se completa con sus otros artículos, empezando por los de menor prioridad de buffer y sin pasar ninguno del tope verde. Así el pedido se llena con lo que más cobertura necesita.</p>';
    ks.forEach(function (k) {
      var g = grupos[k], minimo = mins[k] || 0, valor = 0;
      g.forEach(function (r) { valor += r.orden * r.costo; });
      var falta = Math.max(0, minimo - valor), extra = {}, nivel = null, alcanza = true;
      if (falta > 0) {
        var usa = function (p) { var t = 0; g.forEach(function (r) { t += Math.max(0, p * r.tog - (r.flujoNeto + r.orden)) * r.costo; }); return t; };
        if (usa(1) < falta) { alcanza = false; nivel = 1; }
        else { var lo = 0, hi = 1; for (var it = 0; it < 50; it++) { var mid = (lo + hi) / 2; if (usa(mid) >= falta) hi = mid; else lo = mid; } nivel = hi; }
        g.forEach(function (r) { var q = Math.max(0, nivel * r.tog - (r.flujoNeto + r.orden)); if (r.multiplo > 0) q = Math.ceil(q / r.multiplo - 1e-9) * r.multiplo; else q = Math.ceil(q - 1e-9); extra[r.id] = q; });
      }
      var total = valor; g.forEach(function (r) { total += (extra[r.id] || 0) * r.costo; });
      // Llenado de camión o contenedor: se agregan estibas completas al artículo de menor prioridad que no pase del tope verde
      var camion = '', minEst = estibas[k] || 0;
      if (minEst > 0) {
        var ge = g.filter(function (r) { return r.undEstiba > 0; }), pal = {}, usadas = 0;
        ge.forEach(function (r) { pal[r.id] = Math.ceil((r.orden + (extra[r.id] || 0)) / r.undEstiba - 1e-9); usadas += pal[r.id]; });
        var base = usadas, guard = 0, agregadas = [];
        while (usadas < minEst && guard++ < 2000) {
          var mejor = null, mp = Infinity;
          ge.forEach(function (r) { var despues = (r.flujoNeto + (pal[r.id] + 1) * r.undEstiba) / r.tog; if (r.tog > 0 && despues <= 1 + 1e-9 && despues < mp) { mp = despues; mejor = r; } });
          if (!mejor) break;
          pal[mejor.id]++; usadas++;
        }
        ge.forEach(function (r) { var antes = Math.ceil((r.orden + (extra[r.id] || 0)) / r.undEstiba - 1e-9); if (pal[r.id] > antes) agregadas.push(esc(r.sku) + ' +' + (pal[r.id] - antes)); });
        camion = '<div class="aviso' + (usadas >= minEst ? ' ok' : '') + '" style="margin:12px 0 0"><b>Camión o contenedor de ' + f0(minEst) + ' estibas.</b> El pedido ocupa ' + f0(base) + '. ' +
          (base >= minEst ? 'Ya lo llena.' : usadas >= minEst ? 'Se completa agregando estibas a: ' + agregadas.join(', ') + '.' : 'Solo se llega a ' + f0(usadas) + ' sin pasar ningún artículo del tope verde' + (agregadas.length ? ' (agregando ' + agregadas.join(', ') + ')' : '') + '. Conviene esperar a que más artículos pidan.') + '</div>';
      }
      h += '<div class="card tw"><h3>' + esc(k) + ' — pedido sugerido $ ' + f0(valor) + (minimo ? ' · mínimo $ ' + f0(minimo) : ' · sin mínimo definido') + '</h3>' +
        (falta > 0 ? '<div class="aviso' + (alcanza ? '' : ' err') + '">' + (alcanza ? 'Faltan $ ' + f0(falta) + ' para el mínimo. Con las cantidades adicionales el pedido queda en $ ' + f0(total) + '.' : 'Ni llevando todos sus artículos al tope verde se alcanza el mínimo: quedaría en $ ' + f0(total) + '. Conviene esperar o negociar el mínimo.') + '</div>' : (minimo ? '<div class="aviso ok">El pedido ya supera el mínimo.</div>' : '')) +
        '<table><tr><th class="l">Artículo</th><th>Prioridad</th><th>Orden sugerida</th><th>Adicional para completar</th><th>Total a pedir</th><th>Valor</th><th>Prioridad después</th></tr>' +
        g.slice().sort(function (a, b) { return a.prioridad - b.prioridad; }).map(function (r) {
          var ex = extra[r.id] || 0, tot = r.orden + ex;
          return '<tr data-item="' + esc(r.id) + '"><td class="l">' + nombre(r) + '</td><td>' + chip(r.colorPlan, pc(r.prioridad)) + '</td><td>' + (r.orden ? f0(r.orden) : '—') + '</td><td>' + (ex ? '<b>+ ' + f0(ex) + '</b>' : '—') + '</td><td>' + (tot ? f0(tot) : '—') + '</td><td>$ ' + f0(tot * r.costo) + '</td><td>' + pc(r.tog ? (r.flujoNeto + tot) / r.tog : null) + '</td></tr>';
        }).join('') + '</table>' + camion + '</div>';
    });
    return h;
  }

  /* ---------- Juego de la cadena ---------- */
  var J = window.DDJuego, jg = { fase: 'inicio', rol: 0, esc: 'salto', s: null, jugada: false, corridas: [] };
  var JCOL = ['#1f5fbf', '#e9a23b', '#d64545'];
  function chartLineas(series, o) {
    var W = 560, H = o.alto || 210, L = 46, Rm = 10, T = 10, B = 24, n = 0, mn = o.min != null ? o.min : 0, mx = o.max != null ? o.max : 0;
    series.forEach(function (s) { n = Math.max(n, s.datos.length); s.datos.forEach(function (v) { if (o.max == null && v > mx) mx = v; if (o.min == null && v < mn) mn = v; }); });
    if (mx <= mn) mx = mn + 1;
    n = Math.max(n, o.n || 2);
    function X(i) { return L + (W - L - Rm) * i / (n - 1); }
    function Y(v) { return T + (H - T - B) * (1 - (v - mn) / (mx - mn)); }
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="' + esc(o.titulo || 'Gráfica') + '">', i;
    for (i = 0; i <= 4; i++) { var v = mn + (mx - mn) * i / 4; s += '<line x1="' + L + '" x2="' + (W - Rm) + '" y1="' + Y(v) + '" y2="' + Y(v) + '" stroke="#e8eaee"/><text x="' + (L - 5) + '" y="' + (Y(v) + 4) + '" text-anchor="end">' + f0(v) + '</text>'; }
    if (mn < 0) s += '<line x1="' + L + '" x2="' + (W - Rm) + '" y1="' + Y(0) + '" y2="' + Y(0) + '" stroke="#98a1b0"/>';
    for (i = 0; i < n; i += 5) s += '<text x="' + X(i) + '" y="' + (H - 7) + '" text-anchor="middle">' + (i + 1) + '</text>';
    series.forEach(function (se) {
      var d = ''; se.datos.forEach(function (v, k) { d += (k ? 'L' : 'M') + X(k).toFixed(1) + ' ' + Y(Math.max(mn, Math.min(mx, v))).toFixed(1); });
      if (d) s += '<path d="' + d + '" fill="none" stroke="' + se.color + '" stroke-width="' + (se.ancho || 1.8) + '"' + (se.dash ? ' stroke-dasharray="5 4"' : '') + ' stroke-linejoin="round"/>';
    });
    return s + '</svg>';
  }
  function jLeyenda(conDemanda) {
    return '<div class="leyenda">' + (conDemanda ? '<span><i style="background:#1c2430"></i>Consumidor</span>' : '') + J.ESLABONES.map(function (x, i) { return '<span><i style="background:' + JCOL[i] + '"></i>' + x.nombre + '</span>'; }).join('') + '</div>';
  }
  function jTerminar() {
    jg.corridas = [];
    if (jg.jugada) jg.corridas.push({ titulo: 'Su partida', nota: 'Usted como ' + J.ESLABONES[jg.rol].nombre + '; los demás con la regla reactiva.', s: jg.s });
    jg.corridas.push({ titulo: 'Todos con regla reactiva', nota: 'Cada uno mira su inventario de hoy y casi no cuenta lo que ya viene en camino.', s: J.correr(jg.esc, ['reactiva', 'reactiva', 'reactiva']) });
    jg.corridas.push({ titulo: 'Todos con buffers', nota: 'Cada uno pide cuando su flujo neto llega al tope amarillo, hasta el tope verde.', s: J.correr(jg.esc, ['buffer', 'buffer', 'buffer']) });
    jg.fase = 'fin';
  }
  function jPedir() {
    var inp = $('jPedido'), v = inp ? parseFloat(inp.value) : NaN;
    if (!isFinite(v) || v < 0) { if (inp) inp.focus(); return; }
    var s = jg.s;
    J.cerrar(s, s.e.map(function (e, i) { return i === jg.rol ? v : J.POLITICAS.reactiva(e); }));
    if (s.t >= s.semanas) jTerminar(); else J.abrir(s);
    render();
    var n = $('jPedido'); if (n) n.focus();
  }
  function vJuego() {
    var h = '<h2>Juego de la cadena</h2>';
    if (jg.fase === 'inicio') {
      return h + '<p class="sub">Una cadena de tres eslabones mueve cajas de café: la Tienda le vende al consumidor, el Centro de distribución abastece a la Tienda y la Planta abastece al Centro. Usted maneja un eslabón durante 30 semanas y solo ve sus propios números; los otros dos los maneja el computador.</p>' +
        '<div class="card"><h3>Reglas</h3><ul class="ayuda"><li>Cada semana llegan despachos, usted atiende lo que le piden y decide cuánto pedir.</li>' +
        '<li>Su pedido tarda 1 semana en ser visto y el despacho tarda ' + J.ESLABONES[0].lt + ' semanas más (' + J.ESLABONES[2].lt + ' si usted es la Planta, que fabrica).</li>' +
        '<li>Cada caja en inventario cuesta $' + J.COSTO_INV + ' por semana. Cada caja que quede debiendo cuesta $' + J.COSTO_FALT + ' por semana y se sigue debiendo hasta entregarla.</li>' +
        '<li>Al final se compara su resultado con la misma cadena manejada con una regla reactiva y con buffers.</li></ul>' +
        '<div class="form" style="margin-top:14px"><label>Su eslabón<select id="jRol">' + J.ESLABONES.map(function (x, i) { return '<option value="' + i + '"' + (i === jg.rol ? ' selected' : '') + '>' + x.nombre + '</option>'; }).join('') + '</select></label>' +
        '<label>Escenario<select id="jEsc">' + Object.keys(J.ESCENARIOS).map(function (k) { return '<option value="' + k + '"' + (k === jg.esc ? ' selected' : '') + '>' + J.ESCENARIOS[k].nombre + '</option>'; }).join('') + '</select></label></div>' +
        '<p class="nota" style="margin-top:10px">No lea el escenario en voz alta si va a jugar con un grupo: la gracia es no saber qué viene.</p>' +
        '<div class="barra" style="margin:14px 0 0"><button class="btn pri" data-act="jIniciar">Empezar a jugar</button><button class="btn" data-act="jAuto">Ver solo la comparación</button></div></div>';
    }
    if (jg.fase === 'jugando') {
      var s = jg.s, e = s.e[jg.rol], z = J.zonas(e), prox = '', suma = 0, k;
      for (k = 1; k <= e.lt + 1; k++) { var q = e.llegadas[s.t + k] || 0; suma += q; prox += '<tr><td>En ' + k + (k === 1 ? ' semana' : ' semanas') + '</td><td>' + f0(q) + '</td></tr>'; }
      h += '<p class="sub">Usted es <b>' + esc(e.nombre) + '</b> · semana ' + (s.t + 1) + ' de ' + s.semanas + '</p>' +
        '<div class="kpis"><div class="kpi"><b>' + f0(e.dem) + '</b><span>cajas le pidieron esta semana</span></div>' +
        '<div class="kpi"><b>' + f0(e.inv) + '</b><span>inventario después de despachar ' + f0(e.envio) + '</span></div>' +
        '<div class="kpi"><b style="color:' + (e.falt ? '#d64545' : 'inherit') + '">' + f0(e.falt) + '</b><span>cajas que quedó debiendo</span></div>' +
        '<div class="kpi"><b>$ ' + f0(e.costo) + '</b><span>costo acumulado</span></div></div>';
      h += '<div class="grid2"><div class="card"><h3>¿Cuánto pide esta semana?</h3><div class="barra"><input type="number" id="jPedido" min="0" step="1" placeholder="Cajas" style="width:130px" autofocus>' +
        '<button class="btn pri" data-act="jPedir">Pedir y pasar la semana</button><button class="btn" data-act="jSugerir">¿Qué pediría un buffer?</button></div>' +
        (jg.pista ? '<div class="aviso ok">Flujo neto ' + f0(z.nfp) + ' (inventario + lo que viene − lo que debe). Topes: rojo ' + f0(z.roja) + ', amarillo ' + f0(z.toy) + ', verde ' + f0(z.tog) + '. Un buffer pediría <b>' + f0(J.POLITICAS.buffer(e)) + '</b>.</div>' : '') +
        '<h3 style="margin-top:14px">Lo que viene en camino</h3><table><tr><th>Llega</th><th>Cajas</th></tr><tr><td>Llegó esta semana</td><td>' + f0(e.llega) + '</td></tr>' + prox +
        '<tr><td>Pedido que aún no le han despachado</td><td>' + f0(Math.max(0, e.pend - suma)) + '</td></tr></table></div>';
      h += '<div class="card"><h3>Su historia</h3>' + (s.t ? chartLineas([{ nombre: 'Le pidieron', color: '#1c2430', datos: e.h.dem }, { nombre: 'Usted pidió', color: JCOL[jg.rol], datos: e.h.pedido, dash: true },
        { nombre: 'Inventario neto', color: '#3fa35b', datos: e.h.inv.map(function (v, i) { return v - e.h.falt[i]; }) }], { n: s.semanas, titulo: 'Su historia' }) +
        '<div class="leyenda"><span><i style="background:#1c2430"></i>Le pidieron</span><span><i style="background:' + JCOL[jg.rol] + '"></i>Usted pidió</span><span><i style="background:#3fa35b"></i>Inventario menos lo que debe</span></div>' : '<p class="nota">Aquí verá sus semanas a medida que juegue.</p>') + '</div></div>';
      return h + '<p><button class="btn" data-act="jReiniciar">Abandonar la partida</button></p>';
    }
    // Resultados
    var res = jg.corridas.map(function (c) { return J.resumen(c.s); }), mxP = 0, mnI = 0, mxI = 0;
    jg.corridas.forEach(function (c) { c.s.e.forEach(function (e) { e.h.pedido.forEach(function (v) { if (v > mxP) mxP = v; }); e.h.inv.forEach(function (v, i) { var x = v - e.h.falt[i]; if (x > mxI) mxI = x; if (x < mnI) mnI = x; }); }); });
    var iR = jg.corridas.length - 2, iB = jg.corridas.length - 1, ah = 1 - res[iB].total / res[iR].total;
    h += '<p class="sub">Escenario: <b>' + J.ESCENARIOS[jg.esc].nombre + '</b>. ' + J.ESCENARIOS[jg.esc].nota + ' El consumidor pidió lo mismo en todas las corridas; lo único que cambia es cómo decide cada eslabón.</p>';
    h += '<div class="aviso ok">Con buffers la cadena costó $ ' + f0(res[iB].total) + ' frente a $ ' + f0(res[iR].total) + ' con la regla reactiva (' + pc(ah) + ' menos)' +
      (jg.jugada ? '. Su partida costó $ ' + f0(res[0].total) + '.' : '.') + ' Mire cómo los pedidos de la Planta se alejan de lo que pidió el consumidor: eso es el efecto látigo.</div>';
    h += '<div class="grid2">' + jg.corridas.map(function (c, k) {
      var s = c.s;
      return '<div class="card"><h3>' + esc(c.titulo) + ' — $ ' + f0(res[k].total) + '</h3><p class="nota">' + esc(c.nota) + '</p>' +
        '<h3 style="margin-top:10px">Pedidos por semana</h3>' + chartLineas([{ color: '#1c2430', datos: s.demanda, ancho: 2.4 }].concat(s.e.map(function (e, i) { return { color: JCOL[i], datos: e.h.pedido }; })), { max: mxP * 1.05, titulo: 'Pedidos' }) + jLeyenda(true) +
        '<h3 style="margin-top:14px">Inventario menos lo que se debe</h3>' + chartLineas(s.e.map(function (e, i) { return { color: JCOL[i], datos: e.h.inv.map(function (v, t) { return v - e.h.falt[t]; }) }; }), { min: mnI * 1.05, max: mxI * 1.05, titulo: 'Inventario neto' }) + jLeyenda(false) +
        '<div class="tw" style="margin-top:12px"><table><tr><th>Eslabón</th><th>Costo</th><th>Semanas debiendo</th><th>Variación de pedidos</th></tr>' +
        res[k].filas.map(function (f) { return '<tr><td>' + esc(f.nombre) + '</td><td>$ ' + f0(f.costo) + '</td><td>' + f.semanasFaltante + '</td><td>× ' + f1(f.amplificacion) + '</td></tr>'; }).join('') + '</table></div></div>';
    }).join('') + '</div>';
    h += '<p class="nota">«Variación de pedidos» compara cuánto oscilan los pedidos de cada eslabón con cuánto osciló la demanda del consumidor (× 1 = igual). Los buffers piden por lotes del tamaño de la zona verde, así que sus pedidos también varían; la diferencia es que cuentan todo lo que viene en camino y no persiguen cada faltante.</p>' +
      '<p><button class="btn pri" data-act="jReiniciar">Jugar otra vez</button></p>';
    return h;
  }

  /* ---------- Render y eventos ---------- */
  var VISTAS = { resumen: vResumen, buffers: vBuffers, plan: vPlan, ejec: vEjec, juego: vJuego, metodo: vMetodo, anal: vAnalitica, proy: vProyeccion, tiempo: vTiempo, pron: vPron, estr: vEstr, datos: vDatos, ajustes: vAjustes, ayuda: vAyuda };
  var $ = function (id) { return document.getElementById(id); };
  function render() {
    $('modo').querySelectorAll('button').forEach(function (b) { b.classList.toggle('on', b.dataset.modo === st.modo); });
    $('tabs').innerHTML = TABS.map(function (t) { return '<button data-tab="' + t[0] + '"' + (t[0] === st.tab ? ' class="on"' : '') + '>' + (t[0] === 'estr' && st.modo === 'distribucion' ? 'Red' : t[1]) + '</button>'; }).join('');
    $('main').innerHTML = VISTAS[st.tab]();
    var r = st.sel && R.byId.get(st.sel), dw = $('drawer');
    dw.hidden = !r; dw.innerHTML = r ? vDetalle(r) : '';
  }
  function ir(tab) { st.tab = tab; st.filtro = ''; st.msg = null; render(); window.scrollTo(0, 0); }

  document.addEventListener('click', function (ev) {
    var t = ev.target, el;
    if ((el = t.closest('[data-modo]'))) { st.modo = el.dataset.modo; st.sel = null; st.pronSel = null; st.msg = null; st.filtro = ''; guardar(); recalc(); render(); if (carpeta.h) sincronizar(); return; }
    if ((el = t.closest('[data-tab]'))) { ir(el.dataset.tab); return; }
    if ((el = t.closest('[data-act]'))) {
      var a = el.dataset.act;
      if (a === 'cerrar') { st.sel = null; render(); }
      else if (a === 'csv') csvOrdenes();
      else if (a === 'plantilla') plantilla();
      else if (a === 'ejemplo') { st.datos[st.modo] = null; guardar(); recalc(); st.msg = { t: 'ok', h: 'Se restauraron los datos de ejemplo.' }; render(); }
      else if (a === 'reset') { st.settings = {}; guardar(); recalc(); render(); }
      else if (a === 'jIniciar') { jg.s = J.abrir(J.nuevo(jg.esc)); jg.jugada = true; jg.pista = false; jg.fase = 'jugando'; render(); var ji = $('jPedido'); if (ji) ji.focus(); }
      else if (a === 'jAuto') { jg.jugada = false; jTerminar(); render(); }
      else if (a === 'jPedir') jPedir();
      else if (a === 'jSugerir') { jg.pista = !jg.pista; render(); }
      else if (a === 'jReiniciar') { jg.fase = 'inicio'; jg.s = null; render(); }
      else if (a === 'iaCargar') iaCargar();
      else if (a === 'iaEvaluar') iaEvaluar();
      else if (a === 'carpeta') elegirCarpeta();
      else if (a === 'reconectar') reconectar();
      else if (a === 'releer') sincronizar();
      else if (a === 'guardarDatos') guardarDatosEnCarpeta();
      else if (a === 'desconectar') desconectar();
      else if (a === 'aprobar') aprobar(el.dataset.id);
      else if (a === 'cerrarOrden') cerrarOrden(el.dataset.oid);
      else if (a === 'vertiempo') { st.simSel = el.dataset.id; st.sel = null; ir('tiempo'); }
      else if (a === 'verpron') { st.pronSel = el.dataset.id; st.sel = null; ir('pron'); }
      return;
    }
    if ((el = t.closest('[data-item]'))) { st.sel = el.dataset.item; render(); return; }
    if (st.sel && !t.closest('#drawer')) { st.sel = null; render(); }
  });
  document.addEventListener('input', function (ev) {
    if (ev.target.id !== 'filtro') return;
    st.filtro = ev.target.value; render();
    var f = $('filtro'); f.focus(); f.setSelectionRange(f.value.length, f.value.length);
  });
  document.addEventListener('change', function (ev) {
    var t = ev.target;
    if (t.dataset.check) { st.checks = st.checks || {}; st.checks[t.dataset.check] = t.checked; guardar(); render(); }
    else if (t.id === 'archivo' && t.files[0]) importar(t.files[0]);
    else if (t.id === 'pronSel') { st.pronSel = t.value; render(); }
    else if (t.id === 'simSel') { st.simSel = t.value; render(); }
    else if (t.id === 'simDias') { st.simDias = +t.value; render(); }
    else if (t.id === 'simFuente') { st.simFuente = t.value; render(); }
    else if (t.id === 'proyModo') { st.proyModo = t.value; render(); }
    else if (t.id === 'proyPct') { var pv = parseFloat(t.value); if (isFinite(pv) && pv > -100) { st.proyPct = pv; render(); } }
    else if (t.id === 'jRol') jg.rol = +t.value;
    else if (t.id === 'jEsc') jg.esc = t.value;
    else if (t.dataset.set) {
      var k = t.dataset.set, v = t.value;
      if (t.type === 'number') { v = parseFloat(v); if (!isFinite(v) || v < 0) { render(); return; } }
      st.settings[k] = v; guardar(); recalc(); render();
    }
  });
  document.addEventListener('mousemove', function (ev) {
    var svg = ev.target.closest && ev.target.closest('svg.tsim'), tip = $('tip');
    if (!tip) return;
    if (!svg || !simActual) { tip.hidden = true; var g0 = $('guia'); if (g0) g0.setAttribute('visibility', 'hidden'); return; }
    var bx = svg.getBoundingClientRect(), d = simActual.dias, n = d.length;
    var xv = (ev.clientX - bx.left) / bx.width * GW;
    var i = Math.max(0, Math.min(n - 1, Math.round((xv - GL) / (GW - GL - GR) * (n - 1)))), p = d[i];
    var gx = GL + (GW - GL - GR) * (n > 1 ? i / (n - 1) : 0), g = $('guia');
    g.setAttribute('x1', gx); g.setAttribute('x2', gx); g.setAttribute('visibility', 'visible');
    tip.hidden = false;
    tip.innerHTML = '<b>' + fecha(p.f) + '</b><br>Disponible: ' + f0(p.oh) + '<br>Flujo neto: ' + f0(p.nfp) + '<br>Demanda: ' + f0(p.dem) +
      '<br>Topes: ' + f0(p.roja) + ' / ' + f0(p.toy) + ' / ' + f0(p.tog) + (p.pide ? '<br><b>Orden: ' + f0(p.pide) + '</b>' : '');
    var pct = gx / GW * 100;
    tip.style.left = pct > 70 ? '' : 'calc(' + pct + '% + 12px)';
    tip.style.right = pct > 70 ? 'calc(' + (100 - pct) + '% + 12px)' : '';
  });
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' && ev.target.id === 'jPedido') { jPedir(); return; } if (ev.key === 'Escape' && st.sel) { st.sel = null; render(); } });

  cargar(); recalc(); render(); restaurarCarpeta();
  window.FlujoLibre = { estado: st, carpeta: carpeta, resultado: function () { return R; }, usarCarpeta: function (h) { carpeta.h = h; return sincronizar(); } };
})();
