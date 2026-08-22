import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const raiz = resolve(import.meta.dirname, '..');
const temporario = mkdtempSync(join(tmpdir(), 'divat-semgrep-wrapper-'));
const registro = join(temporario, 'chamadas.log');
const semgrepFalso = join(temporario, 'semgrep');

writeFileSync(semgrepFalso, `#!/bin/sh
printf '%s\\t%s\\n' "\${SEMGREP_ENABLE_VERSION_CHECK-<ausente>}" "$*" >> "${registro}"
if [ "\${1-}" = "--version" ]; then printf '%s\\n' '1.171.0'; fi
`);
chmodSync(semgrepFalso, 0o755);

function executar(...args) {
  const env = { ...process.env, PATH: `${temporario}:${process.env.PATH}` };
  delete env.SEMGREP_ENABLE_VERSION_CHECK;
  const resultado = spawnSync(join(raiz, 'scripts/semgrep.sh'), args, {
    cwd: raiz,
    env,
    encoding: 'utf8',
  });
  assert.equal(resultado.status, 0, resultado.stderr);
}

executar();
executar('--test');
executar('--full');

const chamadas = readFileSync(registro, 'utf8').trim().split('\n');
assert.equal(chamadas.length, 4, chamadas.join('\n'));
assert.match(chamadas[0], /^0\t--version$/, 'version check indireto do modo padrão deve ficar offline');
assert.match(chamadas[1], /^0\tscan /, 'scan padrão deve desativar version check');
assert.match(chamadas[2], /^0\t--test /, '--test deve desativar version check');
assert.match(chamadas[3], /^<ausente>\tscan /, '--full deve preservar o version check online');

console.log('✓ semgrep-wrapper: modos offline sem version check; --full preservado');
