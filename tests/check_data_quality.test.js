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
                       'scripts/lib/prazos.mjs', 'scripts/lib/ambiente.mjs']) {
      fs.copyFileSync(path.join(REAL, rel), path.join(raiz, rel));
    }
    // Baseline PRÓPRIO, pela mesma razão do prazos.json abaixo: até 05/08/2026 este teste copiava
    // o data_quality_baseline.json REAL e o `psql` falso fabricava justamente a primeira entrada
    // dele. Quer dizer que consertar aquele dado no banco e rodar `--atualizar-baseline` deixaria
    // este teste vermelho por um motivo que nada tem a ver com o que ele guarda (a ORDEM dos dois
    // caminhos). O achado abaixo é o mesmo que o `psql` falso devolve — é o par que faz o caso do
    // auditor sair 0 "com dívida já conhecida".
    // Desde a issue #99 a dívida MEDIDA mora em `ambientes.<alvo>.achados` (a política —
    // `orfaos_conhecidos` — é que fica no topo). Os dois slots levam o mesmo achado porque os
    // casos abaixo rodam ora com alvo `teste`, ora com `producao`, e o que eles guardam é a
    // ORDEM dos dois caminhos, não a diferença entre os bancos.
    const ACHADO = {
      verificacao: 'codlinha_orfa', severidade: 'erro', qtd: 2,
      detalhe: 'itinerario_teste sem match em tabela_vista_teste',
    };
    const fixtureBaseline = {
      gerado_em: '2026-08-05',
      nota: 'fixture do teste — dívida inventada, não é o baseline do repo',
      ambientes: {
        teste:    { gerado_em: '2026-08-05', achados: [ACHADO] },
        producao: { gerado_em: '2026-08-05', achados: [ACHADO] },
      },
    };
    fs.writeFileSync(path.join(raiz, 'scripts', 'data_quality_baseline.json'),
                     JSON.stringify(fixtureBaseline, null, 2) + '\n');
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
    const rodar = (extra = {}, alvo = 'teste', argv = []) => {
      const env = { ...process.env, ...extra };
      delete env.SUPABASE_PROD_AUDIT_DATABASE_URL;   // o runner do CI tem essa variável; o teste não pode herdá-la
      delete env.SUPABASE_TEST_AUDIT_DATABASE_URL;
      for (const k of ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy']) delete env[k];
      env.NO_PROXY = env.no_proxy = '127.0.0.1,localhost';
      // Reaplica `extra` DEPOIS dos deletes — não é redundância: o caso do auditor disponível
      // passa justamente SUPABASE_PROD_AUDIT_DATABASE_URL, que a linha acima acabou de apagar.
      for (const [k, v] of Object.entries(extra)) env[k] = v;
      if (alvo === null) delete env.DIVAT_ALVO; else env.DIVAT_ALVO = alvo;
      const r = spawnSync(process.execPath, [script, ...argv], { encoding: 'utf8', env, timeout: 30000 });
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
    // O achado devolvido é justamente o que a fixture de baseline carrega: o gate tem de passar
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

    console.log('fonte devolve lista VAZIA com dívida no baseline — é cegueira, não "resolvido"');
    // O modo de falha mais perigoso deste gate, e o único que sai VERDE: a fonte perde a visão do
    // banco (permissão revogada, RLS, função trocada de schema, migração pela metade) e devolve
    // zero achados. Como a RPC só emite linha quando a contagem é > 0, banco limpo devolve `[]`
    // igualzinho — as duas causas são indistinguíveis daqui. Antes desta guarda o script escolhia
    // sozinho a interpretação otimista: imprimia "✓ Resolvido desde o baseline" para a dívida
    // inteira e saía 0. O `Array.isArray` logo acima não cobre isto — `[]` É uma lista.
    fs.writeFileSync(path.join(bin, 'psql'),
      `#!${process.execPath}\nprocess.stdout.write('\\n[]\\n');\n`, { mode: 0o755 });
    const vazio = rodar({ ...comPath, SUPABASE_PROD_AUDIT_DATABASE_URL: urlDe('producao') }, 'producao');
    ok(vazio.status === 1, 'sai 1 em vez de verde', `exit ${vazio.status}: ${vazio.saida.slice(0, 300)}`);
    ok(!/✓ Qualidade dos dados: nenhum achado/.test(vazio.saida),
       'NÃO declara qualidade em dia', vazio.saida.slice(0, 300));
    ok(!/✓ Resolvido desde o baseline/.test(vazio.saida),
       'NÃO afirma que a dívida foi resolvida', vazio.saida.slice(0, 300));
    ok(/--atualizar-baseline/.test(vazio.saida),
       'diz como confirmar, caso a dívida tenha sido mesmo corrigida', vazio.saida.slice(0, 400));

    console.log('--atualizar-baseline zerando a dívida — grava, mas AVISA alto');
    // A saída de emergência do caso acima não pode ser ela mesma um caminho cego. O `psql` falso
    // continua devolvendo `[]`; se o operador seguir a instrução do gate sem desconfiar, isto aqui
    // apaga as entradas do baseline — que é a dívida REGISTRADA, não o perdão dela. Gravar é
    // legítimo (o `--atualizar-baseline` é a confirmação humana), mas passar de N para ZERO é a
    // assinatura da cegueira, e tem de deixar rastro em duas camadas: o aviso no log e o diff do
    // arquivo versionado, que ainda precisa ser commitado por alguém.
    const baselinePath = path.join(raiz, 'scripts', 'data_quality_baseline.json');
    const antes = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
    const zerou = rodar({ ...comPath, SUPABASE_PROD_AUDIT_DATABASE_URL: urlDe('producao') },
                        'producao', ['--atualizar-baseline']);
    ok(zerou.status === 0, 'grava (a confirmação humana é explícita)', `exit ${zerou.status}: ${zerou.saida.slice(0, 300)}`);
    ok(/⚠/.test(zerou.saida) && /1 achado\(s\)/.test(zerou.saida),
       'avisa que a dívida registrada foi a ZERO, dizendo quantos sumiram', zerou.saida.slice(0, 500));
    ok(/cegou|cegueira/.test(zerou.saida),
       'nomeia a hipótese da fonte cega — não trata como vitória', zerou.saida.slice(0, 500));
    const reescrito = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
    ok(reescrito.ambientes.producao.achados.length === 0, 'o slot do alvo foi mesmo reescrito');
    // A escrita é POR AMBIENTE (issue #99): rodar --atualizar-baseline no cron (alvo `producao`)
    // não pode zerar a dívida medida em TESTE. Antes da #99 havia uma lista só e o cron diário
    // reescrevia o arquivo inteiro — dívida do outro banco apagada sem ninguém ver.
    ok(JSON.stringify(reescrito.ambientes.teste) === JSON.stringify(antes.ambientes.teste),
       'o slot do OUTRO ambiente ficou intacto', JSON.stringify(reescrito.ambientes.teste));
    fs.writeFileSync(baselinePath, JSON.stringify(antes, null, 2) + '\n');   // devolve a fixture

    console.log('baseline por ambiente — falha fechado em vez de comparar contra o banco errado');
    // As três formas de o slot do alvo não existir mandam para lugares diferentes, e por isso têm
    // mensagens diferentes: reformar o arquivo, corrigir o DIVAT_ALVO, ou medir aquele banco. Uma
    // mensagem só faria o operador rodar --atualizar-baseline no alvo errado — e sobrescrever a
    // medição boa do outro ambiente com a deste, que é o dano que a #99 fecha.
    fs.writeFileSync(path.join(bin, 'psql'),
      `#!${process.execPath}\nprocess.stdout.write('\\n[' + ${JSON.stringify(JSON.stringify(ACHADO))} + ']\\n');\n`,
      { mode: 0o755 });
    const comCred = { ...comPath, SUPABASE_TEST_AUDIT_DATABASE_URL: urlDe('teste') };
    const comBaseline = (obj, alvo = 'teste') => {
      fs.writeFileSync(baselinePath, JSON.stringify(obj, null, 2) + '\n');
      const r = rodar(comCred, alvo);
      fs.writeFileSync(baselinePath, JSON.stringify(antes, null, 2) + '\n');
      return r;
    };

    const formaAntiga = comBaseline({ gerado_em: '2026-08-05', nota: 'x', achados: [ACHADO] });
    ok(formaAntiga.status === 1, 'formato antigo (dívida no topo) sai 1', String(formaAntiga.status));
    ok(/formato ANTIGO/.test(formaAntiga.saida) && /ambientes/.test(formaAntiga.saida),
       'diz que a forma mudou, em vez de comparar contra `undefined` e passar', formaAntiga.saida.slice(0, 300));

    const semSlot = comBaseline({ ...fixtureBaseline, ambientes: { producao: { gerado_em: '2026-08-05', achados: [ACHADO] } } });
    ok(semSlot.status === 1, 'slot do alvo ausente sai 1', String(semSlot.status));
    ok(/slot do ambiente 'teste'/.test(semSlot.saida),
       'a mensagem NOMEIA o ambiente que falta', semSlot.saida.slice(0, 300));

    const naoMedido = comBaseline({ ...fixtureBaseline,
      ambientes: { teste: { gerado_em: null, achados: null }, producao: { gerado_em: '2026-08-05', achados: [ACHADO] } } });
    ok(naoMedido.status === 1, 'slot não medido (achados: null) sai 1', String(naoMedido.status));
    ok(/ainda não foi medido/.test(naoMedido.saida) && /DIVAT_ALVO=teste/.test(naoMedido.saida),
       'diz que falta medir ESTE ambiente e como fazê-lo', naoMedido.saida.slice(0, 300));
    ok(!/✓ Qualidade dos dados/.test(naoMedido.saida),
       'NÃO cai na dívida do outro banco e declara qualidade em dia', naoMedido.saida.slice(0, 300));

    // O outro lado: com o slot do alvo medido, o gate volta a passar com a dívida conhecida.
    const medido = comBaseline(fixtureBaseline);
    ok(medido.status === 0, 'com o slot medido, passa com a dívida conhecida',
       `exit ${medido.status}: ${medido.saida.slice(0, 300)}`);

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
