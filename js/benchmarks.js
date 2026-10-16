/* Referenzbeispiele zur Verifikation des Programms: bekannte Lösungen aus der Literatur bzw. unabhängige Handrechnungen
 * nach den Normformeln, nachgerechnet mit denselben Funktionen, die die Bemessung benutzt. Das Ergebnis steht im Anhang
 * der statischen Berechnung und in den Regressionstests. Rechenzeit gesamt rund 0,5 s. */
(function (root) {
  const BP = root.BP = root.BP || {};
  const PI = Math.PI;
  const T_ = BP.i18n.T;

  /* Navier-Reihe: gelenkig gelagerte Rechteckplatte a × b unter Gleichlast q (Kirchhoff), Mitte */
  function navier(a, b, q, D, nu, terms) {
    let w = 0, mx = 0, my = 0;
    for (let m = 1; m <= terms; m += 2) for (let n = 1; n <= terms; n += 2) {
      const s = Math.sin(m * PI / 2) * Math.sin(n * PI / 2), den = m * n * Math.pow(m * m / (a * a) + n * n / (b * b), 2);
      w += s / den;
      mx += s * (m * m / (a * a) + nu * n * n / (b * b)) / den;
      my += s * (nu * m * m / (a * a) + n * n / (b * b)) / den;
    }
    return { w: 16 * q / (Math.pow(PI, 6) * D) * w, mx: 16 * q / Math.pow(PI, 4) * mx, my: 16 * q / Math.pow(PI, 4) * my };
  }

  /* Quadratplatte a × a mit dem FE-Kern rechnen: Ränder gelenkig ('ss') oder eingespannt ('cl'), Werte in Mitte und Randmitte */
  function plate(edge, a, h, q, nu, ks) {
    const FE = BP.fe, G = BP.geo, E = 30e6;
    const dom = G.polygonFromRect(0, 0, a, a);
    const lines = [];
    if (edge !== 'free') for (let i = 0; i < 4; i++) {
      const p0 = dom[i], p1 = dom[(i + 1) % 4], n = G.edgeNormal(p0, p1);
      lines.push(Object.assign({ a: p0, b: p1, kind: 'fix' }, edge === 'cl' ? { kRot: 1e12, nIn: { x: -n.x, y: -n.y } } : {}));
    }
    const sol = FE.solve({ domain: dom, meshSize: a / 24, E, nu, h, lines, ks: ks || 0, cases: [{ q }] });
    const mesh = sol.mesh, U = sol.results[0].U, f = FE.elemForces(sol, U);
    const mx = FE.recover(mesh, f.mx);
    const near = (x, y) => { let best = 0, bd = Infinity; for (let k = 0; k < mesh.nNodes; k++) { const d = Math.hypot(mesh.nodeX[k] - x, mesh.nodeY[k] - y); if (d < bd) { bd = d; best = k; } } return best; };
    const c = near(a / 2, a / 2), e = near(0, a / 2);
    return { D: E * h * h * h / (12 * (1 - nu * nu)), w: U[3 * c], mxC: mx[c], mxE: mx[e] };
  }

  /* Unabhängiges Faserverfahren für den Rechteckquerschnitt b × h mit symmetrischer Bewehrung (je As/2 im Abstand d1):
   * Beton Parabel-Rechteck (εc2 = 2 ‰, εcu2 = 3,5 ‰), Stahl bilinear ohne Verfestigung. Liefert MRd für NEd (Druck positiv). */
  function fiberMRd(b, h, As, d1, fcd, fyd, N) {
    const Es = 200e6, ec2 = 0.002, ecu = 0.0035, nF = 400;
    const sc = (e) => (e <= 0 ? 0 : e < ec2 ? fcd * (1 - Math.pow(1 - e / ec2, 2)) : fcd);
    const ss = (e) => Math.max(-fyd, Math.min(fyd, Es * e));
    // Dehnungsebene: oben εcu (bzw. Drehpunkt bei εc2 in 3/7 h für große Druckkräfte), Nullinie x
    const state = (x) => {
      const top = x <= h ? ecu : ecu * x / x; // Randdehnung oben
      const eps = (z) => (x <= h ? ecu * (x - z) / x : ec2 * (x - z) / (x - 3 / 7 * h)); // z von oben
      let Nc = 0, Mc = 0;
      for (let i = 0; i < nF; i++) { const z = (i + 0.5) * h / nF, f = sc(eps(z)) * b * h / nF; Nc += f; Mc += f * (h / 2 - z); }
      const F1 = As / 2 * ss(eps(d1)), F2 = As / 2 * ss(eps(h - d1));
      return { N: Nc + F1 + F2, M: Mc + F1 * (h / 2 - d1) - F2 * (h / 2 - d1), top };
    };
    let lo = 1e-4, hi = 50 * h;
    for (let k = 0; k < 100; k++) { const m = (lo + hi) / 2; if (state(m).N < N) lo = m; else hi = m; }
    return state((lo + hi) / 2).M;
  }

  /* Referenzwerte der Querschnittsnachweise gelten für EC2 mit NA DE: unabhängig vom Land des Projekts damit rechnen */
  function run() {
    return BP.calc && BP.calc.withNorm && BP.normen ? BP.calc.withNorm(BP.normen.ec('DE'), runDE) : runDE();
  }
  function runDE() {
    const C = BP.calc, V = BP.verify, out = [];
    const add = (group, name, src, ref, val, unit, tol) => {
      const dev = Math.abs(ref) > 1e-12 ? (val - ref) / Math.abs(ref) : val - ref;
      out.push({ group, name, src, ref, val, unit, dev, tol, ok: Math.abs(dev) <= tol + 1e-12 });
    };
    // 1 Platten (FE-Kern)
    const a = 6, q = 10;
    const ss = plate('ss', a, 0.12, q, 0.2), nv = navier(a, a, q, ss.D, 0.2, 61);
    add(T_('Platten (FE)'), T_('Gelenkig gelagerte Quadratplatte, Durchbiegung Mitte'), T_('Navier-Reihe (Timoshenko/Woinowsky-Krieger)'), nv.w * 1000, ss.w * 1000, 'mm', 0.03);
    add(T_('Platten (FE)'), T_('Gelenkig gelagerte Quadratplatte, Moment mx Mitte'), T_('Navier-Reihe, ν = 0,2'), nv.mx, ss.mxC, 'kNm/m', 0.03);
    const cl = plate('cl', a, 0.12, q, 0.3);
    add(T_('Platten (FE)'), T_('Eingespannte Quadratplatte, Durchbiegung Mitte'), T_('Timoshenko Tab. 35: 0,00126 q a⁴ / D'), 0.00126 * q * Math.pow(a, 4) / cl.D * 1000, cl.w * 1000, 'mm', 0.04);
    add(T_('Platten (FE)'), T_('Eingespannte Quadratplatte, Moment Mitte'), T_('Timoshenko Tab. 35: 0,0231 q a²'), 0.0231 * q * a * a, cl.mxC, 'kNm/m', 0.04);
    add(T_('Platten (FE)'), T_('Eingespannte Quadratplatte, Moment Randmitte'), T_('Timoshenko Tab. 35: −0,0513 q a²'), -0.0513 * q * a * a, cl.mxE, 'kNm/m', 0.06);
    // Wand: gelenkig gelagerte Quadratplatte unter Dreieckslast q = q0·y/a (Erddruckverlauf), Navier-Reihe
    const tri = (() => {
      const FE = BP.fe, G = BP.geo, E = 30e6, nu = 0.2, h = 0.12, q0 = 10, dom = G.polygonFromRect(0, 0, a, a);
      const lines = [0, 1, 2, 3].map((i) => ({ a: dom[i], b: dom[(i + 1) % 4], kind: 'fix' }));
      const sol = FE.solve({ domain: dom, meshSize: a / 24, E, nu, h, lines, cases: [{ q: 0, profileY: [[0, 0], [a, q0]] }] });
      const mesh = sol.mesh, U = sol.results[0].U, f2 = FE.elemForces(sol, U), my = FE.recover(mesh, f2.my);
      let c = 0, bd2 = Infinity; for (let k = 0; k < mesh.nNodes; k++) { const d = Math.hypot(mesh.nodeX[k] - a / 2, mesh.nodeY[k] - a / 2); if (d < bd2) { bd2 = d; c = k; } }
      const D = E * h * h * h / (12 * (1 - nu * nu));
      let w = 0, m = 0;
      // Lastbeiwerte q_mn = 8 q0 (−1)^(n+1) / (π² m n) für m ungerade (Last linear in y)
      for (let i = 1; i <= 61; i += 2) for (let n = 1; n <= 61; n++) {
        const qmn = 8 * q0 * Math.pow(-1, n + 1) / (PI * PI * i * n), s2 = Math.sin(i * PI / 2) * Math.sin(n * PI / 2), k2 = (i * i + n * n) / (a * a);
        w += qmn * s2 / (Math.pow(PI, 4) * D * k2 * k2);
        m += qmn * s2 * (nu * i * i + n * n) / (a * a) / (PI * PI * k2 * k2);
      }
      return { w: U[3 * c], wr: w, m: my[c], mr: m };
    })();
    add(T_('Platten (FE)'), T_('Gelenkig gelagerte Platte unter Dreieckslast (Erddruck), Durchbiegung Mitte'), T_('Navier-Reihe'), tri.wr * 1000, tri.w * 1000, 'mm', 0.03);
    add(T_('Platten (FE)'), T_('Gelenkig gelagerte Platte unter Dreieckslast (Erddruck), Moment my Mitte'), T_('Navier-Reihe, ν = 0,2'), tri.mr, tri.m, 'kNm/m', 0.03);
    const bd = plate('free', a, 0.3, q, 0.2, 20000);
    add(T_('Platten (FE)'), T_('Freie, elastisch gebettete Platte, Setzung'), T_('Gleichgewicht: s = q / ks'), q / 20000 * 1000, bd.w * 1000, 'mm', 0.005);
    // 2 Stabwerk
    const cb = C.contBeam([0, 5, 10], 10, () => 10);
    const iB = cb.supIdx[1], mB = cb.M[iB];
    add(T_('Durchlaufträger'), T_('Zweifeldträger 2 × 5 m, Stützmoment'), 'q l² / 8', -31.25, mB, 'kNm', 0.01);
    add(T_('Durchlaufträger'), T_('Zweifeldträger 2 × 5 m, Mittelauflager'), T_('1,25 q l'), 62.5, cb.R[1], 'kN', 0.01);
    add(T_('Durchlaufträger'), T_('Zweifeldträger 2 × 5 m, Feldmoment'), '9/128 q l²', 9 / 128 * 250, Math.max(...cb.M), 'kNm', 0.02);
    // 3 Querschnitte nach EC2 mit NA DE (unabhängige Handrechnung)
    const mat = { fck: 30, fcd: 0.85 * 30 / 1.5, fyd: 500 / 1.15, fctm: 2.9, Ecm: 33000 };
    const k = 1 + Math.sqrt(200 / 250), vmin = 0.035 * Math.pow(k, 1.5) * Math.sqrt(30), vc = 0.1 * k * Math.pow(100 * 0.004 * 30, 1 / 3);
    add(T_('Querschnitte (EC2)'), T_('Querkraft ohne Bügel vRd,c, d = 25 cm, ρl = 0,4 %, C30/37'), T_('EC2 6.2.2 mit NA DE (CRd,c = 0,15/γc, vmin)'), Math.max(vc, vmin) * 250, C.shearCheck(100, 0.25, 10, mat).vRd, 'kN/m', 0.005);
    const As = C.asForShear(150, 0.25, mat), rhoReq = As * 1e-4 / 0.25;
    add(T_('Querschnitte (EC2)'), T_('Längsbewehrung für vRd,c = 150 kN/m, d = 25 cm'), T_('EC2 6.2.2 umgestellt nach ρl'), 150 / 250, 0.1 * k * Math.pow(100 * rhoReq * 30, 1 / 3), 'MPa', 0.01);
    // Durchstanzen Innenstütze 40 × 40 cm, d = 30 cm, ρl = 0,8 %: u0/d = 5,3 ≥ 4 → CRd,c = 0,18/γc; u1 = 4·0,4 + 2π·2d
    const fake = { layers: [{ face: 'oben', dir: 'x', prov: 0.008 * 0.3 * 1e4, d: 0.3 }, { face: 'oben', dir: 'y', prov: 0.008 * 0.3 * 1e4, d: 0.3 }] };
    const pu = C.punching(fake, { x: 0, y: 0, bx: 0.4, by: 0.4 }, 1000, mat, { beta: 1.1 });
    const kP = 1 + Math.sqrt(200 / 300);
    add(T_('Querschnitte (EC2)'), T_('Durchstanzen ohne Bewehrung vRd,c, Innenstütze 40 × 40 cm, d = 30 cm, ρl = 0,8 %'), T_('EC2 6.4.4 mit NA DE (CRd,c = 0,18/γc)'), Math.max(0.12 * kP * Math.pow(100 * 0.008 * 30, 1 / 3), 0.035 * Math.pow(kP, 1.5) * Math.sqrt(30)), pu.vRdc, 'MPa', 0.005);
    add(T_('Querschnitte (EC2)'), T_('Durchstanzen: kritischer Rundschnitt u1 im Abstand 2d'), T_('4 · 0,40 + 2π · 0,60 m'), 1.6 + 2 * PI * 0.6, pu.u1, 'm', 0.002);
    // Stützenquerschnitt 30 × 30 cm, 4 Ø 20, d1 = 5 cm: Parabel-Rechteck mit Völligkeitsbeiwerten (Programm) gegen Faserverfahren
    const As4 = 4 * C.asBar(20) * 1e-4, sec = C.colSection(0.3, 0.3, 4 * C.asBar(20), 0.05, mat, 0.5);
    for (const nf of [0, 0.4, 0.7]) {
      const N = nf * sec.N0;
      add(T_('Querschnitte (EC2)'), T_('Stütze 30 × 30 cm, 4 Ø 20: MRd bei NEd = {p} % von NRd', { p: Math.round(nf * 100) }), T_('Faserverfahren Parabel-Rechteck (unabhängig)'), fiberMRd(0.3, 0.3, As4, 0.05, mat.fcd * 1000, mat.fyd * 1000, N), sec.mRd(N), 'kNm', 0.05);
    }
    add(T_('Querschnitte (EC2)'), T_('Stütze 30 × 30 cm, 4 Ø 20: zentrische Tragfähigkeit'), 'Ac·fcd + As·400 MPa (εc2 = 2 ‰)', 0.09 * mat.fcd * 1000 + As4 * 400e3, sec.N0, 'kN', 0.001);
    // Einmassenschwinger (Luftstoß): geschlossene Lösungen
    const S = V.sdof, KE = 1000, m1 = 1;
    add(T_('Dynamik'), T_('Einmassenschwinger elastisch, Rechteckstoß: xm = 2 P / K'), T_('Biggs: Lastfaktor 2'), 0.2, S({ m: m1, KE, Ru: 1e9, P0: 100, td: Infinity }).xm, 'm', 0.002);
    add(T_('Dynamik'), T_('Einmassenschwinger elastisch-plastisch, Rechteckstoß: μ = Ru / (2 (Ru − P))'), T_('Energiesatz, Ru = 1,2 P → μ = 3'), 3, S({ m: m1, KE, Ru: 120, P0: 100, td: Infinity }).mu, '–', 0.01);
    const Tn = 2 * PI * Math.sqrt(0.77 * m1 / KE), tdI = Tn / 2000;
    add(T_('Dynamik'), T_('Einmassenschwinger, Kurzzeitstoß (Impuls I = 0,5): xm = I / √(KLM m K)'), T_('Impulssatz'), 0.5 / Math.sqrt(0.77 * m1 * KE), S({ m: m1, KE, Ru: 1e9, P0: 1 / tdI, td: tdI }).xm, 'm', 0.01);
    const w = 2 * PI / Tn;
    let dlf = 0;
    for (let i = 0; i <= 20000; i++) { const t = i * 3 * Tn / 20000; const x = t < Tn ? 1 - Math.cos(w * t) + Math.sin(w * t) / (w * Tn) - t / Tn : (() => { const x1 = -Math.cos(w * Tn) + Math.sin(w * Tn) / (w * Tn), v1 = w * Math.sin(w * Tn) + Math.cos(w * Tn) / Tn - 1 / Tn; return x1 * Math.cos(w * (t - Tn)) + v1 / w * Math.sin(w * (t - Tn)); })(); dlf = Math.max(dlf, x); }
    add(T_('Dynamik'), T_('Einmassenschwinger elastisch, Dreieckstoß td = T: Lastfaktor'), T_('Duhamel-Integral (geschlossen)'), dlf, S({ m: m1, KE, Ru: 1e9, P0: 100, td: Tn }).xm / 0.1, '–', 0.01);
    // 4 Baugrund
    const F = V.bearingFactors(30);
    add(T_('Baugrund'), T_('Tragfähigkeitsbeiwert Nd0 (φ = 30°)'), T_('DIN 4017 Tab. 2: 18,4'), 18.4, F.Nd, '–', 0.005);
    add(T_('Baugrund'), T_('Tragfähigkeitsbeiwert Nb0 (φ = 30°)'), T_('DIN 4017 Tab. 2: 10,0'), 10.0, F.Nb, '–', 0.01);
    add(T_('Baugrund'), T_('Tragfähigkeitsbeiwert Nc0 (φ = 30°)'), T_('DIN 4017 Tab. 2: 30,1'), 30.1, F.Nc, '–', 0.005);
    add(T_('Baugrund'), T_('Spannungseinfluss unter der Rechteckecke, a = b = z'), T_('Newmark / Steinbrenner: 0,1752'), 0.1752, V.cornerI(1, 1, 1), '–', 0.002);
    add(T_('Baugrund'), T_('Spannungseinfluss unter der Rechteckecke, a = b = 2z'), T_('Newmark / Steinbrenner: 0,2325'), 0.2325, V.cornerI(2, 2, 1), '–', 0.003);
    return out;
  }

  BP.benchmarks = { run, navier, plate };
})(typeof window !== 'undefined' ? window : globalThis);
