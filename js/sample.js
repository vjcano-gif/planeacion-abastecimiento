/* FlujoLibre — datos de ejemplo (ficticios) para producción y distribución. */
(function (root) {
  'use strict';
  var E = root.DDEngine;

  function rng(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function gauss(r) { return Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r()); }

  // Historia diaria de 36 meses completos más el mes en curso
  function historia(r, hoy, sku, ubic, o) {
    var y = +hoy.slice(0, 4), m = +hoy.slice(5, 7) - 36;
    while (m < 1) { m += 12; y--; }
    var ini = y + '-' + String(m).padStart(2, '0') + '-01', N = E.dayDiff(ini, hoy), rows = [];
    for (var i = 0; i < N; i++) {
      var f = E.addDays(ini, i), mes = +f.slice(5, 7);
      var dow = new Date(f + 'T12:00:00Z').getUTCDay();
      if (dow === 0) continue;
      var nivel = o.base * (1 + (o.tend || 0) * i / N) * (1 + (o.amp || 0) * Math.cos(2 * Math.PI * (mes - (o.pico || 12)) / 12));
      var q = Math.round(nivel * (1 + (o.cv || 0.3) * gauss(r)) * 7 / 6);
      if (q > 0) rows.push({ fecha: f, sku: sku, ubicacion: ubic, cantidad: q });
    }
    return rows;
  }

  // Deja inventarios, tránsitos y pedidos en estados variados para que se vean todos los colores
  function estado(data, hoy, r, patron) {
    var res = E.compute(data, { hoy: hoy }), k = 0;
    data.articulos.forEach(function (a) {
      var x = res.byId.get(E.idOf(a.sku, a.ubicacion));
      if (!x || !x.buffer) { a.inventario = Math.round((x ? x.adu : 0) * 3); return; }
      var p = patron[k++ % patron.length];
      // p[0] es el flujo neto buscado como fracción del tope verde: una parte queda en inventario y el resto en órdenes en camino
      var meta = x.tog * p[0], oh = Math.min(meta, x.objetivo * (0.45 + 1.1 * r())), camino = meta - oh;
      a.inventario = Math.round(oh);
      var nOrd = camino > 0.2 * x.verde ? Math.max(1, Math.round(camino / Math.max(x.verde, 1))) : 0, dl = Math.max(1, Math.ceil(x.dlt));
      for (var j = 0; j < nOrd; j++) data.suministro.push({ sku: a.sku, ubicacion: a.ubicacion || '', fecha: E.addDays(hoy, Math.max(1, Math.round(dl * (j + 0.6) / nOrd))), cantidad: Math.round(camino / nOrd) });
      if (!nOrd) a.inventario = Math.round(meta);
      if (x.directa && !x.parents.length) {
        data.pedidos.push({ sku: a.sku, ubicacion: a.ubicacion || '', fecha: hoy, cantidad: Math.round(x.adu * (0.6 + r())) });
        data.pedidos.push({ sku: a.sku, ubicacion: a.ubicacion || '', fecha: E.addDays(hoy, 2), cantidad: Math.round(x.adu * 0.8) });
        if (p[2]) data.pedidos.push({ sku: a.sku, ubicacion: a.ubicacion || '', fecha: E.addDays(hoy, Math.max(2, Math.floor(x.dlt * 0.6))), cantidad: Math.round(x.roja * 0.9) });
      }
      if (p[3]) a._corto = true;
    });
    // El patrón de los componentes se aplica después de descontar lo que hoy les piden sus padres
    var res2 = E.compute(data, { hoy: hoy });
    data.articulos.forEach(function (a) {
      var x = res2.byId.get(E.idOf(a.sku, a.ubicacion));
      if (x && x.buffer && !a._corto) a.inventario += Math.round(x.demDependiente);
      delete a._corto;
    });
    return data;
  }

  function art(sku, desc, tipo, lt, moq, mult, ciclo, buffer, costo, ubic, origen) {
    return { sku: sku, descripcion: desc, ubicacion: ubic || '', origen: origen || '', tipo: tipo, lead_time: lt, moq: moq, multiplo: mult, ciclo_pedido: ciclo,
      buffer: buffer, tipo_buffer: '', zona_roja: '', zona_amarilla: '', zona_verde: '', factor_lt: '', factor_var: '', daf: 1, inventario: 0, costo: costo,
      und_estiba: '', recurso: '', min_und: '', proveedor: '', perfil: '', min_exhibicion: '', tolerancia_cliente: '' };
  }
  function pon(d, sku, campos) { d.articulos.forEach(function (a) { if (a.sku === sku) Object.assign(a, campos); }); }

  function produccion(hoy) {
    hoy = hoy || E.todayISO();
    var r = rng(20161);
    var d = { modo: 'produccion', ejemplo: true, hoy: hoy, pedidos: [], suministro: [] };
    d.articulos = [
      art('SILLA-EJ', 'Silla ejecutiva', 'Fabricado', 2, 20, 0, 0, true, 420000),
      art('SILLA-OP', 'Silla operativa', 'Fabricado', 2, 20, 0, 0, true, 265000),
      art('SILLA-VI', 'Silla visitante', 'Fabricado', 1, 10, 0, 0, true, 150000),
      art('BASE-5', 'Base estrella de 5 puntas', 'Fabricado', 3, 100, 0, 0, true, 48000),
      art('ASIENTO-T', 'Asiento tapizado', 'Fabricado', 4, 0, 0, 0, false, 62000),
      art('ESPALDAR-M', 'Espaldar en malla', 'Fabricado', 3, 0, 0, 0, false, 55000),
      art('PISTON-G', 'Pistón de gas', 'Comprado', 35, 500, 0, 0, true, 21000),
      art('RUEDA-50', 'Rueda de 50 mm', 'Comprado', 12, 1000, 100, 0, true, 1800),
      art('ALUM-BR', 'Brazo de aluminio para base', 'Comprado', 15, 300, 0, 0, true, 6500),
      art('ESPUMA-HD', 'Espuma de alta densidad', 'Comprado', 7, 0, 0, 0, false, 14000),
      art('TELA-NG', 'Tela negra (metros)', 'Comprado', 20, 200, 0, 0, true, 16000),
      art('MALLA-NY', 'Malla de nylon (metros)', 'Comprado', 25, 150, 0, 0, true, 19000),
      art('MARCO-PL', 'Marco plástico de espaldar', 'Comprado', 10, 0, 0, 0, false, 11000),
      art('TORN-KIT', 'Kit de tornillería', 'Comprado', 5, 500, 0, 7, true, 2400)
    ];
    d.estructura = [
      ['SILLA-EJ', 'BASE-5', 1], ['SILLA-EJ', 'ASIENTO-T', 1], ['SILLA-EJ', 'ESPALDAR-M', 1], ['SILLA-EJ', 'PISTON-G', 1], ['SILLA-EJ', 'TELA-NG', 0.5], ['SILLA-EJ', 'TORN-KIT', 1],
      ['SILLA-OP', 'BASE-5', 1], ['SILLA-OP', 'ASIENTO-T', 1], ['SILLA-OP', 'ESPALDAR-M', 1], ['SILLA-OP', 'PISTON-G', 1], ['SILLA-OP', 'TORN-KIT', 1],
      ['SILLA-VI', 'ASIENTO-T', 1], ['SILLA-VI', 'TELA-NG', 0.3], ['SILLA-VI', 'TORN-KIT', 1],
      ['BASE-5', 'ALUM-BR', 5], ['BASE-5', 'RUEDA-50', 5],
      ['ASIENTO-T', 'ESPUMA-HD', 1], ['ASIENTO-T', 'TELA-NG', 0.8],
      ['ESPALDAR-M', 'MARCO-PL', 1], ['ESPALDAR-M', 'MALLA-NY', 0.6]
    ].map(function (e) { return { padre: e[0], componente: e[1], cantidad: e[2] }; });
    d.historia = [].concat(
      historia(r, hoy, 'SILLA-EJ', '', { base: 28, tend: 0.25, amp: 0.15, pico: 2, cv: 0.35 }),
      historia(r, hoy, 'SILLA-OP', '', { base: 52, tend: 0.1, amp: 0.25, pico: 1, cv: 0.25 }),
      historia(r, hoy, 'SILLA-VI', '', { base: 18, tend: -0.1, amp: 0.1, pico: 7, cv: 1.3 }),
      historia(r, hoy, 'RUEDA-50', '', { base: 14, cv: 2 })
    );
    // Ejemplos de lo demás que maneja la app: mín-máx, artículo gestionado por lead time, ajuste planeado, espacio y capacidad
    pon(d, 'TORN-KIT', { tipo_buffer: 'MM', und_estiba: 2000 });
    pon(d, 'MARCO-PL', { tipo_buffer: 'LT' });
    pon(d, 'SILLA-EJ', { und_estiba: 12, recurso: 'Ensamble', min_und: 14 });
    pon(d, 'SILLA-OP', { und_estiba: 16, recurso: 'Ensamble', min_und: 10 });
    pon(d, 'SILLA-VI', { und_estiba: 24, recurso: 'Ensamble', min_und: 6 });
    pon(d, 'BASE-5', { und_estiba: 60, recurso: 'Inyección', min_und: 3 });
    pon(d, 'PISTON-G', { und_estiba: 400 }); pon(d, 'RUEDA-50', { und_estiba: 5000 }); pon(d, 'ALUM-BR', { und_estiba: 800 });
    pon(d, 'TELA-NG', { und_estiba: 600 }); pon(d, 'MALLA-NY', { und_estiba: 600 });
    d.recursos = [{ recurso: 'Tapicería', minutos_dia: 960, dias_semana: 6, alistamiento_min: 20 }, { recurso: 'Ensamble', minutos_dia: 1440, dias_semana: 6, alistamiento_min: 15 }, { recurso: 'Inyección', minutos_dia: 420, dias_semana: 5, alistamiento_min: 45 }];
    // Rutas: las sillas pasan por tapicería y luego por ensamble
    d.rutas = [['SILLA-EJ', 10, 'Tapicería', 3], ['SILLA-EJ', 20, 'Ensamble', 6], ['SILLA-OP', 10, 'Tapicería', 2], ['SILLA-OP', 20, 'Ensamble', 4], ['SILLA-VI', 10, 'Tapicería', 2], ['SILLA-VI', 20, 'Ensamble', 3]]
      .map(function (x) { return { sku: x[0], secuencia: x[1], recurso: x[2], min_und: x[3], alistamiento_min: '' }; });
    d.festivos = [{ fecha: E.addDays(hoy, 4) }];
    d.descuentos = [{ sku: 'PISTON-G', ubicacion: '', cantidad_desde: 5000, descuento_pct: 3 }, { sku: 'TELA-NG', ubicacion: '', cantidad_desde: 6000, descuento_pct: 2 }];
    pon(d, 'SILLA-EJ', { tolerancia_cliente: 3 }); pon(d, 'SILLA-OP', { tolerancia_cliente: 3 }); pon(d, 'SILLA-VI', { tolerancia_cliente: 5 });
    // Perfiles de buffer: lo que es «largo» para un fabricado no lo es para un importado
    d.rangos = [{ tipo: 'P', lt_corto_max: 10, lt_medio_max: 24 }, { tipo: 'M', lt_corto_max: 5, lt_medio_max: 14 }];
    d.perfiles = [{ perfil: 'PLL', factor_lt: 0.25, factor_var: 0.3 }];
    pon(d, 'RUEDA-50', { perfil: 'PMH' });
    pon(d, 'PISTON-G', { proveedor: 'Importadora Andina' }); pon(d, 'RUEDA-50', { proveedor: 'Importadora Andina' }); pon(d, 'ALUM-BR', { proveedor: 'Importadora Andina' });
    pon(d, 'TELA-NG', { proveedor: 'Textiles del Valle' }); pon(d, 'MALLA-NY', { proveedor: 'Textiles del Valle' });
    d.proveedores = [{ proveedor: 'Importadora Andina', minimo_valor: 80000000, minimo_estibas: '' }, { proveedor: 'Textiles del Valle', minimo_valor: 70000000, minimo_estibas: '' }];
    d.ajustes = [{ sku: 'SILLA-VI', ubicacion: '', tipo: 'demanda', factor: 1.3, desde: E.addDays(hoy, -10), hasta: E.addDays(hoy, 45) }];
    d.suministro.push({ sku: 'MARCO-PL', ubicacion: '', fecha: E.addDays(hoy, 2), cantidad: 900 });
    d.suministro.push({ sku: 'MARCO-PL', ubicacion: '', fecha: E.addDays(hoy, -1), cantidad: 400 });
    return estado(d, hoy, r, [[0.55, 0, 1], [0.2, 0.6, 0], [0.75, 0, 0], [0.3, 1, 0], [0.08, 0, 0], [0.45, 0.5, 0], [0.9, 0, 0], [0.02, 0.4, 0], [0.9, 0, 0], [0.35, 0, 0]]);
  }

  function distribucion(hoy) {
    hoy = hoy || E.todayISO();
    var r = rng(4077);
    var d = { modo: 'distribucion', ejemplo: true, hoy: hoy, estructura: [], pedidos: [], suministro: [], articulos: [], historia: [] };
    var prods = [
      ['LIC-15', 'Licuadora de 1,5 litros', 30, 600, 12, 95000, { amp: 0.2, pico: 12, cv: 0.35, tend: 0.1 }],
      ['VEN-PIE', 'Ventilador de pie', 45, 400, 18, 140000, { amp: 0.55, pico: 7, cv: 0.4, tend: 0.05 }],
      ['PLA-VAP', 'Plancha de vapor', 25, 500, 8, 70000, { amp: 0.1, pico: 5, cv: 1.6, tend: 0 }],
      ['OLL-ARR', 'Olla arrocera', 35, 300, 10, 110000, { amp: 0.3, pico: 12, cv: 0.3, tend: 0.2 }]
    ];
    var sedes = [['Medellín', 2, 0.4], ['Cali', 3, 0.35], ['Barranquilla', 4, 0.25]], cedi = 'CEDI Bogotá';
    prods.forEach(function (p) {
      d.articulos.push(art(p[0], p[1], 'Comprado', p[2], p[3], 0, 0, true, p[5], cedi, ''));
      sedes.forEach(function (s) {
        d.articulos.push(art(p[0], p[1], 'Trasladado', s[1], 0, 6, 0, true, p[5], s[0], cedi));
        var o = Object.assign({}, p[6], { base: p[4] * s[2] * 3 });
        d.historia = d.historia.concat(historia(r, hoy, p[0], s[0], o));
      });
    });
    d.historia = d.historia.concat(historia(r, hoy, 'LIC-15', cedi, { base: 4, cv: 0.7 }));
    d.articulos.forEach(function (a) { a.und_estiba = { 'LIC-15': 48, 'VEN-PIE': 20, 'PLA-VAP': 96, 'OLL-ARR': 36 }[a.sku]; });
    d.recursos = [];
    d.rangos = [{ tipo: 'D', lt_corto_max: 2, lt_medio_max: 3 }, { tipo: 'P', lt_corto_max: 15, lt_medio_max: 30 }];
    d.perfiles = [];
    d.articulos.forEach(function (a) { if (!a.origen) a.proveedor = a.sku === 'VEN-PIE' || a.sku === 'LIC-15' ? 'Electro Oriente' : 'Hogar Global'; });
    d.proveedores = [{ proveedor: 'Electro Oriente', minimo_valor: '', minimo_estibas: 300 }, { proveedor: 'Hogar Global', minimo_valor: 100000000, minimo_estibas: '' }];
    d.rutas = []; d.festivos = []; d.descuentos = [];
    // Ejemplo de retail: mínimo de exhibición en dos sedes
    d.articulos.forEach(function (a) { if (a.sku === 'PLA-VAP' && a.origen) a.min_exhibicion = 45; if (a.origen) a.tolerancia_cliente = 0; });
    d.ajustes = [{ sku: 'VEN-PIE', ubicacion: 'Barranquilla', tipo: 'demanda', factor: 1.25, desde: E.addDays(hoy, -5), hasta: E.addDays(hoy, 60) }];
    return estado(d, hoy, r, [[0.5, 0.8, 0], [0.25, 0, 1], [0.6, 0, 0], [0.1, 0, 0],
      [0.05, 0.5, 0, 1], [0.2, 0, 0], [0.3, 0, 0], [0.15, 0, 0],
      [0.7, 0, 0], [0.85, 0, 0], [0.4, 0, 0], [1.25, 0, 0],
      [0.3, 1, 0], [0.04, 0, 0], [0.65, 0, 0], [0.5, 0, 0]]);
  }

  root.DDSample = { produccion: produccion, distribucion: distribucion };
})(typeof window !== 'undefined' ? window : globalThis);
