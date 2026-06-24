/**
 * MegaForm Widget Plugin — GolfScorecard
 * Renders GolfGenius-style hole-by-hole scorecard with color-coded scores.
 * Listens to MegaFormBus 'mfw:drill-down' event from DataRepeater.
 * 
 * @version  v20260428-01
 */

(function (global: any) {
  'use strict';

  var BADGE = 'GolfScorecard v20260504-10';
  (global as any).__MF_GOLF_SCORECARD_BADGE = BADGE;

  var MegaFormWidgets: any = (global as any).MegaFormWidgets;
  var MFUtil: any = (global as any).MFUtil;

  if (!MegaFormWidgets || !MegaFormWidgets.register) {
    console.warn('[MegaForm] MegaFormWidgets not found — GolfScorecard skipped.');
    return;
  }

  function esc(s: any): string {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function tr(key: string, fallback: string): string {
    try { var i = (global as any).__MF_I18N; return (i && i[key]) || fallback; }
    catch (_) { return fallback; }
  }

  function getApiBase(): string {
    if (typeof MFUtil !== 'undefined' && MFUtil && typeof MFUtil.getApiBase === 'function') {
      return MFUtil.getApiBase().replace(/\/?$/, '/');
    }
    return '/api/MegaForm/';
  }

  function normalizeKeys(obj: any): any {
    if (obj === null || obj === undefined || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(normalizeKeys);
    var out: any = {};
    for (var k in obj) {
      if (!obj.hasOwnProperty(k)) continue;
      out[k.charAt(0).toLowerCase() + k.slice(1)] = normalizeKeys(obj[k]);
    }
    return out;
  }

  function ajax(url: string, cb: (err: string | null, data: any) => void): void {
    // [v20260527-04] Append ?portalId=N; drop TabId/ModuleId headers
    // (DNN 400s "Specified page is not in this site" on child-portal aliases).
    var pf = (global as any).__MF_PLATFORM__ || {};
    var pidRaw = pf.portalId != null ? pf.portalId : pf.PortalId;
    var pid = typeof pidRaw === 'number' ? pidRaw : parseInt(String(pidRaw == null ? '0' : pidRaw), 10);
    if (!isFinite(pid) || pid < 0) pid = 0;
    var openUrl = url;
    if (!/[?&]portalId=/i.test(openUrl)) {
      openUrl += (openUrl.indexOf('?') >= 0 ? '&' : '?') + 'portalId=' + pid;
    }
    var xhr = new XMLHttpRequest();
    xhr.open('GET', openUrl, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    try {
      var sf = (global as any).$ && (global as any).$.ServicesFramework;
      if (sf) {
        var inst = sf(0);
        if (inst) {
          var tk = inst.getAntiForgeryValue();
          if (tk) xhr.setRequestHeader('RequestVerificationToken', tk);
        }
      }
    } catch (_) { }
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      if (xhr.status >= 200 && xhr.status < 300) {
        try { cb(null, normalizeKeys(JSON.parse(xhr.responseText))); }
        catch (_) { cb('Invalid JSON', null); }
      } else { cb('HTTP ' + xhr.status, null); }
    };
    xhr.send();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  SCORECARD RENDERER
  // ═══════════════════════════════════════════════════════════════════════════

  function colVal(row: any[], cols: { name: string }[], colName: string): any {
    for (var i = 0; i < cols.length; i++) {
      if (cols[i].name.toLowerCase() === colName.toLowerCase()) return row[i];
    }
    return null;
  }

  /**
   * Score class: compare score to par for color coding.
   *   eagle or better: mfgs-eagle (green bg)
   *   birdie: mfgs-birdie (red text, circle)
   *   par: mfgs-par (no special)
   *   bogey: mfgs-bogey (blue text, square)
   *   double+: mfgs-dblbogey (blue text, double square)
   */
  function scoreClass(score: any, par: any): string {
    var s = parseInt(score, 10);
    var p = parseInt(par, 10);
    if (isNaN(s) || isNaN(p) || s === 0) return '';
    var diff = s - p;
    if (diff <= -2) return 'mfgs-eagle';
    if (diff === -1) return 'mfgs-birdie';
    if (diff === 0) return 'mfgs-par';
    if (diff === 1) return 'mfgs-bogey';
    return 'mfgs-dblbogey';
  }

  function renderScorecard(data: any, cols: { name: string }[]): string {
    if (!data.rows || data.rows.length === 0) return '<div class="mfgs-empty">No scorecard data.</div>';

    var html = '';
    for (var ri = 0; ri < data.rows.length; ri++) {
      var row = data.rows[ri];
      var course = colVal(row, cols, 'courseName') || '';
      var roundLabel = colVal(row, cols, 'roundLabel') || '';
      var tee = colVal(row, cols, 'tee') || '';
      var slope = colVal(row, cols, 'slopeRating') || '';
      var handicap = colVal(row, cols, 'handicap') || '';

      // ── Round header ──
      html += '<div class="mfgs-round">';
      html += '<div class="mfgs-round-hdr">';
      html += '<strong>' + esc(roundLabel) + '</strong> &middot; ';
      html += esc(course);
      if (tee) html += ' <span class="mfgs-tee">(' + esc(tee) + ')</span>';
      html += '</div>';
      if (slope) html += '<div class="mfgs-slope">SLOPE/Rating: ' + esc(slope) + ' &middot; Handicap: ' + esc(handicap) + '</div>';

      // ── Scorecard table ──
      html += '<table class="mfgs-table"><thead>';

      // Hole numbers row
      html += '<tr class="mfgs-holes"><th></th>';
      for (var h = 1; h <= 9; h++) html += '<th>' + h + '</th>';
      html += '<th class="mfgs-sep">Out</th>';
      for (var h2 = 10; h2 <= 18; h2++) html += '<th>' + h2 + '</th>';
      html += '<th class="mfgs-sep">In</th><th class="mfgs-sep">Total</th><th class="mfgs-sep">Net</th></tr>';
      html += '</thead><tbody>';

      // Yardage row (if columns exist)
      if (colVal(row, cols, 'h1Y') !== null) {
        html += '<tr class="mfgs-yardage"><td>Yard</td>';
        for (var y = 1; y <= 9; y++) html += '<td>' + (colVal(row, cols, 'h' + y + 'Y') || '') + '</td>';
        html += '<td class="mfgs-sep">' + (colVal(row, cols, 'outYard') || '') + '</td>';
        for (var y2 = 10; y2 <= 18; y2++) html += '<td>' + (colVal(row, cols, 'h' + y2 + 'Y') || '') + '</td>';
        html += '<td class="mfgs-sep">' + (colVal(row, cols, 'inYard') || '') + '</td>';
        html += '<td class="mfgs-sep">' + (colVal(row, cols, 'totalYard') || '') + '</td><td></td></tr>';
      }

      // Par row
      var hasPar = colVal(row, cols, 'h1P') !== null;
      var parVals: number[] = [];
      if (hasPar) {
        html += '<tr class="mfgs-par-row"><td>Par</td>';
        for (var p = 1; p <= 9; p++) { var pv = colVal(row, cols, 'h' + p + 'P') || ''; parVals.push(parseInt(String(pv), 10)); html += '<td>' + pv + '</td>'; }
        html += '<td class="mfgs-sep">' + (colVal(row, cols, 'outPar') || '') + '</td>';
        for (var p2 = 10; p2 <= 18; p2++) { var pv2 = colVal(row, cols, 'h' + p2 + 'P') || ''; parVals.push(parseInt(String(pv2), 10)); html += '<td>' + pv2 + '</td>'; }
        html += '<td class="mfgs-sep">' + (colVal(row, cols, 'inPar') || '') + '</td>';
        html += '<td class="mfgs-sep">' + (colVal(row, cols, 'par') || '72') + '</td><td></td></tr>';
      }

      // Stroke Index row (if columns exist)
      if (colVal(row, cols, 'h1SI') !== null) {
        html += '<tr class="mfgs-si-row"><td>SI</td>';
        for (var si = 1; si <= 9; si++) html += '<td>' + (colVal(row, cols, 'h' + si + 'SI') || '') + '</td>';
        html += '<td class="mfgs-sep"></td>';
        for (var si2 = 10; si2 <= 18; si2++) html += '<td>' + (colVal(row, cols, 'h' + si2 + 'SI') || '') + '</td>';
        html += '<td class="mfgs-sep"></td><td class="mfgs-sep"></td><td></td></tr>';
      }

      // Score row — color-coded
      html += '<tr class="mfgs-score-row"><td class="mfgs-player-label">' + esc(roundLabel) + '</td>';
      for (var s = 1; s <= 9; s++) {
        var sv = colVal(row, cols, 'h' + s);
        var cls = hasPar ? scoreClass(sv, parVals[s - 1]) : '';
        html += '<td' + (cls ? ' class="' + cls + '"' : '') + '>' + (sv || '') + '</td>';
      }
      html += '<td class="mfgs-sep mfgs-total">' + (colVal(row, cols, 'outTotal') || '') + '</td>';
      for (var s2 = 10; s2 <= 18; s2++) {
        var sv2 = colVal(row, cols, 'h' + s2);
        var cls2 = hasPar ? scoreClass(sv2, parVals[s2 - 1]) : '';
        html += '<td' + (cls2 ? ' class="' + cls2 + '"' : '') + '>' + (sv2 || '') + '</td>';
      }
      html += '<td class="mfgs-sep mfgs-total">' + (colVal(row, cols, 'inTotal') || '') + '</td>';
      html += '<td class="mfgs-sep mfgs-total">' + (colVal(row, cols, 'total') || '') + '</td>';
      html += '<td class="mfgs-sep mfgs-total">' + (colVal(row, cols, 'net') || '') + '</td>';
      html += '</tr>';

      html += '</tbody></table></div>';
    }
    return html;
  }

  /**
   * Template-based render — repeats `template` per round, substituting {token} placeholders.
   * Tokens: {roundLabel} {courseName} {tee} {slopeRating} {handicap}
   *         {h1}..{h18}  (player score, raw)
   *         {h1Class}..{h18Class}  (auto: mfgs-eagle | mfgs-birdie | mfgs-par | mfgs-bogey | mfgs-dblbogey)
   *         {h1P}..{h18P}  (par per hole)
   *         {h1Y}..{h18Y}  (yardage per hole)
   *         {h1SI}..{h18SI}  (stroke index per hole)
   *         {outYard} {inYard} {totalYard} {outPar} {inPar} {par} {outTotal} {inTotal} {total} {net}
   */
  function renderScorecardTemplate(data: any, cols: { name: string }[], template: string): string {
    if (!data.rows || data.rows.length === 0) return '<div class="mfgs-empty">No scorecard data.</div>';
    var html = '';
    for (var ri = 0; ri < data.rows.length; ri++) {
      var row = data.rows[ri];
      var tokens: Record<string, string> = {};
      var simple = ['roundLabel','courseName','tee','slopeRating','handicap',
                    'outYard','inYard','totalYard','outPar','inPar','par','outTotal','inTotal','total','net'];
      for (var ci = 0; ci < simple.length; ci++) tokens[simple[ci]] = String(colVal(row, cols, simple[ci]) || '');

      var parVals: number[] = [];
      for (var h = 1; h <= 18; h++) {
        var pVal = colVal(row, cols, 'h' + h + 'P');
        tokens['h' + h + 'P']  = String(pVal || '');
        tokens['h' + h + 'Y']  = String(colVal(row, cols, 'h' + h + 'Y')  || '');
        tokens['h' + h + 'SI'] = String(colVal(row, cols, 'h' + h + 'SI') || '');
        parVals.push(parseInt(String(pVal), 10));
      }
      for (var s = 1; s <= 18; s++) {
        var sVal = colVal(row, cols, 'h' + s);
        tokens['h' + s] = String(sVal || '');
        tokens['h' + s + 'Class'] = scoreClass(sVal, parVals[s - 1]);
      }

      var rowHtml = template;
      for (var k in tokens) {
        if (!tokens.hasOwnProperty(k)) continue;
        rowHtml = rowHtml.split('{' + k + '}').join(esc(tokens[k]));
      }
      html += rowHtml;
    }
    return html;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  FOURSOME RENDERER (multi-player table from GolfGenius "3 Best of 4" view)
  // ═══════════════════════════════════════════════════════════════════════════
  //
  // Input data shape: data.rows = one row per player; each row has score1..score18.
  // Output: GolfGenius-style table grouped by foursome with one Yardage / Par /
  // SI header set then one stroke row per player + (optional) Stableford block.

  function renderFoursome(data: any, cols: { name: string }[], opts: any): string {
    if (!data.rows || data.rows.length === 0) return '<div class="mfgs-empty">No foursome data.</div>';
    opts = opts || {};
    var courseName = colVal(data.rows[0], cols, 'courseName') || colVal(data.rows[0], cols, 'course') || '';
    var foursomeLabel = opts.foursomeLabel || (data.rows[0] && (colVal(data.rows[0], cols, 'foursome') || '')) || '';
    var pointsCol = opts.pointsCol || 'stableford';
    var stablefordTotal = 0;
    var playerNames: string[] = [];
    for (var pi = 0; pi < data.rows.length; pi++) {
      var nm = colVal(data.rows[pi], cols, 'displayName') || colVal(data.rows[pi], cols, 'lastName') || ('Player ' + (pi + 1));
      var hcp = colVal(data.rows[pi], cols, 'hdcp') || colVal(data.rows[pi], cols, 'handicap');
      playerNames.push(esc(nm) + (hcp ? ' (' + esc(hcp) + ')' : ''));
      var p = parseInt(String(colVal(data.rows[pi], cols, pointsCol) || '0'), 10);
      if (!isNaN(p)) stablefordTotal += p;
    }

    var html = '';

    // ── Foursome header card ──────────────────────────────────────────────
    html += '<div class="mfgs-foursome">';
    html += '<div class="mfgs-foursome-hdr">';
    html += '<div class="mfgs-foursome-pos"><span>Pos</span><strong>' + esc(opts.position || '1') + '</strong></div>';
    html += '<div class="mfgs-foursome-meta"><div class="mfgs-foursome-title">' + playerNames.join(' + ') + '</div>';
    if (courseName) html += '<div class="mfgs-foursome-course">' + esc(courseName) + '</div>';
    html += '</div>';
    html += '<div class="mfgs-foursome-points"><span>' + esc(opts.pointsLabel || 'Stableford Points') + '</span><strong>' + stablefordTotal + '</strong></div>';
    html += '</div>';

    // ── Strokes table ──────────────────────────────────────────────────────
    html += '<table class="mfgs-table mfgs-foursome-table"><thead>';
    html += '<tr class="mfgs-holes"><th></th>';
    for (var h = 1; h <= 9; h++) html += '<th>' + h + '</th>';
    html += '<th class="mfgs-sep">Out</th>';
    for (var h2 = 10; h2 <= 18; h2++) html += '<th>' + h2 + '</th>';
    html += '<th class="mfgs-sep">In</th><th class="mfgs-sep">Total</th><th class="mfgs-sep">Net</th></tr>';
    html += '</thead><tbody>';

    var refRow = data.rows[0];
    var hasYard = colVal(refRow, cols, 'h1Y') !== null;
    var hasPar  = colVal(refRow, cols, 'h1P') !== null;
    var hasSI   = colVal(refRow, cols, 'h1SI') !== null;

    if (hasYard) {
      html += '<tr class="mfgs-yardage"><td>Yardage</td>';
      var oy = 0, iy = 0;
      for (var y = 1; y <= 9; y++) { var v = colVal(refRow, cols, 'h' + y + 'Y') || ''; oy += parseInt(String(v), 10) || 0; html += '<td>' + esc(v) + '</td>'; }
      html += '<td class="mfgs-sep">' + (oy || '') + '</td>';
      for (var y2 = 10; y2 <= 18; y2++) { var v2 = colVal(refRow, cols, 'h' + y2 + 'Y') || ''; iy += parseInt(String(v2), 10) || 0; html += '<td>' + esc(v2) + '</td>'; }
      html += '<td class="mfgs-sep">' + (iy || '') + '</td><td class="mfgs-sep">' + (oy + iy) + '</td><td></td></tr>';
    }

    var parVals: number[] = [];
    if (hasPar) {
      html += '<tr class="mfgs-par-row"><td>Par</td>';
      var op = 0, ip = 0;
      for (var p = 1; p <= 9; p++) { var pv = colVal(refRow, cols, 'h' + p + 'P') || ''; op += parseInt(String(pv), 10) || 0; parVals.push(parseInt(String(pv), 10)); html += '<td>' + esc(pv) + '</td>'; }
      html += '<td class="mfgs-sep">' + op + '</td>';
      for (var p2 = 10; p2 <= 18; p2++) { var pv2 = colVal(refRow, cols, 'h' + p2 + 'P') || ''; ip += parseInt(String(pv2), 10) || 0; parVals.push(parseInt(String(pv2), 10)); html += '<td>' + esc(pv2) + '</td>'; }
      html += '<td class="mfgs-sep">' + ip + '</td><td class="mfgs-sep">' + (op + ip) + '</td><td></td></tr>';
    }

    if (hasSI) {
      html += '<tr class="mfgs-si-row"><td>Stroke Index</td>';
      for (var si = 1; si <= 9; si++) html += '<td>' + esc(colVal(refRow, cols, 'h' + si + 'SI') || '') + '</td>';
      html += '<td class="mfgs-sep"></td>';
      for (var si2 = 10; si2 <= 18; si2++) html += '<td>' + esc(colVal(refRow, cols, 'h' + si2 + 'SI') || '') + '</td>';
      html += '<td class="mfgs-sep"></td><td class="mfgs-sep"></td><td></td></tr>';
    }

    // One row per player — strokes
    html += '<tr class="mfgs-section-label"><td colspan="' + (hasPar ? 23 : 22) + '">Strokes</td></tr>';
    for (var ri = 0; ri < data.rows.length; ri++) {
      var prow = data.rows[ri];
      var pname = colVal(prow, cols, 'displayName') || colVal(prow, cols, 'lastName') || ('Player ' + (ri + 1));
      var phcp  = colVal(prow, cols, 'hdcp') || colVal(prow, cols, 'handicap') || '';
      html += '<tr class="mfgs-score-row"><td class="mfgs-player-label">' + esc(pname) + (phcp ? ' (' + esc(phcp) + ')' : '') + '</td>';
      var pout = 0, pin = 0;
      for (var ps = 1; ps <= 9; ps++) {
        var psv = colVal(prow, cols, 'score' + ps);
        if (psv == null) psv = colVal(prow, cols, 'h' + ps);
        var psn = parseInt(String(psv), 10) || 0;
        pout += psn;
        var cls = hasPar ? scoreClass(psv, parVals[ps - 1]) : '';
        // [GolfScorecardMark v20260504-04] Wrap value in a span so the
        // .mfgs-eagle/birdie/bogey rules (display:inline-flex with circle/
        // square borders) actually render — they don't apply to <td> directly.
        html += '<td>' + (cls ? ('<span class="mfgs-mark ' + cls + '">' + esc(psv == null ? '' : psv) + '</span>') : esc(psv == null ? '' : psv)) + '</td>';
      }
      html += '<td class="mfgs-sep">' + (pout || '') + '</td>';
      for (var ps2 = 10; ps2 <= 18; ps2++) {
        var psv2 = colVal(prow, cols, 'score' + ps2);
        if (psv2 == null) psv2 = colVal(prow, cols, 'h' + ps2);
        var psn2 = parseInt(String(psv2), 10) || 0;
        pin += psn2;
        var cls2 = hasPar ? scoreClass(psv2, parVals[ps2 - 1]) : '';
        html += '<td>' + (cls2 ? ('<span class="mfgs-mark ' + cls2 + '">' + esc(psv2 == null ? '' : psv2) + '</span>') : esc(psv2 == null ? '' : psv2)) + '</td>';
      }
      var ptotal = pout + pin;
      var pnet = parseInt(String(colVal(prow, cols, 'net') || ptotal), 10) || ptotal;
      html += '<td class="mfgs-sep">' + (pin || '') + '</td>';
      html += '<td class="mfgs-sep mfgs-total">' + ptotal + '</td>';
      html += '<td class="mfgs-sep mfgs-total">' + pnet + '</td></tr>';
    }
    html += '</tbody></table>';

    html += '</div>'; // .mfgs-foursome
    return html;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  LEADERBOARD RENDERER (GolfGenius "Low Gross / Net" ranking table)
  // ═══════════════════════════════════════════════════════════════════════════
  //
  // Output matches the user-supplied screenshot from
  // lbgf-2026seniorchampionship1.golfgenius.com:
  //   Pos | Player | Total To Par Gross | R1 | R2 | R3 | Total Gross
  //
  // Color rules (single source of truth — same threshold logic as scoreClass):
  //   - Total To Par <= 0  → red    (under par or even — the leader)
  //   - Total To Par > 0   → green  (over par)
  //   - Round score < par  → red    (round under par)
  //   - Round score > par  → green
  //
  // Data shape: one row per player. Required cols: position OR rank, displayName
  // OR lastName, gross OR total, optionally net + r1/r2/r3 (round totals).
  // courseName + holeNumber for header context (optional). The renderer is
  // permissive — missing columns just collapse out of the row.

  function renderLeaderboard(data: any, cols: { name: string }[], opts: any): string {
    if (!data.rows || data.rows.length === 0) return '<div class="mfgs-empty">No leaderboard data.</div>';
    opts = opts || {};
    var coursePar = parseInt(String(opts.coursePar || 72), 10);
    var rounds: number[] = [];
    var refRow0 = data.rows[0];
    for (var rN = 1; rN <= 6; rN++) { if (colVal(refRow0, cols, 'r' + rN) != null || colVal(refRow0, cols, 'round' + rN) != null) rounds.push(rN); }
    if (rounds.length === 0) rounds = [1];

    var titleHtml = '';
    if (opts.title || opts.subtitle) {
      titleHtml = '<div class="mfgs-lb-title">'
        + (opts.title    ? '<strong>' + esc(opts.title)    + '</strong>' : '')
        + (opts.subtitle ? '<span>'   + esc(opts.subtitle) + '</span>'   : '')
        + '</div>';
    }

    var html = '<div class="mfgs-leaderboard">' + titleHtml;
    html += '<table class="mfgs-table mfgs-lb-table"><thead><tr>'
      + '<th class="mfgs-lb-pos">Pos</th>'
      + '<th class="mfgs-lb-player">Player</th>'
      + '<th>Total To Par<br><small>Gross</small></th>';
    for (var rh = 0; rh < rounds.length; rh++) html += '<th>R' + rounds[rh] + '</th>';
    html += '<th>Total<br><small>Gross</small></th>'
      + (colVal(refRow0, cols, 'net') != null ? '<th>Net</th>' : '')
      + '</tr></thead><tbody>';

    var hasNet = colVal(refRow0, cols, 'net') != null;
    for (var ri = 0; ri < data.rows.length; ri++) {
      var row    = data.rows[ri];
      var pos    = colVal(row, cols, 'position') || colVal(row, cols, 'rank') || (ri + 1);
      var pname  = colVal(row, cols, 'displayName') || colVal(row, cols, 'lastName') || ('Player ' + (ri + 1));
      var gross  = parseInt(String(colVal(row, cols, 'gross') || colVal(row, cols, 'total') || '0'), 10);
      var net    = parseInt(String(colVal(row, cols, 'net') || gross), 10);
      var toPar  = gross - (coursePar * (rounds.length || 1));
      // If the row supplies an explicit toPar / pointsScore field, prefer it
      var explicitToPar = colVal(row, cols, 'toPar');
      if (explicitToPar != null && String(explicitToPar) !== '') toPar = parseInt(String(explicitToPar), 10) || 0;
      var toParCls = toPar <= 0 ? 'mfgs-lb-under' : 'mfgs-lb-over';
      var toParTxt = toPar > 0 ? '+' + toPar : String(toPar);

      html += '<tr class="mfgs-lb-row">'
        + '<td class="mfgs-lb-pos">' + esc(pos) + '</td>'
        + '<td class="mfgs-lb-player">' + esc(pname) + '</td>'
        + '<td class="' + toParCls + '"><strong>' + esc(toParTxt) + '</strong></td>';

      for (var rj = 0; rj < rounds.length; rj++) {
        var rNum = rounds[rj];
        var rVal = colVal(row, cols, 'r' + rNum);
        if (rVal == null) rVal = colVal(row, cols, 'round' + rNum);
        var rNum1 = parseInt(String(rVal || '0'), 10);
        var rCls = '';
        if (rVal != null && rNum1 > 0) rCls = (rNum1 < coursePar ? 'mfgs-lb-under' : (rNum1 > coursePar ? 'mfgs-lb-over' : ''));
        html += '<td class="' + rCls + '">' + esc(rVal == null ? '' : rVal) + '</td>';
      }
      html += '<td class="mfgs-lb-total"><strong>' + (gross > 0 ? gross : '') + '</strong></td>';
      if (hasNet) html += '<td class="mfgs-lb-total">' + (net > 0 ? net : '') + '</td>';
      html += '</tr>';
    }
    html += '</tbody></table></div>';
    return html;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  JSON CONFIG LAYER
  // ═══════════════════════════════════════════════════════════════════════════
  //
  // The widget accepts a single `configJson` blob describing the entire
  // display behaviour. This makes presets shareable (export/import), version-
  // controllable, and lets admins switch from "Foursome Stableford" to "Solo
  // Scorecard" by changing one dropdown instead of rebuilding 6 fields by hand.
  //
  // Schema (JSON):
  // {
  //   "version": 1,
  //   "displayMode": "scorecard" | "foursome" | "leaderboard" | "custom",
  //   "title": "3 Best of 4 - Chicago Points",
  //   "dataSource": {
  //     "type": "sproc" | "sql",
  //     "name": "usp_ScoringDetailLive",          // sproc name OR raw SQL
  //     "params": { "IsSunday": 0 }                // bound at call time
  //   },
  //   "options": {
  //     "foursomeLabel": "...",
  //     "pointsCol": "stableford",                  // column to sum for points display
  //     "pointsLabel": "Stableford Points"
  //   },
  //   "template": "<div>...</div>",                 // only when displayMode="custom"
  //   "css": ".mfgs-foursome { ... }"
  // }
  //
  // The legacy fields (scorecardQuery, cardTemplate, cardCss) still work when
  // configJson is empty — backwards compatible.

  interface GsConfig {
    version: number;
    displayMode: string;
    title?: string;
    dataSource?: { type: string; name?: string; params?: Record<string, any> };
    options?: Record<string, any>;
    template?: string;
    css?: string;
    // [GolfScorecardAutoLoad v20260504-02] Opt-in: when true, the widget fires
    // its data load on bind() instead of waiting for a DataRepeater drill-down
    // event. Use this when the widget is the standalone display on a page (no
    // master/detail flow) — the underlying DataRepeater Query API is still
    // used (so server-side query/permission resolution is unchanged), just
    // triggered automatically with autoLoadParentId (defaults to "auto").
    autoLoad?: boolean;
    autoLoadParentId?: string;
    // [GolfScorecardSibling v20260504-03] When set, the auto-load (and any
    // future direct loads) call DataRepeater/Query with this widgetKey
    // instead of the GolfScorecard's own key. Required because the level-1
    // detail query lives on the partner DataRepeater field, not on
    // GolfScorecard itself. Admin sets this to the form-builder field key
    // of the DataRepeater (e.g. "datarepeater_7_mm25").
    dataRepeaterKey?: string;
  }

  function parseConfigJson(raw: string): GsConfig | null {
    if (!raw || !String(raw).trim()) return null;
    try {
      var obj = JSON.parse(String(raw));
      if (!obj || typeof obj !== 'object') return null;
      if (!obj.version) obj.version = 1;
      if (!obj.displayMode) obj.displayMode = 'scorecard';
      return obj as GsConfig;
    } catch (_) { return null; }
  }

  // STARTER PRESETS — copy-paste-ready JSON the admin can import to bootstrap.
  // Match the GolfGenius layouts the user shared. Add more presets here over
  // time; each one gives admins a one-click starting point instead of writing
  // SQL + HTML from scratch.
  var STARTER_PRESETS: Record<string, GsConfig> = {
    'foursome-stableford': {
      version: 1,
      displayMode: 'foursome',
      title: 'Foursome · Stableford Points',
      dataSource: {
        type: 'sproc',
        name: 'usp_ScoringDetailLive',
        params: { IsSunday: 0 }
      },
      options: {
        pointsCol: 'stableford',
        pointsLabel: 'Stableford Points'
      },
      css: '.mfgs-foursome-points strong { color:#b91c1c }'
    },
    'solo-scorecard-18': {
      version: 1,
      displayMode: 'scorecard',
      title: 'Solo Scorecard · 18 Holes',
      dataSource: {
        type: 'sproc',
        name: 'usp_ScoringDetail',
        params: {}
      }
    },
    'leaderboard-net': {
      version: 1,
      displayMode: 'custom',
      title: 'Net Leaderboard',
      dataSource: {
        type: 'sproc',
        name: 'usp_uv_ScoringDetailLiveList',
        params: {}
      },
      template: '<tr class="mfgs-lb-row"><td>{position}</td><td>{displayName}</td><td>{handicap}</td><td>{total}</td><td><strong>{net}</strong></td></tr>'
    },
    // [GolfScorecardLeaderboard v20260504-04] GolfGenius-style ranking table
    // matching lbgf-2026seniorchampionship1.golfgenius.com/.../12640022580808414882
    // Pos | Player | Total To Par Gross | R1 | R2 | R3 | Total Gross
    'leaderboard-rounds': {
      version: 1,
      displayMode: 'leaderboard',
      title: 'Low Gross Player v. Field — Championship Flight',
      dataSource: {
        type: 'sproc',
        name: 'usp_uv_ScoringGameLiveList',
        params: {}
      },
      options: {
        coursePar: 72,
        title: 'All Rounds: Low Gross Player v. Field — Championship Flight A',
        subtitle: 'Round 3 (Wed, April 22)'
      }
    }
  };

  function getStarterPresetJson(key: string): string {
    var p = STARTER_PRESETS[key];
    return p ? JSON.stringify(p, null, 2) : '';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  WIDGET REGISTRATION
  // ═══════════════════════════════════════════════════════════════════════════

  var defaults: any = {
    connectionKey: 'DashboardDatabase',
    databaseType: '',
    scorecardQuery: '',
    listenEvent: 'mfw:drill-down',
    emptyMessage: tr('widget.golfscorecard.empty', 'Select a player to view scorecard.'),
    cardTemplate: '',
    cardCss: '',
    // [GolfScorecardJSON v20260503-09] New JSON-driven config layer
    displayMode: 'scorecard',          // scorecard | foursome | leaderboard | custom
    configJson: '',                     // full JSON config — supersedes individual fields when set
    presetKey: ''                       // when set, "Load preset" injects starter JSON into configJson
  };

  // Properties shown in the form-builder Properties panel. Order matters —
  // most-used (preset picker + JSON blob) come first; legacy fields kept at
  // the bottom for backwards compatibility.
  var properties = [
    { key: 'presetKey', label: 'Starter preset (click "Load preset" to populate Config JSON)', type: 'select', options: [
      { label: '— Pick a starter preset —', value: '' },
      { label: 'Foursome · Stableford Points (matches GolfGenius "3 Best of 4")', value: 'foursome-stableford' },
      { label: 'Solo Scorecard · 18 Holes', value: 'solo-scorecard-18' },
      { label: 'Net Leaderboard (custom template)', value: 'leaderboard-net' }
    ]},
    { key: 'displayMode', label: 'Display mode', type: 'select', options: [
      { label: 'Scorecard (default GolfGenius layout)', value: 'scorecard' },
      { label: 'Foursome — multi-player Stableford table', value: 'foursome' },
      { label: 'Leaderboard — ranked list', value: 'leaderboard' },
      { label: 'Custom (uses Card Template)', value: 'custom' }
    ]},
    { key: 'configJson', label: 'Config JSON (export = read this; import = paste JSON here). When set, overrides individual fields below.', type: 'textarea' },
    { key: 'connectionKey', label: 'Connection Name', type: 'text' },
    { key: 'databaseType', label: 'Database Type', type: 'select', options: [
      { label: 'Auto-detect', value: '' },
      { label: 'SQL Server', value: 'SqlServer' }
    ]},
    { key: 'scorecardQuery', label: 'Scorecard SQL or stored proc name (use :parentId for player). Ignored when Config JSON set.', type: 'textarea' },
    { key: 'emptyMessage', label: 'Empty Message', type: 'text' },
    { key: 'cardTemplate', label: 'Custom Card Template (HTML, repeats per round; tokens {h1}..{h18}, {h1Class}, {h1P}, {h1SI}, {h1Y}, {roundLabel}, {courseName}, {tee}, {slopeRating}, {handicap}, {outPar}, {inPar}, {par}, {outYard}, {inYard}, {totalYard}, {outTotal}, {inTotal}, {total}, {net}). Used when Display mode = Custom.', type: 'textarea' },
    { key: 'cardCss', label: 'Custom Card CSS (injected as <style> next to widget)', type: 'textarea' }
  ];

  // ── Sample data for preview (shape matches usp_ScoringDetailLive output) ──
  // The Designer popup feeds this into the SAME renderer functions used at
  // runtime — single source of truth, so what admins see in the preview pane
  // is exactly what users see on the form. Mirrors the GolfGenius "3 Best of
  // 4 - Chicago Points" screenshot (4 players, 9 holes, par 36, course Prestwick).
  function buildSampleData(displayMode: string): { rows: any[]; columns: { name: string }[] } {
    var holes = 18;
    var pars  = [4,4,3,5,4,3,4,4,5, 4,3,5,4,3,4,5,4,4];
    var yards = [290,311,132,426,341,115,302,240,408, 365,165,490,330,140,335,510,360,375];
    var sis   = [13,7,15,3,5,17,9,11,1, 14,18,4,6,12,10,2,8,16];
    var players = [
      { name: 'April Zhou (6)',     hcp: 6,  scores: [4,5,3,5,5,3,5,5,5, 4,3,5,4,3,5,5,4,4], stableford: 11 + 23 },
      { name: 'Bill Freeston (2)',  hcp: 2,  scores: [7,6,3,7,5,3,5,4,5, 5,4,5,5,4,4,5,4,5], stableford: 3 + 18 },
      { name: 'Tom Sandgren (5)',   hcp: 5,  scores: [5,4,3,4,5,3,6,5,6, 4,3,5,4,3,5,5,4,4], stableford: 10 + 22 },
      { name: 'Dianne Witte (10)',  hcp: 10, scores: [5,8,5,7,4,2,5,6,5, 5,4,6,5,3,5,5,4,5], stableford: 11 + 20 },
    ];
    var cols: { name: string }[] = [
      { name: 'displayName' }, { name: 'lastName' }, { name: 'hdcp' }, { name: 'handicap' },
      { name: 'courseName' }, { name: 'foursome' }, { name: 'stableford' }, { name: 'gross' }, { name: 'net' }
    ];
    for (var h = 1; h <= holes; h++) {
      cols.push({ name: 'h' + h });
      cols.push({ name: 'h' + h + 'P' });
      cols.push({ name: 'h' + h + 'Y' });
      cols.push({ name: 'h' + h + 'SI' });
      cols.push({ name: 'score' + h });
    }
    var rows: any[] = [];
    for (var p = 0; p < players.length; p++) {
      var pl = players[p];
      var gross = 0; for (var s = 0; s < holes; s++) gross += pl.scores[s];
      var row: any[] = [pl.name, pl.name, pl.hcp, pl.hcp, 'Prestwick Golf Club', '1', pl.stableford, gross, gross - pl.hcp];
      for (var hh = 0; hh < holes; hh++) {
        row.push(pl.scores[hh]);   // h{n}
        row.push(pars[hh]);        // h{n}P
        row.push(yards[hh]);       // h{n}Y
        row.push(sis[hh]);         // h{n}SI
        row.push(pl.scores[hh]);   // score{n}
      }
      rows.push(row);
    }
    // Solo modes only need first row
    if (displayMode === 'scorecard' || displayMode === 'custom') return { rows: [rows[0]], columns: cols };

    // [GolfScorecardLeaderboard v20260504-04] Leaderboard mode needs Pos /
    // Player / R1 / R2 / R3 / Total — synthesize from the same player pool so
    // designer preview shows realistic numbers without a separate fixture.
    if (displayMode === 'leaderboard') {
      var lbCols: { name: string }[] = [
        { name: 'position' }, { name: 'displayName' }, { name: 'lastName' },
        { name: 'r1' }, { name: 'r2' }, { name: 'r3' },
        { name: 'gross' }, { name: 'net' }, { name: 'toPar' }
      ];
      var lbPlayers = [
        { pos: 1, name: 'Tim Hogarth',   r1: 66, r2: 68, r3: 69, toPar: -13 },
        { pos: 2, name: 'Jason Pridmore', r1: 72, r2: 73, r3: 72, toPar:  +1 },
        { pos: 3, name: 'Dave Slingsby',  r1: 71, r2: 78, r3: 71, toPar:  +4 },
        { pos: 4, name: 'Craig Calkins',  r1: 73, r2: 76, r3: 72, toPar:  +5 },
        { pos: 5, name: 'Mark Steinbauer', r1: 74, r2: 75, r3: 74, toPar:  +7 },
        { pos: 6, name: 'Steve Lin',      r1: 76, r2: 77, r3: 73, toPar:  +10 }
      ];
      var lbRows: any[] = [];
      for (var lp = 0; lp < lbPlayers.length; lp++) {
        var lbpl = lbPlayers[lp];
        var tot = lbpl.r1 + lbpl.r2 + lbpl.r3;
        lbRows.push([lbpl.pos, lbpl.name, lbpl.name, lbpl.r1, lbpl.r2, lbpl.r3, tot, tot - 7, lbpl.toPar]);
      }
      return { rows: lbRows, columns: lbCols };
    }

    return { rows: rows, columns: cols };
  }

  // Expose preset library + renderers + sample-data on a global so:
  //   1. The form builder's Properties panel can call import/export helpers
  //   2. The Golf Designer popup (golf-designer.ts) can render previews using
  //      the SAME engine as the runtime renderer — single source of truth.
  (global as any).MFGolfScorecard = {
    badge: BADGE,
    listPresets: function () {
      var out: { key: string; label: string; mode: string }[] = [];
      for (var k in STARTER_PRESETS) {
        if (STARTER_PRESETS.hasOwnProperty(k)) {
          out.push({ key: k, label: STARTER_PRESETS[k].title || k, mode: STARTER_PRESETS[k].displayMode });
        }
      }
      return out;
    },
    loadPreset: getStarterPresetJson,
    exportConfig: function (props: any): string {
      var parsed = parseConfigJson(props.configJson || '');
      if (parsed) return JSON.stringify(parsed, null, 2);
      var synth: GsConfig = {
        version: 1,
        displayMode: props.displayMode || 'scorecard',
        dataSource: {
          type: (props.scorecardQuery || '').toUpperCase().indexOf('USP_') === 0 ? 'sproc' : 'sql',
          name: props.scorecardQuery || ''
        }
      };
      if (props.cardTemplate) synth.template = props.cardTemplate;
      if (props.cardCss) synth.css = props.cardCss;
      return JSON.stringify(synth, null, 2);
    },
    importConfig: function (raw: string): GsConfig | null {
      return parseConfigJson(raw);
    },
    // SINGLE SOURCE OF TRUTH renderers — designer preview calls these so
    // anything an admin sees in the popup matches the live form exactly.
    renderers: {
      foursome:    function (data: any, opts: any) { return renderFoursome(data, data && data.columns ? data.columns : [], opts || {}); },
      scorecard:   function (data: any) { return renderScorecard(data, data && data.columns ? data.columns : []); },
      template:    function (data: any, tpl: string) { return renderScorecardTemplate(data, data && data.columns ? data.columns : [], tpl); },
      leaderboard: function (data: any, opts: any) { return renderLeaderboard(data, data && data.columns ? data.columns : [], opts || {}); }
    },
    getSampleData: buildSampleData
  };

  function getProps(field: any): any {
    var wp = field.widgetProps || {};
    var merged: any = {};
    for (var k in defaults) merged[k] = defaults[k];
    for (var k2 in wp) { if (wp[k2] !== undefined && wp[k2] !== null) merged[k2] = wp[k2]; }
    return merged;
  }

  MegaFormWidgets.register('GolfScorecard', {
    label: 'Golf Scorecard',
    icon: '⛳',
    category: 'Widgets',
    properties: properties,
    defaults: defaults,

    render: function (field: any, formId: number) {
      var key = field.key || 'golfscorecard';
      var props = getProps(field);
      var styleHtml = '';
      if (props.cardCss && String(props.cardCss).trim()) {
        var safeCss = String(props.cardCss).replace(/<\/style>/gi, '<\\/style>');
        styleHtml = '<style data-mfgs-css-key="' + esc(key) + '">' + safeCss + '</style>';
      }
      // [GolfDesigner v20260504-07] Note: the Builder canvas does NOT call
      // render() — it shows a placeholder ("Golf Scorecard Widget" badge).
      // The Open Designer launcher is therefore injected by a canvas observer
      // below the widget IIFE, which appends a button into each
      // .mf-canvas-field[data-type="GolfScorecard"] card. Runtime render() stays
      // clean for the public form.
      return styleHtml + '<div class="mfgs-wrap" data-mfgs-key="' + esc(key) + '" data-mfgs-form="' + formId + '"' +
             ' data-mfgs-tpl-badge="' + BADGE + '"' +
             ' data-mfgs-props="' + esc(JSON.stringify(props)) + '">' +
             '<div class="mfgs-data"><div class="mfgs-empty">' + esc(props.emptyMessage) + '</div></div></div>';
    },

    bind: function (formId: number) {
      var wraps = document.querySelectorAll('[data-mfgs-form="' + formId + '"]');
      for (var wi = 0; wi < wraps.length; wi++) {
        bindInstance(wraps[wi] as HTMLElement, formId);
      }
    },

    collect: function () { return null; },
    validate: function () { return { valid: true, errors: [] }; }
  });

  function bindInstance(wrap: HTMLElement, formId: number): void {
    var key = wrap.getAttribute('data-mfgs-key') || '';
    var propsJson = wrap.getAttribute('data-mfgs-props');
    var props = defaults;
    if (propsJson) { try { props = JSON.parse(propsJson); } catch (_) { } }

    var dataDiv = wrap.querySelector('.mfgs-data') as HTMLElement;
    if (!dataDiv) return;
    // [GolfDesigner v20260504-07] Builder launcher moved to the canvas-
    // observer bootstrap at the bottom of this file (the Builder canvas
    // doesn't call render(), so the in-render launcher never fired).

    // Listen to MegaFormBus for drill-down events
    var bus = (global as any).MegaFormBus;
    if (bus && bus.on) {
      var channel = 'form-' + formId;
      bus.on('mfw:drill-down', function (evt: any) {
        if (!evt || evt.channel !== channel) return;
        loadScorecard(evt.parentId, evt);
      }, channel);
    }

    // [GolfScorecardAutoLoad v20260504-02] Opt-in standalone mode: when
    // configJson.autoLoad === true, fire the load immediately on bind so the
    // widget can render without a DataRepeater click. Server-side query
    // resolution (DataRepeater/Query level=1) is unchanged — we just supply
    // a synthetic parentId. Default parentId is "auto" but admins can pin a
    // specific value via configJson.autoLoadParentId.
    var bootCfg = parseConfigJson(props.configJson || '');
    if (bootCfg && bootCfg.autoLoad) {
      loadScorecard(bootCfg.autoLoadParentId || 'auto', { auto: true });
    }

    function loadScorecard(parentId: string, evt: any): void {
      if (!parentId) return;
      dataDiv.innerHTML = '<div class="mfgs-loading"><span class="mfgs-spinner"></span> Loading scorecard…</div>';

      // [GolfScorecardSibling v20260504-03] Detail-level queries live on the
      // partner DataRepeater field. When configJson.dataRepeaterKey is set,
      // call /DataRepeater/Query with THAT key. Falls back to this widget's
      // own key for backwards compatibility (the legacy drill-down flow
      // dispatches via the same widget key on both sides).
      var jsonCfgQ = parseConfigJson(props.configJson || '');
      var queryKey = (jsonCfgQ && jsonCfgQ.dataRepeaterKey) ? jsonCfgQ.dataRepeaterKey : key;

      // Use DataRepeater API — same endpoint, level 1
      var url = getApiBase() + 'DataRepeater/Query?formId=' + formId +
                '&widgetKey=' + encodeURIComponent(queryKey) +
                '&parentId=' + encodeURIComponent(parentId) +
                '&level=1&pageSize=200';

      ajax(url, function (err, data) {
        if (err || !data || data.error) {
          dataDiv.innerHTML = '<div class="mfgs-error">' + esc(err || (data && data.error) || 'Error') + '</div>';
          return;
        }
        if (!data.rows || data.rows.length === 0) {
          dataDiv.innerHTML = '<div class="mfgs-empty">No scorecard data for this player.</div>';
          return;
        }

        // [GolfScorecardJSON v20260503-09] Dispatch order:
        //   1. configJson (if set + parseable)  — full JSON config wins
        //   2. displayMode  (foursome | scorecard | custom + cardTemplate)
        //   3. Legacy: cardTemplate set → renderScorecardTemplate
        //   4. Default GolfGenius scorecard
        var jsonCfg = parseConfigJson(props.configJson || '');
        var mode = (jsonCfg && jsonCfg.displayMode) || props.displayMode || 'scorecard';
        var tpl = (jsonCfg && jsonCfg.template) || props.cardTemplate || '';
        var modeOpts = (jsonCfg && jsonCfg.options) || {};

        // Inject preset CSS if provided (in addition to widget-level cardCss)
        if (jsonCfg && jsonCfg.css) {
          var styleId = 'mfgs-cfg-css-' + (wrap.getAttribute('data-mfgs-key') || 'k');
          var styleTag = document.getElementById(styleId);
          if (!styleTag) {
            styleTag = document.createElement('style');
            styleTag.id = styleId;
            document.head.appendChild(styleTag);
          }
          styleTag.textContent = jsonCfg.css;
        }

        if (mode === 'foursome') {
          dataDiv.innerHTML = renderFoursome(data, data.columns, modeOpts);
        } else if (mode === 'leaderboard') {
          dataDiv.innerHTML = renderLeaderboard(data, data.columns, modeOpts);
        } else if (mode === 'custom' && tpl && String(tpl).trim()) {
          dataDiv.innerHTML = renderScorecardTemplate(data, data.columns, String(tpl));
        } else if (tpl && String(tpl).trim()) {
          // Legacy path — admins set cardTemplate without picking a mode
          dataDiv.innerHTML = renderScorecardTemplate(data, data.columns, String(tpl));
        } else {
          dataDiv.innerHTML = renderScorecard(data, data.columns);
        }
      });
    }
  }

  console.log('[MegaForm] ' + BADGE + ' registered.');

  // ═══════════════════════════════════════════════════════════════════════════
  //  [GolfDesigner v20260504-07]  BUILDER CANVAS LAUNCHER
  // ═══════════════════════════════════════════════════════════════════════════
  //
  // Same pattern as the DataRepeater widget's canvas observer: inject an Open
  // Designer button into each .mf-canvas-field[data-type="GolfScorecard"] card.
  // The Builder shows a placeholder, never calls render(), so this is the
  // only way to surface the launcher.
  //
  // Click flow:
  //   1. Read field key from card's data-key
  //   2. Look up field in MegaFormBuilder.state.schema.fields
  //   3. Lazy-load megaform-golf-designer.js
  //   4. MFGolfDesigner.open with field.widgetProps.configJson (the inner JSON)
  //   5. onApply: write back to field.widgetProps.configJson; mark dirty;
  //      re-render canvas
  if (typeof document !== 'undefined') {
    (function injectGolfBuilderLaunchers() {
      var WIDGET_TYPE = 'GolfScorecard';
      var BTN_CLASS   = 'mfgs-card-designer-launcher';
      var INJECTED_FLAG = 'mfgsLauncherInjected';

      function findField(key: string): any {
        var B = (window as any).MegaFormBuilder;
        var fields = B && B.state && B.state.schema && B.state.schema.fields ? B.state.schema.fields : [];
        for (var i = 0; i < fields.length; i++) {
          var f = fields[i]; if (!f) continue;
          if (f.key === key) return f;
          if (f.type === 'Row' && f.columns) {
            for (var ci = 0; ci < f.columns.length; ci++) {
              var col = f.columns[ci]; if (!col || !col.fields) continue;
              for (var fi = 0; fi < col.fields.length; fi++) {
                if (col.fields[fi] && col.fields[fi].key === key) return col.fields[fi];
              }
            }
          }
        }
        return null;
      }

      function lazyLoadAndOpen(initialJson: string, onApply: (json: string) => void) {
        // [v20260530-15] The 3-pane Golf Designer popup (presets / JSON /
        // preview) was retired — its functionality overlapped with the
        // generic Properties panel + Live Preview. Replaced with a thin
        // <textarea> popup so existing admins can still tweak configJson
        // without opening the Builder property rail.
        var current = String(initialJson || '');
        var w = window.open('', '_blank', 'width=720,height=560,resizable=yes,scrollbars=yes');
        if (!w) {
          // Pop-up blocked — fall back to prompt
          var v = window.prompt('Golf Scorecard configJson (paste JSON):', current);
          if (v != null) onApply(v);
          return;
        }
        w.document.write(
          '<style>body{font:13px/1.5 -apple-system,Segoe UI,sans-serif;padding:14px;background:#f8fafc}' +
          'h2{margin:0 0 4px;font-size:15px;color:#0f172a}' +
          'p{margin:0 0 10px;color:#64748b;font-size:12px}' +
          'textarea{width:100%;height:380px;font-family:Menlo,Consolas,monospace;font-size:12px;padding:10px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;resize:vertical}' +
          '.bar{display:flex;justify-content:flex-end;gap:8px;margin-top:10px}' +
          'button{padding:7px 16px;border:1px solid #cbd5e1;background:#fff;border-radius:8px;font-size:13px;cursor:pointer}' +
          'button.primary{background:#6366f1;color:#fff;border-color:#6366f1;font-weight:600}' +
          '</style>' +
          '<h2>Golf Scorecard Config</h2>' +
          '<p>Edit the configJson directly. Common presets: <code>{"displayMode":"scorecard"}</code>, <code>{"displayMode":"foursome"}</code>, <code>{"displayMode":"leaderboard"}</code>.</p>' +
          '<textarea id="cfg">' + current.replace(/</g, '&lt;') + '</textarea>' +
          '<div class="bar"><button onclick="window.close()">Cancel</button>' +
          '<button class="primary" id="ok">Apply</button></div>'
        );
        var okBtn = w.document.getElementById('ok');
        if (okBtn) okBtn.onclick = function () {
          var ta = w.document.getElementById('cfg') as HTMLTextAreaElement;
          var v = ta ? ta.value : current;
          // Validate JSON quickly
          try { if (v.trim()) JSON.parse(v); }
          catch (e) { alert('Invalid JSON: ' + (e as Error).message); return; }
          onApply(v);
          w.close();
        };
      }

      function inject(card: HTMLElement) {
        if (!card || (card as any).dataset[INJECTED_FLAG] === '1') return;
        (card as any).dataset[INJECTED_FLAG] = '1';
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = BTN_CLASS;
        btn.title = 'Open Golf Scorecard Designer (presets + JSON import/export + live preview)';
        btn.innerHTML = '\u{1F3A8} Open Designer';
        btn.style.cssText = 'background:#6366f1;color:#fff;border:0;padding:5px 11px;border-radius:6px;cursor:pointer;font-size:11px;font-weight:600;margin-left:8px;line-height:1.3';
        btn.addEventListener('click', function (e) {
          e.preventDefault(); e.stopPropagation();
          var key = card.getAttribute('data-key') || '';
          var field = findField(key);
          console.log('[mfgs-launcher] click · key=', key, '· field found=', !!field, '· has configJson=', !!(field && field.widgetProps && field.widgetProps.configJson));
          var initialJson = '';
          if (field && field.widgetProps && field.widgetProps.configJson) {
            initialJson = String(field.widgetProps.configJson);
          }
          lazyLoadAndOpen(initialJson, function (json: string) {
            try {
              console.log('[mfgs-launcher] applying configJson length:', json.length);
              if (field) {
                if (!field.widgetProps) field.widgetProps = {};
                field.widgetProps.configJson = json;
                var B = (window as any).MegaFormBuilder;
                if (B && B.state) B.state.isDirty = true;
                // [GolfDesigner v20260504-10] ONLY refresh Properties panel.
                // canvas.render + syncSchemaToHtmlImmediate were racing with
                // showProps and wiping the inputs back to empty. Letting admin
                // click Save triggers the normal save flow which reads from
                // the now-populated configJson textarea.
                try {
                  if (B && B.callModule) {
                    B.callModule('properties', 'showProps', [field]);
                    console.log('[mfgs-launcher] showProps called — Properties panel refreshed');
                  } else {
                    console.warn('[mfgs-launcher] MegaFormBuilder.callModule unavailable');
                  }
                } catch (e) { console.warn('[mfgs-launcher] showProps threw:', e); }
              }
            } catch (e) { console.error('[mfgs-launcher] onApply error:', e); }
          });
        });
        var actions = card.querySelector('.mf-canvas-field-actions');
        if (actions && actions.parentNode) actions.parentNode.insertBefore(btn, actions);
        else card.appendChild(btn);
      }

      function scan() {
        var cards = document.querySelectorAll('.mf-canvas-field[data-type="' + WIDGET_TYPE + '"]');
        for (var i = 0; i < cards.length; i++) inject(cards[i] as HTMLElement);
      }

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', scan);
      } else {
        scan();
      }
      if (typeof MutationObserver !== 'undefined') {
        try { new MutationObserver(function () { scan(); }).observe(document.body, { childList: true, subtree: true }); } catch (_) { /* ignore */ }
      }
    })();
  }

})(typeof window !== 'undefined' ? window : this);
