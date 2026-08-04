// check_prazos.mjs — cobra os compromissos com data de scripts/prazos.json.
//
// Roda DIARIAMENTE no db-checks.yml. Acima de `aviso_dias`: silencioso. Abaixo: imprime.
// Abaixo de `erro_dias`: sai 1 e quebra o build.
//
// Por que NÃO está no tests/check.js: o contrato do check.js é ser offline E determinístico.
// Um gate cujo veredito muda com o calendário quebraria essa propriedade — e um `check.js` que
// falha sozinho numa terça de novembro é um gate que se aprende a ignorar.
//
// Uso:  node scripts/check_prazos.mjs
//       DIVAT_HOJE=2026-10-25 node scripts/check_prazos.mjs   # simula uma data

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { lerPrazos, classificar, hojeISO } from './lib/prazos.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let prazos;
try {
  prazos = await lerPrazos(ROOT);
} catch (e) {
  console.error(`✗ ${e.message}`);
  process.exit(1);
}

const hoje = hojeISO();
const vereditos = prazos.map(p => classificar(p, hoje));
const erros = vereditos.filter(v => v.nivel === 'erro');
const avisos = vereditos.filter(v => v.nivel === 'aviso');

for (const v of avisos) console.log(`  ⚠ ${v.mensagem}`);
for (const v of erros) console.error(`  ✗ ${v.mensagem}`);

if (erros.length) {
  console.error(`\n✗ ${erros.length} prazo(s) estourado(s) ou a ponto de estourar (hoje: ${hoje}).`);
  console.error('  Aja no compromisso e atualize `vence_em` em scripts/prazos.json.');
  console.error('  Apagar a entrada também silencia — mas aparece no diff, e é decisão sua assumir.');
  process.exit(1);
}
console.log(`✓ Prazos: ${prazos.length} conferido(s), ${avisos.length} em aviso, nenhum estourado (hoje: ${hoje}).`);
