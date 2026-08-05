'use strict';
/* Modo duplo do scripts/check_data_quality.mjs (Fase 3, 04/08/2026).
   Rode: node check_data_quality.test.js   (ou, melhor, node check.js para rodar tudo).

   Por que existe: o que este teste fixa é a ORDEM — auditor primeiro; se ele falhar, a validade
   do fallback é consultada ANTES de tocar a rede. Perder essa ordem não quebra nada visível: o
   gate continua rodando, só que no dia em que o fallback vencer E a rede estiver ruim ele
   acusaria "erro de rede" em vez de "o fallback expirou" — a mensagem errada exatamente no dia
   em que a certa importa. Defeito assim não aparece em revisão de diff; aparece meses depois,
   como confusão. A prova manual do plano existia, mas guarda que só roda quando alguém lembra é
   a guarda mais fraca possível (foi a lição da Tarefa 7).

   Contrato do check.js respeitado: OFFLINE e sem dependência. O SB_URL do fakeroot aponta para
   127.0.0.1:9, que o fetch recusa como "bad port" (a porta 9 está na lista de portas bloqueadas
   da especificação) — ou seja, nem em caso de REGRESSÃO este teste abre socket nenhum, quanto
   mais alcança o Supabase de produção. Isso importa: o modo de falha que se está guardando é
   justamente "o script vai à rede antes da hora", e um teste que provasse isso indo à rede
   dispararia a varredura de ~116 mil linhas a cada rodada do gate. Técnica do fakeroot +
   binário falso no PATH: a mesma do auditor.test.js e do check_grants.rig.mjs.

   Provado por mutação em 05/08/2026: invertendo a ordem no script (fetch antes de consultar o
   prazo), 5 dos 11 casos ficam vermelhos. */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

let pass = 0, fail = 0;
const fails = [];
function ok(cond, name, detail){
  if (cond){ pass++; console.log('  PASS', name); }
  else { fail++; fails.push(name + (detail ? (' — ' + detail) : '')); console.log('  FAIL', name, detail || ''); }
}

const REAL = path.join(__dirname, '..');
// Marcas de que o script chegou ao `fetch`. Cobrem as três formas que a falha assume conforme o
// ambiente: recusa de conexão (runner limpo), proxy respondendo erro (sandbox) e o caminho em que
// a RPC responde de verdade. Qualquer uma prova que a rede foi tocada.
const MARCA_REDE = /RPC divat_data_quality falhou|fetch failed|ECONNREFUSED|Nem o auditor nem a RPC/;

(async () => {
  const { REFS } = await import('../scripts/lib/auditor.mjs');

  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'dq-test-'));
  const bin = path.join(raiz, 'bin');
  try {
    fs.mkdirSync(path.join(raiz, 'scripts', 'lib'), { recursive: true });
    fs.mkdirSync(bin);
    for (const rel of ['scripts/check_data_quality.mjs', 'scripts/lib/auditor.mjs',
                       'scripts/lib/prazos.mjs', 'scripts/data_quality_baseline.json']) {
      fs.copyFileSync(path.join(REAL, rel), path.join(raiz, rel));
    }
    // app.js falso: o fallback anônimo ainda tira SB_URL/SB_KEY de lá (issue #74 em aberto para
    // este script). Endereço morto de propósito — ver o cabeçalho.
    fs.writeFileSync(path.join(raiz, 'app.js'),
      "const SB_URL = 'http://127.0.0.1:9';\nconst SB_KEY = 'chave-de-teste-nao-e-segredo';\n");
    // prazos.json PRÓPRIO, com data fixa: o teste é sobre a ordem, não sobre a data real. Copiar
    // o do repo faria este teste quebrar no dia em que alguém legitimamente mover o prazo.
    fs.writeFileSync(path.join(raiz, 'scripts', 'prazos.json'), JSON.stringify({
      prazos: [{
        id: 'check_data_quality_fallback',
        descricao: 'remover o fallback anonimo (fixture do teste)',
        vence_em: '2026-11-30', aviso_dias: 30, erro_dias: 0,
        referencia: 'tests/check_data_quality.test.js',
      }],
    }, null, 2) + '\n');

    const script = path.join(raiz, 'scripts', 'check_data_quality.mjs');
    const rodar = (extra = {}) => {
      const env = { ...process.env, ...extra };
      delete env.SUPABASE_PROD_AUDIT_DATABASE_URL;   // o runner do CI tem essa variável; o teste não pode herdá-la
      delete env.SUPABASE_TEST_AUDIT_DATABASE_URL;
      for (const k of ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy']) delete env[k];
      env.NO_PROXY = env.no_proxy = '127.0.0.1,localhost';
      // Reaplica `extra` DEPOIS dos deletes — não é redundância: o caso do auditor disponível
      // passa justamente SUPABASE_PROD_AUDIT_DATABASE_URL, que a linha acima acabou de apagar.
      for (const [k, v] of Object.entries(extra)) env[k] = v;
      const r = spawnSync(process.execPath, [script], { encoding: 'utf8', env, timeout: 30000 });
      return { status: r.status, saida: (r.stdout || '') + (r.stderr || '') };
    };

    console.log('fallback VENCIDO — morre na expiração, antes de qualquer rede');
    const venceu = rodar({ DIVAT_HOJE: '2026-12-01' });
    ok(venceu.status === 1, 'sai 1', String(venceu.status));
    ok(/o fallback anônimo EXPIROU/.test(venceu.saida), 'diz que o fallback expirou', venceu.saida.slice(0, 200));
    ok(/SUPABASE_PROD_AUDIT_DATABASE_URL/.test(venceu.saida),
       'diz POR QUE o auditor não respondeu, citando o NOME da variável', venceu.saida.slice(0, 200));
    ok(!MARCA_REDE.test(venceu.saida) && !/127\.0\.0\.1/.test(venceu.saida),
       'NÃO tocou a rede: a decisão vem antes do fetch', venceu.saida.slice(0, 300));

    console.log('fallback VÁLIDO — avisa e segue para a RPC anônima');
    const valido = rodar({ DIVAT_HOJE: '2026-08-05' });
    ok(/⚠ Auditor indisponível/.test(valido.saida), 'avisa que caiu no fallback', valido.saida.slice(0, 200));
    // `classificar` só imprime a data quando entra na janela de aviso; longe do vencimento a
    // mensagem é "N dia(s) de folga". O que se cobra aqui é que o ⚠ carregue a validade em
    // ALGUMA forma — sem isso o fallback vira caminho sem prazo visível.
    ok(/check_data_quality_fallback: (\d+ dia\(s\) de folga|vence em \d+ dia\(s\) \(\d{4}-\d{2}-\d{2}\))/.test(valido.saida),
       'o aviso diz até quando o fallback vale', valido.saida.slice(0, 200));
    ok(!/EXPIROU/.test(valido.saida), 'não confunde válido com expirado', valido.saida.slice(0, 200));
    ok(MARCA_REDE.test(valido.saida), 'tentou a RPC anônima (a outra direção da ordem)', valido.saida.slice(0, 300));

    console.log('auditor DISPONÍVEL — nem consulta prazo nem toca a rede');
    // psql falso, no PATH: devolve o que a consulta `jsonb_agg` devolveria. A linha em branco
    // antes do JSON é de propósito — o script pega a ÚLTIMA linha não vazia do stdout.
    fs.writeFileSync(path.join(bin, 'psql'),
      `#!${process.execPath}\n`
      + `process.stdout.write('\\n[{"verificacao":"codlinha_orfa","severidade":"erro",`
      + `"qtd":2,"detalhe":"itinerario_teste sem match em tabela_vista_teste"}]\\n');\n`,
      { mode: 0o755 });
    const comAuditor = rodar({
      PATH: `${bin}${path.delimiter}${process.env.PATH}`,
      SUPABASE_PROD_AUDIT_DATABASE_URL: `postgres://divat_auditor_ci:x@db.${REFS.producao}.supabase.co/postgres`,
    });
    ok(!/⚠ Auditor indisponível/.test(comAuditor.saida), 'não cai no fallback', comAuditor.saida.slice(0, 200));
    ok(!MARCA_REDE.test(comAuditor.saida), 'não toca a rede', comAuditor.saida.slice(0, 300));
    // O achado devolvido é justamente o que o baseline do repo já carrega: o gate tem de passar
    // com dívida conhecida (é o invariante do baseline, que esta tarefa não pode desarrumar).
    ok(comAuditor.status === 0, 'passa com a dívida já registrada no baseline',
       `exit ${comAuditor.status}: ${comAuditor.saida.slice(0, 300)}`);
  } finally {
    fs.rmSync(raiz, { recursive: true, force: true });
  }

  console.log('\n==== PLACAR:', pass + '/' + (pass + fail), '====');
  if (fail){ console.log('FALHAS:'); fails.forEach(f => console.log('  -', f)); process.exit(1); }
})();
