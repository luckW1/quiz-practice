(function (root) {
  'use strict';

  var JAVA_KEYWORDS = new Set([
    'abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch', 'char',
    'class', 'const', 'continue', 'default', 'do', 'double', 'else', 'enum',
    'extends', 'final', 'finally', 'float', 'for', 'goto', 'if', 'implements',
    'import', 'instanceof', 'int', 'interface', 'long', 'native', 'new',
    'package', 'private', 'protected', 'public', 'return', 'short', 'static',
    'strictfp', 'super', 'switch', 'synchronized', 'this', 'throw', 'throws',
    'transient', 'try', 'void', 'volatile', 'while', 'true', 'false', 'null'
  ]);

  var SQL_KEYWORDS = new Set([
    'ADD', 'ALL', 'ALTER', 'AND', 'AS', 'ASC', 'BETWEEN', 'BY', 'CASE',
    'CHAR', 'CHECK', 'COLUMN', 'CREATE', 'CURRENT', 'DATE', 'DEFAULT',
    'DELETE', 'DESC', 'DISTINCT', 'DROP', 'ELSE', 'END', 'ESCAPE', 'EXISTS',
    'FOREIGN', 'FROM', 'GROUP', 'HAVING', 'IN', 'INDEX', 'INNER', 'INSERT',
    'INT', 'INTO', 'IS', 'JOIN', 'KEY', 'LEFT', 'LIKE', 'LIMIT', 'NOT',
    'NULL', 'ON', 'OR', 'ORDER', 'OUTER', 'PRIMARY', 'REFERENCES', 'RIGHT',
    'SELECT', 'SET', 'TABLE', 'THEN', 'UNION', 'UNIQUE', 'UPDATE', 'VALUES',
    'VARCHAR', 'VIEW', 'WHEN', 'WHERE'
  ]);

  var START_PATTERNS = [
    /\b(?:public\s+|private\s+|protected\s+|abstract\s+|final\s+|static\s+)*(?:class|interface)\s+[A-Za-z_$][\w$]*\s*[\{｛]/g,
    /\bpublic\s+[（(]\d+[）)]\s+[A-Za-z_$][\w$]*\s*[\{｛]/g,
    /\b(?:import|package)\s+[A-Za-z_$][\w$.*]*\s*;/g,
    /\b(?:public|private|protected)\s+(?:static\s+)?(?:void|int|long|short|byte|char|float|double|boolean|String|[A-Z][\w$]*)\s+[A-Za-z_$][\w$]*\s*[（(]/g,
    /\b(?:int|long|short|byte|char|float|double|boolean|String|StringBuffer|StringBuilder|Integer|Double|Scanner)\s*(?:\[[^\]]*\]\s*)*[A-Za-z_$][\w$]*\s*(?:=|,|;|\[)/g,
    /\b(?:for|while|switch)\s*[（(]/g,
    /\bdo\s*[\{｛]/g,
    /\b[A-Za-z_$][\w$]*\s*=\s*(?:new\s+)?[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\s*[（(]/g,
    /\b[A-Za-z_$][\w$]*\s*=\s*[A-Za-z_$][\w$]*\s*\[/g
  ];

  var JAVA_TOKEN = /\/\/.*$|\/\*.*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|@[A-Za-z_$][\w$]*|\(\d+\)|\b[A-Za-z_$][\w$]*\b|\b\d+(?:\.\d+)?\b/g;

  function normalizeSyntax(value) {
    var source = String(value == null ? '' : value).replace(/\r\n?/g, '\n');
    var out = '';
    var quote = null;
    var escaped = false;
    var lineComment = false;
    var blockComment = false;
    var map = {
      '｛': '{', '｝': '}', '（': '(', '）': ')', '［': '[', '］': ']',
      '，': ',', '；': ';', '：': ':', '．': '.', '＋': '+', '－': '-',
      '＊': '*', '／': '/', '＝': '=', '＞': '>', '＜': '<', '！': '!',
      '\u3000': ' '
    };

    for (var i = 0; i < source.length; i++) {
      var c = source.charAt(i);
      var next = source.charAt(i + 1);

      if (lineComment) {
        out += c;
        if (c === '\n') lineComment = false;
        continue;
      }
      if (blockComment) {
        out += c;
        if (c === '*' && next === '/') {
          out += '/';
          i++;
          blockComment = false;
        }
        continue;
      }
      if (quote) {
        if (escaped) {
          out += c;
          escaped = false;
        } else if (c === '\\') {
          out += c;
          escaped = true;
        } else if (c === quote || (quote === '"' && c === '”')) {
          out += quote;
          quote = null;
        } else {
          out += c;
        }
        continue;
      }

      if (c === '/' && next === '/') {
        out += '//';
        i++;
        lineComment = true;
      } else if (c === '/' && next === '*') {
        out += '/*';
        i++;
        blockComment = true;
      } else if (c === '"' || c === "'" || c === '“') {
        quote = c === "'" ? "'" : '"';
        out += quote;
      } else {
        out += Object.prototype.hasOwnProperty.call(map, c) ? map[c] : c;
      }
    }
    return out;
  }

  function findProgramStart(raw) {
    var best = -1;
    START_PATTERNS.forEach(function (pattern) {
      pattern.lastIndex = 0;
      var match = pattern.exec(raw);
      if (match && (best < 0 || match.index < best)) best = match.index;
    });
    return best;
  }

  function findProgramEnd(raw, start) {
    var paren = 0;
    var bracket = 0;
    var brace = 0;
    var lastSemicolon = -1;
    var lastBlock = -1;
    var sawBrace = false;
    var quote = null;
    var escaped = false;
    var lineComment = false;
    var blockComment = false;

    for (var i = start; i < raw.length; i++) {
      var c = raw.charAt(i);
      var next = raw.charAt(i + 1);

      if (lineComment) {
        if (c === '\n') lineComment = false;
        continue;
      }
      if (blockComment) {
        if (c === '*' && next === '/') {
          blockComment = false;
          i++;
        }
        continue;
      }
      if (quote) {
        if (escaped) escaped = false;
        else if (c === '\\') escaped = true;
        else if (c === quote || (quote === '"' && c === '”')) quote = null;
        continue;
      }
      if (c === '/' && next === '/') {
        lineComment = true;
        i++;
        continue;
      }
      if (c === '/' && next === '*') {
        blockComment = true;
        i++;
        continue;
      }
      if (c === '"' || c === "'" || c === '“') {
        quote = c === "'" ? "'" : '"';
        continue;
      }
      if (/[\u3400-\u9fff]/.test(c) && paren === 0 && bracket === 0 && brace === 0) {
        var knownEnd = Math.max(lastSemicolon, lastBlock);
        if (knownEnd > start) return knownEnd;
      }

      if (c === '(' || c === '（') paren++;
      else if (c === ')' || c === '）') paren = Math.max(0, paren - 1);
      else if (c === '[' || c === '［') bracket++;
      else if (c === ']' || c === '］') bracket = Math.max(0, bracket - 1);
      else if (c === '{' || c === '｛') {
        brace++;
        sawBrace = true;
      } else if (c === '}' || c === '｝') {
        brace = Math.max(0, brace - 1);
        if (sawBrace && brace === 0) lastBlock = i + 1;
      } else if (c === ';' && paren === 0 && bracket === 0 && brace === 0) {
        lastSemicolon = i + 1;
      }
    }

    if (lastBlock >= 0 || lastSemicolon >= 0) return Math.max(lastBlock, lastSemicolon);
    return sawBrace ? raw.length : -1;
  }

  function isLikelyProgram(code) {
    var normalized = normalizeSyntax(code).trim();
    if (normalized.length < 16) return false;
    if (!/[;{}]/.test(normalized)) return false;
    var signals = normalized.match(/\b(?:class|interface|import|package|public|private|protected|static|final|void|int|long|short|byte|char|float|double|boolean|String|StringBuffer|StringBuilder|Integer|Double|Scanner|for|while|do|switch|if|else|return|new|System)\b/g);
    return !!signals && signals.length > 0;
  }

  function cleanText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function extractProgram(raw) {
    var source = String(raw == null ? '' : raw);
    var start = findProgramStart(source);
    if (start < 0) return null;
    var end = findProgramEnd(source, start);
    if (end <= start) return null;

    var code = source.slice(start, end);
    if (!isLikelyProgram(code)) return null;

    return {
      before: cleanText(source.slice(0, start)),
      code: code.trim(),
      after: cleanText(source.slice(end)).replace(/^[，,。．.；;、\s]+/, '')
    };
  }

  function scanBraces(line) {
    var delta = 0;
    var quote = null;
    var escaped = false;
    for (var i = 0; i < line.length; i++) {
      var c = line.charAt(i);
      if (quote) {
        if (escaped) escaped = false;
        else if (c === '\\') escaped = true;
        else if (c === quote) quote = null;
        continue;
      }
      if (c === '"' || c === "'") {
        quote = c;
        continue;
      }
      if (c === '/' && line.charAt(i + 1) === '/') break;
      if (c === '{') delta++;
      else if (c === '}') delta--;
    }
    return delta;
  }

  function transformCodeLine(line, transform) {
    var out = '';
    var buffer = '';
    var quote = null;
    var escaped = false;

    for (var i = 0; i < line.length; i++) {
      var c = line.charAt(i);
      if (quote) {
        out += c;
        if (escaped) escaped = false;
        else if (c === '\\') escaped = true;
        else if (c === quote) quote = null;
      } else if (c === '"' || c === "'") {
        if (buffer) out += transform(buffer);
        buffer = '';
        quote = c;
        out += c;
      } else if (c === '/' && line.charAt(i + 1) === '/') {
        if (buffer) out += transform(buffer);
        return out + line.slice(i);
      } else {
        buffer += c;
      }
    }
    if (buffer) out += transform(buffer);
    return out;
  }

  function spaceJavaLine(line) {
    return transformCodeLine(line, function (part) {
      return part
        .replace(/\s+/g, ' ')
        .replace(/(?<![=!<>+\-*/%])\s*=\s*(?!=)/g, ' = ')
        .replace(/\s*([+\-*/%]=)\s*/g, ' $1 ')
        .replace(/\s*(==|!=|<=|>=|&&|\|\||->)\s*/g, ' $1 ')
        .replace(/(?<![<>!=])\s*([<>])\s*(?![=>])/g, ' $1 ')
        .replace(/\s*,\s*/g, ', ')
        .replace(/\s*;\s*/g, '; ')
        .replace(/\s+\[\s*\]/g, '[]');
    }).replace(/\s+/g, ' ').trim();
  }

  function reindent(lines) {
    var indent = 0;
    var out = [];
    lines.forEach(function (raw) {
      var line = String(raw).replace(/\t/g, '    ').trim();
      if (!line) {
        if (out.length && out[out.length - 1] !== '') out.push('');
        return;
      }
      line = spaceJavaLine(line)
        .replace(/\b(if|for|while|switch|catch|synchronized)\(/g, '$1 (')
        .replace(/\bdo\{/g, 'do {')
        .replace(/\}(while|else|catch|finally)\b/g, '} $1')
        .replace(/(\S)\{$/, '$1 {');
      var leadingClose = (line.match(/^\}+/) || [''])[0].length;
      if (leadingClose) indent = Math.max(0, indent - leadingClose);
      out.push('    '.repeat(indent) + line);
      var delta = scanBraces(line) + leadingClose;
      indent = Math.max(0, indent + delta);
    });
    while (out.length && out[out.length - 1] === '') out.pop();
    return out.join('\n');
  }

  function expandCompactJava(source) {
    var out = '';
    var buffer = '';
    var paren = 0;
    var bracket = 0;
    var quote = null;
    var escaped = false;
    var lineComment = false;
    var blockComment = false;
    var braceTypes = [];

    function flush() {
      var line = buffer.trim();
      if (line) out += line + '\n';
      buffer = '';
    }

    for (var i = 0; i < source.length; i++) {
      var c = source.charAt(i);
      var next = source.charAt(i + 1);

      if (lineComment) {
        buffer += c;
        if (c === '\n') {
          lineComment = false;
          flush();
        }
        continue;
      }
      if (blockComment) {
        buffer += c;
        if (c === '*' && next === '/') {
          buffer += '/';
          i++;
          blockComment = false;
        }
        continue;
      }
      if (quote) {
        buffer += c;
        if (escaped) escaped = false;
        else if (c === '\\') escaped = true;
        else if (c === quote) quote = null;
        continue;
      }
      if (c === '/' && next === '/') {
        buffer += '//';
        i++;
        lineComment = true;
      } else if (c === '/' && next === '*') {
        buffer += '/*';
        i++;
        blockComment = true;
      } else if (c === '"' || c === "'") {
        quote = c;
        buffer += c;
      } else if (c === '\n') {
        if (buffer.trim()) flush();
      } else if (c === '(') {
        paren++;
        buffer += c;
      } else if (c === ')') {
        paren = Math.max(0, paren - 1);
        buffer += c;
      } else if (c === '[') {
        bracket++;
        buffer += c;
      } else if (c === ']') {
        bracket = Math.max(0, bracket - 1);
        buffer += c;
      } else if (c === '{') {
        var previous = buffer.replace(/\s+$/, '').slice(-1);
        var initializer = previous === '=' || previous === ']' || previous === ',' || previous === '{';
        braceTypes.push(initializer ? 'expression' : 'block');
        buffer += c;
        if (!initializer && paren === 0) flush();
      } else if (c === '}') {
        var type = braceTypes.pop() || 'block';
        buffer += c;
        if (type === 'block' && paren === 0) flush();
      } else if (c === ';' && paren === 0 && bracket === 0) {
        buffer += c;
        flush();
      } else {
        buffer += c;
      }
    }
    flush();
    return out.trim();
  }

  function formatJava(value) {
    var normalized = normalizeSyntax(value).trim();
    if (!normalized) return '';
    var source = normalized.indexOf('\n') >= 0 ? normalized : expandCompactJava(normalized);
    return reindent(source.split('\n'));
  }

  function transformUnquoted(source, transform) {
    var out = '';
    var buffer = '';
    var quote = false;
    for (var i = 0; i < source.length; i++) {
      var c = source.charAt(i);
      if (c === "'") {
        if (!quote) {
          if (buffer) out += transform(buffer);
          buffer = '';
          quote = true;
        }
        out += c;
        if (quote && source.charAt(i + 1) === "'") {
          out += "'";
          i++;
        } else if (quote) {
          quote = false;
        }
      } else if (quote) {
        out += c;
      } else {
        buffer += c;
      }
    }
    if (buffer) out += transform(buffer);
    return out;
  }

  function formatSql(value) {
    var normalized = normalizeSyntax(value).trim();
    var clauseWords = '(INSERT\\s+INTO|DELETE\\s+FROM|CREATE\\s+TABLE|DROP\\s+TABLE|ALTER\\s+TABLE|GROUP\\s+BY|ORDER\\s+BY|UNION\\s+ALL|SELECT|FROM|WHERE|HAVING|LIMIT|VALUES|SET|UPDATE|UNION)';
    var formatted = transformUnquoted(normalized, function (part) {
      return part
        .replace(/\s+/g, ' ')
        .replace(/\b(select|insert|into|update|delete|from|where|group|by|order|having|limit|values|set|create|table|drop|alter|union|all|and|or|not|null|is|in|like|between|distinct|as|join|left|right|inner|outer|on|primary|key|foreign|references|check|default|desc|asc)\b/gi, function (word) {
          return word.toUpperCase();
        })
        .replace(/\b([a-e])\.\s*(?=(?:SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b)/gi, '\n-- $1.\n')
        .replace(/\s*或者\s*(?=SELECT)/g, '\n-- 或者\n')
        .replace(new RegExp('\\s+' + clauseWords, 'g'), '\n$1')
        .replace(/;\s*/g, ';\n')
        .replace(/,\s*/g, ', ')
        .replace(/\s*\+\s*/g, ' + ')
        .replace(/\s*(>=|<=|<>|!=|==)\s*/g, ' $1 ')
        .replace(/(?<![<>!=])\s*=\s*(?!=)/g, ' = ')
        .replace(/(?<![<>!=])\s*>\s*(?!=)/g, ' > ')
        .replace(/(?<![<>!=])\s*<\s*(?![=>])/g, ' < ');
    });

    var lines = formatted.split('\n').map(function (line) { return line.trim(); }).filter(Boolean);
    return lines.map(function (line) {
      if (/^(FROM|WHERE|GROUP BY|ORDER BY|HAVING|LIMIT|VALUES|SET|UNION|LEFT|RIGHT|INNER|OUTER)\b/.test(line)) {
        return '  ' + line;
      }
      return line;
    }).join('\n');
  }

  function languageOf(value, answerMode) {
    var text = normalizeSyntax(value).trim();
    if (!text) return null;
    if (/^(?:[A-Za-z]\.\s*)?(?:SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|CREATE\s+TABLE|DROP\s+TABLE|ALTER\s+TABLE)\b/i.test(text)) {
      return 'sql';
    }
    if (findProgramStart(text) >= 0 || (answerMode && /[{};]/.test(text) && /\b(?:class|public|private|protected|void|int|String|new|System)\b/.test(text))) {
      return 'java';
    }
    return null;
  }

  function isInlineCode(value) {
    var text = String(value == null ? '' : value).trim();
    if (!text || text.length > 260) return false;
    if (languageOf(text) === 'sql') return true;
    return /[;{}]|==|!=|\+\+|--|\[\]|\.\w+\s*\(/.test(text) &&
      /\b(?:boolean|byte|char|double|float|int|long|short|String|System|new|void|class|public|private|protected|static|final|return|for|while|if|else|true|false|null)\b/.test(text);
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function highlightLine(line, language) {
    var lang = language === 'sql' ? 'sql' : 'java';
    var keywords = lang === 'sql' ? SQL_KEYWORDS : JAVA_KEYWORDS;
    var out = '';
    var last = 0;
    var match;
    JAVA_TOKEN.lastIndex = 0;

    while ((match = JAVA_TOKEN.exec(line))) {
      var token = match[0];
      var cls = '';
      if (token.slice(0, 2) === '//' || token.slice(0, 2) === '/*') cls = 'cm';
      else if (token.charAt(0) === '"' || token.charAt(0) === "'") cls = 'str';
      else if (/^\(\d+\)$/.test(token)) cls = 'blank';
      else if (/^\d/.test(token)) cls = 'num';
      else if (token.charAt(0) === '@') cls = 'fn';
      else if (keywords.has(lang === 'sql' ? token.toUpperCase() : token)) cls = 'kw';
      else if (lang === 'java' && /^[A-Z]/.test(token)) cls = 'type';
      else if (line.slice(match.index + token.length).match(/^\s*\(/)) cls = 'fn';

      out += escapeHtml(line.slice(last, match.index));
      if (cls) out += '<span class="' + cls + '">' + escapeHtml(token) + '</span>';
      else out += escapeHtml(token);
      last = match.index + token.length;
    }
    return out + escapeHtml(line.slice(last));
  }

  function formatCode(value, language) {
    return language === 'sql' ? formatSql(value) : formatJava(value);
  }

  var api = {
    normalizeSyntax: normalizeSyntax,
    extractProgram: extractProgram,
    formatCode: formatCode,
    formatJava: formatJava,
    formatSql: formatSql,
    languageOf: languageOf,
    isInlineCode: isInlineCode,
    highlightLine: highlightLine,
    escapeHtml: escapeHtml
  };

  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.QuizCode = api;
})(typeof window !== 'undefined' ? window : globalThis);
