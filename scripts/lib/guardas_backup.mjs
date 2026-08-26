// guardas_backup.mjs — guardas de entrada/saída dos utilitários administrativos de backup.
//
// Definição ÚNICA das três regras que a auditoria de 26/08/2026 encontrou ausentes ou
// duplicadas. `backup_rest.mjs` e `restore_rest.mjs` importam daqui; nenhum dos dois deve
// voltar a ter cópia própria dessas checagens (o `restore_rest.mjs` tinha a sua, o
// `backup_rest.mjs` não tinha nenhuma — foi exatamente essa assimetria o achado SEC-04).
//
// Testes: tests/guardas_backup.test.mjs (roda no tests/check.js).

import { mkdir, open } from 'node:fs/promises';
import { constants as FS } from 'node:fs';
import { createHash } from 'node:crypto';

const HOSTS_LOCAIS = new Set(['127.0.0.1', 'localhost', '::1']);

/* Valida o destino ANTES de qualquer credencial sair da máquina.
 *
 * Três recusas, nesta ordem, porque cada uma cobre um erro diferente:
 *   1. não é URL            → engano de digitação/variável vazia;
 *   2. não é HTTPS          → credencial em claro na rede;
 *   3. não é <ref>.supabase.co → é o caso perigoso: um host QUALQUER receberia a chave
 *      secret/service. O casamento é ancorado (`^...$`) de propósito — `supabase.co.evil.com`
 *      passa em qualquer teste de "termina com" mal escrito.
 *
 * `chaveAdmin` recusa host local: uma chave administrativa apontada para 127.0.0.1 vai para
 * o que estiver escutando ali, e não há como saber o que é.
 *
 * Devolve só a ORIGEM — path, query e hash são descartados, então nada de
 * `https://<ref>.supabase.co/@evil.com` ou de query carregando dado para o outro lado. */
export function validarOrigem(valor, { nome = 'URL', permitirLocal = false, chaveAdmin = false } = {}) {
  let u;
  try { u = new URL(String(valor)); } catch { throw new Error(`${nome} não é uma URL válida`); }

  const local = HOSTS_LOCAIS.has(u.hostname);
  if (local && !permitirLocal) {
    throw new Error(`${nome} deve ser o endpoint direto https://<ref>.supabase.co`);
  }
  if (u.protocol !== 'https:' && !(local && u.protocol === 'http:')) {
    throw new Error(`${nome} precisa usar HTTPS`);
  }
  if (local && chaveAdmin) {
    throw new Error(`${nome} aponta para host local com chave administrativa; recusado`);
  }

  let ref;
  if (local) {
    ref = u.hostname;
  } else {
    const m = /^([a-z0-9]+)\.supabase\.co$/i.exec(u.hostname);
    if (!m) throw new Error(`${nome} deve ser o endpoint direto https://<ref>.supabase.co`);
    ref = m[1];
  }
  return { origem: u.origin, ref, local };
}

/* Pasta de backup é sempre NOVA. `mkdir` sem `recursive` já falha com EEXIST — é o próprio
 * sistema de arquivos dizendo não, sem corrida entre "existe?" e "cria". Antes era
 * `{ recursive: true }`, que aceita pasta existente em silêncio e deixa o `writeFile`
 * truncante apagar o que estava lá (SEC-05). */
export async function pastaNova(dir) {
  try {
    await mkdir(dir, { recursive: false });
  } catch (e) {
    if (e.code === 'EEXIST') throw new Error(`${dir} já existe; escolha uma pasta de saída nova`);
    if (e.code === 'ENOENT') throw new Error(`${dir}: o diretório pai não existe`);
    throw e;
  }
}

/* Lê o arquivo UMA vez e confere o SHA-256 sobre os bytes devolvidos.
 *
 * O restore validava o hash num `createReadStream` e depois RELIA o mesmo caminho para montar
 * os lotes do POST — duas leituras, com janela entre elas (SEC-06). Aqui os bytes conferidos
 * são os mesmos que o chamador usa: não há segunda leitura para trocar.
 *
 * Symlink é recusado pelo PRÓPRIO open, com `O_NOFOLLOW`: o alvo de um link pode ser trocado
 * sem que o caminho mude. Conferir depois de abrir não serve — `open()` já teria seguido o
 * link, e o `fstat` do descritor descreve o ALVO, nunca o link (medido: `isSymbolicLink()`
 * sobre o fd aberto devolve false para um symlink, e o teste passava vazio). */
export async function lerValidado(arquivo, shaEsperado) {
  let fh;
  try {
    fh = await open(arquivo, FS.O_RDONLY | FS.O_NOFOLLOW);
  } catch (e) {
    if (e.code === 'ELOOP') throw new Error(`${arquivo}: é symlink; recusado`);
    throw e;
  }
  try {
    const st = await fh.stat();
    if (!st.isFile()) throw new Error(`${arquivo}: não é arquivo comum; recusado`);
    const buf = await fh.readFile();
    const sha = createHash('sha256').update(buf).digest('hex');
    if (sha !== shaEsperado) {
      throw new Error(`${arquivo}: SHA-256 não confere; arquivo alterado ou corrompido`);
    }
    return buf;
  } finally {
    await fh.close();
  }
}
