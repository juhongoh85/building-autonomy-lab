/* Calibration demo v2 — the optimizer searching for the minimum, then before vs after calibration
 * (canvas animation, single timeline, deterministic)
 *
 * A 3R2C zone model (11 parameters) is calibrated to 96 days of hourly room-temperature measurements with a particle swarm
 * (50 candidates, 120 iterations) and a local polish. Scene 1 shows the search: the loss landscape (a 2-D slice through the
 * final solution, with its local minima), the swarm moving, the loss falling, the 11 parameters settling, and the band of
 * candidate predictions tightening around the measurement. Scene 2 compares the model before (iteration 0, best initial
 * candidate — gray) and after calibration (steel blue) over the full 96 days.
 * Every number shown is read from cal-data.json (Calibration_web/01_prepare_data.py).
 *
 * Public API (window.CAL): CAL.ready, CAL.duration, CAL.renderAt(t), CAL.play(), CAL.pause()
 * URL params: ?still=1 (frame capture), ?t=12.5 (still frame), ?autoplay=1
 * Logical canvas: 1920 x 1080.
 */
(function () {
  "use strict";

  // ------------------------------------------------------------ timeline [s]
  var T_TITLE = 3.0;
  var T_SEARCH = 20.0;        // scene 1: 121 iterations
  var T_COMPARE = 15.0;       // scene 2: 96 days before vs after
  var T_HOLD = 2.0;           // last frame held (no closing page)
  var FADE = 0.5;
  var T_MAIN = T_SEARCH + T_COMPARE;
  var DURATION = T_TITLE + T_MAIN + T_HOLD;

  // ------------------------------------------------------------ style
  var INK = "#20262d", INK2 = "#46505a", MUTED = "#66707a", RULE = "#e0e4e8", RULE2 = "#b9c1c9";
  var ACCENT = "#1e5fa8", ACCENT_SOFT = "rgba(30,95,168,0.14)";
  var GRAY = "#6b7480", GRAY_SOFT = "rgba(107,116,128,0.16)";
  var MEAS = "#20262d";
  var ON_FILL = "#f3f4f6";
  var FONT = "\"Pretendard Variable\", Pretendard, -apple-system, \"Segoe UI\", sans-serif";
  var W = 1920, H = 1080;
  var LAB_NAME = "Autonomous Building Systems Research Group";

  // ------------------------------------------------------------ layout
  var CH_X0 = 840, CH_X1 = 1840;
  var P_TOP = { y0: 205, y1: 620, vmin: 10, vmax: 35 };
  var P_BOT = { y0: 690, y1: 975, vmin: 0, vmax: 10 };
  var CARD_X = 80, CARD_W = 680, CARD_A_Y = 180, CARD_A_H = 380, CARD_B_Y = 580, CARD_B_H = 270;

  var script = document.currentScript;
  var dataUrl = (script && script.getAttribute("data-src")) || "cal-data.json";
  var params = new URLSearchParams(location.search);
  var STILL = params.get("still") === "1";

  var root = document.getElementById("fdd");
  var canvas = document.getElementById("fdd-canvas");
  var playBtn = document.getElementById("fdd-play");
  var bar = document.getElementById("fdd-bar");
  var ctx = canvas.getContext("2d");
  var D = null, N = 0, WIN = 240, ITERS = 120, SWARM = 50, DAYS = 96;
  var DAILY0 = null, DAILY_MAX0 = 10, LOSS_LOG_MIN = 3, LOSS_LOG_MAX = 5, DROP = null;
  var playing = false, started = false, t0 = 0, raf = 0, lastT = 0;
  var POSTER_T = 1.5;

  if (STILL) { document.body.classList.add("still"); }

  // ------------------------------------------------------------ helpers
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function smooth(u) { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); }
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
  function fmtInt(v) { return String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
  function fmt1(v) { return (Math.round(v * 10) / 10).toFixed(1); }
  function fmt2(v) { return (Math.round(v * 100) / 100).toFixed(2); }
  function rmse(a, b, from, to) { var s = 0, n = 0; for (var i = from; i < to; i++) { var e = a[i] - b[i]; s += e * e; n++; } return n ? Math.sqrt(s / n) : 0; }
  function yOf(p, v) { return p.y1 - (p.y1 - p.y0) * (v - p.vmin) / (p.vmax - p.vmin); }

  // ------------------------------------------------------------ data queries
  function prepare() {
    var h = D.history, i, k;
    DAILY0 = [];                                            // daily error of the best candidate at iteration 0 (window)
    for (k = 0; k < WIN / 24; k++) { DAILY0.push(rmse(h.snapshot_room[0], D.measured_room, k * 24, k * 24 + 24)); }
    DAILY_MAX0 = Math.max.apply(null, DAILY0);
    P_BOT.vmax = Math.ceil(DAILY_MAX0 / 2) * 2;
    var lo = Infinity, hi = -Infinity;
    for (i = 0; i < h.best_loss.length; i++) { lo = Math.min(lo, h.best_loss[i]); hi = Math.max(hi, h.best_loss[i]); }
    LOSS_LOG_MIN = Math.floor(Math.log10(lo)); LOSS_LOG_MAX = Math.ceil(Math.log10(hi));
    // the largest fall of the best loss over any 5-iteration window after iteration 10 (used by a caption)
    var best = null;
    for (i = 15; i < h.best_loss.length; i++) {
      var fall = (h.best_loss[i - 5] - h.best_loss[i]) / h.best_loss[i - 5];
      if (best === null || fall > best.fall) { best = { fall: fall, from: i - 5, to: i, lossFrom: h.best_loss[i - 5], lossTo: h.best_loss[i] }; }
    }
    DROP = best;
  }
  function inPlateau(it) {
    var ev = D.history.events;
    for (var i = 0; i < ev.length; i++) { if (ev[i].type === "plateau" && it >= ev[i].iter && it <= ev[i].until) { return ev[i]; } }
    return null;
  }
  function statusAt(it) {
    var h = D.history.best_loss;
    if (it === 0) { return { s: "initial candidates evaluated", c: MUTED }; }
    var imp = (h[it - 1] - h[it]) / h[it - 1];
    if (imp >= 0.01) { return { s: "descending — lower loss found", c: ACCENT }; }
    if (inPlateau(it)) { return { s: "settled in a basin — candidates circling", c: GRAY }; }
    return { s: "searching", c: INK2 };
  }

  // captions — scene 1 by iteration, scene 2 by hour. Every number comes from the data.
  function captionSearch(it) {
    var S = D.summary, h = D.history.best_loss;
    if (it < 6) {
      return "A 3R2C zone model has 11 unknowns — resistances, capacitances, gain fractions, initial temperatures. The optimizer starts " + SWARM + " candidate sets spread across the engineering ranges.";
    } else if (it < Math.max(18, DROP.from - 3)) {
      return "Each iteration, every candidate runs the full " + DAYS + "-day simulation. The loss is the summed hourly room-temperature error; candidates move toward their own best and the swarm's best.";
    } else if (it < Math.max(48, DROP.to + 10)) {
      return "Between iterations " + DROP.from + " and " + DROP.to + " the swarm escapes a shallow basin: loss " + fmtInt(DROP.lossFrom) + " → " + fmtInt(DROP.lossTo) + ". On the map, candidates leave the local minima and gather in the deepest one.";
    } else if (it < 90) {
      return "The band of candidate predictions tightens around the measurement. Gains get smaller: loss " + fmtInt(h[48]) + " at iteration 48, " + fmtInt(h[Math.min(it, 90)]) + " at iteration " + Math.min(it, 90) + ".";
    }
    return "Iteration " + ITERS + ": loss " + fmtInt(h[ITERS]) + ", then a local polish to " + fmtInt(S.loss_after) + ". " + fmtInt(S.simulations) + " simulations in all — now compare the start with the end.";
  }
  function captionCompare(hour) {
    var S = D.summary;
    if (hour < 500) {
      return "Before: the best of the initial candidates. Room-temperature error " + fmt2(S.before.room_rmse) + " °C over the " + DAYS + " days — the right shape, the wrong size and timing.";
    } else if (hour < 1500) {
      return "After: " + fmt2(S.after.room_rmse) + " °C with the same model and the same data — only the 11 parameters changed. Better on " + S.days_after_better + " of " + DAYS + " days.";
    }
    return DAYS + " days: room-temperature error " + fmt2(S.before.room_rmse) + " → " + fmt2(S.after.room_rmse) + " °C. " + fmtInt(S.simulations) + " simulations, one optimizer, no new sensors.";
  }

  // ------------------------------------------------------------ cards (left column)
  function cardFrame(x, y, h, label, sub, color) {
    roundRect(x, y, CARD_W, h, 16, "#f6f7f8", "#c9ced4", 1.5);
    text(label, x + 24, y + 34, 600, 13, color, "left", "0.12em");
    text(sub, x + CARD_W - 24, y + 34, 400, 13, MUTED, "right");
    line(x + 24, y + 48, x + CARD_W - 24, y + 48, RULE2, 1);
  }

  // loss landscape map (2-D slice) with the swarm at iteration `it`
  function drawMap(mx, my, ms, it) {
    var L = D.landscape, nx = L.nx, ny = L.ny, cw = ms / nx, ch = ms / ny, i, j;
    var lo = L.min_log10, hi = L.max_log10;
    for (j = 0; j < ny; j++) {
      for (i = 0; i < nx; i++) {
        var t = (L.grid_log10[j][i] - lo) / (hi - lo);              // 0 = deepest
        var a = 0.06 + 0.78 * Math.pow(1 - t, 1.6);
        ctx.fillStyle = "rgba(30,95,168," + a.toFixed(3) + ")";
        ctx.fillRect(mx + i * cw, my + ms - (j + 1) * ch, cw + 0.5, ch + 0.5);
      }
    }
    ctx.strokeStyle = RULE2; ctx.lineWidth = 1; ctx.strokeRect(mx, my, ms, ms);
    // local minima of the slice
    for (i = 0; i < L.local_minima.length; i++) {
      var m = L.local_minima[i], px = mx + m.x * ms, py = my + ms - m.y * ms;
      ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2); ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.6; ctx.stroke();
      ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2); ctx.strokeStyle = INK2; ctx.lineWidth = 1; ctx.setLineDash([2, 2]); ctx.stroke(); ctx.setLineDash([]);
    }
    // swarm
    var sw = D.history.swarm_xy[it];
    for (i = 0; i < sw.length; i++) {
      ctx.beginPath(); ctx.arc(mx + sw[i][0] * ms, my + ms - sw[i][1] * ms, 3, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(70,80,90,0.85)"; ctx.fill();
    }
    // best trail and current best
    var trail = [];
    for (i = 0; i <= it; i++) { var b = D.history.best_xy[i]; trail.push([mx + b[0] * ms, my + ms - b[1] * ms]); }
    polyline(trail, "#fff", 3); polyline(trail, ACCENT, 1.4);
    var cb = trail[trail.length - 1];
    ctx.beginPath(); ctx.arc(cb[0], cb[1], 6, 0, Math.PI * 2); ctx.fillStyle = "#fff"; ctx.fill();
    ctx.beginPath(); ctx.arc(cb[0], cb[1], 4.5, 0, Math.PI * 2); ctx.fillStyle = ACCENT; ctx.fill();
    // axes
    text(D.meta.landscape_axis_labels[0] + "  →", mx + ms / 2, my + ms + 18, 400, 11, MUTED, "center");
    ctx.save(); ctx.translate(mx - 8, my + ms / 2); ctx.rotate(-Math.PI / 2); text(D.meta.landscape_axis_labels[1] + "  →", 0, 0, 400, 11, MUTED, "center"); ctx.restore();
  }

  function drawLossChart(x0, y0, x1, y1, it) {
    var h = D.history.best_loss, i, k;
    line(x0, y1, x1, y1, RULE2, 1); line(x0, y0, x0, y1, RULE2, 1);
    for (k = LOSS_LOG_MIN; k <= LOSS_LOG_MAX; k++) {
      var yy = y1 - (y1 - y0) * (k - LOSS_LOG_MIN) / (LOSS_LOG_MAX - LOSS_LOG_MIN);
      line(x0, yy, x1, yy, RULE, 1); text(fmtInt(Math.pow(10, k)), x0 - 8, yy + 4, 400, 11, MUTED, "right");
    }
    for (k = 0; k <= ITERS; k += 30) { var xx = x0 + (x1 - x0) * k / ITERS; line(xx, y1, xx, y1 + 4, RULE2, 1); text(String(k), xx, y1 + 16, 400, 11, MUTED, "center"); }
    var pts = [];
    for (i = 0; i <= it; i++) { pts.push([x0 + (x1 - x0) * i / ITERS, y1 - (y1 - y0) * (Math.log10(h[i]) - LOSS_LOG_MIN) / (LOSS_LOG_MAX - LOSS_LOG_MIN)]); }
    polyline(pts, ACCENT, 2.2);
    var q = pts[pts.length - 1];
    ctx.beginPath(); ctx.arc(q[0], q[1], 4, 0, Math.PI * 2); ctx.fillStyle = ACCENT; ctx.fill();
  }

  function drawOptimizerCard(x, y, it) {
    var h = D.history.best_loss, S = D.summary;
    cardFrame(x, y, CARD_A_H, "OPTIMIZER  ·  PARTICLE SWARM", SWARM + " candidates  ·  11 parameters  ·  " + ITERS + " iterations", ACCENT);
    var ms = 262, mx = x + 40, my = y + 66;
    text("LOSS LANDSCAPE  ·  slice through the final solution", x + 24, y + 62 - 4, 500, 11, MUTED, "left", "0.08em");
    drawMap(mx, my, ms, it);
    // legend under the map
    var ly = my + ms + 34;
    ctx.beginPath(); ctx.arc(x + 32, ly, 3, 0, Math.PI * 2); ctx.fillStyle = "rgba(70,80,90,0.85)"; ctx.fill(); text("candidate", x + 40, ly + 4, 400, 11, INK2, "left");
    ctx.beginPath(); ctx.arc(x + 112, ly, 4.5, 0, Math.PI * 2); ctx.fillStyle = ACCENT; ctx.fill(); text("swarm best", x + 120, ly + 4, 400, 11, INK2, "left");
    ctx.beginPath(); ctx.arc(x + 204, ly, 6, 0, Math.PI * 2); ctx.strokeStyle = INK2; ctx.lineWidth = 1; ctx.setLineDash([2, 2]); ctx.stroke(); ctx.setLineDash([]); text("local minimum", x + 214, ly + 4, 400, 11, INK2, "left");
    ctx.fillStyle = "rgba(30,95,168,0.84)"; ctx.fillRect(x + 300, ly - 6, 12, 12); text("low loss", x + 316, ly + 4, 400, 11, INK2, "left");
    // loss chart
    var cx0 = x + 400, cx1 = x + CARD_W - 28, cy0 = y + 80, cy1 = y + 250;
    text("LOSS  ·  best candidate", cx0, y + 62 - 4, 500, 11, MUTED, "left", "0.08em");
    drawLossChart(cx0, cy0, cx1, cy1, it);
    text("iteration", cx1, cy1 + 30, 400, 11, MUTED, "right");
    text("ITERATION " + it + " / " + ITERS, cx0, y + 300, 600, 14, INK, "left", "0.06em");
    text(fmtInt(h[it]), cx0, y + 344, 600, 34, ACCENT, "left", "-0.02em");
    text("loss  (sum of hourly errors, °C)", cx0 + textWidth(fmtInt(h[it]), 600, 34) + 12, y + 344, 400, 13, MUTED, "left");
    var st = statusAt(it);
    text(st.s, cx0, y + 368, 500, 13, st.c, "left");
  }

  function drawParamCard(x, y, label, sub, normA, normB, colorB) {
    var M = D.meta, i;
    cardFrame(x, y, CARD_B_H, label, sub, colorB);
    var tx0 = x + 262, tx1 = x + CARD_W - 40, rowY = y + 70, rowH = 17.5;
    for (i = 0; i < 11; i++) {
      var yy = rowY + i * rowH;
      text(M.param_labels[i], x + 24, yy + 4, 400, 12, INK2, "left");
      line(tx0, yy, tx1, yy, RULE2, 1.2);
      var xa = tx0 + (tx1 - tx0) * normA[i], xb = tx0 + (tx1 - tx0) * normB[i];
      line(xa, yy - 5, xa, yy + 5, GRAY, 2.5);
      ctx.beginPath(); ctx.arc(xb, yy, 4.5, 0, Math.PI * 2); ctx.fillStyle = colorB; ctx.fill();
    }
    text("min", tx0, rowY + 11 * rowH + 2, 400, 10, MUTED, "left");
    text("max of the engineering range", tx1, rowY + 11 * rowH + 2, 400, 10, MUTED, "right");
  }

  function drawBeforeAfterCard(x, y, step) {
    var S = D.summary, cL = x + 190, cR = x + 500;
    cardFrame(x, y, CARD_A_H, "BEFORE  vs  AFTER", "same model, same " + DAYS + " days of data — only the parameters changed", ACCENT);
    text("BEFORE CALIBRATION", cL, y + 86, 600, 13, GRAY, "center", "0.10em");
    text("iteration 0 · best initial candidate", cL, y + 108, 400, 12, MUTED, "center");
    text(fmt2(S.before.room_rmse) + " °C", cL, y + 168, 600, 46, GRAY, "center", "-0.02em");
    text("AFTER CALIBRATION", cR, y + 86, 600, 13, ACCENT, "center", "0.10em");
    text("iteration " + ITERS + " + local polish", cR, y + 108, 400, 12, MUTED, "center");
    text(fmt2(S.after.room_rmse) + " °C", cR, y + 168, 600, 46, ACCENT, "center", "-0.02em");
    text("room-temperature error, " + DAYS + " days (RMSE)", x + CARD_W / 2, y + 198, 400, 13, MUTED, "center");
    line(x + 24, y + 222, x + CARD_W - 24, y + 222, RULE2, 1);
    var day = clamp(Math.floor(step / 24) + 1, 1, DAYS);
    var errB = rmse(D.before.room, D.measured_room, 0, step + 1), errA = rmse(D.after.room, D.measured_room, 0, step + 1);
    text("ERROR SO FAR  ·  DAY " + day, x + 24, y + 254, 500, 12, MUTED, "left", "0.10em");
    text(fmt2(errB) + " °C", x + 24, y + 292, 600, 30, GRAY, "left", "-0.02em");
    text(fmt2(errA) + " °C", x + 190, y + 292, 600, 30, ACCENT, "left", "-0.02em");
    text("DAYS IMPROVED", x + 380, y + 254, 500, 12, MUTED, "left", "0.10em");
    var better = 0;
    for (var d = 0; d < Math.min(DAYS, Math.floor((step + 1) / 24)); d++) { if (D.daily.after[d] < D.daily.before[d]) { better++; } }
    text(better + " / " + Math.min(DAYS, Math.floor((step + 1) / 24)), x + 380, y + 292, 600, 30, INK, "left", "-0.02em");
    text("loss " + fmtInt(S.loss_before) + " → " + fmtInt(S.loss_after) + "   ·   " + fmtInt(S.simulations) + " simulations", x + 24, y + 340, 400, 13, MUTED, "left");
  }

  // ------------------------------------------------------------ charts (right column)
  function drawAxesY(p, ticks, x0) {
    line(x0, p.y0, x0, p.y1, RULE2, 1);
    for (var i = 0; i < ticks.length; i++) {
      var y = yOf(p, ticks[i]);
      line(x0 - 6, y, x0, y, RULE2, 1); line(x0, y, CH_X1, y, RULE, 1);
      text(String(ticks[i]), x0 - 12, y + 5, 400, 13, MUTED, "right");
    }
  }
  function xOfWin(hh) { return CH_X0 + (CH_X1 - CH_X0) * hh / WIN; }
  function xOfAll(hh) { return CH_X0 + (CH_X1 - CH_X0) * hh / N; }

  function drawSearchTop(it) {
    var p = P_TOP, i, hh;
    text("Room temperature, first " + (WIN / 24) + " days  [°C]", CH_X0, p.y0 - 14, 500, 16, INK, "left");
    ctx.fillStyle = ON_FILL;
    for (hh = 0; hh < WIN; hh++) { if (D.ahu_on[hh] > 0) { ctx.fillRect(xOfWin(hh), p.y0, xOfWin(hh + 1) - xOfWin(hh) + 0.5, p.y1 - p.y0); } }
    drawAxesY(p, [10, 15, 20, 25, 30, 35], CH_X0);
    for (i = 0; i <= WIN / 24; i++) { var xd = xOfWin(i * 24); line(xd, p.y0, xd, p.y1, RULE, 1, [4, 4]); if (i < WIN / 24) { text("Day " + (i + 1), xOfWin(i * 24 + 12), p.y1 + 22, 500, 13, MUTED, "center"); } }
    ctx.save(); ctx.beginPath(); ctx.rect(CH_X0, p.y0, CH_X1 - CH_X0, p.y1 - p.y0); ctx.clip();
    // candidate band (10–90 percentile)
    var lo = D.history.env_p10[it], hi = D.history.env_p90[it];
    ctx.beginPath(); ctx.moveTo(xOfWin(0), yOf(p, hi[0]));
    for (hh = 1; hh < WIN; hh++) { ctx.lineTo(xOfWin(hh), yOf(p, hi[hh])); }
    for (hh = WIN - 1; hh >= 0; hh--) { ctx.lineTo(xOfWin(hh), yOf(p, lo[hh])); }
    ctx.closePath(); ctx.fillStyle = ACCENT_SOFT; ctx.fill();
    var best = [], mea = [], snap = D.history.snapshot_room[it];
    for (hh = 0; hh < WIN; hh++) { best.push([xOfWin(hh), yOf(p, snap[hh])]); mea.push([xOfWin(hh), yOf(p, D.measured_room[hh])]); }
    polyline(best, ACCENT, 2.2); polyline(mea, MEAS, 2);
    ctx.restore();
    var lx = CH_X1 - 640, ly = p.y0 - 19;
    line(lx, ly, lx + 28, ly, MEAS, 2); text("Measured", lx + 36, ly + 5, 400, 14, INK2, "left");
    line(lx + 122, ly, lx + 150, ly, ACCENT, 2.2); text("Best candidate", lx + 158, ly + 5, 400, 14, INK2, "left");
    ctx.fillStyle = ACCENT_SOFT; ctx.fillRect(lx + 278, ly - 7, 28, 14); text("80 % of candidates", lx + 314, ly + 5, 400, 14, INK2, "left");
    ctx.fillStyle = ON_FILL; ctx.fillRect(lx + 460, ly - 7, 28, 14); ctx.strokeStyle = RULE2; ctx.lineWidth = 1; ctx.strokeRect(lx + 460, ly - 7, 28, 14);
    text("AHU running", lx + 496, ly + 5, 400, 14, INK2, "left");
  }

  function drawSearchBottom(it) {
    var p = P_BOT, nd = WIN / 24, slot = (CH_X1 - CH_X0) / nd, bw = 26, d;
    text("Error of the best candidate by day  [°C]", CH_X0, p.y0 - 14, 500, 16, INK, "left");
    var ticks = []; for (d = 0; d <= p.vmax; d += 2) { ticks.push(d); }
    drawAxesY(p, ticks, CH_X0);
    line(CH_X0, p.y1, CH_X1, p.y1, RULE2, 1);
    var snap = D.history.snapshot_room[it];
    for (d = 0; d < nd; d++) {
      var xc = CH_X0 + slot * (d + 0.5), v0 = DAILY0[d], v1 = rmse(snap, D.measured_room, d * 24, d * 24 + 24);
      ctx.fillStyle = GRAY_SOFT; ctx.fillRect(xc - bw - 3, yOf(p, v0), bw, p.y1 - yOf(p, v0));
      ctx.strokeStyle = GRAY; ctx.lineWidth = 1; ctx.strokeRect(xc - bw - 3, yOf(p, v0), bw, p.y1 - yOf(p, v0));
      ctx.fillStyle = ACCENT; ctx.fillRect(xc + 3, yOf(p, clamp(v1, 0, p.vmax)), bw, p.y1 - yOf(p, clamp(v1, 0, p.vmax)));
      text(fmt1(v1), xc + 3 + bw / 2, yOf(p, clamp(v1, 0, p.vmax)) - 6, 500, 12, ACCENT, "center");
      text("Day " + (d + 1), xc, p.y1 + 22, 500, 13, MUTED, "center");
    }
    var lx = CH_X1 - 330, ly = p.y0 - 19;
    ctx.fillStyle = GRAY_SOFT; ctx.fillRect(lx, ly - 7, 14, 14); ctx.strokeStyle = GRAY; ctx.strokeRect(lx, ly - 7, 14, 14); text("iteration 0", lx + 22, ly + 5, 400, 14, INK2, "left");
    ctx.fillStyle = ACCENT; ctx.fillRect(lx + 118, ly - 7, 14, 14); text("current best (iteration " + it + ")", lx + 140, ly + 5, 400, 14, INK2, "left");
  }

  function drawCompareTop(step) {
    var p = P_TOP, i, hh;
    text("Room temperature  —  " + DAYS + " days  [°C]", CH_X0, p.y0 - 14, 500, 16, INK, "left");
    drawAxesY(p, [10, 15, 20, 25, 30, 35], CH_X0);
    for (i = 0; i <= DAYS; i += 16) { var xd = xOfAll(i * 24); line(xd, p.y0, xd, P_BOT.y1, RULE, 1, [4, 4]); text(i === 0 ? "Day 1" : "Day " + i, xd, P_BOT.y1 + 22, 500, 13, MUTED, i === 0 ? "left" : "center"); }
    ctx.save(); ctx.beginPath(); ctx.rect(CH_X0, p.y0, CH_X1 - CH_X0, p.y1 - p.y0); ctx.clip();
    var bef = [], aft = [], mea = [];
    for (hh = 0; hh <= step; hh++) { bef.push([xOfAll(hh), yOf(p, D.before.room[hh])]); aft.push([xOfAll(hh), yOf(p, D.after.room[hh])]); mea.push([xOfAll(hh), yOf(p, D.measured_room[hh])]); }
    polyline(bef, GRAY, 1.6); polyline(aft, ACCENT, 1.8); polyline(mea, MEAS, 1.4);
    ctx.restore();
    var lx = CH_X1 - 420, ly = p.y0 - 19;
    line(lx, ly, lx + 28, ly, MEAS, 2); text("Measured", lx + 36, ly + 5, 400, 14, INK2, "left");
    line(lx + 122, ly, lx + 150, ly, GRAY, 2); text("Before", lx + 158, ly + 5, 400, 14, INK2, "left");
    line(lx + 232, ly, lx + 260, ly, ACCENT, 2.2); text("After calibration", lx + 268, ly + 5, 400, 14, INK2, "left");
  }

  function drawCompareBottom(step) {
    var p = P_BOT, slot = (CH_X1 - CH_X0) / DAYS, bw = Math.floor(slot / 2) - 1, d;
    var vmax = Math.ceil(Math.max.apply(null, D.daily.before) / 5) * 5;
    var q = { y0: p.y0, y1: p.y1, vmin: 0, vmax: vmax };
    text("Daily room-temperature error  [°C]", CH_X0, p.y0 - 14, 500, 16, INK, "left");
    var ticks = []; for (d = 0; d <= vmax; d += 5) { ticks.push(d); }
    drawAxesY(q, ticks, CH_X0);
    line(CH_X0, p.y1, CH_X1, p.y1, RULE2, 1);
    var done = Math.floor((step + 1) / 24);
    for (d = 0; d < done; d++) {
      var xs = CH_X0 + slot * d + 1;
      ctx.fillStyle = GRAY; ctx.fillRect(xs, yOf(q, D.daily.before[d]), bw, p.y1 - yOf(q, D.daily.before[d]));
      ctx.fillStyle = ACCENT; ctx.fillRect(xs + bw + 1, yOf(q, D.daily.after[d]), bw, p.y1 - yOf(q, D.daily.after[d]));
    }
    var lx = CH_X1 - 300, ly = p.y0 - 19;
    ctx.fillStyle = GRAY; ctx.fillRect(lx, ly - 7, 14, 14); text("Before", lx + 22, ly + 5, 400, 14, INK2, "left");
    ctx.fillStyle = ACCENT; ctx.fillRect(lx + 90, ly - 7, 14, 14); text("After calibration", lx + 112, ly + 5, 400, 14, INK2, "left");
  }

  // ------------------------------------------------------------ scenes
  function drawHeader() {
    text("PARAMETER OPTIMIZATION  ·  MODEL CALIBRATION", 80, 86, 500, 14, MUTED, "left", "0.14em");
    text("Finding the Parameters: Swarm Search, Then Before vs. After", 80, 126, 600, 30, INK, "left", "-0.02em");
    text(LAB_NAME, W - 80, 86, 500, 14, MUTED, "right", "0.02em");
    line(80, 148, W - 80, 148, RULE2, 1);
  }
  function drawCaption(s) {
    line(80, 1012, W - 80, 1012, RULE, 1);
    var lines = wrap(s, W - 160, 400, 24);
    var capY = lines.length > 1 ? 1042 : 1050;
    for (var i = 0; i < lines.length && i < 2; i++) { text(lines[i], 80, capY + i * 28, 400, 24, INK, "left"); }
  }
  function drawContext(left, right) {
    text(left, CARD_X, 882, 500, 13, MUTED, "left", "0.10em");
    text(right, CARD_X + CARD_W, 882, 400, 13, MUTED, "right");
    var lines = wrap("AHU zone of an office building, " + DAYS + " days of hourly operating data. The loss is the summed hourly |measured − simulated| room temperature; one candidate = one full " + DAYS + "-day run of the 3R2C model.", CARD_W, 400, 15);
    for (var i = 0; i < lines.length && i < 3; i++) { text(lines[i], CARD_X, 912 + i * 21, 400, 15, INK2, "left"); }
  }

  function drawSearch(tS) {
    var it = clamp(Math.floor(tS / T_SEARCH * ITERS + 1e-9), 0, ITERS);
    drawHeader();
    drawOptimizerCard(CARD_X, CARD_A_Y, it);
    drawParamCard(CARD_X, CARD_B_Y, "PARAMETERS  ·  11", "gray tick = start (iteration 0)   ·   blue dot = swarm best now", D.history.best_params_norm[0], D.history.best_params_norm[it], ACCENT);
    drawContext("SEARCH  ·  ITERATION " + it + " / " + ITERS, fmtInt(SWARM * (it + 1)) + " simulations so far");
    drawSearchTop(it);
    drawSearchBottom(it);
    drawCaption(captionSearch(it));
  }

  function drawCompare(tC) {
    var step = clamp(Math.floor(tC / T_COMPARE * (N - 1) + 1e-9), 0, N - 1);
    drawHeader();
    drawBeforeAfterCard(CARD_X, CARD_A_Y, step);
    drawParamCard(CARD_X, CARD_B_Y, "PARAMETERS  ·  11", "gray tick = before   ·   blue dot = after calibration", D.before.params_norm, D.after.params_norm, ACCENT);
    drawContext("BEFORE vs AFTER  ·  DAY " + clamp(Math.floor(step / 24) + 1, 1, DAYS) + " / " + DAYS, "hourly steps  ·  outdoor " + fmt1(D.tout[step]) + " °C");
    drawCompareTop(step);
    drawCompareBottom(step);
    drawCaption(captionCompare(step));
  }

  function drawMain(tMain) {
    if (tMain < T_SEARCH) {
      drawSearch(tMain);
      if (tMain > T_SEARCH - FADE) {                     // crossfade into scene 2
        ctx.save(); ctx.globalAlpha = smooth((tMain - (T_SEARCH - FADE)) / FADE);
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H); drawCompare(0); ctx.restore();
      }
    } else {
      drawCompare(Math.min(tMain - T_SEARCH, T_COMPARE));
    }
  }

  function drawTitle(u) {
    var rise = smooth(u * 2.2);
    ctx.save(); ctx.globalAlpha = rise;
    text("PARAMETER OPTIMIZATION  ·  MODEL CALIBRATION", W / 2, 366, 500, 14, MUTED, "center", "0.14em");
    text("Calibration", W / 2, 520, 700, 150, ACCENT, "center", "-0.04em");
    text("Fitting a zone model to operating data with a particle swarm", W / 2, 572, 500, 22, MUTED, "center", "0.06em");
    text("How Does the Optimizer Find the Right Parameters?", W / 2, 646, 600, 40, INK, "center", "-0.02em");
    line(W / 2 - 60, 690, W / 2 + 60, 690, ACCENT, 2);
    text(LAB_NAME, W / 2, 740, 500, 18, MUTED, "center", "0.02em");
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
      drawMain(T_MAIN);
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
    if (window.CAL_DATA) { dataReady = Promise.resolve(window.CAL_DATA); }
    else { dataReady = fetch(dataUrl).then(function (r) { return r.json(); }); }
    dataReady = dataReady.then(function (json) {
      D = json; N = D.meta.n_hours; WIN = D.meta.window_hours; ITERS = D.summary.iterations; SWARM = D.summary.swarm; DAYS = D.summary.n_days;
      if (!D.history || !D.landscape || !D.before || !D.after || !D.daily) { throw new Error("cal-data.json lacks the expected fields"); }
      prepare();
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
    text("Calibration demo: data could not be loaded (" + err.message + ")", 20, 40, 500, 16, "#b3261e", "left");
  });

  if (playBtn) { playBtn.addEventListener("click", function () { if (lastT >= DURATION) { lastT = 0; } play(); }); }
  canvas.addEventListener("click", function () { if (playing) { pause(); } });
  window.addEventListener("resize", function () {
    if (playing || !D) { return; }
    if (started) { renderAt(lastT); } else { poster(); }
  });

  window.CAL = { ready: ready, duration: DURATION, renderAt: renderAt, play: play, pause: pause };
})();
