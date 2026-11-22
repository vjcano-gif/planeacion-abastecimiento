/* Planeación de Abastecimiento — motor de cálculo (buffers, flujo neto, pronósticos).
   Sin dependencias. Todo corre en el navegador. */
(function (root) {
  'use strict';

  var MS = 86400000;
  function pad(n) { return String(n).padStart(2, '0'); }
  function isoFromUTC(t) {
    var d = new Date(t);
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  }
  function utc(iso) { return Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)); }
  function addDays(iso, n) { return isoFromUTC(utc(iso) + n * MS); }
  function dayDiff(a, b) { return Math.round((utc(b) - utc(a)) / MS); }
  function todayISO() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function parseDate(v) {
    if (v == null || v === '') return null;
    if (v instanceof Date) {
      if (isNaN(v.getTime())) return null;
      var d = new Date(v.getTime() + 12 * 3600000);
      return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    }
    if (typeof v === 'number') return isoFromUTC(Date.UTC(1899, 11, 30) + Math.floor(v) * MS);
    var s = String(v).trim(), m;
    if ((m = /^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/.exec(s))) return m[1] + '-' + pad(+m[2]) + '-' + pad(+m[3]);
    if ((m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/.exec(s))) return m[3] + '-' + pad(+m[2]) + '-' + pad(+m[1]);
    return null;
  }
  function num(v, def) {
    if (v == null || v === '') return def;
    if (typeof v === 'number') return isFinite(v) ? v : def;
    var s = String(v).trim().replace(/\s/g, '');
    if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(',', '.');
    var n = parseFloat(s);
    return isFinite(n) ? n : def;
  }
  function idOf(sku, ubic) { return ubic ? sku + '@' + ubic : String(sku); }

  var DEFAULTS = {
    ventanaADU: 90,          // días de historia (o de pronóstico) para el ADU
    modoADU: 'pasado',       // pasado | futuro | mixto
    periodo: 'mensual',      // mensual | semanal (agrupación para pronosticar)
    ltCortoMax: 7,           // DLT <= es "corto"
    ltMedioMax: 21,          // DLT <= es "medio"; mayor es "largo"
    fLTcorto: 0.8, fLTmedio: 0.5, fLTlargo: 0.3,
    cvBajoMax: 0.3,          // CV semanal <= es variabilidad "baja"
    cvMedioMax: 0.7,
    fVarBaja: 0.25, fVarMedia: 0.5, fVarAlta: 0.75,
    picoUmbral: 0.5,         // fracción de la zona roja que califica un pico
    alertaOH: 0.5,           // fracción de la zona roja para alerta roja de inventario
    alertaADU: 0.25,         // cambio del ADU frente a la ventana anterior que se resalta
    tasaInv: 0.24,           // costo anual de mantener inventario, como fracción del costo
    diasLento: 30,           // días sin demanda para llamar lento a un artículo
    hoy: ''                  // vacío = fecha del sistema
  };

  /* ---------- Pronósticos ---------- */
  function mean(y, a, b) { var s = 0; for (var i = a; i < b; i++) s += y[i]; return b > a ? s / (b - a) : 0; }
  function flat(v, h) { var r = []; for (var i = 0; i < h; i++) r.push(v); return r; }
  var GRID = [0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];

  function mNaive(y, h) {
    var n = y.length, fit = [NaN];
    for (var t = 1; t < n; t++) fit.push(y[t - 1]);
    return { fit: fit, fc: flat(y[n - 1], h) };
  }
  function mSNaive(y, h, s) {
    var n = y.length; if (s < 2 || n < s + 1) return null;
    var fit = [], fc = [];
    for (var t = 0; t < n; t++) fit.push(t < s ? NaN : y[t - s]);
    for (var k = 0; k < h; k++) fc.push(y[n - s + (k % s)]);
    return { fit: fit, fc: fc };
  }
  function mMA(k) {
    return function (y, h) {
      var n = y.length; if (n < k) return null;
      var fit = [];
      for (var t = 0; t < n; t++) fit.push(t < k ? NaN : mean(y, t - k, t));
      return { fit: fit, fc: flat(mean(y, n - k, n), h) };
    };
  }
  function mSES(y, h) {
    var n = y.length; if (n < 3) return null;
    var best = null;
    GRID.forEach(function (a) {
      var L = y[0], sse = 0, fit = [NaN];
      for (var t = 1; t < n; t++) { fit.push(L); var e = y[t] - L; sse += e * e; L = L + a * e; }
      if (!best || sse < best.sse) best = { sse: sse, fit: fit, fc: flat(L, h), params: 'α=' + a };
    });
    return best;
  }
  function mHolt(y, h) {
    var n = y.length; if (n < 4) return null;
    var best = null;
    GRID.forEach(function (a) {
      GRID.forEach(function (b) {
        var L = y[0], T = y[1] - y[0], sse = 0, fit = [NaN];
        for (var t = 1; t < n; t++) {
          var f = L + T; fit.push(f); var e = y[t] - f; sse += e * e;
          var L0 = L; L = a * y[t] + (1 - a) * f; T = b * (L - L0) + (1 - b) * T;
        }
        if (!best || sse < best.sse) {
          var fc = []; for (var k = 1; k <= h; k++) fc.push(L + k * T);
          best = { sse: sse, fit: fit, fc: fc, params: 'α=' + a + ' β=' + b };
        }
      });
    });
    return best;
  }
  function mHW(y, h, s) {
    var n = y.length; if (s < 2 || n < 2 * s) return null;
    var A = [0.1, 0.2, 0.3, 0.5, 0.7, 0.9], B = [0.01, 0.05, 0.1, 0.3], G = [0.05, 0.1, 0.3, 0.5, 0.8];
    var best = null;
    A.forEach(function (a) { B.forEach(function (b) { G.forEach(function (g) {
      var L = mean(y, 0, s), T = (mean(y, s, 2 * s) - L) / s, S = [], sse = 0, fit = [], t;
      for (t = 0; t < s; t++) { S.push(y[t] - L); fit.push(NaN); }
      for (t = s; t < n; t++) {
        var i = t % s, f = L + T + S[i]; fit.push(f); var e = y[t] - f; sse += e * e;
        var L0 = L; L = a * (y[t] - S[i]) + (1 - a) * (L + T);
        T = b * (L - L0) + (1 - b) * T; S[i] = g * (y[t] - L) + (1 - g) * S[i];
      }
      if (!best || sse < best.sse) {
        var fc = []; for (var k = 0; k < h; k++) fc.push(L + (k + 1) * T + S[(n + k) % s]);
        best = { sse: sse, fit: fit, fc: fc, params: 'α=' + a + ' β=' + b + ' γ=' + g };
      }
    }); }); });
    return best;
  }
  function mTrend(y, h) {
    var n = y.length; if (n < 4) return null;
    var sx = 0, sy = 0, sxy = 0, sxx = 0;
    for (var t = 0; t < n; t++) { sx += t; sy += y[t]; sxy += t * y[t]; sxx += t * t; }
    var den = n * sxx - sx * sx, b = den ? (n * sxy - sx * sy) / den : 0, a = (sy - b * sx) / n;
    var fit = [], fc = [];
    for (t = 0; t < n; t++) fit.push(a + b * t);
    for (var k = 0; k < h; k++) fc.push(a + b * (n + k));
    return { fit: fit, fc: fc };
  }
  // Promedio móvil doble: para series con tendencia lineal
  function mDMA(k) {
    return function (y, h) {
      var n = y.length; if (n < 2 * k + 1) return null;
      var M = [], M2 = [], fit = [], t, a = 0, b = 0;
      for (t = 0; t < n; t++) M.push(t >= k - 1 ? mean(y, t - k + 1, t + 1) : NaN);
      for (t = 0; t < n; t++) M2.push(t >= 2 * k - 2 ? mean(M, t - k + 1, t + 1) : NaN);
      for (t = 0; t < n; t++) {
        fit.push(t >= 2 * k - 1 ? a + b : NaN);
        if (t >= 2 * k - 2) { a = 2 * M[t] - M2[t]; b = 2 / (k - 1) * (M[t] - M2[t]); }
      }
      var fc = []; for (var p = 1; p <= h; p++) fc.push(a + b * p);
      return { fit: fit, fc: fc };
    };
  }
  // Winters multiplicativo: tendencia y estacionalidad proporcional al nivel
  function mWM(y, h, s) {
    var n = y.length; if (s < 2 || n < 2 * s) return null;
    var L0 = mean(y, 0, s); if (L0 <= 0) return null;
    for (var q = 0; q < n; q++) if (y[q] < 0) return null;
    var A = [0.1, 0.2, 0.3, 0.5, 0.7, 0.9], B = [0.01, 0.05, 0.1, 0.3], G = [0.05, 0.1, 0.3, 0.5, 0.8], best = null;
    A.forEach(function (a) { B.forEach(function (b) { G.forEach(function (g) {
      var L = L0, T = (mean(y, s, 2 * s) - L0) / s, S = [], sse = 0, fit = [], t, ok = true;
      for (t = 0; t < s; t++) { S.push(y[t] / L0); fit.push(NaN); }
      for (t = s; t < n && ok; t++) {
        var i = t % s, f = (L + T) * S[i]; fit.push(f); var e = y[t] - f; sse += e * e;
        var Lp = L; L = a * (S[i] > 1e-9 ? y[t] / S[i] : L + T) + (1 - a) * (L + T);
        T = b * (L - Lp) + (1 - b) * T; S[i] = g * (L > 1e-9 ? y[t] / L : S[i]) + (1 - g) * S[i];
        if (!isFinite(L) || !isFinite(sse)) ok = false;
      }
      if (ok && (!best || sse < best.sse)) {
        var fc = []; for (var k = 0; k < h; k++) fc.push((L + (k + 1) * T) * S[(n + k) % s]);
        best = { sse: sse, fit: fit, fc: fc, params: 'α=' + a + ' β=' + b + ' γ=' + g };
      }
    }); }); });
    return best;
  }
  // Descomposición clásica multiplicativa: promedio móvil centrado, índices estacionales y tendencia lineal
  function mDescomp(y, h, s) {
    var n = y.length; if (s < 2 || n < 2 * s) return null;
    var half = Math.floor(s / 2), suma = new Array(s).fill(0), cuenta = new Array(s).fill(0), t, k;
    for (t = half; t < n - half; t++) {
      var c;
      if (s % 2 === 0) { c = 0.5 * y[t - half] + 0.5 * y[t + half]; for (k = t - half + 1; k < t + half; k++) c += y[k]; c /= s; }
      else c = mean(y, t - half, t + half + 1);
      if (c > 0) { suma[t % s] += y[t] / c; cuenta[t % s]++; }
    }
    var idx = [], tot = 0;
    for (k = 0; k < s; k++) { if (!cuenta[k]) return null; idx.push(suma[k] / cuenta[k]); tot += idx[k]; }
    if (tot <= 0) return null;
    idx = idx.map(function (v) { return v * s / tot; });
    for (k = 0; k < s; k++) if (idx[k] <= 1e-6) return null;
    var des = y.map(function (v, i) { return v / idx[i % s]; }), tr = mTrend(des, h);
    if (!tr) return null;
    return { fit: tr.fit.map(function (v, i) { return v * idx[i % s]; }), fc: tr.fc.map(function (v, i) { return v * idx[(n + i) % s]; }) };
  }
  // Mínimos cuadrados ordinarios por ecuaciones normales
  function mco(X, y) {
    var p = X[0].length, A = [], i, j, k, r;
    for (i = 0; i < p; i++) A.push(new Array(p + 1).fill(0));
    for (r = 0; r < X.length; r++) for (i = 0; i < p; i++) { A[i][p] += X[r][i] * y[r]; for (j = 0; j < p; j++) A[i][j] += X[r][i] * X[r][j]; }
    for (i = 0; i < p; i++) A[i][i] += 1e-8;
    for (i = 0; i < p; i++) {
      var piv = i; for (k = i + 1; k < p; k++) if (Math.abs(A[k][i]) > Math.abs(A[piv][i])) piv = k;
      if (Math.abs(A[piv][i]) < 1e-12) return null;
      var tmp = A[i]; A[i] = A[piv]; A[piv] = tmp;
      for (k = 0; k < p; k++) { if (k === i) continue; var f = A[k][i] / A[i][i]; if (f) for (j = i; j <= p; j++) A[k][j] -= f * A[i][j]; }
    }
    return A.map(function (row, q) { return row[p] / row[q]; });
  }
  // Regresión con datos de series de tiempo: tendencia lineal más variables ficticias estacionales
  function mRegEst(y, h, s) {
    var n = y.length; if (s < 2 || n < s + 4) return null;
    function fila(t) { var f = [1, t]; for (var k = 1; k < s; k++) f.push(t % s === k ? 1 : 0); return f; }
    var X = [], t; for (t = 0; t < n; t++) X.push(fila(t));
    var b = mco(X, y); if (!b) return null;
    function pred(t) { var f = fila(t), v = 0; for (var k = 0; k < f.length; k++) v += f[k] * b[k]; return v; }
    var fit = [], fc = []; for (t = 0; t < n; t++) fit.push(pred(t)); for (t = 0; t < h; t++) fc.push(pred(n + t));
    return { fit: fit, fc: fc };
  }
  function nelderMead(f, x0, maxIt) {
    var n = x0.length, S = [x0.slice()], i, j;
    for (i = 0; i < n; i++) { var x = x0.slice(); x[i] += Math.abs(x[i]) > 1e-6 ? 0.2 * Math.abs(x[i]) : 0.2; S.push(x); }
    var F = S.map(f);
    for (var it = 0; it < maxIt; it++) {
      var idx = F.map(function (v, k) { return k; }).sort(function (a, b) { return F[a] - F[b]; });
      S = idx.map(function (k) { return S[k]; }); F = idx.map(function (k) { return F[k]; });
      if (Math.abs(F[n] - F[0]) < 1e-10 * (Math.abs(F[0]) + 1e-10)) break;
      var c = new Array(n).fill(0); for (i = 0; i < n; i++) for (j = 0; j < n; j++) c[j] += S[i][j] / n;
      var peor = S[n], xr = c.map(function (v, q) { return v + (v - peor[q]); }), fr = f(xr);
      if (fr < F[0]) { var xe = c.map(function (v, q) { return v + 2 * (v - peor[q]); }), fe = f(xe); if (fe < fr) { S[n] = xe; F[n] = fe; } else { S[n] = xr; F[n] = fr; } }
      else if (fr < F[n - 1]) { S[n] = xr; F[n] = fr; }
      else {
        var xc = c.map(function (v, q) { return v + 0.5 * (peor[q] - v); }), fcn = f(xc);
        if (fcn < F[n]) { S[n] = xc; F[n] = fcn; }
        else for (i = 1; i <= n; i++) { S[i] = S[i].map(function (v, q) { return S[0][q] + 0.5 * (v - S[0][q]); }); F[i] = f(S[i]); }
      }
    }
    var m = 0; for (i = 1; i <= n; i++) if (F[i] < F[m]) m = i;
    return { x: S[m], f: F[m] };
  }
  function desvEst(a) { var m = mean(a, 0, a.length), v = 0; a.forEach(function (x) { v += (x - m) * (x - m); }); return a.length > 1 ? Math.sqrt(v / (a.length - 1)) : 0; }
  /* ARIMA (Box-Jenkins): se diferencia la serie hasta que deja de bajar su variabilidad,
     se prueban órdenes p y q de 0 a 2 por suma de cuadrados condicional y se elige por AIC corregido. */
  function mARIMA(y, h, s) {
    var n = y.length; if (n < 14) return null;
    var combos = [[0, 0], [1, 0]]; if (s >= 2 && n >= 2 * s + 8) { combos.push([0, 1]); combos.push([1, 1]); }
    function dif(d, D) {
      var z = y.slice(); if (D) z = z.slice(s).map(function (v, i) { return v - y[i]; });
      var z1 = z; if (d) z = z.slice(1).map(function (v, i) { return v - z1[i]; });
      return { w: z, z1: z1 };
    }
    var el = null;
    combos.forEach(function (c) { var x = dif(c[0], c[1]); if (x.w.length < 10) return; var sd = desvEst(x.w); if (!el || sd < el.sd * 0.97) el = { d: c[0], D: c[1], sd: sd, w: x.w, z1: x.z1 }; });
    if (!el) return null;
    var w = el.w, m = w.length, conC = !el.d && !el.D, mu = mean(w, 0, m), best = null;
    function residuos(par, p, q) {
      var c = conC ? par[0] : 0, o = conC ? 1 : 0, e = new Array(m).fill(0), sse = 0, t, i;
      for (i = o; i < par.length; i++) if (Math.abs(par[i]) >= 0.98) return null;
      for (t = 0; t < m; t++) {
        var pr = c;
        for (i = 1; i <= p; i++) if (t - i >= 0) pr += par[o + i - 1] * (w[t - i] - c);
        for (i = 1; i <= q; i++) if (t - i >= 0) pr += par[o + p + i - 1] * e[t - i];
        e[t] = w[t] - pr; if (t >= p) sse += e[t] * e[t];
        if (!isFinite(sse)) return null;
      }
      return { e: e, sse: sse, c: c, o: o };
    }
    for (var p = 0; p <= 2; p++) for (var q = 0; q <= 2; q++) {
      if (p + q === 0 && conC) continue;
      var k = p + q + (conC ? 1 : 0), x0 = (conC ? [mu] : []).concat(new Array(p + q).fill(0.1));
      var par = x0;
      if (k) { var r = nelderMead((function (pp, qq) { return function (v) { var z = residuos(v, pp, qq); return z ? z.sse : 1e30; }; })(p, q), x0, 250); par = r.x; }
      var z = residuos(par, p, q); if (!z || m - p - k - 2 <= 0) continue;
      var mm = m - p, aic = mm * Math.log(Math.max(z.sse / mm, 1e-12)) + 2 * (k + 1) + 2 * (k + 1) * (k + 2) / Math.max(1, mm - k - 2);
      if (!best || aic < best.aic) best = { aic: aic, p: p, q: q, par: par, z: z };
    }
    if (!best) return null;
    var bz = best.z, e = bz.e.slice(), ww = w.slice(), i, t;
    for (t = m; t < m + h; t++) {
      var pr = bz.c;
      for (i = 1; i <= best.p; i++) pr += best.par[bz.o + i - 1] * (ww[t - i] - bz.c);
      for (i = 1; i <= best.q; i++) if (t - i < m) pr += best.par[bz.o + best.p + i - 1] * e[t - i];
      ww.push(pr);
    }
    var wf = ww.slice(m), z1f = [], prev = el.z1[el.z1.length - 1];
    for (i = 0; i < h; i++) { prev = el.d ? prev + wf[i] : wf[i]; z1f.push(prev); }
    var ext = y.slice(), fc = [];
    for (i = 0; i < h; i++) { var v = el.D ? z1f[i] + ext[ext.length - s] : z1f[i]; ext.push(v); fc.push(v); }
    var off = (el.D ? s : 0) + (el.d ? 1 : 0), fit = new Array(n).fill(NaN);
    for (t = best.p; t < m; t++) fit[t + off] = y[t + off] - bz.e[t];
    return { fit: fit, fc: fc, params: 'ARIMA(' + best.p + ',' + el.d + ',' + best.q + ')' + (el.D ? ' con diferencia estacional' : '') };
  }
  var METODOS = [
    { id: 'regest', nombre: 'Regresión con tendencia y estacionalidad', fn: mRegEst },
    { id: 'arima', nombre: 'ARIMA (Box-Jenkins)', fn: mARIMA },
    { id: 'ingenuo', nombre: 'Ingenuo (último valor)', fn: mNaive },
    { id: 'ingenuo_est', nombre: 'Ingenuo estacional', fn: mSNaive },
    { id: 'pm3', nombre: 'Promedio móvil (3)', fn: mMA(3) },
    { id: 'pm6', nombre: 'Promedio móvil (6)', fn: mMA(6) },
    { id: 'pmd', nombre: 'Promedio móvil doble (3)', fn: mDMA(3) },
    { id: 'ses', nombre: 'Suavización exponencial simple', fn: mSES },
    { id: 'holt', nombre: 'Holt (tendencia)', fn: mHolt },
    { id: 'hw', nombre: 'Winters aditivo', fn: mHW },
    { id: 'wm', nombre: 'Winters multiplicativo', fn: mWM },
    { id: 'descomp', nombre: 'Descomposición multiplicativa', fn: mDescomp },
    { id: 'tendencia', nombre: 'Regresión lineal de tendencia', fn: mTrend }
  ];
  function errores(act, fc) {
    var n = act.length, sa = 0, sq = 0, sp = 0, np = 0, sb = 0, spe = 0;
    for (var i = 0; i < n; i++) {
      var e = act[i] - fc[i]; sa += Math.abs(e); sq += e * e; sb += e;
      if (act[i] !== 0) { sp += Math.abs(e) / Math.abs(act[i]); spe += e / act[i]; np++; }
    }
    return { mad: sa / n, mse: sq / n, rmse: Math.sqrt(sq / n), mape: np ? sp / np * 100 : null, mpe: np ? spe / np * 100 : null, sesgo: sb / n };
  }
  /* Autocorrelación: coeficientes, error estándar de cada uno y estadístico Q de Ljung-Box */
  function acf(y, K) {
    var n = y.length, m = mean(y, 0, n), den = 0, r = [], se = [], q = 0, acum = 0, k, t;
    for (t = 0; t < n; t++) den += (y[t] - m) * (y[t] - m);
    K = Math.min(K, n - 2);
    if (den <= 0 || K < 1) return { r: [], se: [], q: 0, critico: 0, n: n };
    for (k = 1; k <= K; k++) {
      var s = 0; for (t = k; t < n; t++) s += (y[t] - m) * (y[t - k] - m);
      var rk = s / den;
      se.push(Math.sqrt((1 + 2 * acum) / n)); r.push(rk); acum += rk * rk;
      q += rk * rk / (n - k);
    }
    q *= n * (n + 2);
    var c = K * Math.pow(1 - 2 / (9 * K) + 1.645 * Math.sqrt(2 / (9 * K)), 3);
    return { r: r, se: se, q: q, critico: c, n: n };
  }
  function patron(a, s) {
    function sig(k) { return k <= a.r.length && Math.abs(a.r[k - 1]) > 1.96 * a.se[k - 1]; }
    if (!a.r.length) return 'Sin datos suficientes';
    var tend = sig(1) && sig(2) && a.r[0] > 0 && a.r[1] > 0, est = sig(s);
    if (tend && est) return 'Tendencia y estacionalidad';
    if (tend) return 'Tendencia (la serie no es estacionaria)';
    if (est) return 'Estacionalidad';
    return a.q > a.critico || sig(1) ? 'Estacionaria con autocorrelación' : 'Aleatoria (sin patrón claro)';
  }
  function clamp0(a) { return a.map(function (v) { return v > 0 ? v : 0; }); }

  /* Compite todos los métodos sobre un tramo de prueba y pronostica con el de menor MAD. */
  function claveSerie(y) { var t = 0; for (var i = 0; i < y.length; i++) t += y[i] * (i % 7 + 1); return y.length + ':' + Math.round(t); }
  function tramoPrueba(n, s) { return n < 6 ? 1 : Math.max(1, Math.min(Math.floor(n / 4), s >= 52 ? 12 : 6)); }
  function pronosticar(y, s, H, ext) {
    var n = y.length, res = { metodos: [], mejor: null, fc: [], fit: [], prueba: 0 };
    if (n < 2) return res;
    var h0 = Math.max(1, Math.min(Math.floor(n / 4), s >= 52 ? 12 : 6));
    if (n < 6) h0 = 1;
    var train = y.slice(0, n - h0), test = y.slice(n - h0);
    res.prueba = h0;
    METODOS.forEach(function (m) {
      var r = train.length ? m.fn(train, h0, s) : null;
      if (!r) return;
      var e = errores(test, clamp0(r.fc));
      res.metodos.push({ id: m.id, nombre: m.nombre, mad: e.mad, mse: e.mse, rmse: e.rmse, mape: e.mape, mpe: e.mpe, sesgo: e.sesgo });
    });
    // Modelo externo (preentrenado): entra a la misma competencia con su pronóstico del tramo de prueba
    var usaExt = ext && ext.clave === claveSerie(y) && ext.test && ext.test.length >= h0 && ext.fc && ext.fc.length >= H;
    if (usaExt) {
      var ee = errores(test, clamp0(ext.test.slice(0, h0)));
      res.metodos.push({ id: 'externo', nombre: ext.nombre, mad: ee.mad, mse: ee.mse, rmse: ee.rmse, mape: ee.mape, mpe: ee.mpe, sesgo: ee.sesgo, externo: true });
      res.externo = { fc: clamp0(ext.fc.slice(0, H)), bajo: clamp0((ext.bajo || []).slice(0, H)), alto: clamp0((ext.alto || []).slice(0, H)) };
    }
    if (!res.metodos.length) return res;
    res.metodos.sort(function (a, b) { return a.mad - b.mad; });
    for (var i = 0; i < res.metodos.length && !res.mejor; i++) {
      if (res.metodos[i].externo) { res.mejor = res.metodos[i]; res.fc = res.externo.fc; res.fit = []; res.params = ''; break; }
      var m = METODOS.filter(function (x) { return x.id === res.metodos[i].id; })[0];
      var full = m.fn(y, H, s);
      if (full) { res.mejor = res.metodos[i]; res.fc = clamp0(full.fc); res.fit = full.fit; res.params = full.params || ''; }
    }
    return res;
  }

  function diasMes(key) { return new Date(Date.UTC(+key.slice(0, 4), +key.slice(5, 7), 0)).getUTCDate(); }
  function sigMes(key) {
    var y = +key.slice(0, 4), m = +key.slice(5, 7) + 1;
    if (m > 12) { m = 1; y++; }
    return y + '-' + pad(m);
  }
  function buildBuckets(start, N, hoy, periodo, H) {
    var idx = new Int32Array(N).fill(-1), labels = [], dias = [], nextLabels = [], nextDias = [], i, k;
    if (periodo === 'semanal') {
      var nb = Math.floor(N / 7), off = N - nb * 7;
      for (i = off; i < N; i++) idx[i] = Math.floor((i - off) / 7);
      for (k = 0; k < nb; k++) { labels.push(addDays(start, off + 7 * k)); dias.push(7); }
      for (k = 0; k < H; k++) { nextLabels.push(addDays(hoy, 7 * k)); nextDias.push(7); }
      return { idx: idx, labels: labels, dias: dias, nextLabels: nextLabels, nextDias: nextDias, s: 52 };
    }
    var keys = [], count = {};
    for (i = 0; i < N; i++) { var key = addDays(start, i).slice(0, 7); keys.push(key); count[key] = (count[key] || 0) + 1; }
    var pos = {};
    for (i = 0; i < N; i++) {
      key = keys[i];
      if (count[key] !== diasMes(key)) continue;
      if (pos[key] === undefined) { pos[key] = labels.length; labels.push(key); dias.push(diasMes(key)); }
      idx[i] = pos[key];
    }
    var nk = hoy.slice(0, 7);
    for (k = 0; k < H; k++) { nextLabels.push(nk); nextDias.push(diasMes(nk)); nk = sigMes(nk); }
    return { idx: idx, labels: labels, dias: dias, nextLabels: nextLabels, nextDias: nextDias, s: 12 };
  }

  /* ---------- Cálculo principal ---------- */
  function compute(data, settings) {
    var S = Object.assign({}, DEFAULTS, settings || {});
    var warn = [], nodes = new Map(), hoy = parseDate(S.hoy) || data.hoy || todayISO();

    (data.articulos || []).forEach(function (a) {
      var id = idOf(a.sku, a.ubicacion);
      if (nodes.has(id)) { warn.push('Artículo repetido: ' + id); return; }
      nodes.set(id, { id: id, a: a, comps: [], parents: [] });
    });
    function link(p, c, q) { p.comps.push({ n: c, q: q }); c.parents.push({ n: p, q: q }); }
    (data.estructura || []).forEach(function (e) {
      var p = nodes.get(String(e.padre)), c = nodes.get(String(e.componente));
      if (!p || !c) { warn.push('Estructura: no existe ' + (!p ? e.padre : e.componente)); return; }
      if (p === c) return;
      link(p, c, num(e.cantidad, 1));
    });
    nodes.forEach(function (n) {
      if (!n.a.origen || n.a.origen === n.a.ubicacion) return;
      var src = nodes.get(idOf(n.a.sku, n.a.origen));
      if (!src) { warn.push('Origen no encontrado para ' + n.id + ': ' + n.a.origen); return; }
      link(n, src, 1);
    });

    // Orden topológico: quien consume va antes que lo consumido
    var indeg = new Map(), order = [], queue = [];
    nodes.forEach(function (n) { indeg.set(n.id, n.parents.length); if (!n.parents.length) queue.push(n); });
    while (queue.length) {
      var n0 = queue.shift(); order.push(n0);
      n0.comps.forEach(function (c) { var d = indeg.get(c.n.id) - 1; indeg.set(c.n.id, d); if (d === 0) queue.push(c.n); });
    }
    if (order.length < nodes.size) {
      warn.push('La estructura tiene un ciclo; revise padres y componentes.');
      nodes.forEach(function (n) { if (order.indexOf(n) < 0) order.push(n); });
    }

    // Historia diaria
    var minF = null;
    var hist = (data.historia || []).map(function (h) {
      return { id: idOf(h.sku, h.ubicacion), f: parseDate(h.fecha), q: num(h.cantidad, 0) };
    }).filter(function (h) { return h.f && h.f < hoy; });
    hist.forEach(function (h) { if (!minF || h.f < minF) minF = h.f; });
    var N = minF ? dayDiff(minF, hoy) : 0;
    if (N > 1500) { minF = addDays(hoy, -1500); N = 1500; }
    nodes.forEach(function (n) { n.serie = new Float64Array(N); n.directa = false; });
    var sinArt = 0;
    hist.forEach(function (h) {
      var n = nodes.get(h.id); if (!n) { sinArt++; return; }
      var i = dayDiff(minF, h.f); if (i < 0 || i >= N) return;
      n.serie[i] += h.q; n.directa = true;
    });
    if (sinArt) warn.push(sinArt + ' filas de historia no corresponden a ningún artículo.');
    order.forEach(function (n) {
      n.parents.forEach(function (p) {
        var ps = p.n.serie; for (var i = 0; i < N; i++) n.serie[i] += ps[i] * p.q;
      });
    });

    var W = Math.max(1, Math.round(S.ventanaADU));
    var H = Math.max(3, Math.ceil(W / (S.periodo === 'semanal' ? 7 : 28)));
    var B = buildBuckets(minF || hoy, N, hoy, S.periodo, H);

    function group(rows) {
      var g = new Map();
      (rows || []).forEach(function (r) {
        var id = idOf(r.sku, r.ubicacion), f = parseDate(r.fecha), q = num(r.cantidad, 0);
        if (!nodes.has(id) || !q) return;
        if (!g.has(id)) g.set(id, []);
        g.get(id).push({ f: f || hoy, q: q });
      });
      return g;
    }
    var pedidos = group(data.pedidos), sumin = group(data.suministro);

    // Ajustes planeados vigentes hoy: factor de demanda, de cada zona y de lead time
    var ajustes = new Map();
    function aj(id) { return ajustes.get(id) || { demanda: 1, verde: 1, amarilla: 1, roja: 1, lead_time: 1 }; }
    (data.ajustes || []).forEach(function (x) {
      var id = idOf(x.sku, x.ubicacion), f = num(x.factor, null), t = String(x.tipo || '').toLowerCase().replace(/\s+/g, '_');
      var d = parseDate(x.desde), h = parseDate(x.hasta);
      if (!nodes.has(id) || f == null || f < 0 || (d && hoy < d) || (h && hoy > h)) return;
      if (t.indexOf('lead') >= 0 || t === 'lt') t = 'lead_time';
      var o = Object.assign({}, aj(id));
      if (o[t] === undefined) { warn.push('Ajuste con tipo desconocido: ' + x.tipo); return; }
      o[t] *= f; ajustes.set(id, o);
    });

    // Rangos de lead time por tipo de artículo y factores propios de cada perfil
    var rangos = {}, perfiles = {};
    (data.rangos || []).forEach(function (x) {
      var t = String(x.tipo || '').trim().toUpperCase().charAt(0);
      t = t === 'F' ? 'M' : t === 'C' ? 'P' : t === 'T' ? 'D' : t;
      if ('MPDI'.indexOf(t) < 0 || !t) { warn.push('Rangos: tipo desconocido ' + x.tipo); return; }
      rangos[t] = { corto: num(x.lt_corto_max, null), medio: num(x.lt_medio_max, null) };
    });
    (data.perfiles || []).forEach(function (x) {
      var p = String(x.perfil || '').trim().toUpperCase();
      if (!/^[MPDI][LMS][HML]$/.test(p)) { warn.push('Perfiles: código no válido ' + x.perfil); return; }
      perfiles[p] = { lt: num(x.factor_lt, null), v: num(x.factor_var, null) };
    });

    var dltMemo = new Map();
    function dlt(n, stack) {
      if (dltMemo.has(n.id)) return dltMemo.get(n.id);
      stack = stack || [];
      if (stack.indexOf(n.id) >= 0) return 0;
      stack.push(n.id);
      var mx = 0;
      n.comps.forEach(function (c) { if (!c.n.a.buffer) mx = Math.max(mx, dlt(c.n, stack)); });
      stack.pop();
      var v = num(n.a.lead_time, 0) * aj(n.id).lead_time + mx;
      dltMemo.set(n.id, v);
      return v;
    }

    // Órdenes ya aprobadas y aún abiertas: siguen pidiendo a sus componentes u origen
    var libera = new Map();
    (data.liberadas || []).forEach(function (l) { var id = idOf(l.sku, l.ubicacion); libera.set(id, (libera.get(id) || 0) + num(l.cantidad, 0)); });

    var dep = new Map(), out = [];
    order.forEach(function (n) {
      var a = n.a, r = { id: n.id, sku: a.sku, ubicacion: a.ubicacion || '', origen: a.origen || '', descripcion: a.descripcion || '',
        tipo: a.tipo || '', buffer: !!a.buffer, lt: num(a.lead_time, 0) * aj(n.id).lead_time, costo: num(a.costo, 0), aj: aj(n.id),
        tipoBuf: String(a.tipo_buffer || '').toUpperCase().trim(), undEstiba: num(a.und_estiba, 0), recurso: String(a.recurso || '').trim(), proveedor: String(a.proveedor || '').trim(), minUnd: num(a.min_und, 0),
        comps: n.comps.map(function (c) { return { id: c.n.id, q: c.q }; }),
        parents: n.parents.map(function (p) { return { id: p.n.id, q: p.q }; }) };
      r.dlt = dlt(n);
      r.directa = n.directa;
      r.serie = n.serie;

      // ADU
      var w = Math.min(W, N);
      r.aduPasado = w ? mean(n.serie, N - w, N) : 0;
      var y = new Array(B.labels.length).fill(0), i;
      for (i = 0; i < N; i++) if (B.idx[i] >= 0) y[B.idx[i]] += n.serie[i];
      var fc = pronosticar(y, B.s, H, data.externos ? data.externos.get(n.id) : null);
      var acc = 0, dd = 0;
      for (i = 0; i < fc.fc.length && dd < W; i++) { acc += fc.fc[i]; dd += B.nextDias[i]; }
      r.aduFuturo = dd ? acc / dd : null;
      r.pron = { labels: B.labels, y: y, nextLabels: B.nextLabels, fc: fc.fc, fit: fc.fit, metodos: fc.metodos, mejor: fc.mejor, params: fc.params, prueba: fc.prueba, externo: fc.externo || null, s: B.s, H: H };
      if (y.length >= 8) {
        r.pron.acf = acf(y, Math.min(24, Math.floor(y.length / 2)));
        r.pron.patron = patron(r.pron.acf, B.s);
        var resid = []; fc.fit.forEach(function (v, k) { if (v != null && !isNaN(v)) resid.push(y[k] - v); });
        if (resid.length >= 8) r.pron.acfRes = acf(resid, Math.min(12, Math.floor(resid.length / 3)));
      }
      var base = r.aduPasado;
      if (S.modoADU === 'futuro' && r.aduFuturo != null) base = r.aduFuturo;
      else if (S.modoADU === 'mixto' && r.aduFuturo != null) base = (r.aduPasado + r.aduFuturo) / 2;
      r.daf = (num(a.daf, 1) || 1) * r.aj.demanda;
      r.adu = base * r.daf * (S.escalaADU || 1);
      // Movimiento reciente: días seguidos sin demanda y ritmo de los últimos 14 días
      r.diasSinVenta = 0; for (var dz = N - 1; dz >= 0 && n.serie[dz] === 0; dz--) r.diasSinVenta++;
      r.adu14 = N >= 14 ? mean(n.serie, N - 14, N) : null;
      r.tolerancia = num(a.tolerancia_cliente, null);
      var aduAntes = N >= 2 * w && w ? mean(n.serie, N - 2 * w, N - w) : 0;
      r.cambioADU = aduAntes > 0 ? r.aduPasado / aduAntes - 1 : null;

      // Variabilidad: coeficiente de variación de la demanda semanal
      var dv = Math.min(N, Math.max(W, 56)), nw = Math.floor(dv / 7);
      r.cv = null;
      if (nw >= 4) {
        var ws = [], k;
        for (k = 0; k < nw; k++) { var sm = 0; for (i = N - (k + 1) * 7; i < N - k * 7; i++) sm += n.serie[i]; ws.push(sm); }
        var mu = mean(ws, 0, nw);
        if (mu > 0) { var va = 0; ws.forEach(function (x) { va += (x - mu) * (x - mu); }); r.cv = Math.sqrt(va / (nw - 1)) / mu; }
      }

      var depDem = dep.get(n.id) || 0;
      var ped = pedidos.get(n.id) || [], sup = sumin.get(n.id) || [];
      r.inventario = num(a.inventario, 0);
      r.enTransito = sup.reduce(function (s, x) { return s + x.q; }, 0);
      sup.sort(function (x, z) { return x.f < z.f ? -1 : 1; });
      r.proxSuministro = sup.length ? sup[0] : null;
      var vencida = 0, porDia = {};
      ped.forEach(function (p) { if (p.f <= hoy) vencida += p.q; else porDia[p.f] = (porDia[p.f] || 0) + p.q; });

      if (!r.buffer) {
        var pasa = depDem + vencida + (libera.get(n.id) || 0);
        n.comps.forEach(function (c) { dep.set(c.n.id, (dep.get(c.n.id) || 0) + pasa * c.q); });
        r.demDependiente = depDem; r.orden = 0;
        // Alerta de lead time: artículos sin buffer pero estratégicos (tipo_buffer = LT)
        r.alertasLT = [];
        if (r.tipoBuf === 'LT') sup.forEach(function (o) {
          var dias = dayDiff(hoy, o.f), hz = Math.max(1, r.lt / 3), col = null;
          if (dias < 0) col = 'oscuro'; else if (dias <= hz / 3) col = 'rojo'; else if (dias <= 2 * hz / 3) col = 'amarillo'; else if (dias <= hz) col = 'verde';
          if (col) r.alertasLT.push({ f: o.f, q: o.q, dias: dias, color: col });
        });
        out.push(r); return;
      }

      // Zonas
      /* Perfil de buffer = tipo de artículo + categoría de lead time + categoría de variabilidad.
         Tipo: M fabricado, P comprado, D distribuido, I intermedio. Lead time: L largo, M medio, S corto.
         Variabilidad: H alta, M media, L baja. Los rangos de lead time pueden ser distintos para cada tipo. */
      var t0 = String(a.tipo || '').trim().toUpperCase().charAt(0);
      r.tipoItem = t0 === 'I' ? 'I' : (t0 === 'F' || t0 === 'M') ? 'M' : (t0 === 'C' || t0 === 'P') ? 'P' : (t0 === 'T' || t0 === 'D') ? 'D' : a.origen ? 'D' : n.comps.length ? 'M' : 'P';
      var rg = rangos[r.tipoItem] || {}, cMax = rg.corto != null ? rg.corto : S.ltCortoMax, mMax = rg.medio != null ? rg.medio : S.ltMedioMax;
      r.catLT = r.dlt <= cMax ? 'corto' : r.dlt <= mMax ? 'medio' : 'largo';
      r.catVar = r.cv == null ? 'media' : r.cv <= S.cvBajoMax ? 'baja' : r.cv <= S.cvMedioMax ? 'media' : 'alta';
      // Perfil asignado a mano en la columna «perfil» (por ejemplo PLH): manda sobre el cálculo automático
      var pm = String(a.perfil || '').trim().toUpperCase();
      r.perfilManual = false;
      if (/^[MPDI][LMS][HML]$/.test(pm)) {
        r.tipoItem = pm[0]; r.catLT = { L: 'largo', M: 'medio', S: 'corto' }[pm[1]]; r.catVar = { H: 'alta', M: 'media', L: 'baja' }[pm[2]]; r.perfilManual = true;
      } else if (pm) warn.push('Perfil no válido en ' + n.id + ': ' + a.perfil);
      r.perfil = r.tipoItem + { largo: 'L', medio: 'M', corto: 'S' }[r.catLT] + { alta: 'H', media: 'M', baja: 'L' }[r.catVar];
      var pf = perfiles[r.perfil] || {};
      var fLTauto = pf.lt != null ? pf.lt : r.catLT === 'corto' ? S.fLTcorto : r.catLT === 'medio' ? S.fLTmedio : S.fLTlargo;
      var fl = num(a.factor_lt, null); r.fLT = fl != null ? fl : fLTauto; r.fLTmanual = fl != null;
      var fVauto = pf.v != null ? pf.v : r.catVar === 'baja' ? S.fVarBaja : r.catVar === 'media' ? S.fVarMedia : S.fVarAlta;
      var fv = num(a.factor_var, null); r.fVar = fv != null ? fv : fVauto; r.fVarManual = fv != null;
      r.perfilPropio = pf.lt != null || pf.v != null;
      r.moq = num(a.moq, 0); r.multiplo = num(a.multiplo, 0); r.ciclo = num(a.ciclo_pedido, 0);
      var am = r.adu * r.dlt;
      r.amarilla = am;
      r.rojaBase = am * r.fLT;
      r.rojaSeg = r.rojaBase * r.fVar;
      var op = [{ k: 'ADU × DLT × factor LT', v: am * r.fLT }, { k: 'pedido mínimo', v: r.moq }, { k: 'ciclo de pedido × ADU', v: r.ciclo * r.adu }];
      op.sort(function (x, z) { return z.v - x.v; });
      r.verde = op[0].v; r.verdePor = op[0].k;
      // Tipos de buffer: MM = mín-máx (sin zona amarilla); RO = zonas definidas a mano
      if (r.tipoBuf !== 'MM' && r.tipoBuf !== 'RO') r.tipoBuf = 'R';
      r.manual = {};
      if (r.tipoBuf === 'MM') r.amarilla = 0;
      if (r.tipoBuf === 'RO') {
        var zr = num(a.zona_roja, null), za = num(a.zona_amarilla, null), zv = num(a.zona_verde, null);
        if (zr != null) { r.rojaBase = zr; r.rojaSeg = 0; r.manual.roja = zr; }
        if (za != null) { r.amarilla = za; r.manual.amarilla = za; }
        if (zv != null) { r.verde = zv; r.verdePor = 'valor manual'; r.manual.verde = zv; }
      }
      r.rojaBase *= r.aj.roja; r.rojaSeg *= r.aj.roja; r.amarilla *= r.aj.amarilla; r.verde *= r.aj.verde;
      // Retail: mínimo de exhibición y zonas en unidades enteras (rojo y verde hacia arriba, amarillo al más cercano)
      r.minExh = num(a.min_exhibicion, 0); r.rojaPorExh = false;
      if (r.minExh > 0) {
        if (r.rojaBase + r.rojaSeg < r.minExh) { r.rojaSeg = r.minExh - r.rojaBase; r.rojaPorExh = true; }
        r.rojaSeg = Math.ceil(r.rojaBase + r.rojaSeg - 1e-9) - r.rojaBase;
        r.amarilla = Math.round(r.amarilla); r.verde = Math.max(1, Math.ceil(r.verde - 1e-9));
      }
      r.roja = r.rojaBase + r.rojaSeg;
      r.tor = r.roja; r.toy = r.roja + r.amarilla; r.tog = r.toy + r.verde;
      r.objetivo = r.roja + r.verde / 2;
      r.rangoMax = r.roja + r.verde;
      r.ordenesAbiertasProm = r.verde > 0 ? r.amarilla / r.verde : null;
      r.frecuencia = r.adu > 0 ? r.verde / r.adu : null;

      // Flujo neto
      r.umbralPico = S.picoUmbral * r.roja;
      var limite = addDays(hoy, Math.max(1, Math.ceil(r.dlt)));
      r.picos = [];
      Object.keys(porDia).forEach(function (f) { if (f <= limite && porDia[f] > r.umbralPico && r.umbralPico > 0) r.picos.push({ f: f, q: porDia[f] }); });
      var picoTot = r.picos.reduce(function (s, x) { return s + x.q; }, 0);
      r.demVencida = vencida; r.demPicos = picoTot; r.demDependiente = depDem;
      r.demCalificada = vencida + picoTot + depDem;
      r.flujoNeto = r.inventario + r.enTransito - r.demCalificada;
      r.prioridad = r.tog > 0 ? r.flujoNeto / r.tog : null;
      r.colorPlan = r.tog <= 0 ? 'gris' : r.flujoNeto <= 0 ? 'oscuro' : r.flujoNeto <= r.tor ? 'rojo' : r.flujoNeto <= r.toy ? 'amarillo' : r.flujoNeto <= r.tog ? 'verde' : 'azul';
      r.orden = 0;
      if (r.tog > 0 && r.flujoNeto <= r.toy) {
        var q = Math.max(r.tog - r.flujoNeto, r.moq);
        if (r.multiplo > 0) q = Math.ceil(q / r.multiplo - 1e-9) * r.multiplo; else q = Math.ceil(q - 1e-9);
        r.orden = q;
      }
      r.fechaReq = addDays(hoy, Math.ceil(r.dlt));
      var sale = r.orden + (libera.get(n.id) || 0);
      if (sale) n.comps.forEach(function (c) { dep.set(c.n.id, (dep.get(c.n.id) || 0) + sale * c.q); });

      // Ejecución
      r.pctRoja = r.tor > 0 ? r.inventario / r.tor : null;
      r.colorEjec = r.tor <= 0 ? 'gris' : r.inventario <= 0 ? 'oscuro' : r.inventario < S.alertaOH * r.tor ? 'rojo' : r.inventario < r.tor ? 'amarillo' : r.inventario <= r.tog ? 'verde' : 'azul';

      // Alerta de inventario proyectado: día a día durante un DLT, con la mayor entre el ADU y la demanda conocida
      var Hp = Math.max(1, Math.ceil(r.dlt)), entra = {}, saleDia = {}, ohp = r.inventario, d;
      sup.forEach(function (o) { var k = Math.max(1, dayDiff(hoy, o.f)); entra[k] = (entra[k] || 0) + o.q; });
      Object.keys(porDia).forEach(function (f) { var k = dayDiff(hoy, f); saleDia[k] = (saleDia[k] || 0) + porDia[f]; });
      saleDia[1] = (saleDia[1] || 0) + vencida + depDem;
      r.proy = []; r.proyMin = Infinity; r.proyDia = null;
      for (d = 1; d <= Hp; d++) {
        ohp += (entra[d] || 0) - Math.max(r.adu, saleDia[d] || 0);
        r.proy.push({ f: addDays(hoy, d), oh: ohp });
        if (ohp < r.proyMin) { r.proyMin = ohp; r.proyDia = addDays(hoy, d); }
      }
      r.colorProy = r.tor <= 0 ? 'gris' : r.proyMin <= 0 ? 'oscuro' : r.proyMin < S.alertaOH * r.tor ? 'rojo' : r.proyMin < r.tor ? 'amarillo' : 'verde';

      // Alerta de sincronización de materiales: lo que hoy le piden quienes lo consumen supera el disponible
      r.liberada = libera.get(n.id) || 0;
      r.sincro = depDem > 0 && r.inventario < depDem ? { faltante: depDem - r.inventario, requerido: depDem } : null;
      out.push(r);
    });

    var byId = new Map(); out.forEach(function (r) { byId.set(r.id, r); });

    // Asignación priorizada cuando el origen no alcanza para todos los destinos
    var asignaciones = [];
    out.forEach(function (r) {
      var dest = r.parents.map(function (p) { return { r: byId.get(p.id), q: p.q }; }).filter(function (p) { return p.r.buffer && p.r.orden > 0; });
      if (!dest.length || !r.buffer) return;
      var req = dest.reduce(function (s, p) { return s + p.r.orden * p.q; }, 0), disp = Math.max(0, r.inventario);
      if (disp >= req) return;
      function usa(p) { return dest.reduce(function (s, d) { return s + Math.min(d.r.orden, Math.max(0, p * d.r.tog - d.r.flujoNeto)) * d.q; }, 0); }
      var lo = Math.min.apply(null, dest.map(function (d) { return d.r.prioridad; })), hi = 2;
      for (var it = 0; it < 50; it++) { var mid = (lo + hi) / 2; if (usa(mid) > disp) hi = mid; else lo = mid; }
      asignaciones.push({ origen: r.id, disponible: disp, requerido: req, nivel: lo,
        destinos: dest.map(function (d) {
          var asg = Math.floor(Math.min(d.r.orden, Math.max(0, lo * d.r.tog - d.r.flujoNeto)));
          return { id: d.r.id, pedido: d.r.orden, asignado: asg, antes: d.r.prioridad, despues: (d.r.flujoNeto + asg) / d.r.tog };
        }) });
    });

    return { hoy: hoy, items: out, byId: byId, avisos: warn, asignaciones: asignaciones, dias: N, settings: S };
  }

  /* Simula cómo se habría comportado el buffer con la demanda real de los últimos días:
     zonas recalculadas cada día con el ADU móvil, pedido cuando el flujo neto llega al tope amarillo
     y llegada tras el DLT. Supone que el proveedor o los componentes siempre cumplen. */
  function simular(r, res, dias) {
    var y = r.serie, N = y ? y.length : 0, S = res.settings;
    if (!r.buffer || N < 14) return null;
    var D = Math.min(dias, N), ini = N - D, W = Math.max(1, Math.round(S.ventanaADU)), i;
    var P = new Float64Array(N + 1);
    for (i = 0; i < N; i++) P[i + 1] = P[i] + y[i];
    function zonas(i) {
      var a = Math.max(0, i - W), adu = (i > a ? (P[i] - P[a]) / (i - a) : r.adu / r.daf) * r.daf;
      var am = adu * r.dlt, roja = am * r.fLT * (1 + r.fVar), verde = Math.max(am * r.fLT, r.moq, r.ciclo * adu), m = r.manual || {};
      if (r.tipoBuf === 'MM') am = 0;
      if (m.roja != null) roja = m.roja;
      if (m.amarilla != null) am = m.amarilla;
      if (m.verde != null) verde = m.verde;
      roja *= r.aj.roja; am *= r.aj.amarilla; verde *= r.aj.verde;
      if (r.minExh > 0) { roja = Math.ceil(Math.max(roja, r.minExh) - 1e-9); am = Math.round(am); verde = Math.max(1, Math.ceil(verde - 1e-9)); }
      return { roja: roja, toy: roja + am, tog: roja + am + verde, verde: verde };
    }
    var z0 = zonas(ini), oh = z0.roja + z0.verde / 2, cola = [], out = [], lt = Math.max(1, Math.ceil(r.dlt));
    var sumOH = 0, agot = 0, ordenes = 0, dem = 0, falt = 0, sumObj = 0;
    for (i = ini; i < N; i++) {
      var z = zonas(i), enT = 0, pide = 0;
      cola = cola.filter(function (c) { if (c.d <= i) { oh += c.q; return false; } enT += c.q; return true; });
      var d = y[i], sale = Math.min(oh, d);
      oh -= sale; dem += d; falt += d - sale;
      var nfp = oh + enT;
      if (z.tog > 0 && nfp <= z.toy) {
        pide = Math.max(z.tog - nfp, r.moq);
        pide = r.multiplo > 0 ? Math.ceil(pide / r.multiplo - 1e-9) * r.multiplo : Math.ceil(pide - 1e-9);
        cola.push({ d: i + lt, q: pide }); ordenes++;
      }
      if (oh <= 0 && d > 0) agot++;
      sumOH += oh; sumObj += z.roja + z.verde / 2;
      out.push({ f: addDays(res.hoy, i - N), roja: z.roja, toy: z.toy, tog: z.tog, oh: oh, nfp: nfp, dem: d, pide: pide });
    }
    return { dias: out, invProm: sumOH / D, objetivo: sumObj / D, agotados: agot, ordenes: ordenes, servicio: dem > 0 ? 1 - falt / dem : null };
  }

  /* Integridad del punto de desacople: en qué parte del buffer estuvo el inventario cada día.
     Sirve igual para la simulación y para las fotos reales. */
  function integridad(dias, alertaOH) {
    var o = { n: dias.length, agotado: 0, bajoAlerta: 0, enRoja: 0, optimo: 0, sobre: 0, eventosAgotado: 0, ordenes: 0, frecReal: null }, antes = false;
    dias.forEach(function (p) {
      var verde = p.tog - p.toy, ag = p.oh <= 0;
      if (ag) { o.agotado++; if (!antes) o.eventosAgotado++; }
      else if (p.oh < alertaOH * p.roja) o.bajoAlerta++;
      else if (p.oh < p.roja) o.enRoja++;
      else if (p.oh <= p.roja + verde) o.optimo++;
      else o.sobre++;
      antes = ag;
      if (p.pide) o.ordenes++;
    });
    if (o.ordenes) o.frecReal = o.n / o.ordenes;
    return o;
  }

  /* Posicionamiento: cuánto baja el lead time desacoplado de los artículos con buffer
     si se le pone buffer a cada componente que hoy no lo tiene. */
  function posicionar(data) {
    var nodes = new Map();
    (data.articulos || []).forEach(function (a) { var id = idOf(a.sku, a.ubicacion); if (!nodes.has(id)) nodes.set(id, { id: id, a: a, comps: [], parents: [] }); });
    (data.estructura || []).forEach(function (e) { var p = nodes.get(String(e.padre)), c = nodes.get(String(e.componente)); if (p && c && p !== c) { p.comps.push(c); c.parents.push(p); } });
    function todos(extra) {
      var memo = new Map();
      function f(n, st) {
        if (memo.has(n.id)) return memo.get(n.id);
        if (st.indexOf(n.id) >= 0) return 0;
        st.push(n.id);
        var mx = 0; n.comps.forEach(function (c) { if (!c.a.buffer && c.id !== extra) mx = Math.max(mx, f(c, st)); });
        st.pop();
        var v = num(n.a.lead_time, 0) + mx; memo.set(n.id, v); return v;
      }
      nodes.forEach(function (n) { f(n, []); });
      return memo;
    }
    var base = todos(null), out = [];
    nodes.forEach(function (c) {
      if (c.a.buffer || !c.parents.length) return;
      var alt = todos(c.id), afect = [];
      nodes.forEach(function (p) { if (p.a.buffer && alt.get(p.id) < base.get(p.id) - 1e-9) afect.push({ id: p.id, antes: base.get(p.id), despues: alt.get(p.id) }); });
      if (!afect.length) return;
      afect.sort(function (x, z) { return (z.antes - z.despues) - (x.antes - x.despues); });
      out.push({ id: c.id, sku: c.a.sku, descripcion: c.a.descripcion || '', dltPropio: alt.get(c.id), afectados: afect, reduccion: afect[0].antes - afect[0].despues });
    });
    out.sort(function (x, z) { return z.reduccion - x.reduccion; });
    return out;
  }

  root.DDEngine = { claveSerie: claveSerie, tramoPrueba: tramoPrueba, integridad: integridad, posicionar: posicionar, simular: simular, compute: compute, DEFAULTS: DEFAULTS, idOf: idOf, parseDate: parseDate, num: num, addDays: addDays, dayDiff: dayDiff, todayISO: todayISO };
})(typeof window !== 'undefined' ? window : globalThis);
