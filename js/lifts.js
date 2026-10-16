/* Aufzüge und Lastenaufzüge: Kabine nach Nennlast (EN 81-20), Schachtmaße, Schachtgrube und Schachtkopf, Antrieb und
 * Leistung, Lasten auf das Bauwerk, Stromversorgung. Richtwerte für die Vorplanung; Ausführungsmaße liefert der Aufzugshersteller. */
(function (root) {
  const BP = root.BP = root.BP || {};
  const max = Math.max, min = Math.min;

  /* EN 81-20 Tab. 6: größte nutzbare Kabinenfläche je Nennlast (Personen- und Lasten-Personenaufzüge) */
  const TAB6 = [[100, 0.37], [180, 0.58], [225, 0.70], [300, 0.90], [375, 1.10], [400, 1.17], [450, 1.30], [525, 1.45], [600, 1.60], [630, 1.66],
    [675, 1.75], [750, 1.90], [800, 2.00], [825, 2.05], [900, 2.20], [975, 2.35], [1000, 2.40], [1050, 2.50], [1125, 2.65], [1200, 2.80],
    [1250, 2.90], [1275, 2.95], [1350, 3.10], [1425, 3.25], [1500, 3.40], [1600, 3.56], [2000, 4.20], [2500, 5.00]];
  function maxArea(Q) {
    if (Q <= TAB6[0][0]) return TAB6[0][1];
    if (Q > 2500) return 5.0 + 0.16 * (Q - 2500) / 100;
    for (let i = 1; i < TAB6.length; i++) {
      const [q1, a1] = TAB6[i], [q0, a0] = TAB6[i - 1];
      if (Q <= q1) return a0 + (a1 - a0) * (Q - q0) / (q1 - q0);
    }
    return 5.0;
  }
  /* kleinste Nennlast, die zu einer Kabinenfläche passt (Umkehrung von Tab. 6), auf 25 kg gerundet */
  function minLoad(A) {
    let Q = 100;
    while (maxArea(Q) < A - 1e-9 && Q < 20000) Q += 5;
    return Math.ceil(Q / 25) * 25;
  }

  /* Schacht lichte Maße aus der Kabine: Breite + Gegengewicht/Zylinder und Führungsschienen, Tiefe + Türzone und Rückseite */
  function shaftSize(v) {
    return { wIn: v.w + (v.drive === 'hydraulik' ? 0.45 : 0.50), dIn: v.d + 0.30 };
  }

  /* Auslegung je Aufzug. ctx: { levels: [{ zFloorTop, H }], stops: [Indizes], toSurface, zSurface, mat } */
  function design(v, ctx) {
    const g = 9.81, Q = v.payload, area = v.w * v.d, aMax = maxArea(Q);
    const persons = Math.floor(Q / 75);
    const rope = v.drive !== 'hydraulik';
    const carMass = Math.round(300 + 0.8 * Q); // Kabine mit Rahmen und Türen, Richtwert
    const carH = v.type === 'personen' ? 2.2 : 2.3;
    const doorH = v.type === 'personen' ? 2.0 : 2.1;
    const sp = v.speed;
    // Förderhöhe zwischen unterster und oberster Haltestelle
    const zTop = ctx.toSurface ? ctx.zSurface : ctx.levels[ctx.top].zFloorTop, zBot = ctx.levels[ctx.bottom].zFloorTop;
    const travel = max(0, zTop - zBot);
    // Schachtgrube und Schachtkopf (Richtwerte EN 81-20 mit Schutzräumen; verkürzt nach EN 81-21 mit Sondermaßnahmen)
    const pit = rope ? max(1.0, 1.0 + 0.4 * sp) : max(1.0, 1.1 + 0.2 * sp);
    const head = carH + (rope ? 1.2 + 0.1 * sp : 1.1) + 0.035 * sp * sp;
    const pitRed = 0.5, headRed = carH + 0.5;
    // Antrieb: Seil mit Gegengewicht (50 % Nennlast), Wirkungsgrad 0,75; Hydraulik ohne Gegengewicht, 0,6
    const P = rope ? 0.5 * Q * g * sp / 0.75 / 1000 : (Q + carMass) * g * sp / 0.6 / 1000;
    const kVAstart = rope ? 1.8 * P / 0.85 : 3.0 * P / 0.85; // Anlaufstrom Frequenzumrichter bzw. Sanftanlauf
    const kVArun = P / 0.85;
    // Fahrzeit für eine Fahrt über die ganze Förderhöhe (Anfahren/Bremsen ≈ 2 s)
    const tTrip = travel / max(sp, 0.1) + 2 + 6; // + Türen
    // Lasten auf das Bauwerk (Größenordnung zur Abstimmung mit dem Hersteller)
    const buffer = 4 * (carMass + Q) * g / 1000; // Kabinenpuffer, kN
    const cwBuffer = rope ? 4 * (carMass + 0.5 * Q) * g / 1000 : 0;
    const piston = rope ? 0 : 2 * (carMass + Q) * g / 1000 * 1.4; // Zylinderfuß mit Stoßfaktor
    const hook = rope ? 2 * (carMass + Q + carMass + 0.5 * Q) * g / 1000 : 0; // Montagehaken / Aufhängung Schachtdecke
    const rail = (rope ? 0.1 : 0.15) * (carMass + Q) * g / 1000; // waagerechte Führungsschienenkraft je Befestigung
    return {
      Q, area, aMax, areaOk: area <= aMax + 1e-9, qMin: minLoad(area), persons, rope, carMass, carH, doorH, travel, pit, head, pitRed, headRed,
      P, kVAstart, kVArun, tTrip, buffer, cwBuffer, piston, hook, rail,
      accessible: v.type === 'personen' && v.w >= 1.1 - 1e-9 && v.d >= 1.4 - 1e-9 && v.door >= 0.9 - 1e-9, // EN 81-70 Typ 2
    };
  }

  /* Richtpreis netto: Grundpreis nach Art, Nennlast und Antrieb, je weitere Haltestelle, Schutzabschlüsse separat */
  function price(v, stops) {
    const base = v.type === 'personen' ? 38000 + 14 * v.payload : 42000 + 16 * v.payload;
    const drive = v.drive === 'hydraulik' ? (stops <= 2 ? -4000 : 3000) : 0;
    return { unit: base + drive, perStop: v.type === 'personen' ? 6500 : 8500 };
  }

  BP.lifts = { TAB6, maxArea, minLoad, shaftSize, design, price };
})(typeof window !== 'undefined' ? window : globalThis);
