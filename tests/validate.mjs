import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const root = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const core = require('../assets/core.js');
const dataSource = fs.readFileSync(path.join(root, 'assets', 'data.js'), 'utf8');
const sandbox = { window: {} };
vm.runInNewContext(dataSource, sandbox, { filename: 'assets/data.js' });
const questions = sandbox.window.QUESTIONS;

test('question data has the expected shape and unique IDs', () => {
  assert.equal(questions.length, 550);
  const ids = new Set();
  const counts = { choice: 0, judge: 0, fill: 0, short: 0 };

  questions.forEach((question, index) => {
    assert.equal(question.id, index);
    assert.ok(!ids.has(question.id), `duplicate ID: ${question.id}`);
    ids.add(question.id);
    assert.ok(question.src && question.q);
    assert.ok(Object.hasOwn(counts, question.t));
    counts[question.t] += 1;

    if (question.t === 'choice') {
      assert.ok(Array.isArray(question.o) && question.o.length >= 2);
      assert.match(question.a, /^[A-F]+$/);
      question.a.split('').forEach((letter) => {
        assert.ok(letter.charCodeAt(0) - 65 < question.o.length);
      });
    } else if (question.t === 'judge') {
      assert.ok(question.a === '对' || question.a === '错');
    } else if (question.t === 'fill') {
      assert.ok(Array.isArray(question.a) && question.a.length > 0);
      assert.ok(question.a.every((answer) => String(answer).trim()));
    } else {
      assert.ok(typeof question.a === 'string' && question.a.trim());
    }
  });

  assert.deepEqual(counts, { choice: 231, judge: 120, fill: 81, short: 118 });
});

test('fill answers accept alternatives without accepting arbitrary substrings', () => {
  assert.equal(core.accepts(' .class ', '.class （或字节码）'), true);
  assert.equal(core.accepts('字节码', '.class （或字节码）'), true);
  assert.equal(core.accepts('最终方法', '最终方法 (或 abstract方法、final方法)'), true);
  assert.equal(core.accepts('final方法', '最终方法 (或 abstract方法、final方法)'), true);
  assert.equal(core.accepts('9-i', 'a.length-1-i或 9-i'), true);
  assert.equal(core.accepts('数据库', '关系数据库'), false);
  assert.equal(core.accepts('add', 'int add(int a,int b)'), false);
  assert.equal(core.accepts('int add(int a,int b)', 'int add(int a,int b)'), true);
  assert.equal(core.accepts('.class（', '.class （或字节码）'), false);
  assert.equal(core.accepts('ＪＡＶＡ', 'java'), true);
});

test('manifest and service worker shell reference existing files', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  assert.equal(manifest.start_url, './');
  assert.ok(manifest.icons.length >= 2);

  const worker = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  const shell = worker.match(/var APP_SHELL = \[([\s\S]*?)\];/);
  assert.ok(shell);
  shell[1].match(/\.\/[^']+/g).forEach((asset) => {
    const file = asset.split('?')[0];
    assert.ok(fs.existsSync(path.join(root, file)), `missing cached file: ${asset}`);
  });
});
