/* ═══════════════════════════════════════════════════════════════
   RESPOSTAS RÁPIDAS (Atendimento) — parte do programa
   Vem da Central antiga e foi adaptada ao Sistema Aço Naval:
     - as respostas ficam num arquivo JSON dentro de uma pasta do
       Google Drive (para computador), então os dois PCs usam as mesmas;
     - fotos, áudios e vídeos ficam em arquivos separados, na subpasta
       "midia" (nunca dentro do JSON);
     - só ESTA pasta, escolhida pela janela do Windows, pode ser lida
       ou gravada pela tela — a tela nunca manda um caminho;
     - o envio no WhatsApp usa a biblioteca WA-JS (baixada aqui, com cache).
   ═══════════════════════════════════════════════════════════════ */
const { dialog } = require('electron');
const https = require('https');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');

module.exports = function ligarAtendimento({ app, ipcMain, daCasa, UA }) {
const path = require('path');
const fs = require('fs');
const handle = (canal, fn) => ipcMain.handle(canal, (e, ...a) => (daCasa(e) ? fn(e, ...a) : { ok: false, error: 'origem_invalida' }));

/* ── pasta das respostas (escolhida pelo usuário, guardada neste computador) ── */
const CFG_PATH = path.join(app.getPath('userData'), 'respostas-config.json');
const NOME_PASTA = 'Respostas Aço Naval';
function lerCfg() { try { return JSON.parse(fs.readFileSync(CFG_PATH, 'utf8')); } catch (e) { return {}; } }
function pasta() {
  const c = lerCfg();
  if (!c.pasta) return null;
  try { return fs.statSync(c.pasta).isDirectory() ? c.pasta : null; } catch (e) { return null; }
}
const ARQ = () => path.join(pasta(), 'respostas.json');
const MIDIA = () => path.join(pasta(), 'midia');
const NOME_MIDIA = /^[A-Za-z0-9_-]{4,80}\.[a-z0-9]{2,5}$/;           // só o NOME do arquivo, nunca um caminho
const LIMITE_JSON = 20 * 1024 * 1024;

/* ── junção das respostas dos dois computadores: vale o mais recente de cada item;
      o que foi apagado fica anotado (apagados) para não "voltar" do outro PC ── */
function juntar(a, b) {
  a = a || {}; b = b || {};
  const out = { tipo: 'aco-naval-respostas', v: 2, replies: [], replyGroups: [], apagados: {}, settings: {} };
  const ap = Object.assign({}, a.apagados || {});
  Object.keys(b.apagados || {}).forEach(k => { ap[k] = Math.max(ap[k] || 0, b.apagados[k]); });
  const um = (la, lb) => {
    const m = new Map();
    [].concat(la || [], lb || []).forEach(x => { if (x && x.id) { const p = m.get(x.id); if (!p || (x.upd || 0) >= (p.upd || 0)) m.set(x.id, x); } });
    return [...m.values()].filter(x => !(ap[x.id] && ap[x.id] >= (x.upd || 0)));
  };
  out.replies = um(a.replies, b.replies);
  out.replyGroups = um(a.replyGroups, b.replyGroups);
  out.apagados = ap;
  const sa = a.settings || {}, sb = b.settings || {};
  out.settings = (sb.upd || 0) > (sa.upd || 0) ? sb : sa;
  out.atualizadoEm = new Date().toISOString();
  return out;
}
function lerDisco() {
  try {
    const p = ARQ(); const st = fs.statSync(p); if (st.size > LIMITE_JSON) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) { return null; }
}
function gravarAtomico(obj) {
  const p = ARQ(), tmp = p + '.tmp-' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(obj), 'utf8');
  fs.renameSync(tmp, p);
}

handle('resp-info', () => ({ ok: true, pasta: pasta(), nomePasta: NOME_PASTA }));
handle('resp-escolher-pasta', async () => {
  const r = await dialog.showOpenDialog({ title: 'Escolha a pasta do Google Drive onde guardar as respostas rápidas', properties: ['openDirectory', 'createDirectory'] });
  if (r.canceled || !r.filePaths[0]) return { ok: false, cancelado: true };
  let alvo = r.filePaths[0];
  try {
    if (path.basename(alvo) !== NOME_PASTA) alvo = path.join(alvo, NOME_PASTA);
    fs.mkdirSync(path.join(alvo, 'midia'), { recursive: true });
    fs.writeFileSync(CFG_PATH, JSON.stringify({ pasta: alvo }), 'utf8');
    return { ok: true, pasta: alvo };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});
handle('resp-ler', () => {
  if (!pasta()) return { ok: false, error: 'sem_pasta' };
  return { ok: true, estado: lerDisco() };
});
handle('resp-gravar', (e, estado) => {
  if (!pasta()) return { ok: false, error: 'sem_pasta' };
  try {
    if (!estado || typeof estado !== 'object') return { ok: false, error: 'estado_invalido' };
    const limpo = { replies: Array.isArray(estado.replies) ? estado.replies : [], replyGroups: Array.isArray(estado.replyGroups) ? estado.replyGroups : [], apagados: estado.apagados && typeof estado.apagados === 'object' ? estado.apagados : {}, settings: estado.settings && typeof estado.settings === 'object' ? estado.settings : {} };
    const junto = juntar(lerDisco(), limpo);
    gravarAtomico(junto);
    return { ok: true, estado: junto };
  } catch (err) { return { ok: false, error: String(err && err.message || err) }; }
});

/* ── mídia: arquivos na subpasta "midia" (o JSON guarda só o nome) ── */
function extFromMime(m){ m=String(m||'').toLowerCase();
  if(m.includes('mp4'))return '.mp4';
  if(m.includes('audio')&&m.includes('ogg'))return '.ogg';
  if(m.includes('audio')&&m.includes('webm'))return '.weba';
  if(m.includes('opus'))return '.ogg';
  if(m.includes('webm'))return '.webm';
  if(m.includes('quicktime'))return '.mov';
  if(m.includes('x-matroska'))return '.mkv';
  if(m.includes('3gpp'))return '.3gp';
  if(m.includes('jpeg')||m.includes('jpg'))return '.jpg';
  if(m.includes('png'))return '.png';
  if(m.includes('webp'))return '.webp';
  if(m.includes('gif'))return '.gif';
  return '.bin'; }
const MIMES = { '.mp4':'video/mp4', '.webm':'video/webm', '.mov':'video/quicktime', '.mkv':'video/x-matroska', '.3gp':'video/3gpp', '.ogg':'audio/ogg', '.weba':'audio/webm', '.jpg':'image/jpeg', '.png':'image/png', '.webp':'image/webp', '.gif':'image/gif' };
handle('resp-midia-salvar', async (e, payload) => {
  try {
    if (!pasta()) return { ok: false, error: 'sem_pasta' };
    const m = /^data:([^;,]+)[^,]*,(.*)$/s.exec(String((payload || {}).dataUrl || ''));
    if (!m) return { ok: false, error: 'dataurl_invalida' };
    const buf = Buffer.from(m[2], 'base64');
    if (!buf.length) return { ok: false, error: 'arquivo_vazio' };
    if (buf.length > 80 * 1024 * 1024) return { ok: false, error: 'arquivo_grande_demais' };
    fs.mkdirSync(MIDIA(), { recursive: true });
    const nome = 'm-' + crypto.createHash('sha1').update(buf).digest('hex').slice(0, 20) + extFromMime(m[1]);   // mesmo arquivo = mesmo nome (sem duplicar no Drive)
    const alvo = path.join(MIDIA(), nome);
    if (!fs.existsSync(alvo)) fs.writeFileSync(alvo, buf);
    return { ok: true, path: nome, size: buf.length, mime: m[1] };
  } catch (err) { return { ok: false, error: String(err && err.message || err) }; }
});
handle('resp-midia-ler', async (e, nome) => {
  try {
    nome = String(nome || '');
    if (!pasta() || !NOME_MIDIA.test(nome)) return { ok: false, error: 'caminho_invalido' };
    const buf = fs.readFileSync(path.join(MIDIA(), nome));
    const mime = MIMES[path.extname(nome).toLowerCase()] || 'application/octet-stream';
    return { ok: true, dataUrl: 'data:' + mime + ';base64,' + buf.toString('base64'), size: buf.length, mime };
  } catch (err) { return { ok: false, error: String(err && err.message || err) }; }
});
handle('resp-midia-apagar', async (e, nome) => {
  try {
    nome = String(nome || '');
    if (!pasta() || !NOME_MIDIA.test(nome)) return { ok: false, error: 'caminho_invalido' };
    fs.unlinkSync(path.join(MIDIA(), nome));
    return { ok: true };
  } catch (err) { return { ok: false, error: String(err && err.message || err) }; }
});

/* ── ffmpeg (áudio → OGG/Opus, como mensagem de voz) ── */
const FFMPEG_PATH = (() => {
  const c = [];
  try { c.push(require('@ffmpeg-installer/ffmpeg').path.replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep)); } catch (e) {}
  try { c.push(path.join(path.dirname(process.execPath), 'resources', 'tools', 'ffmpeg.exe')); } catch (e) {}
  c.push(path.join(__dirname, 'tools', 'ffmpeg.exe'));
  return c.find(p => { try { return p && fs.existsSync(p); } catch (e) { return false; } }) || null;
})();

// ===== BIBLIOTECA DE ENVIO DO ATENDIMENTO (WA-JS) =====
// O painel de Atendimento (respostas rapidas) precisa "conversar" com o
// WhatsApp Web de um jeito que nao quebre toda vez que o WhatsApp muda a
// pagina deles. Em vez de clicar em botao escondido e simular digitacao (o
// que ja deu problema — foto virando figurinha, sem legenda), a Central usa a
// WA-JS (projeto open-source mantido ativamente so pra isso: wppconnect.io),
// que fala direto com a API INTERNA do proprio WhatsApp Web. O arquivo dela e
// baixado aqui (no processo principal, sem as restricoes de CSP da pagina) e
// fica em cache em disco — assim funciona offline depois da primeira vez.
const WAJS_URLS = [
  'https://cdn.jsdelivr.net/npm/@wppconnect/wa-js/dist/wppconnect-wa.js',
  'https://unpkg.com/@wppconnect/wa-js/dist/wppconnect-wa.js',
  'https://github.com/wppconnect-team/wa-js/releases/download/nightly/wppconnect-wa.js',
  // versão fixa de reserva — se as de cima vierem mais velhas que o mínimo
  // (cache de CDN, por exemplo), usa esta
  'https://cdn.jsdelivr.net/npm/@wppconnect/wa-js@4.7.1/dist/wppconnect-wa.js',
  'https://unpkg.com/@wppconnect/wa-js@4.7.1/dist/wppconnect-wa.js',
];
// 2026.10.11.2 — VERSÃO MÍNIMA DO WA-JS: 4.6.1. O WhatsApp está ligando, conta
// por conta, um modo novo que criptografa e sobe as mídias num "worker". Com o
// WA-JS anterior à correção de 26/08 (commit 0beac7e, "keep media
// encrypt/upload on the main thread"), outro projeto que manda nota de voz pelo
// WA-JS (WA-HQ-PTT) tinha exatamente "toca no Android, no iPhone não" — e
// resolveu só atualizando o WA-JS. A correção vem na 4.6.1 (02/10/2026).
//
// 2026.10.15 — MÍNIMO SUBIU PRA 4.7.1. O WhatsApp Web 2.3000.1050509545 mudou
// o "prepRawMedia" (a função que prepara foto/vídeo/áudio pro envio) de lugar.
// Todo WA-JS até a 4.7.0 quebrou no envio de QUALQUER mídia com "Cannot read
// properties of undefined (reading 'prepRawMedia')". Corrigido na 4.7.1
// (15/10/2026, commit 0c6d784). A 4.7.1 também mantém a correção do upload acima.
// Confere pela correção dentro do arquivo (a marca abaixo) ou pela versão.
// Quando o WhatsApp quebrar de novo, o envio da Central percebe e se atualiza
// sozinho (ver 'refresh-wajs'); este mínimo só barra cache velho.
const WAJS_MIN = [4, 7, 1];
function verParts(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)(.*)$/.exec(String(v || ''));
  return m ? [+m[1], +m[2], +m[3], m[4] ? 0 : 1] : null; // último: 1 = versão final, 0 = "-alpha"
}
function verCmp(a, b) {
  const pa = verParts(a), pb = verParts(b);
  if (!pa && !pb) return 0; if (!pa) return -1; if (!pb) return 1;
  for (let i = 0; i < 4; i++) { if (pa[i] !== pb[i]) return pa[i] - pb[i]; }
  return 0;
}
function wajsInfo(src) {
  src = String(src || '');
  const m = /\.version="(\d+)\.(\d+)\.(\d+)([^"]*)",\w+\.supportedWhatsappWeb=/.exec(src);
  const version = m ? (m[1] + '.' + m[2] + '.' + m[3] + m[4]) : '';
  const marker = src.indexOf('WAWebMediaPrepMediaProps') >= 0; // só existe a partir da correção do prepRawMedia
  let newEnough = null;
  if (m) {
    const v = [+m[1], +m[2], +m[3]];
    const d = (v[0] - WAJS_MIN[0]) || (v[1] - WAJS_MIN[1]) || (v[2] - WAJS_MIN[2]);
    newEnough = d > 0 || (d === 0 && !m[4]); // "4.6.1-alpha" conta como anterior — a marca decide
  }
  // formato desconhecido (versão futura que mude o texto): não bloqueia
  const ok = marker || newEnough === true || (newEnough === null && src.length > 50000);
  return { version, marker, ok };
}
const WAJS_CACHE_PATH = path.join(app.getPath('userData'), 'wajs-cache.js');
function fetchText(url, redirectsLeft) {
  redirectsLeft = redirectsLeft == null ? 5 : redirectsLeft;
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': UA }, timeout: 15000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirectsLeft > 0) {
        res.resume();
        let next; try { next = new URL(res.headers.location, url).toString(); } catch (e) { reject(e); return; }
        fetchText(next, redirectsLeft - 1).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) { res.resume(); reject(new Error('http_' + res.statusCode)); return; }
      let data = ''; res.setEncoding('utf8');
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    }).on('error', reject);
    req.on('timeout', () => { try { req.destroy(new Error('timeout_15s')); } catch (e) {} });
  });
}
async function fetchWaJs() {
  let lastErr, older = null;
  for (const url of WAJS_URLS) {
    try {
      const src = await fetchText(url);
      if (wajsInfo(src).ok) return src;
      if (!older) older = src; // velha demais: guarda, mas tenta a próxima fonte
    } catch (e) { lastErr = e; }
  }
  if (older) return older; // nenhuma fonte trouxe a versão nova: melhor que nada
  throw lastErr || new Error('falha_todas_fontes');
}

const WAJS_MAX_CACHE_AGE = 3 * 24 * 60 * 60 * 1000; // 3 dias
let __wajsRefreshing = false;
function refreshWaJsInBackground() {
  if (__wajsRefreshing) return;
  __wajsRefreshing = true;
  fetchWaJs()
    .then(fresh => {
      // nunca troca um cache bom por um download mais velho
      let ci = null; try { ci = wajsInfo(fs.readFileSync(WAJS_CACHE_PATH, 'utf8')); } catch (e) {}
      const fi = wajsInfo(fresh);
      if (!ci || !ci.ok || (fi.ok && verCmp(fi.version, ci.version) >= 0)) { try { fs.writeFileSync(WAJS_CACHE_PATH, fresh, 'utf8'); } catch (e) {} }
    })
    .catch(() => {})
    .finally(() => { __wajsRefreshing = false; });
}
handle('resp-wajs', async () => {
  let cached = null, cacheAge = Infinity;
  try {
    const st = fs.statSync(WAJS_CACHE_PATH);
    cacheAge = Date.now() - st.mtimeMs;
    cached = fs.readFileSync(WAJS_CACHE_PATH, 'utf8');
  } catch (e) {}
  // 2026.10.11.2: cache com WA-JS anterior à 4.6.1 não vale — baixa de novo na hora
  const cachedInfo = cached ? wajsInfo(cached) : null;
  if (cached && cacheAge < WAJS_MAX_CACHE_AGE && cachedInfo.ok) {
    refreshWaJsInBackground(); // mantém fresco sem fazer ninguém esperar
    return { ok: true, src: cached, cached: true, version: cachedInfo.version };
  }
  try {
    const fresh = await fetchWaJs();
    const freshInfo = wajsInfo(fresh);
    if (!(cachedInfo && cachedInfo.ok) || (freshInfo.ok && verCmp(freshInfo.version, cachedInfo.version) >= 0)) {
      try { fs.writeFileSync(WAJS_CACHE_PATH, fresh, 'utf8'); } catch (e) {}
      return { ok: true, src: fresh, version: freshInfo.version };
    }
    return { ok: true, src: cached, cached: true, version: cachedInfo.version }; // download veio mais velho que o cache
  } catch (err) {
    if (cached) return { ok: true, src: cached, cached: true, version: cachedInfo.version }; // rede caiu: cache velho ainda é melhor que nada
    return { ok: false, error: String(err && err.message || err) };
  }
});

// 2026.10.15 — AUTOCORREÇÃO: quando um envio falha com cara de "o WhatsApp mudou
// por dentro" (função não encontrada), a página pede a biblioteca MAIS NOVA que
// existir agora — consulta todas as fontes ao mesmo tempo, ignora a idade do
// cache, pega a de versão mais alta e grava (nunca rebaixa). A página então
// compara com a versão que está rodando nela e oferece recarregar a aba.
handle('resp-wajs-atualizar', async () => {
  let cached = null; try { cached = fs.readFileSync(WAJS_CACHE_PATH, 'utf8'); } catch (e) {}
  const ci = cached ? wajsInfo(cached) : null;
  const before = ci ? ci.version : '';
  const got = await Promise.allSettled(WAJS_URLS.map(u => fetchText(u)));
  let best = null, bestInfo = null;
  for (const g of got) {
    if (g.status !== 'fulfilled') continue;
    const inf = wajsInfo(g.value);
    if (!inf.ok) continue;
    if (!best || verCmp(inf.version, bestInfo.version) > 0) { best = g.value; bestInfo = inf; }
  }
  if (!best) return { ok: false, before, version: before, changed: false, error: got.every(g => g.status !== 'fulfilled') ? 'sem_internet' : 'nenhuma_versao_nova' };
  const newer = !ci || !ci.ok || verCmp(bestInfo.version, ci.version) > 0;
  if (newer) { try { fs.writeFileSync(WAJS_CACHE_PATH, best, 'utf8'); } catch (e) {} }
  return { ok: true, before, version: newer ? bestInfo.version : before, changed: newer };
});



handle('resp-audio-ogg', async (e, payload) => {
  try {
    if (!FFMPEG_PATH) return { ok: false, error: 'ffmpeg_nao_encontrado' };
    const m = /^data:[^,]*,(.*)$/s.exec(String((payload || {}).dataUrl || ''));
    if (!m) return { ok: false, error: 'dataurl_invalida' };
    const buf = Buffer.from(m[1], 'base64');
    if (!buf.length) return { ok: false, error: 'audio_vazio' };
    const stamp = Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    // 2026.10.11: a entrada pode ser WebM (gravação nova) OU um OGG antigo que
    // precisa ser refeito (ver waSendAudio) — extensão certa ajuda o ffmpeg.
    // 2026.11.8: agora também entra ÁUDIO PRONTO do computador (MP3, M4A, WAV,
    // AAC, AMR, o .opus do WhatsApp...). A extensão certa ajuda o ffmpeg a
    // reconhecer formatos "crus" como AAC e AMR. A página manda a extensão do
    // arquivo original; sem ela, deduz pelo tipo (como antes: OGG ou WebM).
    const AUD_EXT = { 'audio/ogg': '.ogg', 'audio/opus': '.ogg', 'audio/webm': '.webm', 'video/webm': '.webm',
      'audio/mpeg': '.mp3', 'audio/mp3': '.mp3', 'audio/mp4': '.m4a', 'audio/x-m4a': '.m4a', 'audio/m4a': '.m4a',
      'audio/aac': '.aac', 'audio/x-aac': '.aac', 'audio/aacp': '.aac', 'audio/wav': '.wav', 'audio/x-wav': '.wav',
      'audio/wave': '.wav', 'audio/vnd.wave': '.wav', 'audio/amr': '.amr', 'audio/3gpp': '.3gp', 'video/3gpp': '.3gp',
      'audio/flac': '.flac', 'audio/x-flac': '.flac', 'audio/x-ms-wma': '.wma', 'video/mp4': '.mp4' };
    const mimeIn = String((/^data:([^;,]*)/i.exec(String(payload.dataUrl)) || [])[1] || '').toLowerCase();
    const extHint = String(payload.ext || '').toLowerCase();
    const srcExt = /^\.[a-z0-9]{1,5}$/.test(extHint) ? extHint : (AUD_EXT[mimeIn] || '.webm');
    const src = path.join(os.tmpdir(), 'acn-voz-' + stamp + srcExt);
    const dst = path.join(os.tmpdir(), 'acn-voz-' + stamp + '-saida.ogg'); // nome diferente da entrada (que agora pode ser .ogg)
    fs.writeFileSync(src, buf);
    // 2026.10.11 — ÁUDIO QUE NÃO TOCA NO IPHONE: o WhatsApp do iPhone é mais
    // exigente que o do Android/Web com o "cabeçalho" do OGG/Opus. Perfil fixo de
    // nota de voz: mono, 48kHz, 32k VBR, VoIP, quadros de 20ms, tempo começando
    // do zero, sem metadados herdados. Se este ffmpeg (build de 2018) recusar
    // alguma opção, repete com os parâmetros antigos, que sempre funcionaram.
    // 2026.10.11.2: "aresample=async=1:first_pts=0" RECONSTRÓI a linha do tempo
    // a partir do zero. Sem isso, quando a gravação do Chromium chega com tempos
    // irregulares (comum com microfone USB ou PC ocupado), o ffmpeg copia o
    // tempo torto pro OGG e as marcações das páginas deixam de bater com o áudio
    // que tem dentro — o validador oficial do Opus (opusinfo) acusa, o Android
    // tolera e o iPhone recusa. Validado com este mesmo ffmpeg.exe (2018).
    const ARGS_FULL = ['-y', '-i', src, '-vn', '-map', '0:a:0', '-af', 'aresample=async=1:first_pts=0', '-map_metadata', '-1', '-c:a', 'libopus', '-b:a', '32k', '-vbr', 'on', '-ar', '48000', '-ac', '1', '-application', 'voip', '-frame_duration', '20', '-f', 'ogg', dst];
    const ARGS_OLD  = ['-y', '-i', src, '-vn', '-c:a', 'libopus', '-b:a', '32k', '-ar', '48000', '-ac', '1', '-application', 'voip', dst];
    const runFf = (args) => new Promise((resolve) => {
      let done = false, tail = '';
      let proc;
      try { proc = spawn(FFMPEG_PATH, args, { windowsHide: true }); }
      catch (err) { return resolve({ ok: false, error: String((err && err.message) || err) }); }
      proc.stderr && proc.stderr.on('data', d => { tail = (tail + d.toString()).slice(-1000); });
      proc.on('error', err => { if (!done) { done = true; resolve({ ok: false, error: String((err && err.message) || err) }); } });
      proc.on('close', code => {
        if (done) return; done = true;
        if (code === 0 && fs.existsSync(dst) && fs.statSync(dst).size > 0) resolve({ ok: true });
        else resolve({ ok: false, error: 'ffmpeg codigo ' + code + (tail ? ': ' + tail.slice(-300) : '') });
      });
      // 2026.11.8: áudio pronto pode ser longo — 60s, mais 4s por MB acima de 15MB
      setTimeout(() => { if (!done) { done = true; try { proc.kill(); } catch (e2) {} resolve({ ok: false, error: 'tempo_esgotado' }); } }, Math.max(60, Math.round(buf.length / 1048576) * 4) * 1000);
    });
    let r = await runFf(ARGS_FULL);
    if (!r.ok) { try { fs.unlinkSync(dst); } catch (e2) {} r = await runFf(ARGS_OLD); }
    let out = null;
    if (r.ok) { try { out = 'data:audio/ogg;base64,' + fs.readFileSync(dst).toString('base64'); } catch (e2) { r.ok = false; r.error = 'falha_lendo_saida'; } }
    try { fs.unlinkSync(src); } catch (e2) {}
    try { fs.unlinkSync(dst); } catch (e2) {}
    return r.ok ? { ok: true, dataUrl: out } : r;
  } catch (err) { return { ok: false, error: String((err && err.message) || err) }; }
});


};
