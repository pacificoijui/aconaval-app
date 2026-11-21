/* ═══════════════════════════════════════════════════════════════
   ARQUIVOS (PDF e imagens) — parte do programa
   Visualizador próprio, bandeja dos baixados, pacote de envio e arrasto
   nativo do Windows. A tela NUNCA lê arquivo por caminho direto: ela pede
   ao processo principal, que confere o caminho contra as pastas liberadas
   (Downloads, Documentos, Área de trabalho e a pasta própria do sistema) e
   contra os arquivos que o próprio Windows entregou (dois cliques, arrastar
   e soltar). Nada de senha ou documento pessoal vai para log.
   ═══════════════════════════════════════════════════════════════ */
const { shell, nativeImage, BrowserWindow, webContents } = require('electron');
const path = require('path');
const fs = require('fs');

const EXT_VISOR = /\.(pdf|png|jpe?g|gif|webp|bmp)$/i;                 // abrem no visualizador do programa
const EXT_ABRIVEL = /\.(pdf|png|jpe?g|gif|webp|bmp|docx?|odt|xlsx?|ods|rtf|txt|csv|zip)$/i;   // o resto abre no programa do Windows
const LIMITE = 400 * 1024 * 1024;

module.exports = function ligarArquivos({ app, ipcMain, daCasa, session, janela, ICONE }) {
  const handle = (canal, fn) => ipcMain.handle(canal, (e, ...a) => (daCasa(e) ? fn(e, ...a) : { ok: false, error: 'origem_invalida' }));
  const win32 = process.platform === 'win32';
  const norm = (p) => { const r = path.resolve(p); return win32 ? r.toLowerCase() : r; };

  /* ── pastas liberadas e arquivos entregues pelo Windows ── */
  const pastaSistema = () => path.join(app.getPath('downloads'), 'Sistema Aço Naval');
  function pastasLiberadas() {
    const l = [];
    ['downloads', 'documents', 'desktop'].forEach(n => { try { l.push(app.getPath(n)); } catch (e) {} });
    l.push(pastaSistema());
    return l;
  }
  const permitidos = new Set();            // arquivos que o Windows entregou (dois cliques / arrastar) — valem até fechar o programa
  const real = (p) => { try { return fs.realpathSync(p); } catch (e) { return null; } };
  /** devolve o caminho real se o arquivo existe e está liberado; senão null */
  function conferir(p) {
    p = String(p || '');
    if (!p || p.length > 1000 || p.includes('\0') || !path.isAbsolute(p)) return null;
    const r = real(p); if (!r) return null;
    try { if (!fs.statSync(r).isFile()) return null; } catch (e) { return null; }
    if (permitidos.has(norm(r))) return r;
    for (const d of pastasLiberadas()) {
      const rd = real(d); if (!rd) continue;
      const a = norm(r), b = norm(rd) + (win32 ? '\\' : '/');
      if (a.startsWith(b)) return r;
    }
    return null;
  }
  function liberar(p) { const r = real(p); if (r) { permitidos.add(norm(r)); return r; } return null; }

  handle('arq-info', () => ({ ok: true, pastas: pastasLiberadas(), sistema: pastaSistema() }));
  handle('arq-ler', async (e, p) => {
    try {
      const r = conferir(p); if (!r) return { ok: false, error: 'caminho_nao_liberado' };
      if (!EXT_VISOR.test(r)) return { ok: false, error: 'tipo_nao_suportado' };
      const st = fs.statSync(r); if (st.size > LIMITE) return { ok: false, error: 'arquivo_grande_demais' };
      const buf = fs.readFileSync(r);
      return { ok: true, bytes: new Uint8Array(buf.buffer, buf.byteOffset, buf.length), nome: path.basename(r), tamanho: st.size, quando: st.mtimeMs };
    } catch (err) { return { ok: false, error: String(err && err.message || err) }; }
  });
  handle('arq-existe', (e, p) => ({ ok: true, existe: !!conferir(p) }));
  handle('arq-mostrar', (e, p) => { const r = conferir(p); if (!r) return { ok: false, error: 'caminho_nao_liberado' }; shell.showItemInFolder(r); return { ok: true }; });
  handle('arq-abrir-ext', async (e, p) => {
    const r = conferir(p); if (!r || !EXT_ABRIVEL.test(r)) return { ok: false, error: 'caminho_nao_liberado' };
    const m = await shell.openPath(r); return m ? { ok: false, error: m } : { ok: true };
  });
  handle('arq-imprimir', async (e, p) => {
    const r = conferir(p); if (!r) return { ok: false, error: 'caminho_nao_liberado' };
    try {
      const w = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, plugins: true } });
      await w.loadFile(r);
      await new Promise(res => setTimeout(res, /\.pdf$/i.test(r) ? 900 : 200));
      w.webContents.print({ silent: false, printBackground: true }, () => { try { w.destroy(); } catch (x) {} });
      return { ok: true };
    } catch (err) { return { ok: false, error: String(err && err.message || err) }; }
  });
  // preload entrega o caminho de um arquivo que o USUÁRIO soltou na janela (webUtils.getPathForFile)
  handle('arq-liberar', (e, p) => { const r = liberar(p); if (!r || !EXT_ABRIVEL.test(r)) return { ok: false, error: 'arquivo_invalido' }; return { ok: true, caminho: r }; });

  /* ── arrasto nativo: a tela manda só caminhos; o main confere cada um ── */
  ipcMain.on('arq-arrastar', (e, lista) => {
    if (!daCasa(e)) return;
    const files = (Array.isArray(lista) ? lista : []).slice(0, 80).map(conferir).filter(Boolean);
    if (!files.length) return;
    let icon = nativeImage.createEmpty();
    try { icon = nativeImage.createFromPath(ICONE).resize({ width: 48, height: 48 }); } catch (x) {}
    try { e.sender.startDrag(files.length === 1 ? { file: files[0], icon } : { file: files[0], files, icon }); } catch (x) {}
  });

  /* ── downloads: nada abre sozinho; cai na bandeja ── */
  const baixando = new WeakSet();
  function nomeLivre(dir, nome) {
    nome = String(nome || 'arquivo').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').slice(0, 150) || 'arquivo';
    const ext = path.extname(nome), base = path.basename(nome, ext);
    let alvo = path.join(dir, nome), n = 1;
    while (fs.existsSync(alvo)) alvo = path.join(dir, base + ' (' + (n++) + ')' + ext);
    return alvo;
  }
  function ligarSessao(sess) {
    if (!sess || baixando.has(sess)) return; baixando.add(sess);
    sess.on('will-download', (ev, item, wc) => {
      try {
        const dir = pastaSistema(); fs.mkdirSync(dir, { recursive: true });
        const alvo = nomeLivre(dir, item.getFilename());
        item.setSavePath(alvo);
        let origem = ''; try { origem = new URL(item.getURL()).hostname; } catch (x) {}
        const quando = Date.now();
        item.once('done', (e2, estado) => {
          const w = janela(); if (!w || w.isDestroyed()) return;
          let tam = 0; try { tam = fs.statSync(alvo).size; } catch (x) {}
          const ok = estado === 'completed' && tam > 0;
          if (ok) liberar(alvo);
          w.webContents.send('arq-baixado', { caminho: alvo, nome: path.basename(alvo), ok, estado, tamanho: tam, origem, quando, sessao: String((wc && wc.session && wc.session.storagePath) || origem) });
        });
      } catch (x) {}
    });
  }
  app.on('session-created', ligarSessao);
  // defaultSession só existe depois que o app está pronto (antes disso o Electron dá erro)
  app.whenReady().then(() => { try { ligarSessao(session.defaultSession); } catch (x) {} });

  /* ── arquivos que o Windows entrega (dois cliques no PDF, "Abrir com") ── */
  const fila = [];
  function abrirArgv(argv) {
    (argv || []).slice(1).forEach(a => {
      if (!a || a.startsWith('-') || !path.isAbsolute(a) || !EXT_ABRIVEL.test(a)) return;
      const r = liberar(a); if (!r) return;
      const w = janela();
      if (w && !w.isDestroyed() && w.webContents && !w.webContents.isLoading()) w.webContents.send('arq-abrir-externo', { caminho: r, nome: path.basename(r) });
      else fila.push({ caminho: r, nome: path.basename(r) });
    });
  }
  handle('arq-pendentes', () => ({ ok: true, itens: fila.splice(0) }));
  return { abrirArgv, conferir, liberar };
};
