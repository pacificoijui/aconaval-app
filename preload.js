// preload.js — a única porta entre a tela e o Windows.
// Só a página principal da janela recebe window.acnApp, e só quando ela é
// o próprio site (ou a tela "sem internet"); os módulos, que abrem em
// molduras dentro da casca, não recebem nada.
const { contextBridge, ipcRenderer } = require('electron');

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
    aoAtualizar: (cb) => { if (typeof cb === 'function') ipcRenderer.on('atualizacao', (e, d) => cb(d)); }
  });
}
