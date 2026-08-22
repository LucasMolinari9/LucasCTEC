'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const smoke = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'check_deploy.mjs'), 'utf8');

assert.match(
  smoke,
  /publicResponses\.get\(['"]\/src\/data\/rest\.mjs['"]\)/,
  'o smoke deve ler a guarda fail-closed do módulo REST publicado, não procurá-la no app.js'
);
assert.match(smoke, /Configuração Supabase ausente para o ambiente de/);
assert.match(smoke, /\.test\(restSource\)/, 'a guarda deve ser verificada no corpo de rest.mjs');
console.log('==== PLACAR: 3/3 ====');
