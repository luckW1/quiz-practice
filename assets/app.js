(function () {
  'use strict';

  var Q = Array.isArray(window.QUESTIONS) ? window.QUESTIONS : [];
  var TYPE_NAME = { choice: '单选题', judge: '判断题', fill: '填空题', short: '简答题' };
  var LETTERS = 'ABCDEF';
  var REC_KEY = 'qbank.records.v1';
  var CFG_KEY = 'qbank.config.v1';
  var core = window.QuizCore;
  var code = window.QuizCode;

  var $ = function (id) { return document.getElementById(id); };
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function readJSON(key, def) {
    try {
      var v = JSON.parse(localStorage.getItem(key));
      return v && typeof v === 'object' ? v : def;
    } catch (e) { return def; }
  }

  var QUESTION_BY_ID = Object.create(null);
  var BANK_COUNTS = Object.create(null);
  var BANK_TYPE_COUNTS = Object.create(null);
  var banks = [];
  Q.forEach(function (q) {
    QUESTION_BY_ID[q.id] = q;
    if (banks.indexOf(q.src) < 0) {
      banks.push(q.src);
      BANK_TYPE_COUNTS[q.src] = Object.create(null);
    }
    BANK_COUNTS[q.src] = (BANK_COUNTS[q.src] || 0) + 1;
    BANK_TYPE_COUNTS[q.src][q.t] = (BANK_TYPE_COUNTS[q.src][q.t] || 0) + 1;
  });
  var ALL_TYPES = ['choice', 'judge', 'fill', 'short'];

  var records = normalizeRecords(readJSON(REC_KEY, {}));
  var cfg = readJSON(CFG_KEY, {});
  cfg.banks = Array.isArray(cfg.banks) ? cfg.banks.filter(function (b) { return banks.indexOf(b) >= 0; }) : banks.slice();
  if (!cfg.banks.length) cfg.banks = banks.slice();
  cfg.types = Array.isArray(cfg.types) ? cfg.types.filter(function (t) { return ALL_TYPES.indexOf(t) >= 0; }) : ALL_TYPES.slice();
  if (!cfg.types.length) cfg.types = ALL_TYPES.slice();
  cfg.mode = cfg.mode === 'order' ? 'order' : 'random';
  cfg.onlyWrong = !!cfg.onlyWrong;

  var state = { pool: [], idx: 0, answered: false, picked: [], removeOnNext: null };

  function saveRecords() {
    try { localStorage.setItem(REC_KEY, JSON.stringify(records)); } catch (e) {}
  }
  function saveCfg() {
    try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (e) {}
  }

  function normalizeRecords(value) {
    var clean = {};
    if (!value || typeof value !== 'object' || Array.isArray(value)) return clean;
    Q.forEach(function (q) {
      var item = value[q.id];
      if (!item || typeof item !== 'object' || typeof item.ok !== 'boolean') return;
      clean[q.id] = {
        ok: item.ok,
        ts: typeof item.ts === 'number' && isFinite(item.ts) ? item.ts : Date.now()
      };
    });
    return clean;
  }

  function current() {
    var id = state.pool[state.idx];
    return id == null ? null : QUESTION_BY_ID[id] || null;
  }

  /* ---------------- 侧边栏 ---------------- */

  function renderChips() {
    var bankBox = $('bankChips');
    bankBox.innerHTML = '';
    banks.forEach(function (b) {
      var n = BANK_COUNTS[b] || 0;
      var btn = el('button', 'chip' + (cfg.banks.indexOf(b) >= 0 ? ' active' : ''), b + ' · ' + n);
      btn.addEventListener('click', function () {
        var i = cfg.banks.indexOf(b);
        if (i >= 0) {
          if (cfg.banks.length === 1) return;
          cfg.banks.splice(i, 1);
        } else {
          cfg.banks.push(b);
        }
        saveCfg(); renderChips(); refreshPool();
      });
      bankBox.appendChild(btn);
    });

    var typeBox = $('typeChips');
    typeBox.innerHTML = '';
    ALL_TYPES.forEach(function (t) {
      var n = cfg.banks.reduce(function (sum, b) {
        return sum + (BANK_TYPE_COUNTS[b] && BANK_TYPE_COUNTS[b][t] || 0);
      }, 0);
      if (!n) return;
      var btn = el('button', 'chip' + (cfg.types.indexOf(t) >= 0 ? ' active' : ''), TYPE_NAME[t] + ' · ' + n);
      btn.addEventListener('click', function () {
        var i = cfg.types.indexOf(t);
        if (i >= 0) {
          if (cfg.types.length === 1) return;
          cfg.types.splice(i, 1);
        } else {
          cfg.types.push(t);
        }
        saveCfg(); renderChips(); refreshPool();
      });
      typeBox.appendChild(btn);
    });

    var total = Q.filter(function (q) {
      return cfg.banks.indexOf(q.src) >= 0 && cfg.types.indexOf(q.t) >= 0;
    }).length;
    $('bankTotal').textContent = '共 ' + total + ' 题';
  }

  function renderSeg() {
    Array.prototype.forEach.call($('modeSeg').children, function (b) {
      b.classList.toggle('active', b.dataset.mode === cfg.mode);
    });
  }

  function updateStats() {
    var ids = Object.keys(records);
    var ok = 0, bad = 0;
    ids.forEach(function (id) { if (records[id].ok) ok++; else bad++; });
    $('stDone').textContent = ids.length;
    $('stRate').textContent = ids.length ? Math.round((ok / ids.length) * 100) + '%' : '—';
    $('stWrong').textContent = bad;
  }

  /* ---------------- 题池 ---------------- */

  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function buildPool() {
    var list = Q.filter(function (q) {
      return cfg.banks.indexOf(q.src) >= 0 && cfg.types.indexOf(q.t) >= 0;
    });
    if (cfg.onlyWrong) {
      list = list.filter(function (q) { return records[q.id] && !records[q.id].ok; });
    }
    list.sort(function (a, b) { return a.id - b.id; });
    if (cfg.mode === 'random') shuffle(list);
    state.pool = list.map(function (q) { return q.id; });
    state.idx = 0;
    state.answered = false;
    state.picked = [];
    state.removeOnNext = null;
    updatePos();
  }

  function refreshPool() {
    buildPool();
    render();
  }

  function updatePos() {
    var n = state.pool.length;
    $('posNow').textContent = n ? state.idx + 1 : 0;
    $('posAll').textContent = n;
    $('bar').style.width = n ? ((state.idx + 1) / n * 100) + '%' : '0%';
    $('progress').setAttribute('aria-valuemax', String(n));
    $('progress').setAttribute('aria-valuenow', String(n ? state.idx + 1 : 0));
  }

  /* ---------------- 渲染题目 ---------------- */

  function copyCode(text, button) {
    var label = button.querySelector('.code-copy-text');
    function done() {
      button.classList.add('copied');
      if (label) label.textContent = '已复制';
      window.setTimeout(function () {
        button.classList.remove('copied');
        if (label) label.textContent = '复制';
      }, 1600);
    }
    function fallback() {
      var field = document.createElement('textarea');
      field.value = text;
      field.setAttribute('readonly', '');
      field.style.position = 'fixed';
      field.style.opacity = '0';
      document.body.appendChild(field);
      field.select();
      try { document.execCommand('copy'); done(); } catch (e) {}
      field.remove();
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(fallback);
    } else {
      fallback();
    }
  }

  function buildCode(source, language, subtitle) {
    var lang = language || code.languageOf(source) || 'java';
    var formatted = code.formatCode(source, lang);
    var lines = formatted.split('\n');
    var wrap = el('div', 'code-panel');
    var head = el('div', 'code-head');
    var meta = el('div', 'code-meta');
    var label = el('span', 'code-label');
    label.appendChild(el('span', 'code-language', lang === 'sql' ? 'SQL' : 'Java'));
    label.appendChild(el('span', 'code-subtitle', subtitle || '程序代码'));
    meta.appendChild(label);
    head.appendChild(meta);

    var actions = el('div', 'code-actions');
    actions.appendChild(el('span', 'code-lines', lines.length + ' 行'));
    var copy = el('button', 'code-copy');
    copy.type = 'button';
    copy.setAttribute('aria-label', '复制代码');
    copy.appendChild(el('span', 'code-copy-icon'));
    copy.appendChild(el('span', 'code-copy-text', '复制'));
    copy.addEventListener('click', function () { copyCode(formatted, copy); });
    actions.appendChild(copy);
    head.appendChild(actions);
    wrap.appendChild(head);

    var pre = document.createElement('pre');
    pre.className = 'code';
    pre.innerHTML = lines.map(function (l) {
      return '<span class="cl">' + (l.trim() ? code.highlightLine(l, lang) : '&nbsp;') + '</span>';
    }).join('');
    wrap.appendChild(pre);
    return wrap;
  }

  function renderStem(q) {
    var box = $('qStem');
    box.innerHTML = '';
    var program = code.extractProgram(q.q);
    if (!program) {
      box.appendChild(el('p', '', q.q));
      return;
    }
    if (program.before) box.appendChild(el('p', '', program.before));
    box.appendChild(buildCode(program.code, 'java', '程序代码'));
    if (program.after) box.appendChild(el('p', 'code-after', program.after));
  }

  function render() {
    var q = current();
    var meta = document.querySelector('.meta');
    var area = $('qArea');
    var fb = $('qFeedback');
    fb.hidden = true;
    fb.className = 'feedback';
    area.innerHTML = '';
    $('qStem').innerHTML = '';

    if (!q) {
      meta.style.display = 'none';
      area.style.display = 'none';
      var empty = el('div', 'empty');
      empty.appendChild(el('strong', '', '这里还没有题目'));
      empty.appendChild(el('span', '', cfg.onlyWrong
        ? '当前筛选下没有错题，去练几道题再来吧。'
        : '请在上方至少选择一个题库和一个题型。'));
      $('qStem').appendChild(empty);
      updatePos();
      return;
    }

    meta.style.display = 'flex';
    area.style.display = 'block';
    $('qSrc').textContent = q.src;
    $('qType').textContent = TYPE_NAME[q.t];
    $('qNo').textContent = '第 ' + q.no + ' 题';
    renderStem(q);

    if (q.t === 'choice') renderChoice(q);
    else if (q.t === 'judge') renderJudge(q);
    else if (q.t === 'fill') renderFill(q);
    else renderShort(q);

    updatePos();
  }

  function renderChoice(q) {
    var box = el('div', 'options');
    q.o.forEach(function (text, i) {
      var b = el('button', 'option');
      b.appendChild(el('span', 'letter', LETTERS[i]));
      var content = el('span', 'text');
      if (code.isInlineCode(text)) {
        var inline = el('code', 'code-inline');
        inline.innerHTML = code.highlightLine(text, code.languageOf(text) || 'java');
        content.appendChild(inline);
      } else {
        content.textContent = text;
      }
      b.appendChild(content);
      b.addEventListener('click', function () { pickOption(i); });
      box.appendChild(b);
    });
    $('qArea').appendChild(box);

    if (q.a.length > 1) {
      var row = el('div', 'btn-row');
      var btn = el('button', 'btn primary', '提交答案');
      btn.addEventListener('click', submitMulti);
      row.appendChild(btn);
      $('qArea').appendChild(row);
    }
  }

  function pickOption(i) {
    var q = current();
    if (!q || state.answered) return;
    var L = LETTERS[i];
    if (q.a.length > 1) {
      var k = state.picked.indexOf(L);
      if (k >= 0) state.picked.splice(k, 1); else state.picked.push(L);
      var nodes = document.querySelectorAll('.option');
      Array.prototype.forEach.call(nodes, function (b, j) {
        b.classList.toggle('picked', state.picked.indexOf(LETTERS[j]) >= 0);
      });
      return;
    }
    state.answered = true;
    Array.prototype.forEach.call(document.querySelectorAll('.option'), function (b, j) {
      var l = LETTERS[j];
      b.classList.add('locked');
      if (q.a.indexOf(l) >= 0) b.classList.add('correct');
      if (l === L && q.a.indexOf(l) < 0) b.classList.add('wrong');
    });
    finish(L === q.a, '你选择了 ' + L + '，正确答案是 ' + q.a + '。');
  }

  function submitMulti() {
    var q = current();
    if (!q || state.answered) return;
    if (!state.picked.length) { flash('请先选择答案', 'info'); return; }
    state.answered = true;
    var picked = state.picked.slice().sort().join('');
    var answer = q.a.split('').sort().join('');
    Array.prototype.forEach.call(document.querySelectorAll('.option'), function (b, j) {
      var l = LETTERS[j];
      b.classList.add('locked');
      b.classList.remove('picked');
      if (q.a.indexOf(l) >= 0) b.classList.add('correct');
      else if (state.picked.indexOf(l) >= 0) b.classList.add('wrong');
    });
    finish(picked === answer, '你选择了 ' + picked + '，正确答案是 ' + q.a + '。');
  }

  function renderJudge(q) {
    var row = el('div', 'judge-row');
    [['对', '正确'], ['错', '错误']].forEach(function (pair) {
      var b = el('button', 'judge-btn', pair[1]);
      b.dataset.v = pair[0];
      b.addEventListener('click', function () { pickJudge(pair[0]); });
      row.appendChild(b);
    });
    $('qArea').appendChild(row);
  }

  function pickJudge(v) {
    var q = current();
    if (!q || state.answered) return;
    state.answered = true;
    Array.prototype.forEach.call(document.querySelectorAll('.judge-btn'), function (b) {
      b.classList.add('locked');
      if (b.dataset.v === q.a) b.classList.add('correct');
      else if (b.dataset.v === v) b.classList.add('wrong');
    });
    var txt = function (x) { return x === '对' ? '正确' : '错误'; };
    finish(v === q.a, '你选择了「' + txt(v) + '」，正确答案是「' + txt(q.a) + '」。');
  }

  function renderFill(q) {
    var box = el('div', 'fill-box');
    q.a.forEach(function (_, i) {
      var row = el('div', 'fill-row');
      row.appendChild(el('span', 'idx', q.a.length > 1 ? '第 ' + (i + 1) + ' 空' : '答案'));
      var inp = document.createElement('input');
      inp.type = 'text';
      inp.placeholder = '请输入答案';
      inp.autocomplete = 'off';
      inp.dataset.i = i;
      inp.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); submitFill(); }
      });
      row.appendChild(inp);
      box.appendChild(row);
    });
    $('qArea').appendChild(box);

    var row = el('div', 'btn-row');
    var btn = el('button', 'btn primary', '提交答案');
    btn.addEventListener('click', submitFill);
    row.appendChild(btn);
    $('qArea').appendChild(row);
  }

  function accept(input, answer) {
    return core.accepts(input, answer);
  }

  function submitFill() {
    var q = current();
    if (!q || state.answered) return;
    var inputs = $('qArea').querySelectorAll('input');
    var allOk = true;
    Array.prototype.forEach.call(inputs, function (inp, i) {
      var ok = accept(inp.value, q.a[i]);
      inp.classList.add(ok ? 'ok' : 'bad');
      inp.disabled = true;
      if (!ok) {
        allOk = false;
        var exp = el('span', 'expected', '应为：' + q.a[i]);
        inp.parentNode.appendChild(exp);
      }
    });
    state.answered = true;
    finish(allOk, '正确答案：' + q.a.join(' ｜ '));
  }

  function renderShort(q) {
    var row = el('div', 'btn-row');
    var btn = el('button', 'btn primary', '显示参考答案');
    btn.addEventListener('click', function () {
      btn.disabled = true;
      var answerLanguage = code.languageOf(q.a, true);
      if (answerLanguage) {
        $('qArea').appendChild(buildCode(q.a, answerLanguage, '参考答案'));
      } else {
        var box = el('div', 'short-answer');
        box.appendChild(el('span', 'label', '参考答案'));
        box.appendChild(document.createTextNode(q.a));
        $('qArea').appendChild(box);
      }

      var self = el('div', 'btn-row');
      var yes = el('button', 'btn', '我答对了');
      var no = el('button', 'btn', '没答对');
      yes.addEventListener('click', function () { markSelf(true, self); });
      no.addEventListener('click', function () { markSelf(false, self); });
      self.appendChild(yes);
      self.appendChild(no);
      $('qArea').appendChild(self);
      flash('对照参考答案自评，结果会计入统计。', 'info');
    });
    row.appendChild(btn);
    $('qArea').appendChild(row);
  }

  function markSelf(ok, row) {
    var q = current();
    if (!q) return;
    state.answered = true;
    row.remove();
    finish(ok, ok ? '已记为答对。' : '已记为答错，可回看参考答案。');
  }

  /* ---------------- 反馈与计分 ---------------- */

  function finish(ok, detail) {
    var q = current();
    if (!q) return;
    records[q.id] = { ok: ok, ts: Date.now() };
    if (ok && cfg.onlyWrong) state.removeOnNext = q.id;
    saveRecords();
    updateStats();

    var fb = $('qFeedback');
    fb.hidden = false;
    fb.className = 'feedback ' + (ok ? 'ok' : 'no');
    fb.innerHTML = '';

    var title = el('span', 'ans', ok ? '✓ 回答正确' : '✗ 回答错误');
    fb.appendChild(title);
    if (detail) fb.appendChild(el('span', '', detail));

    if (!ok) {
      var fix = el('button', 'btn fix', '这次算我对');
      fix.addEventListener('click', function () {
        records[q.id] = { ok: true, ts: Date.now() };
        saveRecords();
        updateStats();
        if (cfg.onlyWrong) state.removeOnNext = q.id;
        fb.className = 'feedback info';
        fb.innerHTML = '';
        fb.appendChild(el('span', 'ans', '已改判为答对，继续加油。'));
      });
      fb.appendChild(fix);
    }

    var next = el('button', 'btn primary', '下一题');
    next.addEventListener('click', goNext);
    fb.appendChild(next);
  }

  function flash(msg, kind) {
    var fb = $('qFeedback');
    fb.hidden = false;
    fb.className = 'feedback ' + (kind || 'info');
    fb.innerHTML = '';
    fb.appendChild(el('span', '', msg));
  }

  /* ---------------- 导航 ---------------- */

  function discardPendingQuestion() {
    if (state.removeOnNext == null) return false;
    var removeId = state.removeOnNext;
    var oldIdx = state.idx;
    state.removeOnNext = null;
    state.pool = state.pool.filter(function (id) { return id !== removeId; });
    state.answered = false;
    state.picked = [];
    if (!state.pool.length) {
      state.idx = 0;
      render();
      flash('错题已经全部清空，切换题库或关闭“只练错题”继续练习。', 'info');
      return true;
    }
    state.idx = Math.min(oldIdx, state.pool.length - 1);
    return true;
  }

  function goNext() {
    if (!state.pool.length) return;
    if (discardPendingQuestion()) {
      if (!state.pool.length) return;
      render();
      return;
    }
    if (state.idx + 1 >= state.pool.length) {
      state.idx = 0;
      if (cfg.mode === 'random') {
        var ids = state.pool.slice();
        shuffle(ids);
        state.pool = ids;
      }
      state.answered = false;
      state.picked = [];
      render();
      flash('本组题目已全部练完，又从第 1 题重新开始。', 'info');
      return;
    }
    state.idx++;
    state.answered = false;
    state.picked = [];
    render();
  }

  function goPrev() {
    if (!state.pool.length) return;
    if (discardPendingQuestion() && !state.pool.length) return;
    state.idx = (state.idx - 1 + state.pool.length) % state.pool.length;
    state.answered = false;
    state.picked = [];
    render();
  }

  function goRandom() {
    if (!state.pool.length) return;
    if (discardPendingQuestion() && !state.pool.length) return;
    var i = state.idx;
    if (state.pool.length > 1) {
      while (i === state.idx) i = Math.floor(Math.random() * state.pool.length);
    } else { i = 0; }
    state.idx = i;
    state.answered = false;
    state.picked = [];
    render();
  }

  /* ---------------- 事件绑定 ---------------- */

  $('modeSeg').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    cfg.mode = b.dataset.mode;
    saveCfg();
    renderSeg();
    refreshPool();
  });

  $('onlyWrong').addEventListener('change', function (e) {
    cfg.onlyWrong = e.target.checked;
    saveCfg();
    refreshPool();
  });

  $('resetBtn').addEventListener('click', function () {
    if (!confirm('确定要清空所有练习记录吗？此操作不可撤销。')) return;
    records = {};
    saveRecords();
    updateStats();
    refreshPool();
  });

  var sidebar = $('sidebar');
  var menuBtn = $('menuBtn');
  function setMenuState(open) {
    sidebar.classList.toggle('open', open);
    $('scrim').classList.toggle('show', open);
    document.body.classList.toggle('menu-open', open);
    menuBtn.setAttribute('aria-expanded', String(open));
    sidebar.setAttribute('aria-hidden', String(!open));
  }
  function openMenu() {
    setMenuState(true);
    $('closeMenu').focus();
  }
  function closeMenu() {
    var wasOpen = sidebar.classList.contains('open');
    setMenuState(false);
    if (wasOpen) menuBtn.focus();
  }
  menuBtn.addEventListener('click', openMenu);
  $('closeMenu').addEventListener('click', closeMenu);
  $('scrim').addEventListener('click', closeMenu);

  $('nextBtn').addEventListener('click', goNext);
  $('prevBtn').addEventListener('click', goPrev);
  $('randBtn').addEventListener('click', goRandom);

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closeMenu(); return; }
    var target = e.target;
    var tag = (target.tagName || '').toUpperCase();
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) return;
    if ((tag === 'BUTTON' || tag === 'A') && (e.key === 'Enter' || e.key === ' ')) return;
    if (sidebar.classList.contains('open')) return;
    var q = current();
    if (!q) return;
    var k = e.key.toUpperCase();

    if (e.key === 'Enter') {
      e.preventDefault();
      if (state.answered) goNext();
      else if (q.t === 'choice' && q.a.length > 1) submitMulti();
      else if (q.t === 'short') {
        var b = $('qArea').querySelector('button.btn.primary');
        if (b) b.click();
      }
      return;
    }

    if (q.t === 'choice' && !state.answered && LETTERS.indexOf(k) >= 0) {
      var i = LETTERS.indexOf(k);
      if (i < q.o.length) pickOption(i);
    } else if (q.t === 'judge' && !state.answered) {
      if (k === 'A' || k === '1') pickJudge('对');
      if (k === 'B' || k === '2') pickJudge('错');
    }
  });

  /* ---------------- 启动 ---------------- */

  function init() {
    sidebar.setAttribute('aria-hidden', String(window.matchMedia('(max-width: 900px)').matches));
    $('onlyWrong').checked = cfg.onlyWrong;
    renderChips();
    renderSeg();
    updateStats();
    buildPool();
    render();
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('./sw.js').catch(function () {});
      });
    }
  }

  init();
})();
