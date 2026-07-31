// sb.mjs — cabeçalhos de autenticação do PostgREST, num lugar só.
//
// Por que existe: o Supabase está migrando as chaves de API. As legadas (`anon` e `service_role`)
// são JWT; as novas (`sb_publishable_…` e `sb_secret_…`) NÃO são, e o suporte às legadas vai só
// até o fim de 2026. Mandar uma chave não-JWT em `Authorization: Bearer` é ignorado no melhor
// caso e rejeitado no pior — então o cabeçalho passa a depender do FORMATO da chave.
//
// Estava em 6 lugares (os quatro gates vivos + backup_rest + restore_rest), cada um montando o
// objeto à mão. Seis cópias divergem, e o dia em que isso apareceria seria o dia da troca de
// chave: o portal migrado e os gates todos em 401 ao mesmo tempo, sem ninguém entender por quê.
// Achado 4 da auditoria cruzada de 31/07/2026, que notou que o `Authorization: Bearer` "não deve
// ser copiado cegamente para uma publishable key não-JWT".
//
// O `app.js` tem a MESMA lógica declarada localmente (`ehJWT`/`cabecalhosSB`, seção SUPABASE
// CONFIG) — ele é zero-build e não importa módulo, então lá a cópia é inevitável. Ela é guardada
// pelo `canon` do tests/check.js e testada em tests/sbFetch.test.js.
//
// CONSEQUÊNCIA PRÁTICA: migrar as chaves vira trocar as constantes no topo do `app.js`. Nada
// aqui nem nos gates precisa mudar junto.

export const ehJWT = k => /^eyJ/.test(String(k || ''));

export const cabecalhosSB = (key, extras = {}) => ehJWT(key)
  ? { apikey: key, Authorization: `Bearer ${key}`, ...extras }
  : { apikey: key, ...extras };
