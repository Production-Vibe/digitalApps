'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const MODULES_DIR = path.join(__dirname, '..', '..', '..', '..', 'modules');
const TEMP_DIR = path.join(os.tmpdir(), 'digitalapps-check');

function selectedModules() {
  const args = process.argv.slice(2);
  const files = fs.readdirSync(MODULES_DIR).filter(function (f) {
    return f.toLowerCase().endsWith('.md');
  });
  const wanted = args.map(function (a) {
    return a.toLowerCase().startsWith('.') ? a.toLowerCase() : a.toLowerCase() + '.md';
  });
  const selected = files.filter(function (f) {
    return wanted.length === 0 || wanted.indexOf(f.toLowerCase()) !== -1;
  });
  if (selected.length === 0) {
    console.error('No module files found for: ' + args.join(', '));
    process.exit(2);
  }
  return selected;
}

function extractBody(file) {
  var lines = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n').split('\n');
  var body = lines.slice();
  if (body.length && /^```|^#/.test(body[0].trim())) {
    body = body.slice(1);
    if (body.length && body[body.length - 1].trim() === '```') body.pop();
  }
  return body.join('\n');
}

function checkJs(name, content) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
  var target = path.join(TEMP_DIR, name + '.js');
  fs.writeFileSync(target, content);
  var res = spawnSync(process.execPath, ['--check', target], { encoding: 'utf8' });
  return {
    ok: res.status === 0,
    message: (res.stderr || '').trim() || (res.status !== 0 ? 'node --check failed' : '')
  };
}

function replaceInterpolations(src) {
  var out = '';
  var i = 0;
  while (i < src.length) {
    if (src[i] === '$' && src[i + 1] === '{') {
      var depth = 1;
      i += 2;
      while (i < src.length && depth > 0) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') depth--;
        i++;
      }
      out += 'null';
    } else {
      out += src[i];
      i++;
    }
  }
  return out;
}

function extractScripts(body) {
  var blocks = [];
  var re = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  var m;
  while ((m = re.exec(body)) !== null) {
    if (m[1] && m[1].trim().length > 0) blocks.push(m[1]);
  }
  return blocks;
}

var failures = [];
console.log('Checking modules in ' + MODULES_DIR);
selectedModules().forEach(function (file) {
  var full = path.join(MODULES_DIR, file);
  var name = path.basename(full, '.md');
  var body = extractBody(full);
  var main = checkJs(name, body);
  if (!main.ok) failures.push({ name: name, message: main.message });

  var scripts = extractScripts(body);
  scripts.forEach(function (s, i) {
    var r = checkJs(name + '__script' + (i + 1), replaceInterpolations(s));
    if (!r.ok) failures.push({ name: name + ' (script ' + (i + 1) + ')', message: r.message });
  });

  console.log((main.ok ? 'PASS' : 'FAIL') + '  ' + name + (scripts.length ? '  [+' + scripts.length + ' inline script' + (scripts.length > 1 ? 's' : '') + ']' : ''));
});
console.log('');

if (failures.length > 0) {
  console.error(failures.length + ' module(s) FAILED syntax check:');
  failures.forEach(function (f) {
    console.error('--- ' + f.name + ' ---');
    console.error(f.message.split('\n').slice(0, 20).join('\n'));
  });
  process.exit(1);
}

console.log('All modules OK.');