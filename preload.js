// preload.js — a única porta entre a tela e o Windows.
// Só a página principal da janela recebe window.acnApp, e só quando ela é
// o próprio site (ou a tela "sem internet"); os módulos, que abrem em
// molduras dentro da casca, não recebem nada.
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const cfg = ipcRenderer.sendSync('config') || {};
const daCasa = location.origin === cfg.origem || location.origin.replace('://www.', '://') === String(cfg.origem || '').replace('://www.', '://') || location.protocol === 'file:';

if (daCasa) {
  contextBridge.exposeInMainWorld('acnApp', {
    electron: true,
    inicio: cfg.inicio,
    info: () => ipcRenderer.invoke('info'),
    autostart: (ligar) => ipcRenderer.invoke('autostart', !!ligar),
    abrirFora: (url) => ipcRenderer.invoke('abrir-fora', String(url || '')),
    voltar: (url) => ipcRenderer.invoke('voltar', String(url || '')),
    limparGuia: (id) => ipcRenderer.invoke('limpar-guia', String(id || '')),
    procurarAtualizacao: () => ipcRenderer.invoke('procurar-atualizacao'),
    instalarAtualizacao: () => ipcRenderer.invoke('instalar-atualizacao'),
    aoAtualizar: (cb) => { if (typeof cb === 'function') ipcRenderer.on('atualizacao', (e, d) => cb(d)); },
    // arquivos: a tela nunca manda caminho cru para ler — o programa confere cada um (pastas liberadas)
    arquivos: {
      info: () => ipcRenderer.invoke('arq-info'),
      ler: (p) => ipcRenderer.invoke('arq-ler', String(p || '')),
      existe: (p) => ipcRenderer.invoke('arq-existe', String(p || '')),
      mostrar: (p) => ipcRenderer.invoke('arq-mostrar', String(p || '')),
      abrirExterno: (p) => ipcRenderer.invoke('arq-abrir-ext', String(p || '')),
      imprimir: (p) => ipcRenderer.invoke('arq-imprimir', String(p || '')),
      arrastar: (lista) => ipcRenderer.send('arq-arrastar', (Array.isArray(lista) ? lista : []).map(String)),
      // arquivo que o usuário soltou na janela: o preload descobre o caminho real e o programa libera aquele arquivo
      caminhoDe: async (file) => { try { const p = webUtils.getPathForFile(file); if (!p) return null; const r = await ipcRenderer.invoke('arq-liberar', p); return r && r.ok ? r.caminho : null; } catch (e) { return null; } },
      pendentes: () => ipcRenderer.invoke('arq-pendentes'),
      aoBaixar: (cb) => { if (typeof cb === 'function') ipcRenderer.on('arq-baixado', (e, d) => cb(d)); },
      aoAbrirExterno: (cb) => { if (typeof cb === 'function') ipcRenderer.on('arq-abrir-externo', (e, d) => cb(d)); }
    },
    // respostas rápidas (a pasta do Google Drive é escolhida na janela do Windows; a tela nunca manda caminho)
    respostas: {
      info: () => ipcRenderer.invoke('resp-info'),
      escolherPasta: () => ipcRenderer.invoke('resp-escolher-pasta'),
      ler: () => ipcRenderer.invoke('resp-ler'),
      gravar: (estado) => ipcRenderer.invoke('resp-gravar', estado),
      midiaSalvar: (dataUrl) => ipcRenderer.invoke('resp-midia-salvar', { dataUrl: String(dataUrl || '') }),
      midiaLer: (nome) => ipcRenderer.invoke('resp-midia-ler', String(nome || '')),
      midiaApagar: (nome) => ipcRenderer.invoke('resp-midia-apagar', String(nome || '')),
      audioParaOgg: (dataUrl, ext) => ipcRenderer.invoke('resp-audio-ogg', { dataUrl: String(dataUrl || ''), ext: String(ext || '') }),
      waJs: () => ipcRenderer.invoke('resp-wajs'),
      waJsAtualizar: () => ipcRenderer.invoke('resp-wajs-atualizar')
    }
  });
}
