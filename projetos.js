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
    out.projetos.push({ id: String(p.id), nome: String(p.nome || '').slice(0, 120), cliente: String(p.cliente || '').slice(0, 160), ts: Number(p.ts) || 0, cfg: p.cfg });
  });
  const ap = estado.apagados && typeof estado.apagados === 'object' ? estado.apagados : {};
  Object.keys(ap).slice(0, 3000).forEach(k => { if (/^[A-Za-z0-9_-]{1,40}$/.test(k) && Number(ap[k]) > 0) out.apagados[k] = Number(ap[k]); });
  return out;
}
/* vale o mais recente de cada projeto; apagado depois da última alteração não volta */
function juntar(a, b) {
  a = a || {}; b = b || {};
  const ap = Object.assign({}, a.apagados || {});
  Object.keys(b.apagados || {}).forEach(k => { ap[k] = Math.max(ap[k] || 0, b.apagados[k]); });
  const m = new Map();
  [].concat(a.projetos || [], b.projetos || []).forEach(p => { if (p && p.id) { const q = m.get(p.id); if (!q || (p.ts || 0) >= (q.ts || 0)) m.set(p.id, p); } });
  return { tipo: 'aco-naval-projetos', v: 1, projetos: [...m.values()].filter(p => !(ap[p.id] && ap[p.id] >= (p.ts || 0))), apagados: ap, atualizadoEm: new Date().toISOString() };
}
function lerDisco() {
  try { const p = ARQ(); if (fs.statSync(p).size > LIMITE_JSON) return null; return limpar(JSON.parse(fs.readFileSync(p, 'utf8'))); } catch (e) { return null; }
}
function gravarAtomico(obj) {
  const p = ARQ(), tmp = p + '.tmp-' + process.pid;
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
