/* Optimal control demo — rule-based vs reinforcement learning (canvas animation, single timeline, deterministic)
 *
 * The same two-boiler heating plant is run two ways in the same digital twin for the same five winter days:
 *   rule-based            fixed 50 °C boiler setpoint, boilers staged in sequence (the plant's original logic)   → gray
 *   reinforcement learning every 15 min the agent chooses each boiler's start/stop and setpoint (48–52 °C)         → steel blue
 * Every number shown is read from rl-data.json (RL_control_web/01_prepare_data.py, from the dissertation result files).
 *
 * Public API (window.RL):
 *   RL.ready       Promise — data and font loaded
 *   RL.duration    seconds (whole video)
 *   RL.renderAt(t) draw the frame for time t [s]  (used by the frame exporter)
 *   RL.play() / RL.pause()
 *
 * URL params: ?still=1  → no controls, canvas fills the viewport (frame capture)
 *             ?t=12.5   → render a still frame at t seconds (visual check)
 *             ?autoplay=1
 *
 * Logical canvas: 1920 x 1080. All coordinates below are in that space.
 */
(function () {
  "use strict";

  // ------------------------------------------------------------ timeline [s]
  var T_TITLE = 3.0;          // title scene
  var T_MAIN = 35.0;          // main scene: 120 h drawn in 35 s (7 s per day)
  var T_HOLD = 2.0;           // the last main frame is held so the final caption can be read (no closing page — user request 2026-10-23)
  var FADE = 0.5;
  var DURATION = T_TITLE + T_MAIN + T_HOLD;

  // ------------------------------------------------------------ style
  var INK = "#20262d", INK2 = "#46505a", MUTED = "#66707a", RULE = "#e0e4e8", RULE2 = "#b9c1c9";
  var ACCENT = "#1e5fa8", ACCENT_SOFT = "rgba(30,95,168,0.12)";
  var GRAY = "#6b7480", GRAY_SOFT = "rgba(107,116,128,0.16)";        // the conventional rule-based control: neutral gray
  var BAND_FILL = "#eef1f4", BAND_EDGE = "#aab2bb";                    // comfort band (a reference, not a method)
  var FLAME = "#f08a24";
  var FONT = "\"Pretendard Variable\", Pretendard, -apple-system, \"Segoe UI\", sans-serif";
  var W = 1920, H = 1080;
  var LAB_NAME = "Autonomous Building Systems Research Group";

  // ------------------------------------------------------------ layout
  var CH_X0 = 840, CH_X1 = 1840;                                      // right column: charts
  var P_GAS = { y0: 205, y1: 470, vmin: 0, vmax: 160, title: "Gas use  [m³/h]" };
  var P_TEMP = { y0: 530, y1: 745, vmin: 17, vmax: 26, title: "Room temperature  [°C]" };
  var P_RUN = { y0: 805, y1: 975, title: "Boiler operation", labelRule: 826, rowRuleB1: 848, rowRuleB2: 876, labelRL: 910, rowRLB1: 932, rowRLB2: 960, blockH: 16 };
  var CARD_X = 80, CARD_W = 680, CARD_H = 325, CARD_A_Y = 180, CARD_B_Y = 525;

  var script = document.currentScript;
  var dataUrl = (script && script.getAttribute("data-src")) || "rl-data.json";
  var params = new URLSearchParams(location.search);
  var STILL = params.get("still") === "1";

  var root = document.getElementById("fdd");
  var canvas = document.getElementById("fdd-canvas");
  var playBtn = document.getElementById("fdd-play");
  var bar = document.getElementById("fdd-bar");
  var ctx = canvas.getContext("2d");
  var D = null, N = 0, HOURS = 120, STEP_H = 0.25;
  var CUM = null;            // prefix sums (gas, run time) computed once at load
  var playing = false, started = false, t0 = 0, raf = 0, lastT = 0;
  var POSTER_T = 1.5;

  if (STILL) { document.body.classList.add("still"); }

  // ------------------------------------------------------------ helpers
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function smooth(u) { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); }
  function xOfH(h) { return CH_X0 + (CH_X1 - CH_X0) * h / HOURS; }
  function yOf(p, v) { return p.y1 - (p.y1 - p.y0) * (v - p.vmin) / (p.vmax - p.vmin); }
  function font(weight, px) { return weight + " " + px + "px " + FONT; }
  function text(s, x, y, weight, px, color, align, spacing) {
    ctx.font = font(weight, px); ctx.fillStyle = color; ctx.textAlign = align || "left"; ctx.textBaseline = "alphabetic";
    ctx.letterSpacing = spacing ? spacing : "0px";
    ctx.fillText(s, x, y);
  }
  function textWidth(s, weight, px) { ctx.font = font(weight, px); ctx.letterSpacing = "0px"; return ctx.measureText(s).width; }
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
  function path(points, color, width, dash, cap) {   // square corners (piping)
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
    ctx.font = font(weight, px); ctx.letterSpacing = "0px";
    var words = s.split(" "), lines = [], cur = "";
    for (var i = 0; i < words.length; i++) {
      var test = cur ? cur + " " + words[i] : words[i];
      if (ctx.measureText(test).width > maxWidth && cur) { lines.push(cur); cur = words[i]; } else { cur = test; }
    }
    if (cur) { lines.push(cur); }
    return lines;
  }
  function arrow(x, y, dir, color, size) {
    var s = size || 9;
    ctx.beginPath();
    if (dir === "r") { ctx.moveTo(x + s, y); ctx.lineTo(x - s, y - s * 0.7); ctx.lineTo(x - s, y + s * 0.7); }
    if (dir === "l") { ctx.moveTo(x - s, y); ctx.lineTo(x + s, y - s * 0.7); ctx.lineTo(x + s, y + s * 0.7); }
    if (dir === "d") { ctx.moveTo(x, y + s); ctx.lineTo(x - s * 0.7, y - s); ctx.lineTo(x + s * 0.7, y - s); }
    if (dir === "u") { ctx.moveTo(x, y - s); ctx.lineTo(x - s * 0.7, y + s); ctx.lineTo(x + s * 0.7, y + s); }
    ctx.closePath(); ctx.fillStyle = color; ctx.fill();
  }
  function fmtInt(v) { return String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
  function fmt1(v) { return (Math.round(v * 10) / 10).toFixed(1); }
  function fmtSigned(v) { var r = Math.round(v); return (r > 0 ? "+" : (r < 0 ? "−" : "")) + Math.abs(r); }

  // ------------------------------------------------------------ data queries
  function buildPrefix() {
    var m = { rule: {}, rl: {} }, keys = ["gas", "b1_on", "b2_on"], i, k, side;
    for (side in m) {
      for (k = 0; k < keys.length; k++) {
        var src = D[side][keys[k]], acc = 0, out = new Array(N);
        for (i = 0; i < N; i++) { acc += src[i]; out[i] = acc; }
        m[side][keys[k]] = out;
      }
    }
    return m;
  }
  function cumGas(side, step) { return step < 0 ? 0 : CUM[side].gas[step]; }                 // m³ up to and including step
  function runTime(side, boiler, step) { return step < 0 ? 0 : CUM[side][boiler + "_on"][step] * STEP_H; }   // h
  function stepOfHour(u) { return clamp(Math.floor(u / STEP_H + 1e-9), 0, N - 1); }
  function gasInDay(side, day) {                                                            // m³ over day index 0..4
    var s0 = day * 96, s1 = Math.min(N, s0 + 96) - 1;
    return cumGas(side, s1) - cumGas(side, s0 - 1);
  }

  // narrative captions by elapsed hour u (continuous) — every number is computed from the data
  function captionAt(u) {
    var S = D.summary, M = D.meta;
    var setRule = Math.round(M.rule_setpoint_C), lo = Math.round(M.rl_setpoint_range_C[0]), hi = Math.round(M.rl_setpoint_range_C[1]);
    var halfBand = M.band_half_C;
    if (u < 3) {
      return "Same office building, same five winter days, same digital twin. Two gas boilers feed one air handler — and two different controllers run them.";
    } else if (u < 7) {
      return "Rule-based: the plant's original logic. The lead boiler holds a fixed " + setRule + " °C setpoint and the second boiler is staged in by sequence.";
    } else if (u < 12) {
      return "Reinforcement learning: every 15 minutes the agent chooses each boiler's start/stop and setpoint (" + lo + "–" + hi + " °C). It was trained in the digital twin, not in the real building.";
    } else if (u < 17) {
      return "Both keep the room inside the ±" + halfBand + " °C comfort band during occupied hours. The agent does it with lower water temperatures and shares the load between the boilers.";
    } else if (u < 27) {
      return "Night: everything off. Day 1 gas — rule-based " + fmtInt(gasInDay("rule", 0)) + " m³, reinforcement learning " + fmtInt(gasInDay("rl", 0)) + " m³.";
    } else if (u < 41) {
      return "Sequence control keeps one boiler firing for hours while the other idles. The agent cycles both — its reward penalises gas use and unequal boiler run time.";
    } else if (u < 51) {
      return "The reward also penalises any step where the room falls below its setpoint while the air handler runs, so comfort is not traded away for gas.";
    } else if (u < 65) {
      var g2r = cumGas("rule", 2 * 96 - 1), g2l = cumGas("rl", 2 * 96 - 1);
      return "After two days: rule-based " + fmtInt(g2r) + " m³, reinforcement learning " + fmtInt(g2l) + " m³ (" + fmtSigned((g2l - g2r) / g2r * 100) + " %). Same room temperature.";
    } else if (u < 89) {
      var s3 = 3 * 96 - 1;
      return "Boiler run time after three days — rule-based " + fmt1(runTime("rule", "b1", s3)) + " h / " + fmt1(runTime("rule", "b2", s3)) + " h, reinforcement learning "
        + fmt1(runTime("rl", "b1", s3)) + " h / " + fmt1(runTime("rl", "b2", s3)) + " h: about half the hours, evenly shared.";
    } else if (u < 113) {
      return "Day 5. The two room-temperature traces stay together; the two gas traces do not.";
    }
    return "Five days: gas " + fmtInt(S.gas_rule_total_m3) + " → " + fmtInt(S.gas_rl_total_m3) + " m³ (" + fmtSigned(S.gas_change_pct) + " %), boiler run time "
      + fmt1(S.runtime_rule_b1_h) + " / " + fmt1(S.runtime_rule_b2_h) + " h → " + fmt1(S.runtime_rl_b1_h) + " / " + fmt1(S.runtime_rl_b2_h) + " h, room temperature unchanged.";
  }

  // ------------------------------------------------------------ drawing: plant card (one controller)
  // x, y, w = 680, h = 325. state: { b1_on, b2_on, b1_set, b2_set, room, set, ahu_on, outdoor, gas, rt1, rt2 }
  function drawPlantCard(x, y, label, sub, color, soft, state) {
    var BLACK = "#2a2f36", REDP = "#d0342c", DUCT = "#b9c0c8", DUCT2 = "#6f7a86", G1 = "#eef0f2", G2 = "#d3d8de", G3 = "#aab2bb";
    var k;
    ctx.save();
    roundRect(x, y, CARD_W, CARD_H, 16, "#f6f7f8", "#c9ced4", 1.5);
    // label row
    text(label, x + 24, y + 34, 600, 13, color, "left", "0.12em");
    text(sub, x + CARD_W - 24, y + 34, 400, 13, MUTED, "right");
    line(x + 24, y + 48, x + CARD_W - 24, y + 48, RULE2, 1);

    // geometry
    var bw = 60, bh = 80, by = y + 108;
    var bx = [x + 44, x + 150];
    var ySup = y + 82, yRet = y + 96;                          // supply / return headers
    var ahX = x + 332, ahY = y + 74, ahW = 120, ahH = 72;      // AHU
    var rmX = x + 500, rmY = y + 70, rmW = 156, rmH = 100;     // office zone

    // headers (drawn first so boilers / AHU draw over the joints)
    path([[bx[0] + 15, ySup], [ahX, ySup]], BLACK, 4);
    path([[bx[0] + 45, yRet], [ahX, yRet]], BLACK, 4, [10, 7]);
    arrow(x + 262, ySup, "r", BLACK, 8); arrow(x + 300, yRet, "l", BLACK, 8);
    text("Supply", x + 262, ySup - 10, 500, 11, INK2, "center"); text("Return", x + 300, yRet + 20, 500, 11, INK2, "center");

    // boilers
    var on = [state.b1_on, state.b2_on], sets = [state.b1_set, state.b2_set];
    for (k = 0; k < 2; k++) {
      var X = bx[k];
      path([[X + 15, by], [X + 15, ySup]], BLACK, 4);
      path([[X + 45, by], [X + 45, yRet]], BLACK, 4, [10, 7]);
      roundRect(X, by, bw, bh, 8, BLACK, null);
      ctx.fillStyle = BLACK; ctx.fillRect(X + 22, by - 14, 16, 16);
      roundRect(X + 12, by + 14, bw - 24, 22, 4, "#fff", null);
      if (on[k] > 0) {                                        // flame: opacity = share of the 15-min step the boiler fired
        ctx.save(); ctx.globalAlpha = 0.25 + 0.75 * clamp(on[k], 0, 1);
        ctx.beginPath(); ctx.moveTo(X + 30, by + 44); ctx.lineTo(X + 42, by + 68); ctx.lineTo(X + 18, by + 68); ctx.closePath(); ctx.fillStyle = FLAME; ctx.fill();
        ctx.restore();
      } else {
        ctx.beginPath(); ctx.moveTo(X + 30, by + 48); ctx.lineTo(X + 40, by + 66); ctx.lineTo(X + 20, by + 66); ctx.closePath(); ctx.strokeStyle = "#5b636c"; ctx.lineWidth = 1.2; ctx.stroke();
      }
      text("Boiler " + (k + 1), X + bw / 2, by + bh + 22, 600, 13, INK, "center");
      if (on[k] > 0) {
        text("ON  ·  " + fmt1(sets[k]) + " °C", X + bw / 2, by + bh + 42, 600, 13, color, "center");
      } else {
        text("OFF", X + bw / 2, by + bh + 42, 500, 13, MUTED, "center");
      }
      // duty bar (share of the step)
      ctx.fillStyle = RULE; ctx.fillRect(X, by + bh + 50, bw, 4);
      ctx.fillStyle = color; ctx.fillRect(X, by + bh + 50, bw * clamp(on[k], 0, 1), 4);
    }

    // AHU: coil + fan
    var s1 = ahX + 56;
    roundRect(ahX, ahY, ahW, ahH, 4, "#fff", BLACK, 2);
    line(s1, ahY, s1, ahY + ahH, G3, 1.5);
    ctx.beginPath();
    var cz0 = ahX + 12, cz1 = s1 - 12, czy = ahY + 10, crow = 6, cdy = (ahH - 20) / crow;
    ctx.moveTo(cz0, czy);
    for (k = 0; k < crow; k++) { ctx.lineTo((k % 2 === 0) ? cz1 : cz0, czy + k * cdy); ctx.lineTo((k % 2 === 0) ? cz1 : cz0, czy + (k + 1) * cdy); }
    ctx.strokeStyle = REDP; ctx.lineWidth = 2.5; ctx.lineJoin = "round"; ctx.stroke();
    var fx = (s1 + ahX + ahW) / 2, fy = ahY + ahH / 2;
    ctx.beginPath(); ctx.arc(fx, fy, 17, 0, Math.PI * 2); ctx.fillStyle = G1; ctx.fill(); ctx.strokeStyle = BLACK; ctx.lineWidth = 2; ctx.stroke();
    for (k = 0; k < 4; k++) { var a = k * Math.PI / 2 + 0.5; line(fx, fy, fx + 12 * Math.cos(a), fy + 12 * Math.sin(a), BLACK, 2); }
    ctx.beginPath(); ctx.arc(fx, fy, 3.5, 0, Math.PI * 2); ctx.fillStyle = BLACK; ctx.fill();
    text("Air handler", ahX + ahW / 2, ahY - 10, 600, 13, INK, "center");
    text(state.ahu_on > 0 ? "fan ON" : "fan OFF", ahX + ahW / 2, ahY + ahH + 20, 500, 12, state.ahu_on > 0 ? INK2 : MUTED, "center");

    // duct to the zone
    path([[ahX + ahW, ahY + ahH / 2], [rmX, ahY + ahH / 2]], DUCT, 7);
    if (state.ahu_on > 0) { arrow(rmX - 12, ahY + ahH / 2, "r", DUCT2, 8); }

    // office zone with the room temperature readout
    roundRect(rmX, rmY, rmW, rmH, 3, "#fff", BLACK, 2);
    ctx.fillStyle = G2; ctx.fillRect(rmX + 2, rmY + rmH - 8, rmW - 4, 6);
    text(fmt1(state.room) + " °C", rmX + rmW / 2, rmY + 50, 600, 28, state.ahu_on > 0 ? color : INK2, "center", "-0.02em");
    text("setpoint " + fmt1(state.set) + " °C", rmX + rmW / 2, rmY + 74, 400, 12, MUTED, "center");
    text("Office zone", rmX + rmW / 2, rmY - 10, 600, 13, INK, "center");
    text("outdoor " + fmt1(state.outdoor) + " °C", rmX + rmW / 2, rmY + rmH + 20, 400, 12, MUTED, "center");

    // bottom row: cumulative gas and boiler run time
    var yb = y + 252;
    line(x + 24, yb, x + CARD_W - 24, yb, RULE2, 1);
    text("GAS SO FAR", x + 24, yb + 22, 500, 12, MUTED, "left", "0.10em");
    text(fmtInt(state.gas) + " m³", x + 24, yb + 58, 600, 32, color, "left", "-0.02em");
    text("BOILER RUN TIME", x + 330, yb + 22, 500, 12, MUTED, "left", "0.10em");
    text("B1  " + fmt1(state.rt1) + " h", x + 330, yb + 58, 600, 24, INK, "left", "-0.01em");
    text("B2  " + fmt1(state.rt2) + " h", x + 500, yb + 58, 600, 24, INK, "left", "-0.01em");
    ctx.restore();
  }

  function stateAt(side, step) {
    var S = D[side];
    return {
      b1_on: S.b1_on[step], b2_on: S.b2_on[step], b1_set: S.b1_set[step], b2_set: S.b2_set[step],
      room: S.room[step], set: D.setpoint_room[step], ahu_on: S.ahu_on[step], outdoor: D.outdoor[step],
      gas: cumGas(side, step), rt1: runTime(side, "b1", step), rt2: runTime(side, "b2", step)
    };
  }

  // ------------------------------------------------------------ drawing: charts (right column)
  function drawAxesY(p, ticks) {
    line(CH_X0, p.y0, CH_X0, p.y1, RULE2, 1);
    for (var i = 0; i < ticks.length; i++) {
      var y = yOf(p, ticks[i]);
      line(CH_X0 - 6, y, CH_X0, y, RULE2, 1);
      line(CH_X0, y, CH_X1, y, RULE, 1);
      text(String(ticks[i]), CH_X0 - 12, y + 5, 400, 13, MUTED, "right");
    }
  }
  function drawDayGrid(withLabels) {
    for (var d = 0; d <= 5; d++) {
      var x = xOfH(24 * d);
      line(x, P_GAS.y0, x, P_RUN.y1, d === 0 || d === 5 ? RULE2 : RULE, 1, d === 0 || d === 5 ? [] : [4, 4]);
      if (withLabels && d < 5) { text("Day " + (d + 1), xOfH(24 * d + 12), P_RUN.y1 + 22, 500, 13, MUTED, "center"); }
    }
    line(CH_X0, P_RUN.y1, CH_X1, P_RUN.y1, RULE2, 1);
  }
  function panelTitle(p) { text(p.title, CH_X0, p.y0 - 14, 500, 16, INK, "left"); }

  // hourly stepped line up to elapsed hour u
  function steppedLine(values, u, color, width) {
    var pts = [], hc = Math.min(Math.floor(u), HOURS - 1), h;
    for (h = 0; h <= hc; h++) {
      var xa = xOfH(h), xb = xOfH(h === hc ? Math.min(u, HOURS) : h + 1), y = yOf(P_GAS, values[h]);
      pts.push([xa, y]); pts.push([xb, y]);
    }
    polyline(pts, color, width);
  }

  function drawGasPanel(u) {
    var p = P_GAS;
    panelTitle(p);
    drawAxesY(p, [0, 40, 80, 120, 160]);
    steppedLine(D.hourly.gas_rule, u, GRAY, 2.5);
    steppedLine(D.hourly.gas_rl, u, ACCENT, 2.5);
    // legend
    var lx = CH_X1 - 360, ly = p.y0 - 19;
    line(lx, ly, lx + 28, ly, GRAY, 2.5); text("Rule-based", lx + 36, ly + 5, 400, 14, INK2, "left");
    line(lx + 150, ly, lx + 178, ly, ACCENT, 2.5); text("Reinforcement learning", lx + 186, ly + 5, 400, 14, INK2, "left");
  }

  function drawTempPanel(step) {
    var p = P_TEMP, i, half = D.meta.band_half_C;
    panelTitle(p);
    // comfort band during occupied steps (progressive)
    ctx.fillStyle = BAND_FILL;
    for (i = 0; i <= step; i++) {
      if (D.occupied[i] !== 1) { continue; }
      var xa = xOfH(D.t_hour[i]), xb = xOfH(D.t_hour[i] + STEP_H);
      ctx.fillRect(xa, yOf(p, D.setpoint_room[i] + half), xb - xa + 0.5, yOf(p, D.setpoint_room[i] - half) - yOf(p, D.setpoint_room[i] + half));
    }
    drawAxesY(p, [18, 20, 22, 24, 26]);
    // band edges per occupied run
    var up = [], dn = [];
    for (i = 0; i <= step + 1 && i <= N; i++) {
      var occ = (i <= step) && D.occupied[i] === 1;
      if (occ) {
        var x = xOfH(D.t_hour[i]);
        up.push([x, yOf(p, D.setpoint_room[i] + half)]); dn.push([x, yOf(p, D.setpoint_room[i] - half)]);
        if (i === step || i === N - 1) { var xe = xOfH(D.t_hour[i] + STEP_H); up.push([xe, up[up.length - 1][1]]); dn.push([xe, dn[dn.length - 1][1]]); }
      } else if (up.length) {
        var xe2 = xOfH(D.t_hour[i - 1] + STEP_H); up.push([xe2, up[up.length - 1][1]]); dn.push([xe2, dn[dn.length - 1][1]]);
        polyline(up, BAND_EDGE, 1.2, [5, 4]); polyline(dn, BAND_EDGE, 1.2, [5, 4]); up = []; dn = [];
      }
    }
    if (up.length) { polyline(up, BAND_EDGE, 1.2, [5, 4]); polyline(dn, BAND_EDGE, 1.2, [5, 4]); }
    // traces
    var rulePts = [], rlPts = [];
    for (i = 0; i <= step; i++) {
      var xx = xOfH(D.t_hour[i]);
      rulePts.push([xx, yOf(p, D.rule.room[i])]); rlPts.push([xx, yOf(p, D.rl.room[i])]);
    }
    polyline(rulePts, GRAY, 2.2); polyline(rlPts, ACCENT, 2.2);
    ctx.beginPath(); ctx.arc(rulePts[step][0], rulePts[step][1], 4, 0, Math.PI * 2); ctx.fillStyle = GRAY; ctx.fill();
    ctx.beginPath(); ctx.arc(rlPts[step][0], rlPts[step][1], 4, 0, Math.PI * 2); ctx.fillStyle = ACCENT; ctx.fill();
    // legend
    var lx = CH_X1 - 640, ly = p.y0 - 19;
    line(lx, ly, lx + 28, ly, GRAY, 2.2); text("Rule-based", lx + 36, ly + 5, 400, 14, INK2, "left");
    line(lx + 150, ly, lx + 178, ly, ACCENT, 2.2); text("Reinforcement learning", lx + 186, ly + 5, 400, 14, INK2, "left");
    ctx.fillStyle = BAND_FILL; ctx.fillRect(lx + 366, ly - 7, 28, 14); line(lx + 366, ly - 7, lx + 394, ly - 7, BAND_EDGE, 1.2, [5, 4]); line(lx + 366, ly + 7, lx + 394, ly + 7, BAND_EDGE, 1.2, [5, 4]);
    text("Comfort band ±" + half + " °C, occupied hours", lx + 402, ly + 5, 400, 14, INK2, "left");
  }

  function drawRunPanel(step) {
    var p = P_RUN;
    panelTitle(p);
    text("RULE-BASED", CH_X0, p.labelRule, 600, 12, GRAY, "left", "0.10em");
    text("REINFORCEMENT LEARNING", CH_X0, p.labelRL, 600, 12, ACCENT, "left", "0.10em");
    drawRow(p.rowRuleB1, "B1", D.rule.b1_on, GRAY, runTime("rule", "b1", step));
    drawRow(p.rowRuleB2, "B2", D.rule.b2_on, GRAY, runTime("rule", "b2", step));
    drawRow(p.rowRLB1, "B1", D.rl.b1_on, ACCENT, runTime("rl", "b1", step));
    drawRow(p.rowRLB2, "B2", D.rl.b2_on, ACCENT, runTime("rl", "b2", step));
    // legend
    var lx = CH_X1 - 470, ly = p.y0 - 19;
    ctx.fillStyle = GRAY_SOFT; ctx.fillRect(lx, ly - 7, 14, 14); ctx.fillStyle = GRAY; ctx.fillRect(lx + 14, ly - 7, 14, 14);
    text("Boiler firing (shade = share of the 15-min step)", lx + 36, ly + 5, 400, 14, INK2, "left");
    text("run time so far →", CH_X1, ly + 5, 400, 14, INK2, "right");

    function drawRow(yRow, label, onArr, color, hours) {
      line(CH_X0, yRow + p.blockH / 2 + 2, CH_X1, yRow + p.blockH / 2 + 2, RULE, 1);
      text(label, CH_X0 - 12, yRow + 6, 500, 13, MUTED, "right");
      for (var i = 0; i <= step; i++) {
        if (onArr[i] <= 0) { continue; }
        var xa = xOfH(D.t_hour[i]), xb = xOfH(D.t_hour[i] + STEP_H);
        ctx.save(); ctx.globalAlpha = 0.2 + 0.8 * clamp(onArr[i], 0, 1); ctx.fillStyle = color;
        ctx.fillRect(xa, yRow - p.blockH / 2, xb - xa + 0.5, p.blockH); ctx.restore();
      }
      var s = fmt1(hours) + " h", w = textWidth(s, 600, 15);
      ctx.fillStyle = "rgba(255,255,255,0.9)"; ctx.fillRect(CH_X1 - w - 6, yRow - 11, w + 6, 20);
      text(s, CH_X1, yRow + 5, 600, 15, color, "right");
    }
  }

  function drawCursor(u) {
    var cx = xOfH(clamp(u, 0, HOURS));
    line(cx, P_GAS.y0, cx, P_RUN.y1, RULE2, 1, [3, 4]);
  }

  // ------------------------------------------------------------ scenes
  function drawHeader() {
    text("OPTIMAL CONTROL  ·  REINFORCEMENT LEARNING", 80, 86, 500, 14, MUTED, "left", "0.14em");
    text("Rule-based vs. Reinforcement Learning: Same Building, Same Five Days", 80, 126, 600, 30, INK, "left", "-0.02em");
    text(LAB_NAME, W - 80, 86, 500, 14, MUTED, "right", "0.02em");
    line(80, 148, W - 80, 148, RULE2, 1);
  }

  function drawMain(tMain) {
    var u = clamp(tMain / T_MAIN, 0, 1) * HOURS;            // elapsed hours (continuous)
    var step = stepOfHour(u);
    var M = D.meta;
    drawHeader();
    drawPlantCard(CARD_X, CARD_A_Y, "RULE-BASED", "Fixed " + Math.round(M.rule_setpoint_C) + " °C setpoint  ·  boilers staged in sequence", GRAY, GRAY_SOFT, stateAt("rule", step));
    drawPlantCard(CARD_X, CARD_B_Y, "REINFORCEMENT LEARNING", "Start/stop and setpoint chosen every 15 min  (" + Math.round(M.rl_setpoint_range_C[0]) + "–" + Math.round(M.rl_setpoint_range_C[1]) + " °C)", ACCENT, ACCENT_SOFT, stateAt("rl", step));
    // time strip under the cards
    var day = clamp(Math.floor(u / 24) + 1, 1, 5), hour = Math.min(Math.floor(u), HOURS);
    text("DAY " + day + "  ·  HOUR " + hour + " / " + HOURS, CARD_X, 882, 500, 13, MUTED, "left", "0.10em");
    text("15-min steps  ·  outdoor " + fmt1(D.outdoor[step]) + " °C", CARD_X + CARD_W, 882, 400, 13, MUTED, "right");
    var ctxLines = wrap("Both controllers run in the same calibrated digital twin of the building (TRNSYS + hybrid models), with the same weather, schedule and room setpoint.", CARD_W, 400, 15);
    for (var i = 0; i < ctxLines.length && i < 3; i++) { text(ctxLines[i], CARD_X, 912 + i * 21, 400, 15, INK2, "left"); }
    // charts
    drawDayGrid(true);
    drawGasPanel(u);
    drawTempPanel(step);
    drawRunPanel(step);
    drawCursor(u);
    // caption
    line(80, 1012, W - 80, 1012, RULE, 1);
    var lines = wrap(captionAt(u), W - 160, 400, 24);
    var capY = lines.length > 1 ? 1042 : 1050;
    for (i = 0; i < lines.length && i < 2; i++) { text(lines[i], 80, capY + i * 28, 400, 24, INK, "left"); }
  }

  function drawTitle(u) {
    var rise = smooth(u * 2.2);
    ctx.save(); ctx.globalAlpha = rise;
    text("OPTIMAL CONTROL  ·  REINFORCEMENT LEARNING", W / 2, 366, 500, 14, MUTED, "center", "0.14em");
    text("Optimal Control", W / 2, 520, 700, 150, ACCENT, "center", "-0.04em");
    text("Reinforcement learning for a two-boiler heating plant", W / 2, 572, 500, 22, MUTED, "center", "0.06em");
    text("How Do We Save Gas Without Losing Comfort?", W / 2, 646, 600, 40, INK, "center", "-0.02em");
    line(W / 2 - 60, 690, W / 2 + 60, 690, ACCENT, 2);
    text(LAB_NAME, W / 2, 740, 500, 18, MUTED, "center", "0.02em");
    ctx.restore();
  }

  // (no closing scoreboard — the video ends on the last main frame; the final caption carries the five-day numbers)

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
      drawMain(T_MAIN);          // hold the final frame (T_HOLD)
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
      document.fonts.load("600 24px \"Pretendard Variable\""),
      document.fonts.load("700 24px \"Pretendard Variable\"")
    ]).catch(function () { }) : Promise.resolve();
    var dataReady;
    if (window.RL_DATA) {
      dataReady = Promise.resolve(window.RL_DATA);
    } else {
      dataReady = fetch(dataUrl).then(function (r) { return r.json(); });
    }
    dataReady = dataReady.then(function (json) {
      D = json; N = D.t_hour.length; HOURS = D.meta.n_hours; STEP_H = D.meta.step_hours;
      if (N < 2 || !D.rule || !D.rl || !D.hourly || !D.summary) { throw new Error("rl-data.json lacks the expected fields"); }
      CUM = buildPrefix();
    });
    Promise.all([fontReady, dataReady]).then(resolve, reject);
  });

  ready.then(function () {
    var tParam = parseFloat(params.get("t"));
    if (!isNaN(tParam)) { started = true; renderAt(tParam); return; }
    poster();
    if (params.get("autoplay") === "1") { play(); }
  }).catch(function (err) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    text("Optimal control demo: data could not be loaded (" + err.message + ")", 20, 40, 500, 16, "#b3261e", "left");
  });

  if (playBtn) { playBtn.addEventListener("click", function () { if (lastT >= DURATION) { lastT = 0; } play(); }); }
  canvas.addEventListener("click", function () { if (playing) { pause(); } });
  window.addEventListener("resize", function () {
    if (playing || !D) { return; }
    if (started) { renderAt(lastT); } else { poster(); }
  });

  window.RL = { ready: ready, duration: DURATION, renderAt: renderAt, play: play, pause: pause };
})();
