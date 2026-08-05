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

   Desde a Tarefa 9 ele guarda também a RESOLUÇÃO DO ALVO (issue #74): sem DIVAT_ALVO o script
   morre no topo, antes do auditor, antes do prazo e antes da rede. É a propriedade que impede um
   gate de PR de falar com produção sem ninguém pedir — e ela só vale se for medida, porque um
   default silencioso reintroduzido no meio do arquivo não aparece em revisão de diff.

   Contrato do check.js respeitado: OFFLINE e sem dependência. O url do ambiente de fakeroot aponta
   para 127.0.0.1:9, que o fetch recusa como "bad port" (a porta 9 está na lista de portas bloqueadas
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
                       'scripts/lib/prazos.mjs', 'scripts/lib/ambiente.mjs',
                       'scripts/data_quality_baseline.json']) {
      fs.copyFileSync(path.join(REAL, rel), path.join(raiz, rel));
    }
    // Alvo vem de DIVAT_ALVO + scripts/ambientes.json (issue #74), não mais de um app.js falso —
    // nada mais lê o app.js aqui, por isso ele saiu do fakeroot. Os dois endereços são mortos de
    // propósito (ver o cabeçalho): nem em caso de regressão este teste alcança um Supabase real.
    fs.writeFileSync(path.join(raiz, 'scripts', 'ambientes.json'), JSON.stringify({
      nota: 'fixture do teste — nenhum destes endereços existe',
      ambientes: {
        teste:    { ref: 'rig-teste', url: 'http://127.0.0.1:9', key: 'chave-de-teste-nao-e-segredo' },
        producao: { ref: 'rig-prod',  url: 'http://127.0.0.1:9', key: 'chave-de-teste-nao-e-segredo' },
      },
    }, null, 2) + '\n');
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
    // `alvo` separado de `extra` para o caso da AUSÊNCIA poder pedir explicitamente `null` — o
    // runner pode ter DIVAT_ALVO no ambiente e não se pode herdar isso sem querer.
    const rodar = (extra = {}, alvo = 'teste') => {
      const env = { ...process.env, ...extra };
      delete env.SUPABASE_PROD_AUDIT_DATABASE_URL;   // o runner do CI tem essa variável; o teste não pode herdá-la
      delete env.SUPABASE_TEST_AUDIT_DATABASE_URL;
      for (const k of ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy']) delete env[k];
      env.NO_PROXY = env.no_proxy = '127.0.0.1,localhost';
      // Reaplica `extra` DEPOIS dos deletes — não é redundância: o caso do auditor disponível
      // passa justamente SUPABASE_PROD_AUDIT_DATABASE_URL, que a linha acima acabou de apagar.
      for (const [k, v] of Object.entries(extra)) env[k] = v;
      if (alvo === null) delete env.DIVAT_ALVO; else env.DIVAT_ALVO = alvo;
      const r = spawnSync(process.execPath, [script], { encoding: 'utf8', env, timeout: 30000 });
      return { status: r.status, saida: (r.stdout || '') + (r.stderr || '') };
    };

    console.log('fallback VENCIDO — morre na expiração, antes de qualquer rede');
    const venceu = rodar({ DIVAT_HOJE: '2026-12-01' });
    ok(venceu.status === 1, 'sai 1', String(venceu.status));
    ok(/o fallback anônimo EXPIROU/.test(venceu.saida), 'diz que o fallback expirou', venceu.saida.slice(0, 200));
    // O NOME da variável segue o ALVO — aqui `teste`, o gatilho de PR. É o que se quer ler num
    // run vermelho: "faltou a credencial DESTE ambiente", não a de um ambiente que ninguém pediu.
    ok(/SUPABASE_TEST_AUDIT_DATABASE_URL/.test(venceu.saida),
       'diz POR QUE o auditor não respondeu, citando o NOME da variável do alvo', venceu.saida.slice(0, 200));
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

    console.log('auditor DISPONÍVEL (cron, alvo=producao) — nem consulta prazo nem toca a rede');
    // psql falso, no PATH: devolve o que a consulta `jsonb_agg` devolveria. A linha em branco
    // antes do JSON é de propósito — o script pega a ÚLTIMA linha não vazia do stdout. Ele também
    // REGISTRA o PGHOST recebido: é por PGHOST que se descobre com qual banco o auditor falou,
    // porque a URL de conexão nunca aparece na linha de comando nem no log (auditor.mjs).
    const REGISTRO = path.join(raiz, 'pghost.log');
    fs.writeFileSync(path.join(bin, 'psql'),
      `#!${process.execPath}\n`
      + `require('fs').appendFileSync(${JSON.stringify(REGISTRO)}, (process.env.PGHOST || '(sem PGHOST)') + '\\n');\n`
      + `process.stdout.write('\\n[{"verificacao":"codlinha_orfa","severidade":"erro",`
      + `"qtd":2,"detalhe":"itinerario_teste sem match em tabela_vista_teste"}]\\n');\n`,
      { mode: 0o755 });
    const comPath = { PATH: `${bin}${path.delimiter}${process.env.PATH}` };
    const urlDe = amb => `postgres://divat_auditor_ci:x@db.${REFS[amb]}.supabase.co/postgres`;

    // O caminho do auditor em produção é o do CRON — e é com DIVAT_ALVO=producao que ele roda.
    const comAuditor = rodar({ ...comPath, SUPABASE_PROD_AUDIT_DATABASE_URL: urlDe('producao') }, 'producao');
    ok(!/⚠ Auditor indisponível/.test(comAuditor.saida), 'não cai no fallback', comAuditor.saida.slice(0, 200));
    ok(!MARCA_REDE.test(comAuditor.saida), 'não toca a rede', comAuditor.saida.slice(0, 300));
    // O achado devolvido é justamente o que o baseline do repo já carrega: o gate tem de passar
    // com dívida conhecida (é o invariante do baseline, que esta tarefa não pode desarrumar).
    ok(comAuditor.status === 0, 'passa com a dívida já registrada no baseline',
       `exit ${comAuditor.status}: ${comAuditor.saida.slice(0, 300)}`);
    ok(fs.readFileSync(REGISTRO, 'utf8').trim() === `db.${REFS.producao}.supabase.co`,
       'no cron o auditor conecta no ref de PRODUÇÃO', fs.readFileSync(REGISTRO, 'utf8'));

    console.log('DIVAT_ALVO=teste — o auditor segue o alvo, não um literal (issue #74)');
    // A propriedade que este caso fixa: o ALVO governa os DOIS caminhos do modo duplo. Até
    // 05/08/2026 o `conectarAuditor` recebia 'producao' fixo — o log dizia `· Alvo: teste` e o
    // psql conectava em produção. Sem este caso, o mesmo vício volta na próxima refatoração.
    fs.writeFileSync(REGISTRO, '');
    const alvoTeste = rodar({
      ...comPath,
      SUPABASE_TEST_AUDIT_DATABASE_URL: urlDe('teste'),
      SUPABASE_PROD_AUDIT_DATABASE_URL: urlDe('producao'),   // presente de propósito: é a armadilha
    }, 'teste');
    const host = fs.readFileSync(REGISTRO, 'utf8').trim();
    ok(host === `db.${REFS.teste}.supabase.co`, 'conecta no ref de TESTE', host || '(psql não foi chamado)');
    ok(!host.includes(REFS.producao), 'NÃO conecta em produção, mesmo com a credencial de prod no ambiente', host);
    ok(/· Alvo: teste/.test(alvoTeste.saida) && !/⚠ Auditor indisponível/.test(alvoTeste.saida),
       'usou o auditor de teste e o log não mente sobre o alvo', alvoTeste.saida.slice(0, 300));

    console.log('DIVAT_ALVO=teste sem a credencial de teste — cai no fallback, não em produção');
    // O estado de HOJE no CI: só a credencial de produção existe. A ausência da de teste não pode
    // virar um atalho para produção; o desenho da Tarefa 8 já trata ausência — é o fallback.
    fs.writeFileSync(REGISTRO, '');
    const soProd = rodar({ ...comPath, SUPABASE_PROD_AUDIT_DATABASE_URL: urlDe('producao'),
                           DIVAT_HOJE: '2026-08-05' }, 'teste');
    ok(fs.readFileSync(REGISTRO, 'utf8').trim() === '', 'o psql NÃO é chamado', fs.readFileSync(REGISTRO, 'utf8'));
    ok(/⚠ Auditor indisponível \(SUPABASE_TEST_AUDIT_DATABASE_URL não configurado/.test(soProd.saida),
       'avisa que falta a credencial DO ALVO', soProd.saida.slice(0, 300));

    console.log('sem DIVAT_ALVO — morre na resolução do alvo, antes do auditor, do prazo e da rede');
    // A ausência é erro por desenho (issue #74): um default silencioso é exatamente como um gate
    // de PR acaba falando com produção. Aqui se cobra também a ORDEM — o alvo é resolvido no topo,
    // então nada do modo duplo chega a rodar.
    const semAlvo = rodar({ DIVAT_HOJE: '2026-08-05' }, null);
    ok(semAlvo.status === 1, 'sai 1', String(semAlvo.status));
    ok(/DIVAT_ALVO não definido/.test(semAlvo.saida), 'diz que falta DIVAT_ALVO', semAlvo.saida.slice(0, 200));
    ok(!MARCA_REDE.test(semAlvo.saida) && !/127\.0\.0\.1/.test(semAlvo.saida),
       'NÃO tocou a rede', semAlvo.saida.slice(0, 300));
    ok(!/Auditor indisponível|SUPABASE_PROD_AUDIT_DATABASE_URL|fallback/.test(semAlvo.saida),
       'nem tentou o auditor nem consultou o prazo do fallback', semAlvo.saida.slice(0, 300));

    console.log('com DIVAT_ALVO — o alvo escolhido aparece no log (evidência da #74)');
    ok(/· Alvo: teste/.test(valido.saida), 'imprime o alvo', valido.saida.slice(0, 200));
    ok(!/chave-de-teste-nao-e-segredo/.test(valido.saida), 'não imprime a chave', valido.saida.slice(0, 300));
  } finally {
    fs.rmSync(raiz, { recursive: true, force: true });
  }

  console.log('\n==== PLACAR:', pass + '/' + (pass + fail), '====');
  if (fail){ console.log('FALHAS:'); fails.forEach(f => console.log('  -', f)); process.exit(1); }
})();
