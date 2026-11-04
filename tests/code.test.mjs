import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const root = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const code = require('../assets/code.js');
const sandbox = { window: {} };
vm.runInNewContext(
  require('node:fs').readFileSync(path.join(root, 'assets', 'data.js'), 'utf8'),
  sandbox,
  { filename: 'assets/data.js' }
);
const questions = sandbox.window.QUESTIONS;

test('all multiline practice programs are extracted from the question stem', () => {
  questions.slice(201, 221).forEach((question) => {
    const program = code.extractProgram(question.q);
    assert.ok(program, `question ${question.id} was not extracted`);
    assert.match(program.code, /\b(?:class|Cat)\b/);
    assert.ok(program.before.length > 0);
  });
});

test('compact code is separated from prose and formatted with indentation', () => {
  const question = questions[39];
  const program = code.extractProgram(question.q);
  assert.ok(program);
  assert.equal(program.before, '下列输出结果是（ ）');
  assert.equal(program.after, '');
  assert.match(program.code, /System\.out\.print/);

  const formatted = code.formatCode(program.code, 'java');
  assert.doesNotMatch(formatted, /[｛｝（）]/);
  assert.match(formatted, /while \( a < 5 \) \{/);
  assert.match(formatted, /\n {4}switch \(a\) \{/);
  assert.match(formatted, /\n {8}case 0:/);
});

test('do-while blocks keep the trailing condition and statement', () => {
  const program = code.extractProgram(questions[41].q);
  assert.ok(program);
  assert.match(program.code, /while\s*\(i<\s*4\);/);
  assert.match(program.code, /System\.out\.println/);
  assert.equal(program.after, '');
});

test('short expressions and array prose are not treated as full programs', () => {
  assert.equal(code.extractProgram(questions[30].q), null);
  assert.equal(code.extractProgram(questions[113].q), null);

  const invalidArrayQuestion = code.extractProgram(questions[193].q);
  assert.ok(invalidArrayQuestion);
  assert.match(invalidArrayQuestion.after, /^来说/);
});

test('SQL answers are normalized into readable clauses', () => {
  const formatted = code.formatSql(
    "select sno,sname from student where ssex='男' and age>18 order by sno desc;"
  );
  assert.equal(
    formatted,
    [
      'SELECT sno, sname',
      '  FROM student',
      "  WHERE ssex = '男' AND age > 18",
      '  ORDER BY sno DESC;'
    ].join('\n')
  );
});

test('lettered SQL subquestions remain readable labels', () => {
  const formatted = code.formatSql('a. CREATE TABLE T(Id INT); b. DELETE FROM T;');
  assert.match(formatted, /^-- a\.\nCREATE TABLE T\(Id INT\);/);
  assert.match(formatted, /\n-- b\.\nDELETE FROM T;/);
});

test('highlighting escapes HTML and marks blanks, strings and keywords', () => {
  const html = code.highlightLine('public String value = "<tag>"; // 填空 (1)', 'java');
  assert.match(html, /class="kw">public/);
  assert.match(html, /class="type">String/);
  assert.match(html, /&lt;tag&gt;/);
  assert.match(html, /class="cm">\/\/ 填空/);
  assert.doesNotMatch(html, /<tag>/);
});
