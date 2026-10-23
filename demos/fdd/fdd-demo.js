/* FDD demo — canvas animation (single timeline, deterministic)
 *
 * Public API (window.FDD):
 *   FDD.ready       Promise — data and font loaded
 *   FDD.duration    seconds (whole video)
 *   FDD.renderAt(t) draw the frame for time t [s]  (used by the frame exporter)
 *   FDD.play() / FDD.pause()
 *
 * URL params: ?still=1  → no controls, canvas fills the viewport (frame capture)
 *             ?t=12.5   → render a still frame at t seconds (visual check)
 *             ?autoplay=1
 *
 * Scope (2026-10-22): fault DETECTION only — no diagnosis (cause / action) is shown.
 * Logical canvas: 1920 x 1080. All coordinates below are in that space.
 */
(function () {
  "use strict";

  // ------------------------------------------------------------ timeline [s]
  var T_TITLE = 3.0;          // title scene length
  var T_MAIN = 30.0;          // main scene: 360 steps drawn in 30 s (12 steps/s)
  var T_CLOSE = 5.0;          // closing scene
  var FADE = 0.5;             // crossfade length
  var DURATION = T_TITLE + T_MAIN + T_CLOSE;

  // ------------------------------------------------------------ style
  var INK = "#20262d", INK2 = "#46505a", MUTED = "#66707a", RULE = "#e0e4e8", RULE2 = "#b9c1c9";
  var ACCENT = "#1e5fa8", ACCENT_SOFT = "rgba(30,95,168,0.12)", RED = "#b3261e", RED_SOFT = "rgba(179,38,30,0.10)";
  var FONT = "\"Pretendard Variable\", Pretendard, -apple-system, \"Segoe UI\", sans-serif";
  var W = 1920, H = 1080;

  var LAB_NAME = "Autonomous Building Systems Research Group";
  var LAB_TAGLINE = "Building autonomy, braced by physics.";

  // ------------------------------------------------------------ layout (right column: charts)
  var CH_X0 = 840, CH_X1 = 1840;                         // chart x range (left column = schematic, 80..760)
  var P_TEMP = { y0: 205, y1: 640, vmin: 15, vmax: 70, title: "Outlet temperature  [°C]" };
  var P_RES = { y0: 715, y1: 960, vmin: -12, vmax: 20, title: "Residual  =  measurement − prediction  [°C]" };

  var script = document.currentScript;
  var dataUrl = (script && script.getAttribute("data-src")) || "fdd-data.json";
  var params = new URLSearchParams(location.search);
  var STILL = params.get("still") === "1";

  var root = document.getElementById("fdd");
  var canvas = document.getElementById("fdd-canvas");
  var playBtn = document.getElementById("fdd-play");
  var bar = document.getElementById("fdd-bar");
  var ctx = canvas.getContext("2d");
  var D = null;              // data
  var N = 0;                 // steps
  var playing = false, started = false, t0 = 0, raf = 0, lastT = 0;
  var POSTER_T = 1.5;        // idle frame: title scene fully faded in (t=0 itself is blank)

  if (STILL) { document.body.classList.add("still"); }

  // ------------------------------------------------------------ helpers
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function smooth(u) { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); }
  function xOf(step) { return CH_X0 + (CH_X1 - CH_X0) * step / (N - 1); }
  function yOf(p, v) { return p.y1 - (p.y1 - p.y0) * (v - p.vmin) / (p.vmax - p.vmin); }
  function font(weight, px) { return weight + " " + px + "px " + FONT; }
  function text(s, x, y, weight, px, color, align, spacing) {
    ctx.font = font(weight, px); ctx.fillStyle = color; ctx.textAlign = align || "left"; ctx.textBaseline = "alphabetic";
    if (spacing) { ctx.letterSpacing = spacing; } else { ctx.letterSpacing = "0px"; }
    ctx.fillText(s, x, y);
  }
  function line(x0, y0, x1, y1, color, width, dash) {
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash || []); ctx.stroke(); ctx.setLineDash([]);
  }
  function polyline(points, color, width, dash) {
    if (points.length < 2) { return; }
    ctx.beginPath(); ctx.moveTo(points[0][0], points[0][1]);
    for (var i = 1; i < points.length; i++) { ctx.lineTo(points[i][0], points[i][1]); }
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = "round"; ctx.lineCap = "round";
    ctx.setLineDash(dash || []); ctx.stroke(); ctx.setLineDash([]);
  }
  function path(points, color, width, dash, cap) {   // open path with square corners (piping)
    if (points.length < 2) { return; }
    ctx.beginPath(); ctx.moveTo(points[0][0], points[0][1]);
    for (var i = 1; i < points.length; i++) { ctx.lineTo(points[i][0], points[i][1]); }
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = "miter"; ctx.lineCap = cap || "butt";
    ctx.setLineDash(dash || []); ctx.stroke(); ctx.setLineDash([]);
  }
  function roundRect(x, y, w, h, r, fill, stroke, lw) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1.5; ctx.stroke(); }
  }
  function wrap(s, maxWidth, weight, px) {
    ctx.font = font(weight, px);
    var words = s.split(" "), lines = [], cur = "";
    for (var i = 0; i < words.length; i++) {
      var test = cur ? cur + " " + words[i] : words[i];
      if (ctx.measureText(test).width > maxWidth && cur) { lines.push(cur); cur = words[i]; } else { cur = test; }
    }
    if (cur) { lines.push(cur); }
    return lines;
  }
  // filled arrowhead on a horizontal / vertical pipe. dir: "r" | "l" | "u" | "d"
  function arrow(x, y, dir, color, size) {
    var s = size || 9;
    ctx.beginPath();
    if (dir === "r") { ctx.moveTo(x + s, y); ctx.lineTo(x - s, y - s * 0.7); ctx.lineTo(x - s, y + s * 0.7); }
    if (dir === "l") { ctx.moveTo(x - s, y); ctx.lineTo(x + s, y - s * 0.7); ctx.lineTo(x + s, y + s * 0.7); }
    if (dir === "d") { ctx.moveTo(x, y + s); ctx.lineTo(x - s * 0.7, y - s); ctx.lineTo(x + s * 0.7, y - s); }
    if (dir === "u") { ctx.moveTo(x, y - s); ctx.lineTo(x - s * 0.7, y + s); ctx.lineTo(x + s * 0.7, y + s); }
    ctx.closePath(); ctx.fillStyle = color; ctx.fill();
  }
  // sensor tag: circle with "T" / "F" and a subscript index (paper style: light green circle)
  function sensorTag(x, y, letter, index, alarm) {
    var r = 17;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = alarm ? RED : "#cfe6c6"; ctx.fill();
    ctx.strokeStyle = alarm ? RED : "#5a8a52"; ctx.lineWidth = 1.5; ctx.stroke();
    var col = alarm ? "#fff" : INK;
    text(letter, x - 3, y + 6, 600, 17, col, "center");
    text(String(index), x + 8, y + 10, 500, 11, col, "center");
  }

  // ------------------------------------------------------------ state at a given step
  function stateAt(step) {
    var faults = D.faults, i, f;
    var state = { fault: null, detected: false, caption: "" };
    for (i = 0; i < faults.length; i++) {
      f = faults[i];
      if (step >= f.start && step <= f.end) {
        state.fault = f;
        state.detected = (f.first_flag !== null && step >= f.first_flag);
      }
    }
    // narrative captions by step range — detection only
    if (step < 40) {
      state.caption = "A physics-informed model predicts the normal outlet temperature of the heat exchanger.";
    } else if (step < 80) {
      state.caption = "The band is the expected residual range. It reflects the model accuracy and the uncertainty of each operating condition.";
    } else if (step <= 100) {
      state.caption = "Fault 1: the residual jumps out of the band. Two consecutive steps outside confirm the detection.";
    } else if (step < 150) {
      state.caption = "After the repair the residual returns to the band.";
    } else if (step < 185) {
      state.caption = "Fault 2: a small deficit appears in each heating cycle. Still inside the band, so no alarm yet.";
    } else if (step <= 235) {
      state.caption = "The deficit keeps growing until it leaves the band under load — detected.";
    } else if (step < 260) {
      state.caption = "Normal again after maintenance.";
    } else if (step < 298) {
      state.caption = "Fault 3: a slow offset builds up. The band is tight during idle hours, so small deviations show there first.";
    } else {
      state.caption = "Even a slow, small offset is detected where the expected range is tight.";
    }
    return state;
  }

  // ------------------------------------------------------------ drawing: schematic (paper-style system figure)
  // box: x, y, w=680, h=450.  Top band = air side (AHU → occupied zone), bottom band = hydronic side.
  function drawSchematic(x, y, state) {
    var alarm = state.detected;
    var BLACK = "#2a2f36", REDP = "#d0342c", BLUEP = "#2b5fd9", DUCT = "#b9c0c8", DUCT2 = "#6f7a86";
    var G1 = "#eef0f2", G2 = "#d3d8de", G3 = "#aab2bb";
    var k, r;
    ctx.save();
    roundRect(x, y, 680, 450, 22, "#f6f7f8", "#c9ced4", 1.5);

    // ---------------- geometry
    var ahX = x + 400, ahY = y + 50, ahW = 140, ahH = 90;        // AHU box
    var rmX = x + 565, rmY = y + 35, rmW = 100, rmH = 120;       // occupied zone (room)
    var pyS = y + 255, pyR = y + 355;                            // hydronic supply / return y
    var bxX = x + 25, bxY = y + 265, bxW = 60, bxH = 90;         // boiler
    var hxX = x + 275, hxY = y + 222, hxW = 50, hxH = 146, hxD = 12;   // plate heat exchanger (isometric)
    var vX = x + 160, pX = x + 225;                              // valve / pump x on the primary supply
    var rsX = bxX + bxW + 18;                                    // boiler riser x
    var redX = x + 460, bluX = x + 480;                          // secondary risers up to the AHU coil

    // ---------------- air side: ducts first (so boxes draw over them)
    // return air: room top → over the AHU → into the AHU left side
    path([[rmX + 50, rmY], [rmX + 50, y + 18], [ahX - 14, y + 18], [ahX - 14, ahY + 40], [ahX, ahY + 40]], DUCT, 7);
    arrow(x + 470, y + 18, "l", DUCT2, 8); text("RA", x + 470, y + 12, 500, 11, DUCT2, "center");
    // supply air: AHU right → room
    path([[ahX + ahW, ahY + 30], [rmX, ahY + 30]], DUCT, 7);
    arrow(rmX - 12, ahY + 30, "r", DUCT2, 8); text("SA", rmX - 12, ahY + 20, 500, 11, DUCT2, "center");

    // AHU: filter | heating coil | supply fan
    roundRect(ahX, ahY, ahW, ahH, 4, "#fff", BLACK, 2);
    var s1 = ahX + 36, s2 = ahX + 92;
    line(s1, ahY, s1, ahY + ahH, G3, 1.5); line(s2, ahY, s2, ahY + ahH, G3, 1.5);
    ctx.save(); ctx.beginPath(); ctx.rect(ahX + 6, ahY + 8, s1 - ahX - 12, ahH - 16); ctx.clip();        // filter: hatch
    for (k = -ahH; k < 60; k += 7) { line(ahX + 6 + k, ahY + 8, ahX + 6 + k + ahH, ahY + 8 + ahH, G3, 1); }
    ctx.restore();
    ctx.strokeStyle = G3; ctx.lineWidth = 1.5; ctx.strokeRect(ahX + 6, ahY + 8, s1 - ahX - 12, ahH - 16);
    ctx.beginPath();                                                                                   // heating coil: red zigzag
    var cz0 = s1 + 10, cz1 = s2 - 10, czy = ahY + 14, crow = 6, cdy = (ahH - 28) / crow;
    ctx.moveTo(cz0, czy);
    for (r = 0; r < crow; r++) { ctx.lineTo((r % 2 === 0) ? cz1 : cz0, czy + r * cdy); ctx.lineTo((r % 2 === 0) ? cz1 : cz0, czy + (r + 1) * cdy); }
    ctx.strokeStyle = REDP; ctx.lineWidth = 2.5; ctx.lineJoin = "round"; ctx.stroke();
    var fx = (s2 + ahX + ahW) / 2, fy = ahY + ahH / 2;                                                 // supply fan: scroll + blades
    ctx.beginPath(); ctx.arc(fx, fy, 19, 0, Math.PI * 2); ctx.fillStyle = G1; ctx.fill(); ctx.strokeStyle = BLACK; ctx.lineWidth = 2; ctx.stroke();
    for (k = 0; k < 4; k++) { var a = k * Math.PI / 2 + 0.5; line(fx, fy, fx + 14 * Math.cos(a), fy + 14 * Math.sin(a), BLACK, 2); }
    ctx.beginPath(); ctx.arc(fx, fy, 4, 0, Math.PI * 2); ctx.fillStyle = BLACK; ctx.fill();
    text("AHU", ahX + ahW / 2, ahY - 8, 600, 13, INK, "center");          // above the box (risers pass below it)

    // occupied zone: room with diffuser and a person
    roundRect(rmX, rmY, rmW, rmH, 3, "#fff", BLACK, 2);
    ctx.fillStyle = G2; ctx.fillRect(rmX + 2, rmY + rmH - 10, rmW - 4, 8);                             // floor
    ctx.fillStyle = G3; ctx.beginPath(); ctx.moveTo(rmX + 12, rmY + 2); ctx.lineTo(rmX + 44, rmY + 2); ctx.lineTo(rmX + 38, rmY + 10); ctx.lineTo(rmX + 18, rmY + 10); ctx.closePath(); ctx.fill();   // diffuser
    for (k = 0; k < 3; k++) { var dx = rmX + 20 + k * 8; line(dx, rmY + 14, dx, rmY + 30, "rgba(208,52,44,0.55)", 1.5); arrow(dx, rmY + 32, "d", "rgba(208,52,44,0.55)", 4); }
    var pxp = rmX + 66, pyp = rmY + rmH - 10;                                                           // person
    ctx.fillStyle = BLACK;
    ctx.beginPath(); ctx.arc(pxp, pyp - 52, 7, 0, Math.PI * 2); ctx.fill();
    roundRect(pxp - 7, pyp - 43, 14, 26, 5, BLACK, null);
    line(pxp - 4, pyp - 17, pxp - 5, pyp, BLACK, 4); line(pxp + 4, pyp - 17, pxp + 5, pyp, BLACK, 4);
    text("Occupied zone", rmX + rmW / 2, rmY + rmH + 20, 600, 13, INK, "center");

    // ---------------- hydronic side
    // primary loop (black): boiler → riser → valve → pump → HX, dashed return into the boiler
    path([[bxX + bxW, bxY + 24], [rsX, bxY + 24], [rsX, pyS], [hxX, pyS]], BLACK, 4);
    path([[hxX, pyR], [rsX, pyR], [rsX, bxY + bxH - 24], [bxX + bxW, bxY + bxH - 24]], BLACK, 4, [12, 8]);
    arrow(rsX + 24, pyS, "r", BLACK); arrow(pX + 36, pyS, "r", BLACK); arrow(x + 200, pyR, "l", BLACK);
    // boiler
    roundRect(bxX, bxY, bxW, bxH, 8, BLACK, null);
    ctx.fillStyle = BLACK; ctx.fillRect(bxX + 20, bxY - 14, 20, 16);
    roundRect(bxX + 12, bxY + 14, bxW - 24, 22, 4, "#fff", null);
    ctx.beginPath(); ctx.moveTo(bxX + 30, bxY + 48); ctx.lineTo(bxX + 40, bxY + 70); ctx.lineTo(bxX + 20, bxY + 70); ctx.closePath(); ctx.fillStyle = "#f08a24"; ctx.fill();
    text("Boiler", bxX + bxW / 2, bxY + bxH + 22, 600, 13, INK, "center");
    // control valve: globe body with diaphragm actuator
    ctx.beginPath(); ctx.moveTo(vX - 15, pyS - 11); ctx.lineTo(vX + 15, pyS + 11); ctx.lineTo(vX + 15, pyS - 11); ctx.lineTo(vX - 15, pyS + 11); ctx.closePath();
    ctx.fillStyle = G2; ctx.fill(); ctx.strokeStyle = BLACK; ctx.lineWidth = 2; ctx.stroke();
    line(vX, pyS - 11, vX, pyS - 28, BLACK, 2.5);
    ctx.beginPath(); ctx.arc(vX, pyS - 28, 13, Math.PI, 0); ctx.closePath(); ctx.fillStyle = G1; ctx.fill(); ctx.strokeStyle = BLACK; ctx.lineWidth = 2; ctx.stroke();
    line(vX - 13, pyS - 28, vX + 13, pyS - 28, BLACK, 2);
    text("Control valve", vX, pyS - 50, 500, 12, INK, "center");
    // pump: centrifugal casing with motor
    roundRect(pX + 8, pyS - 10, 26, 20, 3, G2, BLACK, 1.5);                                             // motor
    ctx.beginPath(); ctx.arc(pX, pyS, 16, 0, Math.PI * 2); ctx.fillStyle = G1; ctx.fill(); ctx.strokeStyle = BLACK; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.arc(pX, pyS, 6, 0, Math.PI * 2); ctx.fillStyle = BLACK; ctx.fill();
    line(pX - 12, pyS + 20, pX + 30, pyS + 20, BLACK, 2.5);                                            // base
    text("Pump", pX + 6, pyS - 26, 500, 12, INK, "center");
    // plate heat exchanger: isometric stack of plates with four ports
    ctx.beginPath(); ctx.moveTo(hxX, hxY); ctx.lineTo(hxX + hxD, hxY - hxD); ctx.lineTo(hxX + hxW + hxD, hxY - hxD); ctx.lineTo(hxX + hxW, hxY); ctx.closePath();
    ctx.fillStyle = G2; ctx.fill(); ctx.strokeStyle = BLACK; ctx.lineWidth = 1.5; ctx.stroke();        // top face
    ctx.beginPath(); ctx.moveTo(hxX + hxW, hxY); ctx.lineTo(hxX + hxW + hxD, hxY - hxD); ctx.lineTo(hxX + hxW + hxD, hxY + hxH - hxD); ctx.lineTo(hxX + hxW, hxY + hxH); ctx.closePath();
    ctx.fillStyle = G3; ctx.fill(); ctx.stroke();                                                       // side face
    ctx.fillStyle = "#fff"; ctx.fillRect(hxX, hxY, hxW, hxH); ctx.strokeStyle = BLACK; ctx.lineWidth = 2; ctx.strokeRect(hxX, hxY, hxW, hxH);   // front face
    for (k = 1; k < 8; k++) { line(hxX + hxW * k / 8, hxY + 6, hxX + hxW * k / 8, hxY + hxH - 6, G3, 1.2); }
    ctx.fillStyle = BLACK; ctx.fillRect(hxX + 6, hxY + 6, hxW - 12, 5); ctx.fillRect(hxX + 6, hxY + hxH - 11, hxW - 12, 5);   // tie bars
    var ports = [[hxX, pyS, BLACK], [hxX, pyR, BLACK], [hxX + hxW, pyS, REDP], [hxX + hxW, pyR, BLUEP]];
    for (k = 0; k < 4; k++) { ctx.beginPath(); ctx.arc(ports[k][0], ports[k][1], 5, 0, Math.PI * 2); ctx.fillStyle = ports[k][2]; ctx.fill(); }
    text("Plate heat exchanger", hxX + hxW / 2, hxY + hxH + 24, 600, 13, INK, "center");

    // secondary loop: red hot-water supply (HX → AHU coil) with T1, blue return (coil → HX) with F1
    path([[hxX + hxW, pyS], [redX, pyS], [redX, ahY + ahH]], REDP, 4);
    path([[bluX, ahY + ahH], [bluX, pyR], [hxX + hxW, pyR]], BLUEP, 4);
    arrow(redX, pyS - 60, "u", REDP); arrow(hxX + hxW + 34, pyR, "l", BLUEP);
    var tX = hxX + hxW + 58, fX = hxX + hxW + 100;
    sensorTag(tX, pyS, "T", 1, alarm);
    sensorTag(fX, pyR, "F", 1, false);
    if (alarm) {
      ctx.beginPath(); ctx.arc(tX, pyS, 27, 0, Math.PI * 2); ctx.strokeStyle = RED; ctx.lineWidth = 2; ctx.setLineDash([4, 4]); ctx.stroke(); ctx.setLineDash([]);
      text("monitored", tX, pyS - 32, 600, 12, RED, "center");
    } else {
      text("monitored", tX, pyS - 32, 500, 12, MUTED, "center");
    }

    // ---------------- legend: lines (row 1) and sensors (row 2)
    var lx = x + 24, ly = y + 414;
    line(lx, ly, lx + 24, ly, BLACK, 4); text("Primary supply", lx + 30, ly + 4, 400, 12, INK2, "left");
    line(lx + 126, ly, lx + 150, ly, BLACK, 4, [8, 6]); text("Primary return", lx + 156, ly + 4, 400, 12, INK2, "left");
    line(lx + 252, ly, lx + 276, ly, REDP, 4); text("Hot water supply", lx + 282, ly + 4, 400, 12, INK2, "left");
    line(lx + 390, ly, lx + 414, ly, BLUEP, 4); text("Hot water return", lx + 420, ly + 4, 400, 12, INK2, "left");
    line(lx + 530, ly, lx + 554, ly, DUCT, 7); text("Air duct", lx + 560, ly + 4, 400, 12, INK2, "left");
    var ly2 = ly + 26;
    ctx.beginPath(); ctx.arc(lx + 9, ly2, 9, 0, Math.PI * 2); ctx.fillStyle = "#cfe6c6"; ctx.fill(); ctx.strokeStyle = "#5a8a52"; ctx.lineWidth = 1.2; ctx.stroke();
    text("T", lx + 7, ly2 + 4, 600, 11, INK, "center"); text("1", lx + 13, ly2 + 6, 500, 7, INK, "center");
    text("Hot water outlet temperature sensor (monitored variable)", lx + 26, ly2 + 4, 400, 12, INK2, "left");
    ctx.beginPath(); ctx.arc(lx + 369, ly2, 9, 0, Math.PI * 2); ctx.fillStyle = "#cfe6c6"; ctx.fill(); ctx.strokeStyle = "#5a8a52"; ctx.lineWidth = 1.2; ctx.stroke();
    text("F", lx + 367, ly2 + 4, 600, 11, INK, "center"); text("1", lx + 373, ly2 + 6, 500, 7, INK, "center");
    text("Hot water flow meter", lx + 386, ly2 + 4, 400, 12, INK2, "left");
    ctx.restore();
  }

  // ------------------------------------------------------------ drawing: status (left column)
  function drawStatus(x, y, state, step) {
    var w = 680;
    line(x, y, x + w, y, RULE2, 1);
    text("STATUS", x, y + 34, 500, 14, MUTED, "left", "0.12em");
    if (state.detected) {
      text("FAULT DETECTED", x, y + 86, 600, 40, RED, "left", "-0.02em");
      text(state.fault.label + " — " + state.fault.observation, x, y + 128, 400, 17, INK2, "left");
      text("Residual outside the expected range for 2 consecutive steps", x, y + 154, 400, 15, MUTED, "left");
    } else {
      text("NORMAL", x, y + 86, 600, 40, ACCENT, "left", "-0.02em");
      text("Residual inside the expected range", x, y + 128, 400, 17, INK2, "left");
    }
    text("time step  " + step + " / " + (N - 1), x, y + 200, 400, 14, MUTED, "left");
  }

  // ------------------------------------------------------------ drawing: charts (right column)
  function drawAxesX(p, withLabels) {
    line(CH_X0, p.y1, CH_X1, p.y1, RULE2, 1);
    for (var s = 0; s <= N - 1; s += 60) {
      var x = xOf(s);
      line(x, p.y1, x, p.y1 + 6, RULE2, 1);
      if (withLabels) { text(String(s), x, p.y1 + 24, 400, 13, MUTED, "center"); }
    }
    if (withLabels) { text("time step", CH_X1, p.y1 + 24, 400, 13, MUTED, "right"); }
  }
  function drawAxesY(p, ticks) {
    line(CH_X0, p.y0, CH_X0, p.y1, RULE2, 1);
    for (var i = 0; i < ticks.length; i++) {
      var y = yOf(p, ticks[i]);
      line(CH_X0 - 6, y, CH_X0, y, RULE2, 1);
      line(CH_X0, y, CH_X1, y, RULE, 1);
      text(String(ticks[i]), CH_X0 - 12, y + 5, 400, 13, MUTED, "right");
    }
  }
  function panelTitle(p, s) { text(s, CH_X0, p.y0 - 14, 500, 16, INK, "left"); }

  // split a series into segments by the detection flag
  function segmentsByFlag(points, upto) {
    var seg = [], segs = [], cur = null, i;
    for (i = 0; i <= upto; i++) {
      var flag = D.T_flag[i] === 1;
      seg.push(points[i]);
      if (flag !== cur) { if (cur !== null) { segs.push({ flag: cur, pts: seg.slice(0, -1).concat([points[i]]) }); } seg = [points[i]]; cur = flag; }
    }
    if (seg.length) { segs.push({ flag: cur, pts: seg }); }
    return segs;
  }

  function drawTempPanel(upto) {
    var p = P_TEMP, i;
    panelTitle(p, p.title);
    drawAxesY(p, [20, 30, 40, 50, 60, 70]);
    drawAxesX(p, false);
    // expected range (prediction ± half)
    if (upto >= 1) {
      ctx.beginPath();
      ctx.moveTo(xOf(0), yOf(p, D.T_pred[0] + D.T_half[0]));
      for (i = 1; i <= upto; i++) { ctx.lineTo(xOf(i), yOf(p, D.T_pred[i] + D.T_half[i])); }
      for (i = upto; i >= 0; i--) { ctx.lineTo(xOf(i), yOf(p, D.T_pred[i] - D.T_half[i])); }
      ctx.closePath(); ctx.fillStyle = ACCENT_SOFT; ctx.fill();
    }
    var pred = [], meas = [];
    for (i = 0; i <= upto; i++) { pred.push([xOf(i), yOf(p, D.T_pred[i])]); meas.push([xOf(i), yOf(p, D.T_meas[i])]); }
    polyline(pred, ACCENT, 2.5);
    var segs = segmentsByFlag(meas, upto);
    for (i = 0; i < segs.length; i++) { polyline(segs[i].pts, segs[i].flag ? RED : INK, segs[i].flag ? 3 : 2); }
    if (upto >= 0) {
      ctx.beginPath(); ctx.arc(xOf(upto), yOf(p, D.T_meas[upto]), 5, 0, Math.PI * 2);
      ctx.fillStyle = D.T_flag[upto] === 1 ? RED : INK; ctx.fill();
    }
    // legend (right, same baseline as the panel title)
    var lx = CH_X1 - 560, ly = p.y0 - 19;
    line(lx, ly, lx + 28, ly, ACCENT, 2.5); text("Prediction", lx + 36, ly + 5, 400, 14, INK2, "left");
    ctx.fillStyle = ACCENT_SOFT; ctx.fillRect(lx + 130, ly - 7, 28, 14); text("Expected range", lx + 166, ly + 5, 400, 14, INK2, "left");
    line(lx + 300, ly, lx + 328, ly, INK, 2); text("Measurement", lx + 336, ly + 5, 400, 14, INK2, "left");
    line(lx + 450, ly, lx + 478, ly, RED, 3); text("Detected", lx + 486, ly + 5, 400, 14, INK2, "left");
  }

  function drawResidualPanel(upto) {
    var p = P_RES, i;
    panelTitle(p, p.title);
    drawAxesY(p, [-10, 0, 10, 20]);
    drawAxesX(p, true);
    if (upto >= 1) {
      ctx.beginPath();
      ctx.moveTo(xOf(0), yOf(p, D.T_half[0]));
      for (i = 1; i <= upto; i++) { ctx.lineTo(xOf(i), yOf(p, D.T_half[i])); }
      for (i = upto; i >= 0; i--) { ctx.lineTo(xOf(i), yOf(p, -D.T_half[i])); }
      ctx.closePath(); ctx.fillStyle = ACCENT_SOFT; ctx.fill();
    }
    var up = [], dn = [], res = [];
    for (i = 0; i <= upto; i++) {
      up.push([xOf(i), yOf(p, D.T_half[i])]); dn.push([xOf(i), yOf(p, -D.T_half[i])]);
      res.push([xOf(i), yOf(p, D.T_meas[i] - D.T_pred[i])]);
    }
    polyline(up, ACCENT, 1.5, [6, 5]); polyline(dn, ACCENT, 1.5, [6, 5]);
    line(CH_X0, yOf(p, 0), CH_X1, yOf(p, 0), RULE2, 1);
    var segs = segmentsByFlag(res, upto);
    for (i = 0; i < segs.length; i++) { polyline(segs[i].pts, segs[i].flag ? RED : INK2, segs[i].flag ? 3 : 1.8); }
    for (i = 0; i <= upto; i++) {
      if (D.T_flag[i] === 1) { ctx.beginPath(); ctx.arc(res[i][0], res[i][1], 2.5, 0, Math.PI * 2); ctx.fillStyle = RED; ctx.fill(); }
    }
    // legend
    var lx = CH_X1 - 330, ly = p.y0 - 19;
    line(lx, ly, lx + 28, ly, ACCENT, 1.5, [6, 5]); text("Expected range", lx + 36, ly + 5, 400, 14, INK2, "left");
    line(lx + 170, ly, lx + 198, ly, INK2, 1.8); text("Residual", lx + 206, ly + 5, 400, 14, INK2, "left");
  }

  // fault windows (from first detection) + cursor
  function drawWindows(upto) {
    var i, f;
    for (i = 0; i < D.faults.length; i++) {
      f = D.faults[i];
      if (f.first_flag === null || upto < f.first_flag) { continue; }
      var xa = xOf(f.first_flag), xb = xOf(Math.min(upto, f.end));
      ctx.fillStyle = RED_SOFT;
      ctx.fillRect(xa, P_TEMP.y0, Math.max(2, xb - xa), P_TEMP.y1 - P_TEMP.y0);
      ctx.fillRect(xa, P_RES.y0, Math.max(2, xb - xa), P_RES.y1 - P_RES.y0);
      text(f.label.toUpperCase(), xa + 8, P_TEMP.y0 + 22, 600, 14, RED, "left", "0.08em");
    }
    var cx = xOf(Math.max(0, upto));
    line(cx, P_TEMP.y0, cx, P_RES.y1, RULE2, 1, [3, 4]);
  }

  // ------------------------------------------------------------ scenes
  function drawHeader() {
    text("FDD  ·  FAULT DETECTION", 80, 86, 500, 14, MUTED, "left", "0.14em");
    text("Model-based monitoring of a heating heat exchanger", 80, 126, 600, 30, INK, "left", "-0.02em");
    text(LAB_NAME, W - 80, 86, 500, 14, MUTED, "right", "0.02em");
    line(80, 148, W - 80, 148, RULE2, 1);
  }

  function drawMain(tMain) {
    var step = Math.floor(clamp(tMain / T_MAIN, 0, 1) * (N - 1));
    var state = stateAt(step);
    drawHeader();
    drawSchematic(80, 180, state);
    drawStatus(80, 668, state, step);
    drawTempPanel(step);
    drawResidualPanel(step);
    drawWindows(step);
    line(80, 1012, W - 80, 1012, RULE, 1);
    var lines = wrap(state.caption, W - 160, 400, 24);
    for (var i = 0; i < lines.length; i++) { text(lines[i], 80, 1050 + i * 30, 400, 24, INK, "left"); }
  }

  function drawTitle(u) {
    var rise = smooth(u * 2.2);
    ctx.save(); ctx.globalAlpha = rise;
    text("FDD", W / 2, 520, 700, 160, ACCENT, "center", "-0.04em");
    text("Fault Detection & Diagnosis", W / 2, 572, 500, 22, MUTED, "center", "0.06em");
    text("How Do We Detect Faults?", W / 2, 646, 600, 40, INK, "center", "-0.02em");
    line(W / 2 - 60, 690, W / 2 + 60, 690, ACCENT, 2);
    text(LAB_NAME, W / 2, 740, 500, 18, MUTED, "center", "0.02em");
    ctx.restore();
  }

  function drawClosing(u) {
    var a = smooth(u * 2.5);
    ctx.save(); ctx.globalAlpha = a;
    var y = 520, gap = 330, x0 = W / 2 - gap;
    var steps = ["Predict", "Compare", "Detect"];
    for (var i = 0; i < 3; i++) {
      var x = x0 + i * gap;
      text(steps[i], x, y, 600, 48, i === 2 ? ACCENT : INK, "center", "-0.02em");
      if (i < 2) { text("→", x + gap / 2, y - 2, 400, 38, RULE2, "center"); }
    }
    line(W / 2 - 60, 584, W / 2 + 60, 584, ACCENT, 2);
    text(LAB_NAME, W / 2, 640, 500, 22, INK, "center", "0.01em");
    ctx.restore();
  }

  // ------------------------------------------------------------ frame
  function renderAt(t) {
    t = clamp(t, 0, DURATION);
    lastT = t;
    var rect = canvas.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    var cw = Math.max(1, Math.round(rect.width * dpr)), chh = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== cw || canvas.height !== chh) { canvas.width = cw; canvas.height = chh; }
    var s = cw / W;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H);

    if (t < T_TITLE) {
      drawTitle(t / T_TITLE);
      if (t > T_TITLE - FADE) {
        ctx.save(); ctx.globalAlpha = smooth((t - (T_TITLE - FADE)) / FADE);
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H); drawMain(0); ctx.restore();
      }
    } else if (t < T_TITLE + T_MAIN) {
      drawMain(t - T_TITLE);
    } else {
      var u = (t - T_TITLE - T_MAIN) / T_CLOSE;
      if (u < FADE / T_CLOSE) {
        drawMain(T_MAIN);
        ctx.save(); ctx.globalAlpha = smooth(u * T_CLOSE / FADE); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H); ctx.restore();
      }
      drawClosing(u);
    }
    if (bar) { bar.style.width = (100 * t / DURATION).toFixed(2) + "%"; }
  }

  // ------------------------------------------------------------ playback
  function tick(now) {
    if (!playing) { return; }
    var t = (now - t0) / 1000;
    renderAt(t);
    if (t >= DURATION) { pause(); if (playBtn) { playBtn.querySelector("span").textContent = "Replay"; } return; }
    raf = requestAnimationFrame(tick);
  }
  function poster() { renderAt(POSTER_T); lastT = 0; if (bar) { bar.style.width = "0%"; } }
  function play() {
    if (playing) { return; }
    playing = true; started = true; root.classList.add("is-playing");
    t0 = performance.now() - (lastT >= DURATION ? 0 : lastT * 1000);
    raf = requestAnimationFrame(tick);
  }
  function pause() { playing = false; root.classList.remove("is-playing"); if (raf) { cancelAnimationFrame(raf); } }

  // ------------------------------------------------------------ boot
  var ready = new Promise(function (resolve, reject) {
    var fontReady = (document.fonts && document.fonts.load) ? Promise.all([
      document.fonts.load("400 24px \"Pretendard Variable\""),
      document.fonts.load("500 24px \"Pretendard Variable\""),
      document.fonts.load("600 24px \"Pretendard Variable\"")
    ]).catch(function () { }) : Promise.resolve();
    var dataReady;
    if (window.FDD_DATA) {
      dataReady = Promise.resolve(window.FDD_DATA);
    } else {
      dataReady = fetch(dataUrl).then(function (r) { return r.json(); });
    }
    dataReady = dataReady.then(function (json) {
      D = json; N = D.t.length;
      if (N < 2) { throw new Error("fdd-data.json has fewer than 2 steps"); }
    });
    Promise.all([fontReady, dataReady]).then(resolve, reject);
  });

  ready.then(function () {
    var tParam = parseFloat(params.get("t"));
    if (!isNaN(tParam)) { started = true; renderAt(tParam); return; }   // started: a later resize re-renders this t, not the poster
    poster();
    if (params.get("autoplay") === "1") { play(); }
  }).catch(function (err) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    text("FDD demo: data could not be loaded (" + err.message + ")", 20, 40, 500, 16, RED, "left");
  });

  if (playBtn) { playBtn.addEventListener("click", function () { if (lastT >= DURATION) { lastT = 0; } play(); }); }
  canvas.addEventListener("click", function () { if (playing) { pause(); } });
  window.addEventListener("resize", function () {
    if (playing || !D) { return; }
    if (started) { renderAt(lastT); } else { poster(); }
  });

  window.FDD = { ready: ready, duration: DURATION, renderAt: renderAt, play: play, pause: pause };
})();
