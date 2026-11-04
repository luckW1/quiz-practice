(function (root) {
  'use strict';

  function normalizeText(value) {
    var text = String(value == null ? '' : value);
    return typeof text.normalize === 'function' ? text.normalize('NFKC') : text;
  }

  function normalizeAnswer(value) {
    return normalizeText(value)
      .replace(/[\s\u3000]/g, '')
      .replace(/[，,。．.；;、]+$/, '')
      .replace(/[“”"'']/g, '')
      .toLowerCase();
  }

  function answerVariants(answer) {
    var values = [];
    function add(value) {
      var normalized = normalizeAnswer(value);
      var open = (normalized.match(/\(/g) || []).length;
      var close = (normalized.match(/\)/g) || []).length;
      if (normalized && open === close && values.indexOf(normalized) < 0) values.push(normalized);
    }

    var raw = String(answer == null ? '' : answer);
    add(raw);
    raw.split(/或者|或/).forEach(add);
    raw.replace(/[（(]([^()（）]*)[）)]/g, function (all, content) {
      if (/[\u3400-\u9fff]/.test(content)) {
        add(raw.replace(all, ''));
        content.split(/或者|或|[、，,]/).forEach(add);
      }
      return all;
    });
    return values;
  }

  function accepts(input, answer) {
    var normalized = normalizeAnswer(input);
    return !!normalized && answerVariants(answer).indexOf(normalized) >= 0;
  }

  var api = {
    normalizeAnswer: normalizeAnswer,
    answerVariants: answerVariants,
    accepts: accepts
  };

  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.QuizCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
