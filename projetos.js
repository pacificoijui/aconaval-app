/* ═══════════════════════════════════════════════════════════════
   PROJETOS DO CONFIGURADOR — pasta do Google Drive
   Os projetos (orçamentos) do Configurador ficavam só no navegador de cada
   computador. Aqui eles passam a ficar num arquivo JSON dentro de uma pasta
   do Google Drive (para computador), escolhida na janela do Windows uma vez
   em cada PC — os dois computadores passam a ver os mesmos projetos.
     - só ESTA pasta pode ser lida ou gravada pela tela (a tela nunca manda
       um caminho; quem escolhe é a janela do Windows);
     - junção: vale o mais recente de cada projeto; o que foi apagado fica
       anotado (apagados) para não "voltar" do outro computador.
   ═══════════════════════════════════════════════════════════════ */
const { dialog } = require('electron');

module.exports = function ligarProjetos({ app, ipcMain, daCasa }) {
const path = require('path');
const fs = require('fs');
const handle = (canal, fn) => ipcMain.handle(canal, (e, ...a) => (daCasa(e) ? fn(e, ...a) : { ok: false, error: 'origem_invalida' }));

const CFG_PATH = path.join(app.getPath('userData'), 'projetos-config.json');
const RESP_CFG = path.join(app.getPath('userData'), 'respostas-config.json');
const NOME_PASTA = 'Projetos Aço Naval';
const LIMITE_JSON = 40 * 1024 * 1024, LIMITE_PROJ = 300 * 1024, MAX_PROJ = 600;
function lerCfg() { try { return JSON.parse(fs.readFileSync(CFG_PATH, 'utf8')); } catch (e) { return {}; } }
function pasta() {
  const c = lerCfg(); if (!c.pasta) return null;
  try { return fs.statSync(c.pasta).isDirectory() ? c.pasta : null; } catch (e) { return null; }
}
const ARQ = () => path.join(pasta(), 'projetos.json');

/* o que chega da tela é conferido: só campos conhecidos, tamanhos limitados */
function limpar(estado) {
  const out = { projetos: [], apagados: {} };
  if (!estado || typeof estado !== 'object') return out;
  (Array.isArray(estado.projetos) ? estado.projetos : []).slice(0, MAX_PROJ).forEach(p => {
    if (!p || typeof p !== 'object' || !/^[A-Za-z0-9_-]{1,40}$/.test(String(p.id || ''))) return;
    if (!p.cfg || typeof p.cfg !== 'object') return;
    let tam = 0; try { tam = JSON.stringify(p.cfg).length; } catch (e) { return; }
    if (tam > LIMITE_PROJ) return;
    out.projetos.push({ id: String(p.id), nome: String(p.nome || '').slice(0, 120), cliente: String(p.cliente || '').slice(0, 160), ts: Number(p.ts) || 0, rev: Math.max(0, Math.floor(Number(p.rev) || 0)), base: Math.max(0, Math.floor(Number(p.base) || 0)), cfg: p.cfg });
  });
  const ap = estado.apagados && typeof estado.apagados === 'object' ? estado.apagados : {};
  Object.keys(ap).slice(0, 3000).forEach(k => { if (/^[A-Za-z0-9_-]{1,40}$/.test(k) && Number(ap[k]) > 0) out.apagados[k] = Number(ap[k]); });
  return out;
}
/* JUNÇÃO DOS DOIS COMPUTADORES — sem depender do relógio de cada PC e sem perder nada.
   Cada projeto tem um contador "rev" (sobe a cada alteração) e "base" (o rev que o Drive tinha quando este computador sincronizou pela última vez).
     • só este computador mexeu desde a última vez  → vale o daqui;
     • só o outro mexeu                              → vale o do Drive;
     • os DOIS mexeram (versões diferentes)          → ficam as duas: a do Drive e a daqui como "(versão deste computador)".
   O que foi excluído de propósito fica anotado (apagados) para não "voltar". */
const canon = (o) => JSON.stringify(o, (k, v) => (v && typeof v === 'object' && !Array.isArray(v)) ? Object.keys(v).sort().reduce((r, x) => { r[x] = v[x]; return r; }, {}) : v);
const igual = (a, b) => a.nome === b.nome && a.cliente === b.cliente && canon(a.cfg) === canon(b.cfg);
function juntar(disco, nova) {
  disco = disco || {}; nova = nova || {};
  const ap = Object.assign({}, disco.apagados || {});
  Object.keys(nova.apagados || {}).forEach(k => { ap[k] = Math.max(ap[k] || 0, nova.apagados[k]); });
  const m = new Map(); (disco.projetos || []).forEach(p => { if (p && p.id) m.set(p.id, Object.assign({}, p, { base: p.rev || 0 })); });
  const extras = [];
  (nova.projetos || []).forEach(L => {
    if (!L || !L.id) return; const D = m.get(L.id);
    if (!D) { m.set(L.id, Object.assign({}, L, { base: L.rev || 0 })); return; }
    if (igual(D, L)) { D.rev = Math.max(D.rev || 0, L.rev || 0); D.base = D.rev; D.ts = Math.max(D.ts || 0, L.ts || 0); return; }
    const dr = D.rev || 0, lr = L.rev || 0, lb = L.base || 0;
    if (dr === 0 && lr === 0) { extras.push(L); return; }                           // projetos antigos, sem contador, e diferentes: guarda os dois
    if (lb === dr && lr > dr) { m.set(L.id, Object.assign({}, L, { base: lr })); return; }   // só este computador mexeu
    if (lr === lb) return;                                                        // este computador não mexeu: vale o do Drive
    extras.push(L);                                                               // os dois mexeram: guarda as duas versões
  });
  extras.forEach(L => {
    const h = require('crypto').createHash('sha1').update(canon(L.cfg) + L.nome).digest('hex').slice(0, 6), id = (L.id + 'x' + h).slice(0, 40);
    if (!m.has(id) && ![...m.values()].some(q => igual(q, L))) m.set(id, { id, nome: ((L.nome || 'Projeto') + ' (versão de outro computador)').slice(0, 120), cliente: L.cliente, ts: L.ts, rev: 1, base: 1, cfg: L.cfg });
  });
  return { tipo: 'aco-naval-projetos', v: 2, projetos: [...m.values()].filter(p => !(ap[p.id] && ap[p.id] >= (p.ts || 0))), apagados: ap, atualizadoEm: new Date().toISOString() };
}
function lerDisco() {
  try { const p = ARQ(); if (fs.statSync(p).size > LIMITE_JSON) return null; return limpar(JSON.parse(fs.readFileSync(p, 'utf8'))); } catch (e) { return null; }
}
function gravarAtomico(obj) {
  const p = ARQ(), tmp = p + '.tmp-' + process.pid, bak = path.join(path.dirname(p), 'projetos.copia-anterior.json');
  try { if (fs.existsSync(p) && (!fs.existsSync(bak) || Date.now() - fs.statSync(bak).mtimeMs > 10 * 60 * 1000)) fs.copyFileSync(p, bak); } catch (e) {}   // cópia de segurança do arquivo anterior (a cada 10 min), para recuperar se algo der errado
  fs.writeFileSync(tmp, JSON.stringify(obj), 'utf8'); fs.renameSync(tmp, p);
}

handle('projs-info', () => ({ ok: true, pasta: pasta(), nomePasta: NOME_PASTA }));
handle('projs-escolher-pasta', async () => {
  let inicio; try { const c = JSON.parse(fs.readFileSync(RESP_CFG, 'utf8')); if (c.pasta) inicio = path.dirname(c.pasta); } catch (e) {}   // sugere o mesmo lugar das respostas rápidas (a mesma pasta do Drive)
  const r = await dialog.showOpenDialog({ title: 'Escolha a pasta do Google Drive onde guardar os projetos do Configurador', defaultPath: inicio, properties: ['openDirectory', 'createDirectory'] });
  if (r.canceled || !r.filePaths[0]) return { ok: false, cancelado: true };
  let alvo = r.filePaths[0];
  try {
    if (path.basename(alvo) !== NOME_PASTA) alvo = path.join(alvo, NOME_PASTA);
    fs.mkdirSync(alvo, { recursive: true });
    fs.writeFileSync(CFG_PATH, JSON.stringify({ pasta: alvo }), 'utf8');
    return { ok: true, pasta: alvo };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});
/* junta o que a tela mandou com o que já está na pasta (de outro computador), grava e devolve o resultado */
handle('projs-gravar', (e, estado) => {
  if (!pasta()) return { ok: false, error: 'sem_pasta' };
  try {
    const junto = juntar(lerDisco(), limpar(estado));
    gravarAtomico(junto);
    return { ok: true, estado: junto };
  } catch (err) { return { ok: false, error: String(err && err.message || err) }; }
});
};
