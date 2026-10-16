/*
 * Layout-Vorschläge: sechs Grundrisstypen (Großschutzraum ab 20 Personen), aus Personenzahl und Fläche je Person bemessen.
 * Typen mit großer Deckenspannweite werden nur bis zu der Personenzahl angeboten, für die die Vorbemessung aufgeht,
 * lange Typen nur bis 100 m Länge. Fehlende Notausstiege für Wege über 30 m werden ergänzt.
 * Jeder Vorschlag liefert eine vollständige Geometrie (Kontur, Wände, Türen, Zugänge, Räume)
 * und einfache Leitungswege, die das Rechenmodell direkt übernehmen kann.
 */
(function (root) {
  const BP = root.BP = root.BP || {};
  const max = Math.max, min = Math.min;
  const T_ = BP.i18n.T, N_ = BP.i18n.N;
  const up = (v) => Math.ceil(v * 20 - 1e-6) / 20;   // auf 5 cm aufrunden
  const r2 = (v) => Math.round(v * 20) / 20;          // auf 5 cm runden
  const clamp = (v, a, b) => max(a, min(b, v));
  const TI = 0.25, TM = 0.175; // Stahlbeton-Innenwand, Mauerwerkswand

  /* Raumprogramm: Nettoflächen in m². */
  function program(n, per) {
    return {
      live: max(8, n * per),
      tech: max(4, 2.5 + 0.2 * n),
      san: max(3, 2 + 0.15 * n),
      lock: n > 50 ? 6 : 3.5,
    };
  }

  const DN = [0.1, 0.125, 0.16, 0.2, 0.25, 0.315, 0.4, 0.5, 0.63, 0.8, 1.0];
  function builder(p) {
    const b = p.build, tc = p.tech;
    const t = b.tWall, H = b.clearHeight;
    const depth = b.cover + (b.insulation.roof || 0) + b.tRoof + H; // OK Rohboden unter Gelände
    // Rohrdurchmesser aus dem Luftbedarf, Ziel höchstens 3,5 m/s
    const dC = (tc.co2Target - tc.co2Out) * 1e-6;
    const Q = dC > 0 ? max(1, Math.round(p.use.people)) * tc.co2PerPerson / 1000 / dC : 150;
    const dReq = Math.sqrt(4 * Q / 3600 / 3.5 / Math.PI);
    const d = DN.find((v) => v >= dReq) || DN[DN.length - 1];
    const L = { t, H, d, hD: Math.floor((H - d / 2 - 0.15) * 20) / 20, hTop: r2(depth + 0.8), walls: [], openings: [], access: [], rooms: [], routes: [] };
    let nw = 0, no = 0, nr = 0;
    L.wall = (ax, ay, bx, by, th, kind) => { const w = { id: 'w' + (++nw), a: { x: r6(ax), y: r6(ay) }, b: { x: r6(bx), y: r6(by) }, t: th, kind }; L.walls.push(w); return w; };
    // Tür an Position c (Koordinate entlang der Wandachse, x bei waagrechter, y bei senkrechter Wand)
    L.door = (w, c, kind, width) => {
      const horiz = Math.abs(w.a.y - w.b.y) < 1e-9;
      const s = horiz ? Math.sign(w.b.x - w.a.x) : Math.sign(w.b.y - w.a.y);
      const pos = (c - (horiz ? w.a.x : w.a.y)) * s;
      L.openings.push({ id: 'o' + (++no), host: 'w:' + w.id, pos: r3(pos), w: width || (kind === 'schutztuer' ? 0.9 : 0.8), h: 2.0, sill: 0, kind });
    };
    L.room = (name, x, y) => L.rooms.push({ id: 'r' + (++nr), name, x: r3(x), y: r3(y) });
    L.stair = (edge, pos) => L.access.push({ id: 'a1', kind: 'treppe', edge, pos: r3(pos), width: 1.0, tw: 0.25, cover: 'klappe', landing: 1.2 });
    L.exit = (edge, pos) => L.access.push({ id: 'a2', kind: 'schacht', edge, pos: r3(pos), width: 0.8, depth: 0.8, tw: 0.25, lw: 0.6, lh: 0.8 });
    L.route = (id, type, kind, name, pts) => L.routes.push(Object.assign(
      { id, type, kind, name, shape: type === 'luft' ? 'rund' : 'rechteck', d: type === 'luft' ? L.d : 0.1, w: type === 'luft' ? 0.2 : 0.1, hgt: type === 'luft' ? 0.1 : 0.06, ins: 0, clr: type === 'luft' ? 0.05 : 0.03, airflow: null, reserve: 15, cable: type === 'kabel' ? 'NYY-J 5×6' : '' },
      { pts: pts.map(([x, y, h]) => ({ x: r3(x), y: r3(y), h: r3(h) })) }));
    return L;
  }
  const r3 = (v) => Math.round(v * 1000) / 1000;
  const r6 = (v) => Math.round(v * 1e6) / 1e6;

  /* Lage einer Türmitte in einem Bereich [lo, hi], ohne eine Sperrzone [s0, s1] zu treffen. */
  function doorAt(lo, hi, want, w, block) {
    const half = w / 2 + 0.1;
    let c = clamp(want, lo + half, hi - half);
    if (block && c + half > block[0] && c - half < block[1]) {
      const below = block[0] - half, above = block[1] + half;
      c = below >= lo + half ? below : above <= hi - half ? above : c;
    }
    return c;
  }

  /* Leitungen in einem Technikraum mit Außenwand. side: Richtung zur Außenwand ('x+','x-','y+','y-'). */
  function stdRoutes(L, tech, san, target) {
    const { hD, hTop, t } = L;
    // Zuluft: Ansaugung außen vor der Technik-Außenwand, durch die Technik zum Aufenthalt
    const out = (pt, side, dist) => ({ 'x+': [pt.face + dist, pt.c], 'x-': [pt.face - dist, pt.c], 'y+': [pt.c, pt.face + dist], 'y-': [pt.c, pt.face - dist] }[side]);
    const tz = out(tech, tech.side, 1.1);
    const zu = [[tz[0], tz[1], hTop], [tz[0], tz[1], hD]];
    if (tech.side[0] === 'x') zu.push([target.x, tz[1], hD], [target.x, target.y, hD]);
    else zu.push([tz[0], target.y, hD], [target.x, target.y, hD]);
    L.route('l1', 'luft', 'zuluft', T_('Zuluft vom Ansaugbauwerk'), dedupe(zu));
    // Abluft: aus dem Sanitärraum durch dessen Außenwand nach oben
    const sz = out(san, san.side, 0.7);
    const ab = san.side[0] === 'x' ? [[san.mid, sz[1], hD], [sz[0], sz[1], hD], [sz[0], sz[1], hTop]] : [[sz[0], san.mid, hD], [sz[0], sz[1], hD], [sz[0], sz[1], hTop]];
    L.route('l2', 'luft', 'abluft', T_('Abluft Sanitär'), ab);
    // Strom: Hausanschluss durch die Technik-Außenwand, unter der Zuluft
    const c2 = tech.c2 != null ? tech.c2 : tech.c;
    const sOut = tech.side[0] === 'x' ? [tech.face + (tech.side[1] === '+' ? 0.9 : -0.9), c2] : [c2, tech.face + (tech.side[1] === '+' ? 0.9 : -0.9)];
    const sIn = tech.side[0] === 'x' ? [tech.face + (tech.side[1] === '+' ? -t - 0.6 : t + 0.6), c2] : [c2, tech.face + (tech.side[1] === '+' ? -t - 0.6 : t + 0.6)];
    L.route('l3', 'kabel', 'strom', T_('Hausanschluss Strom'), [[sOut[0], sOut[1], 1.6], [sIn[0], sIn[1], 1.6], [sIn[0], sIn[1], 1.0]]);
  }
  function dedupe(pts) { return pts.filter((q, i) => i === 0 || Math.hypot(q[0] - pts[i - 1][0], q[1] - pts[i - 1][1]) > 1e-6 || Math.abs(q[2] - pts[i - 1][2]) > 1e-6); }

  /* Nebenzone an der Stirnseite: Schleuse unten, Sanitär, Technik oben (für Kompakt und Zweiraum). */
  function sideZone(pr, Wmin) {
    const Ln = 2.6;
    const hs = up(max(1.8, pr.lock / Ln)), hsan = up(max(1.5, pr.san / Ln)), htech0 = up(max(1.8, pr.tech / Ln));
    const need = hs + hsan + htech0 + 2 * TM;
    return { Ln, hs, hsan, htech0, need, Wi: max(Wmin, need) };
  }

  /* 1 Kompakt: Rechteck, Aufenthalt plus Nebenzone, eine tragende Querwand. */
  function kompakt(p, pr) {
    const L = builder(p), t = L.t;
    const z = sideZone(pr, up(Math.sqrt(pr.live / 1.3)));
    const Wi = up(z.Wi), Lr = up(max(3.0, pr.live / Wi));
    const htech = Wi - z.hs - z.hsan - 2 * TM;
    const X = 2 * t + Lr + TI + z.Ln, Y = 2 * t + Wi;
    L.outline = [{ x: 0, y: 0 }, { x: X, y: 0 }, { x: X, y: Y }, { x: 0, y: Y }];
    const xw = t + Lr + TI / 2, xs = t + Lr + TI, xe = X - t;
    const y1 = t + z.hs + TM / 2, y2 = y1 + TM / 2 + z.hsan + TM / 2;
    const w1 = L.wall(xw, t, xw, t + Wi, TI, 'stb');
    const w2 = L.wall(xs, y1, xe, y1, TM, 'mw');
    const w3 = L.wall(xs, y2, xe, y2, TM, 'mw');
    void w2; void w3;
    L.door(w1, t + z.hs / 2, 'schutztuer');
    L.door(w1, y1 + TM / 2 + z.hsan / 2, 'innen');
    const yT = y2 + TM / 2 + htech / 2;
    L.door(w1, yT, 'innen');
    L.stair(0, xs + z.Ln / 2);
    L.exit(2, X - (t + max(1.0, Lr * 0.3)));
    L.room(N_('Aufenthalt'), t + Lr / 2, t + Wi / 2);
    L.room(N_('Schleuse'), xs + z.Ln / 2, t + z.hs / 2);
    L.room(N_('Sanitär'), xs + z.Ln / 2, y1 + TM / 2 + z.hsan / 2);
    L.room(N_('Technik'), xs + z.Ln / 2, yT);
    stdRoutes(L, { side: 'y+', face: Y, c: xs + z.Ln * 0.65, c2: xs + z.Ln * 0.3 }, { side: 'x+', face: X, c: y1 + TM / 2 + z.hsan / 2, mid: xs + 0.5 }, { x: t + Lr / 2, y: yT });
    return L;
  }

  /* 2 Röhre: schmal und lang, kurze Deckenspannweite; Räume hintereinander. */
  function roehre(p, pr, n) {
    const L = builder(p), t = L.t;
    const Wi = r2(clamp(2.6 + 0.05 * n, 3.0, 4.5));
    const Ls = up(max(1.6, pr.lock / Wi)), Lr = up(max(3.0, pr.live / Wi));
    const half = (Wi - TM) / 2, Lt = up(max(2.0, max(pr.tech, pr.san) / half));
    const X = 2 * t + Ls + TI + Lr + TM + Lt, Y = 2 * t + Wi;
    L.outline = [{ x: 0, y: 0 }, { x: X, y: 0 }, { x: X, y: Y }, { x: 0, y: Y }];
    const xS = t + Ls + TI / 2, xN = t + Ls + TI + Lr + TM / 2, xB = t + Ls + TI + Lr + TM, ym = t + Wi / 2;
    const wS = L.wall(xS, t, xS, t + Wi, TI, 'stb');
    const wN = L.wall(xN, t, xN, t + Wi, TM, 'mw');
    L.wall(xB, ym, X - t, ym, TM, 'mw');
    L.door(wS, ym, 'schutztuer');
    L.door(wN, t + half / 2, 'innen');
    L.door(wN, ym + TM / 2 + half / 2, 'innen');
    L.stair(3, Y - ym);
    const xE = t + Ls + TI + Lr - max(1.0, Lr * 0.25);
    L.exit(2, X - xE);
    L.room(N_('Schleuse'), t + Ls / 2, ym);
    L.room(N_('Aufenthalt'), t + Ls + TI + Lr / 2, ym);
    L.room(N_('Sanitär'), xB + Lt / 2, t + half / 2);
    L.room(N_('Technik'), xB + Lt / 2, ym + TM / 2 + half / 2);
    stdRoutes(L, { side: 'x+', face: X, c: t + Wi * 0.75, c2: min(t + Wi - 0.25, t + Wi * 0.75 + 0.35) }, { side: 'x+', face: X, c: t + half / 2, mid: xB + Lt / 2 }, { x: t + Ls + TI + Lr / 2, y: t + Wi * 0.75 });
    return L;
  }

  /* 3 L-Form: Aufenthalt im langen Schenkel, Sanitär und Technik im kurzen, Schleuse am Ende. */
  function lform(p, pr) {
    const L = builder(p), t = L.t;
    const Wb = r2(clamp(Math.sqrt(pr.live / 2.0), 3.0, 5.0));
    const Wl = 3.4, half = (Wl - TM) / 2;
    const Hl = up(max(2.0, max(pr.tech, pr.san) / half));
    const Lr = up(max(Wl + 0.8, pr.live / Wb));
    const Ls = up(max(1.8, pr.lock / Wb));
    const X = 2 * t + Lr + TI + Ls, Bb = 2 * t + Wb, y0 = t + Wb + TI, y1 = y0 + Hl, Y = y1 + t;
    L.outline = [{ x: 0, y: 0 }, { x: X, y: 0 }, { x: X, y: Bb }, { x: 2 * t + Wl, y: Bb }, { x: 2 * t + Wl, y: Y }, { x: 0, y: Y }];
    const yc = t + Wb + TI / 2, xd = t + Wl / 2, xs = t + Lr + TI / 2;
    const wSep = L.wall(t, yc, t + Wl, yc, TI, 'stb');
    L.wall(xd, y0, xd, y1, TM, 'mw');
    const wSch = L.wall(xs, t, xs, t + Wb, TI, 'stb');
    L.door(wSch, t + Wb / 2, 'schutztuer');
    L.door(wSep, t + half / 2, 'innen');
    L.door(wSep, xd + TM / 2 + half / 2, 'innen');
    L.stair(1, t + Wb / 2);
    L.exit(5, Y - (t + Wb / 2));
    L.room(N_('Aufenthalt'), t + Lr / 2 + Wl / 4, t + Wb / 2);
    L.room(N_('Schleuse'), xs + TI / 2 + Ls / 2, t + Wb / 2);
    L.room(N_('Sanitär'), t + half / 2, y0 + Hl / 2);
    L.room(N_('Technik'), xd + TM / 2 + half / 2, y0 + Hl / 2);
    stdRoutes(L, { side: 'y+', face: Y, c: xd + TM / 2 + half * 0.6, c2: y0 + Hl * 0.7, sideStrom: 'x+' }, { side: 'x-', face: 0, c: y0 + Hl / 2, mid: t + half / 2 }, { x: t + Lr * 0.6, y: t + Wb / 2 });
    // Strom von rechts in die Technik (Außenwand des kurzen Schenkels)
    L.routes = L.routes.filter((r) => r.id !== 'l3');
    const xo = 2 * t + Wl, ys = y0 + Hl * 0.7;
    L.route('l3', 'kabel', 'strom', T_('Hausanschluss Strom'), [[xo + 0.9, ys, 1.6], [xo - t - 0.6, ys, 1.6], [xo - t - 0.6, ys, 1.0]]);
    return L;
  }

  /* 4 Zweiraum: wie Kompakt, Aufenthalt durch tragende Längswand in Wohnen und Schlafen geteilt. */
  function zweiraum(p, pr) {
    const L = builder(p), t = L.t;
    const z = sideZone(pr, up(Math.sqrt(pr.live / 0.8)));
    const Wi = up(max(z.Wi, 4.4)), Lr = up(max(3.0, pr.live / (Wi - TI)));
    const htech = Wi - z.hs - z.hsan - 2 * TM;
    const X = 2 * t + Lr + TI + z.Ln, Y = 2 * t + Wi;
    L.outline = [{ x: 0, y: 0 }, { x: X, y: 0 }, { x: X, y: Y }, { x: 0, y: Y }];
    const xw = t + Lr + TI / 2, xs = t + Lr + TI, xe = X - t;
    const y1 = t + z.hs + TM / 2, y2 = y1 + TM / 2 + z.hsan + TM / 2;
    // Längswand nicht auf die Sanitärtür setzen: bei schmalem Sanitärraum auf eine Leichtwandachse ausweichen
    let ym = t + Wi / 2;
    const ySan = y1 + TM / 2 + z.hsan / 2;
    if (Math.abs(ym - ySan) < 0.5 + TI / 2 && z.hsan < 2 * (1.0 + TI / 2)) ym = ym - y1 < y2 - ym ? y1 : y2;
    const w1 = L.wall(xw, t, xw, t + Wi, TI, 'stb');
    const wm = L.wall(t, ym, t + Lr, ym, TI, 'stb');
    L.wall(xs, y1, xe, y1, TM, 'mw');
    L.wall(xs, y2, xe, y2, TM, 'mw');
    const blk = [ym - TI / 2, ym + TI / 2];
    L.door(w1, doorAt(t, y1 - TM / 2, t + z.hs / 2, 0.9, blk), 'schutztuer');
    L.door(w1, doorAt(y1 + TM / 2, y2 - TM / 2, y1 + TM / 2 + z.hsan / 2, 0.8, blk), 'innen');
    const yT = y2 + TM / 2 + htech / 2;
    L.door(w1, doorAt(y2 + TM / 2, t + Wi, yT, 0.8, blk), 'innen');
    L.door(wm, t + Lr * 0.5, 'innen');
    L.stair(0, xs + z.Ln / 2);
    L.exit(2, X - (t + max(1.0, Lr * 0.3)));
    L.room(N_('Wohnen'), t + Lr / 2, (t + ym - TI / 2) / 2);
    L.room(N_('Schlafen'), t + Lr / 2, (ym + TI / 2 + t + Wi) / 2);
    L.room(N_('Schleuse'), xs + z.Ln / 2, t + z.hs / 2);
    L.room(N_('Sanitär'), xs + z.Ln / 2, y1 + TM / 2 + z.hsan / 2);
    L.room(N_('Technik'), xs + z.Ln / 2, yT);
    // Zuluft-Höhe so wählen, dass sie nicht in der Längswand läuft
    const tLo = y2 + TM / 2 + 0.3, tHi = t + Wi - 0.3;
    const yR = [yT, yT + 0.5, yT - 0.5, tHi, tLo].find((v) => v >= tLo && v <= tHi && Math.abs(v - ym) > TI / 2 + 0.25) || yT;
    stdRoutes(L, { side: 'y+', face: Y, c: xs + z.Ln * 0.65, c2: xs + z.Ln * 0.3 }, { side: 'x+', face: X, c: y1 + TM / 2 + z.hsan / 2, mid: xs + 0.5 }, { x: t + Lr / 2, y: yR });
    return L;
  }

  /* 5 Flurtyp: Mittelflur mit Räumen beidseitig, für größere Gruppen. */
  function flur(p, pr, n) {
    const L = builder(p), t = L.t;
    const c = 1.4, D = r2(clamp(2.8 + 0.03 * n, 3.0, 4.5));
    const Ls = up(max(2.0, pr.lock / c));
    const k = max(1, Math.ceil(n / 10));
    let la = up(max(Ls + TI + 1.6, 0.45 * pr.live / D)), ls = up(max(1.5, pr.san / D)), lt = up(max(2.0, pr.tech / D));
    const lk = up(max(2.2, 0.55 * pr.live / D / k));
    // erster Schlafraum braucht hinter der Schleuse Platz für die Tür
    const wk = Array.from({ length: k }, (_, i) => (i === 0 ? max(lk, up(Ls + TI + 1.6)) : lk));
    const bottom = la + ls + lt + 2 * TM, top = wk.reduce((s2, v) => s2 + v, 0) + (k - 1) * TM;
    const Lx = up(max(bottom, top));
    la += Lx - bottom;
    for (let i = 0; i < k; i++) wk[i] += (Lx - top) / k;
    const Wi = 2 * D + c + 2 * TI;
    const X = 2 * t + Lx, Y = 2 * t + Wi;
    L.outline = [{ x: 0, y: 0 }, { x: X, y: 0 }, { x: X, y: Y }, { x: 0, y: Y }];
    const yc1 = t + D + TI / 2, yc2 = t + D + TI + c + TI / 2, yCorr = t + D + TI + c / 2, yTop0 = t + D + 2 * TI + c;
    const wc1 = L.wall(t, yc1, X - t, yc1, TI, 'stb');
    const wc2 = L.wall(t, yc2, X - t, yc2, TI, 'stb');
    const xL = t + Ls + TI / 2;
    const wL = L.wall(xL, t + D + TI, xL, t + D + TI + c, TI, 'stb');
    const xa = t + la + TM / 2, xb = xa + TM / 2 + ls + TM / 2;
    L.wall(xa, t, xa, t + D, TM, 'mw');
    L.wall(xb, t, xb, t + D, TM, 'mw');
    L.door(wL, yCorr, 'schutztuer');
    const after = t + Ls + TI;
    L.door(wc1, doorAt(after, xa - TM / 2, max(after + 0.6, t + la / 2), 0.9), 'innen', 0.9);
    L.door(wc1, xa + TM / 2 + ls / 2, 'innen');
    const xTc = xb + TM / 2 + lt / 2;
    L.door(wc1, xTc, 'innen');
    let x0 = t;
    for (let i = 0; i < k; i++) {
      const x1 = x0 + wk[i];
      if (i < k - 1) L.wall(x1 + TM / 2, yTop0, x1 + TM / 2, t + Wi, TM, 'mw');
      L.door(wc2, doorAt(max(x0, i === 0 ? after : x0), x1, (x0 + x1) / 2, 0.8), 'innen');
      L.room(k > 1 ? N_('Schlafen') + ' ' + (i + 1) : N_('Schlafen'), (x0 + x1) / 2, yTop0 + D / 2);
      x0 = x1 + TM;
    }
    L.stair(3, Y - yCorr);
    L.exit(1, yCorr);
    L.room(N_('Schleuse'), t + Ls / 2, yCorr);
    L.room(N_('Flur'), (after + X - t) / 2, yCorr);
    L.room(N_('Aufenthalt'), t + la / 2, t + D / 2);
    L.room(N_('Sanitär'), xa + TM / 2 + ls / 2, t + D / 2);
    L.room(N_('Technik'), xTc, t + D / 2);
    stdRoutes(L, { side: 'y-', face: 0, c: xTc, c2: t + D * 0.35 }, { side: 'y-', face: 0, c: xa + TM / 2 + ls / 2, mid: t + D / 2 }, { x: after + 0.8, y: yCorr });
    // Strom von rechts in die Technik
    L.routes = L.routes.filter((r) => r.id !== 'l3');
    L.route('l3', 'kabel', 'strom', T_('Hausanschluss Strom'), [[X + 0.9, t + D * 0.35, 1.6], [X - t - 0.6, t + D * 0.35, 1.6], [X - t - 0.6, t + D * 0.35, 1.0]]);
    void wc2;
    return L;
  }

  /* 6 Großschutzraum: Abschnitte für je bis 50 Personen mit Schlafkabinen, Aufenthalt und Sanitär.
   * Eingang mit Schleuse, Dekontamination und Sanitätsraum; Abschnitte durch Zwischenschleusen getrennt.
   * Ab 100 Personen zwei Flügel mit zweitem Zugang. Tragende Flurwände halten die Deckenspannweite klein. */
  function gross(p, pr, n, per0) {
    const L = builder(p), t = L.t;
    const wings = n > 100 ? 2 : 1;
    const per = n > 60 ? 6 : 4;                 // Betten je Kabine: 3 bzw. 2 Etagen beidseitig
    const wc = per === 6 ? 2.4 : 2.1;           // Kabinenbreite
    const D = per === 6 ? 4.0 : 3.4;            // Tiefe der Raumbänder
    const c = n > 100 ? 2.0 : 1.6;              // Flurbreite
    const kS = wings === 2 ? 2 * Math.ceil(n / 100) : Math.ceil(n / 50); // Abschnitte gesamt, je Flügel gleich viele
    const nS = Math.ceil(n / kS);               // Personen je Abschnitt
    const secOf = Array.from({ length: wings }, (_, i) => Math.floor(kS / wings) + (i < kS % wings ? 1 : 0));
    const ncab = Math.ceil(nS / per);
    const sleep = wc * D / per;                 // Schlaffläche je Person in den Kabinen
    const Aauf = max(12, nS * max(0.5, per0 - sleep)), Asan = max(5, 0.3 * nS); // Aufenthalt = eingestellte Fläche je Person ohne Schlafplatz
    const Lsec = up(max(ncab * wc + (ncab - 1) * TM, (Aauf + Asan) / D + TM));
    const lsan = up(max(1.8, Asan / D)), lauf = Lsec - lsan - TM;
    const Lz = 2.0, Le = 2.6, cx = 2.2;
    const Lend = up(max(3.0, pr.tech / D));
    const Ww = 2 * D + 2 * TI + c;
    const Wi = wings * Ww + (wings - 1) * TI;
    const wingLen = (m) => m * Lsec + (m - 1) * (2 * TI + Lz) + TI + Lend;
    const xs = t + Le + TI + cx + TI;            // Beginn der Flügel
    const Lw = max(...secOf.map(wingLen));
    const X = up(xs + Lw + t), Y = 2 * t + Wi;
    L.outline = [{ x: 0, y: 0 }, { x: X, y: 0 }, { x: X, y: Y }, { x: 0, y: Y }];
    const xe = X - t;                            // Innenkante Stirnwand hinten
    // Eingang: Schleuse in der Mitte, Dekontamination und Sanitätsraum seitlich
    const wl = n > 100 ? 3.0 : 2.4;
    const yc = wings === 1 ? t + D + TI + c / 2 : t + Wi / 2;
    const xa = t + Le + TI / 2, xb = xa + TI / 2 + cx + TI / 2;
    const wA = L.wall(xa, t, xa, Y - t, TI, 'stb');
    const yl0 = yc - wl / 2 - TI / 2, yl1 = yc + wl / 2 + TI / 2;
    L.wall(t, yl0, xa - TI / 2, yl0, TI, 'stb');
    L.wall(t, yl1, xa - TI / 2, yl1, TI, 'stb');
    L.door(wA, yc, 'schutztuer', 1.0);
    L.door(wA, (t + yl0 - TI / 2) / 2, 'innen', 0.9);
    L.door(wA, (yl1 + TI / 2 + Y - t) / 2, 'innen', 0.9);
    L.stair(3, Y - yc);
    L.room(N_('Schleuse'), t + Le / 2, yc);
    L.room(N_('Dekontamination'), t + Le / 2, (t + yl0 - TI / 2) / 2);
    L.room(N_('Sanitätsraum'), t + Le / 2, (yl1 + TI / 2 + Y - t) / 2);
    L.room(N_('Verteiler'), xa + TI / 2 + cx / 2, yc);
    let accN = 1, aud = null, sanFirst = null, techX = null;
    for (let i = 0; i < wings; i++) {
      const y0 = t + i * (Ww + TI), yw1 = y0 + D + TI / 2, yw2 = y0 + D + TI + c + TI / 2, yC = y0 + D + TI + c / 2, yB = y0 + D + 2 * TI + c, yTop = y0 + Ww;
      const tag = wings > 1 ? String.fromCharCode(65 + i) : '';
      // Abschluss zum Verteiler: tragende Wand mit breiter Flurtür (hält die Deckenspannweite klein)
      const wB = L.wall(xb, y0, xb, yTop, TI, 'stb');
      L.door(wB, yC, 'innen', min(1.2, c - 0.2));
      const wc1 = L.wall(xb + TI / 2, yw1, xe, yw1, TI, 'stb');
      const wc2 = L.wall(xb + TI / 2, yw2, xe, yw2, TI, 'stb');
      if (i < wings - 1) L.wall(xb - TI / 2, yTop + TI / 2, xe, yTop + TI / 2, TI, 'stb');
      let x0 = xs;
      const m = secOf[i];
      for (let j = 0; j < m; j++) {
        const nm = (tag || '') + (j + 1);
        // Schlafkabinen
        let xc = x0;
        for (let k = 0; k < ncab; k++) {
          const w = k < ncab - 1 ? wc : (x0 + Lsec) - xc;
          if (k < ncab - 1) L.wall(xc + w + TM / 2, yB, xc + w + TM / 2, yTop, TM, 'mw');
          L.door(wc2, doorAt(xc, xc + w, xc + w / 2, 0.8), 'innen');
          L.room(N_('Kabine') + ' ' + nm + '.' + (k + 1), xc + w / 2, (yB + yTop) / 2);
          xc += w + TM;
        }
        // Aufenthalt und Sanitär
        const xS = x0 + lauf + TM / 2;
        L.wall(xS, y0, xS, y0 + D, TM, 'mw');
        L.door(wc1, x0 + lauf * 0.3, 'innen', 0.9);
        if (lauf > 8) L.door(wc1, x0 + lauf * 0.8, 'innen', 0.9);
        L.door(wc1, xS + TM / 2 + lsan / 2, 'innen');
        L.room(N_('Aufenthalt') + ' ' + nm, x0 + lauf / 2, y0 + D / 2);
        L.room(N_('Sanitär') + ' ' + nm, xS + TM / 2 + lsan / 2, y0 + D / 2);
        L.room(N_('Flur') + ' ' + nm, x0 + Lsec / 2, yC);
        if (i === 0 && j === 0) { aud = { x: x0 + lauf / 2, y: y0 + D / 2 }; sanFirst = xS + TM / 2 + lsan / 2; }
        x0 += Lsec;
        if (j < m - 1) {
          // Zwischenschleuse zum nächsten Abschnitt: zwei Stahlbetonwände mit Schutztür, seitlich Vorräte
          const v1 = L.wall(x0 + TI / 2, y0, x0 + TI / 2, yTop, TI, 'stb');
          const v2 = L.wall(x0 + TI + Lz + TI / 2, y0, x0 + TI + Lz + TI / 2, yTop, TI, 'stb');
          L.door(v1, yC, 'schutztuer'); L.door(v2, yC, 'schutztuer');
          const xm = x0 + TI + Lz / 2;
          L.door(wc1, xm, 'innen'); L.door(wc2, xm, 'innen');
          L.room(N_('Zwischenschleuse') + ' ' + nm, xm, yC);
          L.room(N_('Vorrat') + ' ' + nm, xm, y0 + D / 2);
          L.room(N_('Wasser') + ' ' + nm, xm, (yB + yTop) / 2);
          // Lange Flügel: zusätzlicher Notausstieg durch den Raum an der Außenwand neben der Zwischenschleuse
          if (X > 60) {
            if (i === 0) L.access.push({ id: 'a' + (++accN), kind: 'schacht', edge: 0, pos: r3(xm), width: 0.8, depth: 0.8, tw: 0.25, lw: 0.6, lh: 0.8 });
            else if (i === wings - 1) L.access.push({ id: 'a' + (++accN), kind: 'schacht', edge: 2, pos: r3(X - xm), width: 0.8, depth: 0.8, tw: 0.25, lw: 0.6, lh: 0.8 });
          }
          x0 += 2 * TI + Lz;
        }
      }
      // Endzone: Flügel A Technik und Notausstieg, Flügel B Lager und zweiter Zugang mit Schleuse
      const xz = x0 + TI / 2;
      const lz = xe - (x0 + TI);
      if (i === 0) {
        L.wall(xz, y0, xz, y0 + D, TI, 'stb');
        L.wall(xz, yB, xz, yTop, TI, 'stb');
        techX = x0 + TI + lz / 2;
        L.door(wc1, techX, 'innen', 0.9); L.door(wc2, techX, 'innen', 0.9);
        L.room(N_('Technik'), techX, y0 + D / 2);
        L.room(N_('Vorrat') + ' ' + (tag || N_('Technik')), techX, (yB + yTop) / 2);
        L.access.push({ id: 'a' + (++accN), kind: 'schacht', edge: 1, pos: r3(yC), width: 0.8, depth: 0.8, tw: 0.25, lw: 0.6, lh: 0.8 });
      } else {
        const vz = L.wall(xz, y0, xz, yTop, TI, 'stb');
        L.door(vz, yC, 'schutztuer');
        const xm = x0 + TI + lz / 2;
        L.door(wc1, xm, 'innen', 0.9); L.door(wc2, xm, 'innen', 0.9);
        L.room(N_('Schleuse') + ' ' + tag, xm, yC);
        L.room(N_('Lager') + ' ' + tag, xm, y0 + D / 2);
        L.room(N_('Vorrat') + ' ' + tag, xm, (yB + yTop) / 2);
        L.access.push({ id: 'a' + (++accN), kind: 'treppe', edge: 1, pos: r3(yC), width: 1.0, tw: 0.25, cover: 'klappe', landing: 1.2 });
      }
    }
    stdRoutes(L, { side: 'y-', face: 0, c: techX, c2: techX - 0.8 }, { side: 'y-', face: 0, c: sanFirst, mid: t + D / 4 }, aud); // Abluft nicht auf der Zuluftachse y = t + D/2
    return L;
  }

  const TYPES = [
    { key: 'kompakt', name: N_('Kompakt'), fn: kompakt, max: 15, desc: N_('Fast quadratisch, wenig Außenwand je m². Eine tragende Querwand trennt Aufenthalt und Nebenräume. Bis 15 Personen.') },
    { key: 'roehre', name: N_('Röhre'), fn: roehre, max: 100, maxLen: 100, desc: N_('Schmal und lang: kurze Deckenspannweite, dünne Bauteile, gut im Lastfall Luftstoß. Passt in schmale Grundstücke. Bis 100 Personen.') },
    { key: 'lform', name: N_('L-Form'), fn: lform, max: 100, maxLen: 100, desc: N_('Technik und Sanitär im kurzen Schenkel, Aufenthalt ruhig im langen. Schleuse am Ende des Ganges. Bis 100 Personen.') },
    { key: 'zweiraum', name: N_('Zweiraum'), fn: zweiraum, max: 40, desc: N_('Tragende Längswand halbiert die Spannweite und trennt Wohnen und Schlafen. Bis 40 Personen.') },
    { key: 'flur', name: N_('Mittelflur'), fn: flur, max: 150, maxLen: 100, desc: N_('Räume beidseitig am Flur, Notausstieg am Flurende. Sinnvoll ab etwa 15 und bis 150 Personen.') },
    { key: 'gross', name: N_('Großschutzraum'), fn: gross, min: 20, desc: N_('Abschnitte für je bis 50 Personen mit Schlafkabinen (4 bzw. 6 Betten), Aufenthalt und Sanitär, getrennt durch Zwischenschleusen mit Schutztüren und Vorratsräumen. Eingang mit Schleuse, Dekontamination und Sanitätsraum, Technik am Ende. Über 100 Personen zwei Flügel mit zweitem Zugang, bei langen Flügeln zusätzliche Notausstiege.') },
  ];

  /* Um 90° drehen (gegen den Uhrzeigersinn, danach in den positiven Bereich verschoben). Kantenfolge bleibt gleich. */
  function rotate(lay) {
    const g = lay.geom, Ymax = Math.max(...g.outline.map((q) => q.y));
    const tr = (q) => ({ x: r6(Ymax - q.y), y: r6(q.x) });
    return Object.assign({}, lay, {
      rotated: !lay.rotated,
      geom: {
        outline: g.outline.map(tr),
        walls: g.walls.map((w) => Object.assign({}, w, { a: tr(w.a), b: tr(w.b) })),
        openings: g.openings.map((o) => Object.assign({}, o)),
        access: g.access.map((a) => Object.assign({}, a)),
        rooms: g.rooms.map((r) => Object.assign({}, r, tr(r))),
      },
      routes: lay.routes.map((r) => Object.assign({}, r, { pts: r.pts.map((q) => Object.assign(tr(q), { h: q.h })) })),
    });
  }

  /* Rettungswege: Solange ein Punkt im Bauwerk mehr als 30 m Luftlinie vom nächsten Zugang entfernt ist, einen Notausstieg
   * an der nächstgelegenen freien Stelle der Außenwand ergänzen (Abstand zu Ecken, Innenwänden, Zugängen und Leitungen). */
  const EXIT_FAR = 30;
  function ensureExits(L) {
    const out = L.outline, n = out.length, t = L.t;
    let area2 = 0;
    for (let i = 0; i < n; i++) { const a = out[i], b = out[(i + 1) % n]; area2 += a.x * b.y - b.x * a.y; }
    const sgn = area2 >= 0 ? 1 : -1;
    const edges = out.map((a, i) => {
      const b = out[(i + 1) % n], len = Math.hypot(b.x - a.x, b.y - a.y) || 1, u = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
      return { a, len, u, nn: { x: sgn * u.y, y: -sgn * u.x } };
    });
    const inside = (pt) => { let c = false; for (let i = 0, j = n - 1; i < n; j = i++) { const a = out[i], b = out[j]; if ((a.y > pt.y) !== (b.y > pt.y) && pt.x < (b.x - a.x) * (pt.y - a.y) / (b.y - a.y) + a.x) c = !c; } return c; };
    const xs = out.map((q) => q.x), ys = out.map((q) => q.y), x0 = min(...xs), x1 = max(...xs), y0 = min(...ys), y1 = max(...ys);
    const sp = max(0.5, Math.sqrt((x1 - x0) * (y1 - y0) / 3000));
    const width = (ac) => (ac.width || 0.8) + 2 * (ac.tw || 0.25);
    const W = 0.8 + 2 * 0.25;
    for (let guard = 0; guard < 60; guard++) {
      const exits = L.access.filter((ac) => edges[ac.edge]).map((ac) => { const e = edges[ac.edge]; return { x: e.a.x + e.u.x * ac.pos, y: e.a.y + e.u.y * ac.pos }; });
      let far = null;
      for (let x = x0 + sp / 2; x < x1; x += sp) for (let y = y0 + sp / 2; y < y1; y += sp) {
        const pt = { x, y };
        if (!inside(pt)) continue;
        const d = exits.reduce((m, e) => min(m, Math.hypot(e.x - x, e.y - y)), Infinity);
        if (!far || d > far.d) far = { x, y, d };
      }
      if (!far || far.d <= EXIT_FAR) return;
      const cand = edges.map((e, i) => {
        const s = clamp((far.x - e.a.x) * e.u.x + (far.y - e.a.y) * e.u.y, 0, e.len);
        return { i, s, d: Math.hypot(e.a.x + e.u.x * s - far.x, e.a.y + e.u.y * s - far.y) };
      }).sort((p1, p2) => p1.d - p2.d);
      let placed = false;
      for (const c of cand) {
        const e = edges[c.i], m = max(W / 2, t + 0.3) + 0.05;
        if (e.len < 2 * m) continue;
        const blocks = [];
        for (const ac of L.access) if (ac.edge === c.i) { const r = (width(ac) + W) / 2 + 0.3; blocks.push([ac.pos - r, ac.pos + r]); }
        for (const w of L.walls) for (const q of [w.a, w.b]) {
          const along = (q.x - e.a.x) * e.u.x + (q.y - e.a.y) * e.u.y, off = -((q.x - e.a.x) * e.nn.x + (q.y - e.a.y) * e.nn.y);
          if (off > -0.05 && off < t + w.t / 2 + 0.1 && along > -0.5 && along < e.len + 0.5) { const r = w.t / 2 + W / 2 + 0.1; blocks.push([along - r, along + r]); }
        }
        for (const rt of L.routes) for (const q of rt.pts) {
          const along = (q.x - e.a.x) * e.u.x + (q.y - e.a.y) * e.u.y, off = (q.x - e.a.x) * e.nn.x + (q.y - e.a.y) * e.nn.y;
          if (off > -0.05 && off < 2.5) { const r = W / 2 + 0.6; blocks.push([along - r, along + r]); }
        }
        const free = (s) => s >= m && s <= e.len - m && !blocks.some(([b0, b1]) => s > b0 && s < b1);
        for (let k = 0; k <= 2 * e.len / 0.05 && !placed; k++) {
          const s = r3(c.s + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.05);
          if (free(s)) {
            let id = L.access.length + 1;
            while (L.access.some((ac) => ac.id === 'a' + id)) id++;
            L.access.push({ id: 'a' + id, kind: 'schacht', edge: c.i, pos: s, width: 0.8, depth: 0.8, tw: 0.25, lw: 0.6, lh: 0.8 });
            placed = true;
          }
        }
        if (placed) break;
      }
      if (!placed) return;
    }
  }

  function generate(p, opts) {
    const n = max(1, Math.round(p.use.people)), per = opts && opts.per > 0 ? opts.per : 3;
    const pr = program(n, per);
    return TYPES.filter((T) => (!T.min || n >= T.min) && (!T.max || n <= T.max)).map((T) => {
      const L = T.fn(p, pr, n, per);
      const xs = L.outline.map((q) => q.x), ys = L.outline.map((q) => q.y);
      if (T.maxLen && max(max(...xs) - min(...xs), max(...ys) - min(...ys)) > T.maxLen) return null; // unpraktisch lang
      ensureExits(L);
      return { key: T.key, name: T_(T.name), desc: T_(T.desc), pr, rotated: false, geom: { outline: L.outline.map((q) => ({ x: r6(q.x), y: r6(q.y) })), walls: L.walls, openings: L.openings, access: L.access, rooms: L.rooms }, routes: L.routes };
    }).filter(Boolean);
  }

  BP.layouts = { generate, rotate, TYPES, program };
})(typeof window !== 'undefined' ? window : globalThis);
