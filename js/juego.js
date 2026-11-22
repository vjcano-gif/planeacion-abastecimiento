/* Planeación de Abastecimiento — Juego de la cadena: simulación didáctica de una cadena de suministro de tres eslabones.
   Cada semana: llegan despachos, se atiende la demanda, y cada eslabón decide cuánto pedir.
   El pedido tarda una semana en ser visto por quien abastece, y el despacho tarda el tiempo de entrega. */
(function (root) {
  'use strict';
  var BASE = 40, COSTO_INV = 1, COSTO_FALT = 3;
  var ESLABONES = [{ nombre: 'Tienda', lt: 2 }, { nombre: 'Centro de distribución', lt: 2 }, { nombre: 'Planta', lt: 3 }];
  var ESCENARIOS = {
    salto: { nombre: 'Salto de demanda', nota: 'La demanda sube en la semana 7 y se queda arriba.' },
    promo: { nombre: 'Promoción pasajera', nota: 'Tres semanas de promoción y luego todo vuelve a lo normal.' },
    ruido: { nombre: 'Demanda variable', nota: 'El promedio no cambia, pero cada semana varía bastante.' }
  };

  function rng(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function demanda(esc, semanas, semilla) {
    var r = rng(semilla || 7), d = [];
    for (var t = 0; t < semanas; t++) {
      var u = r() + r() + r() - 1.5, v;
      if (esc === 'promo') v = (t >= 7 && t <= 9 ? 80 : BASE) + u * 6;
      else if (esc === 'ruido') v = BASE + u * 22;
      else v = (t >= 6 ? 60 : BASE) + u * 7;
      d.push(Math.max(0, Math.round(v)));
    }
    return d;
  }

  function nuevo(esc, semanas, semilla) {
    semanas = semanas || 30;
    var s = { t: 0, semanas: semanas, esc: esc, demanda: demanda(esc, semanas, semilla), abierta: false };
    s.e = ESLABONES.map(function (x, i) {
      var ultimo = i === ESLABONES.length - 1, lleg = new Array(semanas + 10).fill(0);
      for (var k = 0; k < x.lt + (ultimo ? 1 : 0); k++) lleg[k] = BASE;
      return { nombre: x.nombre, lt: x.lt, inv: 3 * BASE, falt: 0, llegadas: lleg, pedidoPrevio: BASE, pend: (x.lt + 1) * BASE, costo: 0,
        dem: 0, envio: 0, llega: 0, h: { dem: [], inv: [], falt: [], pedido: [], costo: [] } };
    });
    return s;
  }

  // Primera mitad de la semana: llegan despachos y se atiende la demanda
  function abrir(s) {
    if (s.abierta || s.t >= s.semanas) return s;
    var t = s.t;
    s.e.forEach(function (e) { e.llega = e.llegadas[t] || 0; e.inv += e.llega; e.pend -= e.llega; });
    s.e.forEach(function (e, i) {
      e.dem = i === 0 ? s.demanda[t] : s.e[i - 1].pedidoPrevio;
      var total = e.dem + e.falt;
      e.envio = Math.min(e.inv, total); e.inv -= e.envio; e.falt = total - e.envio;
      if (i > 0) s.e[i - 1].llegadas[t + s.e[i - 1].lt] += e.envio;
    });
    s.abierta = true;
    return s;
  }
  // Segunda mitad: cada eslabón registra su pedido y se cobran los costos
  function cerrar(s, pedidos) {
    var t = s.t, n = s.e.length;
    s.e.forEach(function (e, i) {
      var p = Math.max(0, Math.round(pedidos[i] || 0));
      e.pedidoPrevio = p; e.pend += p;
      if (i === n - 1) e.llegadas[t + 1 + e.lt] += p;
      var c = e.inv * COSTO_INV + e.falt * COSTO_FALT;
      e.costo += c;
      e.h.dem.push(e.dem); e.h.inv.push(e.inv); e.h.falt.push(e.falt); e.h.pedido.push(p); e.h.costo.push(c);
    });
    s.t++; s.abierta = false;
    return s;
  }

  function prom(a, k) { var x = a.slice(-k), t = 0; x.forEach(function (v) { t += v; }); return x.length ? t / x.length : BASE; }
  function zonas(e) {
    var adu = prom(e.h.dem.concat([e.dem]), 8), dlt = e.lt + 1, am = adu * dlt, roja = am * 0.3 * 1.5, verde = Math.max(am * 0.3, adu);
    return { adu: adu, roja: roja, toy: roja + am, tog: roja + am + verde, nfp: e.inv + e.pend - e.falt };
  }
  var POLITICAS = {
    // Reacciona al inventario de hoy y casi no cuenta lo que ya viene en camino
    reactiva: function (e) {
      var f = prom(e.h.dem.concat([e.dem]), 4);
      return Math.max(0, Math.round(f + 0.5 * (3 * f - (e.inv - e.falt)) + 0.15 * ((e.lt + 1) * f - e.pend)));
    },
    // Repone con buffer: pide cuando el flujo neto llega al tope amarillo, hasta el tope verde
    buffer: function (e) {
      var z = zonas(e);
      return z.nfp <= z.toy ? Math.max(0, Math.round(z.tog - z.nfp)) : 0;
    }
  };

  function correr(esc, politicas, semanas, semilla) {
    var s = nuevo(esc, semanas, semilla);
    while (s.t < s.semanas) { abrir(s); cerrar(s, s.e.map(function (e, i) { return POLITICAS[politicas[i]](e); })); }
    return s;
  }
  function desv(a) {
    if (a.length < 2) return 0;
    var m = 0, v = 0; a.forEach(function (x) { m += x; }); m /= a.length;
    a.forEach(function (x) { v += (x - m) * (x - m); });
    return Math.sqrt(v / (a.length - 1));
  }
  function resumen(s) {
    var d0 = desv(s.demanda.slice(0, s.t)) || 1, total = 0;
    var filas = s.e.map(function (e) {
      total += e.costo;
      var sem = 0; e.h.falt.forEach(function (x) { if (x > 0) sem++; });
      return { nombre: e.nombre, costo: e.costo, amplificacion: desv(e.h.pedido) / d0, semanasFaltante: sem, invProm: prom(e.h.inv, e.h.inv.length) };
    });
    return { total: total, filas: filas };
  }

  root.DDJuego = { nuevo: nuevo, abrir: abrir, cerrar: cerrar, correr: correr, resumen: resumen, zonas: zonas, POLITICAS: POLITICAS,
    ESLABONES: ESLABONES, ESCENARIOS: ESCENARIOS, BASE: BASE, COSTO_INV: COSTO_INV, COSTO_FALT: COSTO_FALT };
})(typeof window !== 'undefined' ? window : globalThis);
