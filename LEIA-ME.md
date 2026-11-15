# Sistema Aço Naval — programa para Windows

Mesma base do Sistema Ijuí: uma janela só com o trilho de módulos à esquerda
(Atendimento, Produtos, Orçamentos, Pedidos, Solicitações, Entregas,
Comissões…) e as abas dos módulos abertos em cima, que ficam carregadas.

## Como funciona

- A tela é o `www.aconaval.com/sistema/` (pasta `sistema/` deste repositório).
  Melhorou o sistema no site? Já aparece no programa na hora, sem reinstalar.
- O programa (`main.js`) cuida só do que o navegador não faz:
  - abre só o aconaval.com — WhatsApp, Maps, YouTube etc. vão para o navegador;
  - impressões e telas do próprio sistema abrem em janelas do programa;
  - o login fica guardado no computador;
  - sem internet, mostra `offline.html` e tenta de novo sozinho;
  - abrir junto com o Windows (menu da conta, no rodapé do trilho);
  - **se atualiza sozinho** (electron-updater), lendo as releases do
    repositório público `pacificoijui/aconaval-app`.
- `preload.js` entrega `window.acnApp` só para a casca (nunca para os módulos).
- No navegador, `www.aconaval.com/sistema/` mostra só a página de baixar o programa
  (a casca só abre quando existe `window.acnApp`, isto é, dentro do programa).
- **Guias**: o botão + no trilho adiciona um site de fora (WhatsApp, Instagram, Gmail…)
  numa aba do programa. Cada guia é um `<webview>` com o login num compartimento só
  dela (`persist:guia-<id>`); o `main.js` barra qualquer webview fora desse formato.
  Botão direito na guia edita ou remove (remover apaga o login guardado dela).

## Testar no computador

    npm install
    npm start                      # abre contra www.aconaval.com
    ACN_SITE=http://localhost:8942 npm start   # contra um servidor local

## Gerar o instalador

    npm run dist                   # gera dist/Sistema-Aco-Naval-Setup.exe

No Linux precisa do Wine (64 e 32 bits) instalado.

## Publicar uma versão nova (atualiza todos os computadores)

1. Aumente `version` no `package.json` (ex.: 1.0.1).
2. Commit + tag igual: `git tag v1.0.1 && git push --tags` no repositório
   `aconaval-app` — o workflow `.github/workflows/publicar.yml` gera o
   instalador no Windows e publica a release. Os programas instalados baixam
   sozinhos e mostram "Reiniciar e atualizar".
