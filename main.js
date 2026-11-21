/* ════════════════════════════════════════════════════════════════════
   SISTEMA AÇO NAVAL — programa para Windows

   Mesma base do Sistema Ijuí: uma janela só, que abre o sistema da
   empresa (www.aconaval.com/sistema/) com o trilho de módulos e as abas
   que ficam carregadas. A tela em si mora no site — então qualquer
   melhoria no sistema chega na hora, sem reinstalar nada. O programa
   cuida só do que o navegador não faz:
     - abre só o aconaval.com. Qualquer outro endereço (WhatsApp, Google
       Maps, YouTube…) vai para o navegador do Windows;
     - o login fica guardado no computador (as abas já abrem logadas);
     - se atualiza sozinho: cada versão nova publicada chega em todos os
       computadores onde ele está instalado (electron-updater);
     - pode abrir junto com o Windows;
     - sem internet, mostra uma tela de aviso que tenta de novo sozinha;
     - GUIAS: sites de fora que a pessoa usa todo dia (WhatsApp, Instagram,
       Gmail…) em abas do próprio programa, cada um com o login guardado
       num compartimento só dele (igual às guias do Sistema Ijuí).

   Ver desktop/LEIA-ME.md.
   ════════════════════════════════════════════════════════════════════ */
const { app, BrowserWindow, Menu, shell, ipcMain, session, screen } = require('electron');
const path = require('path');
const fs = require('fs');

const APP_ID = 'com.aconaval.sistema';
const NOME = 'Sistema Aço Naval';
// ACN_SITE existe só para testar contra um servidor local
const SITE = String(process.env.ACN_SITE || 'https://www.aconaval.com').replace(/\/+$/, '');
const ORIGEM = new URL(SITE).origin;
// o site responde com e sem www; os dois contam como "dentro"
const ORIGENS = new Set([ORIGEM, ORIGEM.replace('://www.', '://'), ORIGEM.replace('://', '://www.')]);
const INICIO = SITE + '/sistema/';
const PARTICAO = 'persist:aconaval';
const ICONE = path.join(__dirname, 'icone.png');
const OFFLINE = path.join(__dirname, 'offline.html');

if (process.platform === 'win32') { try { app.setAppUserModelId(APP_ID); } catch (e) {} }

/* O WhatsApp Web recusa abrir quando vê "Electron" no user-agent, e não
   aceita cabeçalho com acento (o nome do programa tem "ç"). Montado do zero,
   o user-agent é igual ao do Chrome que está de fato rodando por baixo. */
const PLATAFORMA_UA = process.platform === 'win32' ? 'Windows NT 10.0; Win64; x64'
  : process.platform === 'darwin' ? 'Macintosh; Intel Mac OS X 10_15_7' : 'X11; Linux x86_64';
const UA_CHROME = 'Mozilla/5.0 (' + PLATAFORMA_UA + ') AppleWebKit/537.36 (KHTML, like Gecko) Chrome/'
  + String(process.versions.chrome || '130').split('.')[0] + '.0.0.0 Safari/537.36';
try { app.userAgentFallback = UA_CHROME; } catch (e) {}

// guias: um compartimento (sessão) por guia, criado pela casca
const PARTICAO_GUIA = /^persist:guia-g[a-z0-9]{1,24}$/;

let win = null;

/* ════════════ ENDEREÇOS ════════════ */
function origemDe(u) { try { return new URL(u).origin; } catch (e) { return ''; } }
function dentro(u) { return ORIGENS.has(origemDe(u)); }
function local(u) { return /^(about:|blob:|data:)/i.test(String(u || '')); }
function abrirFora(u) {
  // só protocolos conhecidos — nada de file:// ou programas do Windows
  if (/^(https?:|mailto:|tel:|whatsapp:)/i.test(String(u || ''))) shell.openExternal(u).catch(() => {});
}

/* ════════════ JANELA: tamanho e posição lembrados ════════════ */
const ARQ_JANELA = () => path.join(app.getPath('userData'), 'janela.json');
function lerJanela() {
  try {
    const j = JSON.parse(fs.readFileSync(ARQ_JANELA(), 'utf8'));
    if (![j.x, j.y, j.width, j.height].every(Number.isFinite)) return null;
    // Encaixa a janela INTEIRA na tela onde ela estava (ou na mais próxima):
    // antes aceitava até 50px para fora e não olhava a largura — a janela
    // podia abrir com o canto esquerdo (o trilho de módulos) fora da tela.
    const a = screen.getDisplayMatching({ x: j.x, y: j.y, width: j.width, height: j.height }).workArea;
    const width = Math.min(Math.max(j.width, 900), a.width);
    const height = Math.min(Math.max(j.height, 600), a.height);
    const x = Math.min(Math.max(j.x, a.x), a.x + a.width - width);
    const y = Math.min(Math.max(j.y, a.y), a.y + a.height - height);
    return { x, y, width, height, max: j.max };
  } catch (e) { return null; }
}
function gravarJanela() {
  if (!win || win.isDestroyed()) return;
  try {
    const b = win.getNormalBounds();
    fs.writeFileSync(ARQ_JANELA(), JSON.stringify({ x: b.x, y: b.y, width: b.width, height: b.height, max: win.isMaximized() }));
  } catch (e) {}
}

/* ════════════ REGRAS PARA TODA PÁGINA (janela principal e janelas filhas) ════════════ */
function regrasDaPagina(wc) {
  // window.open: impressão (about:blank), prévia de PDF (blob:) e telas do
  // próprio sistema abrem numa janela do programa; o resto vai para o navegador.
  wc.setWindowOpenHandler(({ url }) => {
    if (!url || local(url) || dentro(url)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 1000, height: 760, autoHideMenuBar: true, icon: ICONE, backgroundColor: '#ffffff',
          webPreferences: { partition: PARTICAO, contextIsolation: true, nodeIntegration: false, sandbox: true }
        }
      };
    }
    abrirFora(url);
    return { action: 'deny' };
  });
  // a página principal só navega dentro do site (ou para a tela "sem internet")
  wc.on('will-navigate', (e, u) => {
    if (dentro(u) || local(u) || u.startsWith('file:') && u.indexOf('offline.html') >= 0) return;
    e.preventDefault();
    abrirFora(u);
  });
  // os módulos (molduras da casca) também: um link pro WhatsApp dentro do
  // Comercial abre o WhatsApp, não troca o módulo por ele. Molduras mais
  // fundas (um vídeo do YouTube dentro de uma página) ficam como estão.
  wc.on('will-frame-navigate', (e) => {
    const f = e.frame;
    if (!f || !f.parent || f.parent !== wc.mainFrame) return;
    if (dentro(e.url) || local(e.url)) return;
    e.preventDefault();
    abrirFora(e.url);
  });
}
/* ════════════ GUIAS (webview com site de fora) ════════════
   A casca só consegue criar webview no formato de guia: site https, no
   compartimento persist:guia-<id>, sem preload e com o isolamento todo
   ligado — nenhum site de fora fala com o programa. Dentro da guia a
   navegação é livre (o login do Google passa por outro endereço, por
   exemplo); janela nova vai para o navegador do Windows. */
function regrasDaGuia(wc) {
  wc.setWindowOpenHandler(({ url }) => { abrirFora(url); return { action: 'deny' }; });
  wc.on('will-navigate', (e, u) => { if (!/^(https?:|about:|blob:|data:)/i.test(u)) { e.preventDefault(); abrirFora(u); } });
}
function guardarWebviews(wc) {
  wc.on('will-attach-webview', (e, prefs, params) => {
    delete prefs.preload;
    prefs.nodeIntegration = false;
    prefs.nodeIntegrationInSubFrames = false;
    prefs.contextIsolation = true;
    prefs.sandbox = true;
    prefs.webSecurity = true;
    prefs.allowRunningInsecureContent = false;
    const ok = win && wc === win.webContents && dentro(wc.getURL())
      && PARTICAO_GUIA.test(String(params.partition || '')) && /^https:\/\//i.test(String(params.src || ''));
    if (!ok) e.preventDefault();
  });
}
app.on('session-created', (sess) => {
  // as guias também só ganham o necessário: notificação, microfone/câmera
  // (chamada no WhatsApp), área de transferência e tela cheia
  if (sess === session.fromPartition(PARTICAO)) return;
  sess.setPermissionRequestHandler((wc, perm, cb) => cb(PERMITIDAS.has(perm)));
  sess.setPermissionCheckHandler((wc, perm) => PERMITIDAS.has(perm));
});

app.on('web-contents-created', (ev, wc) => {
  if (wc.getType() === 'webview') regrasDaGuia(wc);
  else { regrasDaPagina(wc); guardarWebviews(wc); }
  // atalhos de sempre: zoom, tela cheia, ferramentas de suporte
  wc.on('before-input-event', (e, i) => {
    if (i.type !== 'keyDown') return;
    const ctrl = i.control || i.meta;
    if (ctrl && (i.key === '=' || i.key === '+')) { wc.setZoomLevel(Math.min(wc.getZoomLevel() + 0.5, 4)); e.preventDefault(); }
    else if (ctrl && i.key === '-') { wc.setZoomLevel(Math.max(wc.getZoomLevel() - 0.5, -3)); e.preventDefault(); }
    else if (ctrl && i.key === '0') { wc.setZoomLevel(0); e.preventDefault(); }
    else if (i.key === 'F11') { const w = BrowserWindow.fromWebContents(wc); if (w) w.setFullScreen(!w.isFullScreen()); e.preventDefault(); }
    else if (ctrl && i.shift && (i.key === 'I' || i.key === 'i')) { wc.toggleDevTools(); e.preventDefault(); }
  });
});

/* ════════════ PERMISSÕES ════════════
   Microfone/câmera (chamadas de vídeo do Atendimento), área de
   transferência, notificações e tela cheia: só para o próprio site. */
const PERMITIDAS = new Set(['media', 'clipboard-read', 'clipboard-sanitized-write', 'notifications', 'fullscreen', 'display-capture']);
function ligarPermissoes(sess) {
  sess.setPermissionRequestHandler((wc, perm, cb, det) => {
    cb(PERMITIDAS.has(perm) && dentro((det && det.requestingUrl) || wc.getURL()));
  });
  sess.setPermissionCheckHandler((wc, perm, origem) => PERMITIDAS.has(perm) && dentro(origem || (wc && wc.getURL()) || ''));
}

/* ════════════ A JANELA ════════════ */
function criarJanela() {
  const j = lerJanela();
  win = new BrowserWindow({
    width: j ? j.width : 1366, height: j ? j.height : 860, x: j ? j.x : undefined, y: j ? j.y : undefined,
    minWidth: Math.min(900, screen.getPrimaryDisplay().workArea.width), minHeight: Math.min(600, screen.getPrimaryDisplay().workArea.height), show: false, title: NOME, icon: ICONE,
    backgroundColor: '#002147', autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      partition: PARTICAO, contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: true,
      webviewTag: true          // só para as guias — ver guardarWebviews()
    }
  });
  if (!j || j.max !== false) win.maximize();
  win.once('ready-to-show', () => win.show());
  win.on('close', gravarJanela);
  win.on('page-title-updated', (e, t) => { e.preventDefault(); win.setTitle(t && t.indexOf('Aço Naval') >= 0 ? t : NOME); });

  // sem internet (ou o site fora do ar): tela de aviso, que tenta de novo sozinha
  win.webContents.on('did-fail-load', (e, cod, desc, url, principal) => {
    if (!principal || cod === -3) return;               // -3 = navegação cancelada (normal)
    win.loadFile(OFFLINE, { query: { volta: url && dentro(url) ? url : INICIO } }).catch(() => {});
  });
  win.loadURL(INICIO).catch(() => {});
}

/* ════════════ CONVERSA COM A TELA (window.acnApp, ver preload.js) ════════════
   Só a página do próprio site (ou a tela "sem internet") pode chamar. */
function daCasa(e) {
  const u = (e.senderFrame && e.senderFrame.url) || '';
  return dentro(u) || u.startsWith('file:');
}
ipcMain.on('config', (e) => { e.returnValue = { origem: ORIGEM, inicio: INICIO }; });
ipcMain.handle('info', (e) => {
  if (!daCasa(e)) return null;
  let autostart = false;
  try { autostart = !!app.getLoginItemSettings().openAtLogin; } catch (x) {}
  return { versao: app.getVersion(), autostart, empacotado: app.isPackaged };
});
ipcMain.handle('autostart', (e, ligar) => {
  if (!daCasa(e)) return false;
  try { app.setLoginItemSettings({ openAtLogin: !!ligar }); return true; } catch (x) { return false; }
});
ipcMain.handle('abrir-fora', (e, u) => {
  if (!daCasa(e)) return false;
  abrirFora(String(u || '')); return true;
});
// guia removida: apaga o login e os dados guardados dela
ipcMain.handle('limpar-guia', async (e, id) => {
  const part = 'persist:guia-' + String(id || '');
  if (!daCasa(e) || !PARTICAO_GUIA.test(part)) return false;
  try { await session.fromPartition(part).clearStorageData(); await session.fromPartition(part).clearCache(); return true; } catch (x) { return false; }
});
ipcMain.handle('voltar', (e, u) => {
  if (!daCasa(e) || !win) return false;
  win.loadURL(dentro(u) ? u : INICIO).catch(() => {}); return true;
});

/* ════════════ RESPOSTAS RÁPIDAS (atendimento) — ver atendimento.js ════════════ */
require('./atendimento.js')({ app, ipcMain, daCasa, UA: (session.defaultSession && session.defaultSession.getUserAgent && session.defaultSession.getUserAgent()) || ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/' + process.versions.chrome) });

/* ════════════ ARQUIVOS: PDF, bandeja dos baixados, pacote, arrasto — ver arquivos.js ════════════ */
const ARQUIVOS = require('./arquivos.js')({ app, ipcMain, daCasa, session, janela: () => win, ICONE });

/* ════════════ ATUALIZAÇÃO AUTOMÁTICA ════════════
   Procura ao abrir e a cada 4 horas; baixa sozinho, avisa no trilho e numa
   faixa em cima. Instala ao reiniciar (botão) ou quando o programa fechar. */
let atualizador = null, ultimoEstado = { estado: 'atual' };
function avisarAtualizacao(d) {
  ultimoEstado = d;
  if (win && !win.isDestroyed()) win.webContents.send('atualizacao', d);
}
function ligarAtualizador() {
  if (!app.isPackaged) return;
  try { atualizador = require('electron-updater').autoUpdater; } catch (e) { return; }
  atualizador.autoDownload = true;
  atualizador.autoInstallOnAppQuit = true;
  atualizador.on('checking-for-update', () => avisarAtualizacao({ estado: 'procurando' }));
  atualizador.on('update-not-available', () => avisarAtualizacao({ estado: 'atual' }));
  atualizador.on('download-progress', (p) => avisarAtualizacao({ estado: 'baixando', pct: p.percent }));
  atualizador.on('update-downloaded', (i) => avisarAtualizacao({ estado: 'pronta', versao: i && i.version }));
  atualizador.on('error', (err) => avisarAtualizacao({ estado: 'erro', msg: String(err && err.message || err).slice(0, 200) }));
  const procurar = () => atualizador.checkForUpdates().catch(() => {});
  setTimeout(procurar, 8000);
  setInterval(procurar, 4 * 60 * 60 * 1000);
}
ipcMain.handle('procurar-atualizacao', (e) => {
  if (!daCasa(e)) return null;
  if (!atualizador) { avisarAtualizacao({ estado: 'atual' }); return ultimoEstado; }
  atualizador.checkForUpdates().catch(() => {});
  return ultimoEstado;
});
ipcMain.handle('instalar-atualizacao', (e) => {
  if (!daCasa(e) || !atualizador || ultimoEstado.estado !== 'pronta') return false;
  setImmediate(() => atualizador.quitAndInstall(false, true));
  return true;
});

/* ════════════ INICIAR ════════════ */
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // clicou no atalho com o programa já aberto: traz a janela pra frente
  app.on('second-instance', (e, argv) => {
    try { ARQUIVOS.abrirArgv(argv); } catch (x) {}
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show(); win.focus();
  });
  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    ligarPermissoes(session.fromPartition(PARTICAO));
    criarJanela();
    ligarAtualizador();
    try { ARQUIVOS.abrirArgv(process.argv); } catch (x) {}
  });
  app.on('window-all-closed', () => app.quit());
}
