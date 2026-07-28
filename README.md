# CAD Unifilar — Editor Web de Diagramas Unifilares Elétricos

MVP de um editor CAD 2D web, ágil e gratuito, focado **estritamente** no
desenho de diagramas unifilares elétricos — pensado para rodar na Vercel
(plano Hobby) e persistir no Firebase Firestore (plano Spark, gratuito).

## Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Konva / react-konva** para o canvas 2D (grid, zoom, pan, formas)
- **Zustand** para o estado global do editor
- **Tailwind CSS 4** para a interface
- **Firebase Web SDK v12** (Firestore + Auth) — com *fallback* automático
  para um mock local (`localStorage`, incluindo um uid determinístico por
  e-mail) enquanto as credenciais não são preenchidas
- **pdf.js** (`pdfjs-dist`) para rasterizar um PDF importado como XREF —
  suporta PDFs de múltiplas páginas (seletor visual de página quando há
  mais de uma). O worker é servido como asset estático do próprio app
  (`public/pdf.worker.min.mjs`, sincronizado do pacote instalado via
  `npm run sync-pdf-worker`, que roda automaticamente no `postinstall`),
  não de um CDN externo — evita depender de rede de terceiros em tempo de
  execução.
- **jsPDF** para exportar a prancha ativa como PDF vetorial (100%
  client-side, sem servidor), incluindo hachuras vetoriais reais (não
  aproximação de cor sólida) e o carimbo/legenda de título ABNT

## Como rodar localmente

```bash
npm install
npm run dev
```

Abra http://localhost:3000. O app funciona **imediatamente**, sem
credencial nenhuma: "Salvar no Firestore" grava no `localStorage` do
navegador até você configurar o Firebase de verdade.

## Como plugar suas credenciais do Firebase (plano Spark)

1. Crie um projeto em https://console.firebase.google.com
2. Ative o **Firestore Database** (modo produção).
3. Em *Project settings → General → Your apps*, crie um app **Web** e
   copie as chaves de configuração.
4. Copie `.env.local.example` para `.env.local` e preencha:

   ```
   NEXT_PUBLIC_FIREBASE_API_KEY=...
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
   NEXT_PUBLIC_FIREBASE_APP_ID=...
   ```

5. Pronto — nenhuma outra mudança de código é necessária. `salvarProjeto`
   e `carregarProjeto` (em `src/lib/firebase.ts`) passam a usar o
   Firestore de verdade automaticamente.
6. **Regras de segurança** (ajuste depois para autenticação real; isto é
   só para o MVP funcionar em modo de teste):

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /projetos/{id} {
         allow read, write: if true; // TROQUE antes de ir para produção
       }
     }
   }
   ```

## Deploy na Vercel (Hobby)

```bash
npx vercel
```

Configure as mesmas variáveis `NEXT_PUBLIC_FIREBASE_*` em
*Project Settings → Environment Variables* na Vercel.

## Como usar o editor

- **Linha de comando** (rodapé, estilo AutoCAD):
  - `L` — linha (clique = 1º ponto, clique = 2º ponto, e continua
    encadeando; `Esc` encerra).
  - `C` — círculo (centro + clique para o raio).
  - `REC` — retângulo (clique = 1º canto, clique = canto oposto).
  - `POL` — polígono fechado: cada clique crava um vértice; `Enter`
    fecha o polígono (mínimo 3 vértices, como o Close do PLINE do
    AutoCAD), `Esc` cancela o desenho em andamento.
  - `PL` (ou `PLINE`) — polilinha **aberta**: igual ao `POL` no jeito de
    cravar vértices (clique a clique), mas `Enter` conclui o elemento
    **sem** fechar entre o último e o primeiro ponto (mínimo 2 vértices)
    -- é o objeto `tipo: "polilinha"`, distinto do `poligono` (que
    sempre fecha e é o único hachurável). `Esc` cancela.
  - `S` — ferramenta Selecionar (clique escolhe 1 elemento; **Shift+clique**
    adiciona/remove elementos da seleção).
  - `E` ou `DEL` — apagar. Com uma seleção ativa, apaga na hora; sem
    seleção, entra no modo clique-para-apagar (igual ao ERASE do AutoCAD).
  - `M` — mover os elementos selecionados (clique = ponto base, clique =
    destino). Exige seleção prévia.
  - `CO` ou `CP` — copiar os elementos selecionados (ponto base + destino);
    continua armado para múltiplas cópias a partir do mesmo ponto base,
    até `Esc`. Exige seleção prévia.
  - `H` — hachura (Hatch Tool). Com uma seleção ativa, aplica a hachura
    ativa na hora a todo retângulo/polígono selecionado; sem seleção,
    entra no modo clique-para-hachurar (clicar num retângulo/polígono
    aplica, clicar de novo no mesmo elemento remove).
  - `TR` — aparar (TRIM). Passe o mouse sobre um segmento -- os pontos
    de interseção com todas as outras linhas visíveis são calculados na
    hora, e o segmento sob o cursor fica em destaque (vermelho); clique
    para removê-lo. Não precisa selecionar arestas de corte antes: toda
    linha visível já funciona como corte para todas as outras.
  - `O` — deslocar (OFFSET). Digite a distância (mm) e pressione Enter
    (o próximo Enter é lido como o valor, não como um novo comando),
    clique na linha alvo e depois clique de um dos lados para definir a
    direção -- uma cópia paralela é criada naquele lado, na distância
    informada. A linha original nunca é alterada.
  - `F` — concordância (FILLET). Usa o raio "lembrado" do uso anterior
    (nasce em 0mm); `R` + Enter + um número muda o raio antes de
    selecionar. Selecione duas linhas (a segunda conclui): com raio 0,
    as duas são esticadas/cortadas até se encontrarem num vértice
    pontiagudo; com raio > 0, um arco tangente às duas é inserido, e as
    linhas são cortadas nos pontos de tangência.
  - `T` — texto. Clique posiciona o ponto de inserção; o **próximo**
    Enter é lido como o conteúdo literal do texto (não como um comando
    novo, mesmo que pareça um). `Esc` cancela antes de digitar.
  - `DIM` — cota (Dimension/Ruler). 3 cliques: ponto inicial, ponto final
    (a distância aparece ao vivo durante o arraste, como uma régua) e a
    posição da linha de cota/extensão -- o 3º clique já insere o
    elemento `tipo: "cota"` definitivo, com o texto da distância
    calculado e "congelado" na hora. `Esc` a qualquer momento cancela
    sem salvar nada.
  - `PE` (ou `CONC`/`CONCESSIONARIA`) — Padrão de Entrada/Concessionária.
    2 cliques: posição do poste, depois posição do medidor -- insere o
    conjunto inteiro (poste + ramal + medidor + 2 textos editáveis) de
    uma vez, como um único passo de undo. `Esc` cancela antes do 2º
    clique.
  - `MV` (ou `MVIEW`) — Viewport (janela de impressão). 2 cliques (canto
    a canto) inserem um retângulo `tipo: "viewport"` na prancha -- uma
    "janela" que mostra uma vista independente (zoom/pan próprios) do
    mesmo mundo compartilhado do projeto. Repete até `Esc` (permite
    inserir vários seguidos, como o `RETANGULO`).
  - `Z`/`W` (ou `ZW`) — Zoom Window. 2 cliques definem um retângulo de
    seleção; a área é enquadrada para preencher 100% da tela (fora de um
    Viewport) ou 100% do Viewport em "Model Ativo" (dentro de um) --
    volta sozinho para `Selecionar` ao concluir (comando de
    visualização, não de desenho).
  - Todos os comandos têm botões equivalentes na régua de ferramentas
    (`ToolRuler`, reposicionável -- ver abaixo). A tecla `Delete`/
    `Backspace` também apaga a seleção atual, mesmo fora da linha de
    comando.
- **Seleção por caixa (Window vs. Crossing Select)**: com a ferramenta
  Selecionar ativa, arraste no canvas vazio (ou por cima de formas --
  só conta como arraste depois de um pequeno limiar de movimento, um
  clique parado continua selecionando 1 elemento como sempre):
  - **Da esquerda para a direita**: retângulo **azul sólido** (Window
    Select) -- seleciona só os elementos com a bounding box **100%
    dentro** da caixa.
  - **Da direita para a esquerda**: retângulo **verde tracejado**
    (Crossing Select) -- seleciona qualquer elemento que esteja contido
    **ou apenas cruzado/tocado** pela caixa.
  - Segure `Shift` ao soltar o botão do mouse para **adicionar** à
    seleção atual em vez de substituí-la.
- **Grid & Snap**: o cursor "gruda" nos múltiplos de 10mm (ajustável na
  barra de status). Pode ser desligado no botão `SNAP ON/OFF`.
- **OSNAP (atração magnética)**: ao aproximar o cursor a menos de 10px
  (em tela, em qualquer zoom) de um ponto notável de uma geometria já
  desenhada, o ponto gruda exatamente ali -- o candidato mais perto do
  cursor vence, entre 4 tipos:
  - **Endpoint** (extremidade de linha/aresta de retângulo-polígono-
    polilinha, ou ponta de arco) -- indicador **quadrado** verde.
  - **Midpoint** (ponto médio de qualquer aresta, inclusive as de
    retângulos e polígonos, não só linhas soltas) -- indicador
    **triângulo** verde.
  - **Center** (centro de círculo/arco) -- indicador **círculo** verde.
  - **Intersection** (cruzamento exato entre dois segmentos quaisquer,
    mesmo de elementos diferentes) -- indicador em **X** verde. O
    cálculo filtra primeiro os segmentos perto do cursor (em tela) antes
    de testar pares -- evita um O(n²) completo a cada movimento do
    mouse mesmo em desenhos grandes.
  Tem prioridade sobre o snap de grid, e vale para qualquer ferramenta
  que peça um ponto (linha, círculo, retângulo, polígono, polilinha,
  mover, copiar, carimbo, deslocar, concordância). O tipo ativo aparece
  na barra de status (`OSNAP: Center`, por exemplo).
- **Edição por vértices (grips & STRETCH)**: com a ferramenta Selecionar
  ativa e um elemento com vértices editáveis selecionado (linha,
  retângulo, polígono ou polilinha), pequenos quadrados azuis aparecem
  em cada vértice. Clicar num grip arma o modo *stretch*: o vértice
  segue o cursor ao vivo (preview ciano tracejado) até o **próximo
  clique**, que confirma a nova posição -- igual ao arrastar a ponta de
  uma linha/retângulo no AutoCAD. A operação entra no histórico de
  undo/redo como qualquer outra edição.
- **Adicionar/remover vértice (retângulo e polígono fechados)**: junto
  dos grips de vértice, aparecem grips menores e vazados no **meio** de
  cada aresta -- clicar num deles insere um vértice novo naquele ponto.
  Botão direito num vértice já existente abre um menu de contexto com
  "🗑 Remover vértice". Um retângulo editado dessa forma vira
  automaticamente um polígono de 4+ pontos soltos (igual ao `PEDIT` do
  AutoCAD ao editar o vértice de um retângulo) -- inclusive essa
  "promoção" de tipo entra no histórico de undo/redo.
- **Desfazer/Refazer (UNDO/REDO)**: `Ctrl+Z` desfaz e `Ctrl+Y` (ou
  `Ctrl+Shift+Z`) refaz a última ação -- também disponíveis como botões
  "↶ Desfazer"/"↷ Refazer" na barra superior. Cobre toda mutação de
  geometria: criar, mover, copiar, apagar, TRIM, OFFSET, FILLET e
  STRETCH (grips). O histórico guarda até 50 estados; qualquer ação nova
  depois de um Desfazer descarta o "futuro" (Refazer), como em qualquer
  editor convencional.
- **Zoom**: roda do mouse (zoom centrado no cursor).
- **Pan**: arraste segurando o botão do meio **ou** o botão direito do
  mouse.
- **Camadas (layers)**: painel na barra lateral esquerda. Cada camada tem
  nome, cor, espessura de linha e visibilidade (ícone de lâmpada).
  Clique no nome de uma camada para torná-la a "camada ativa" — todo
  elemento novo herda essa camada. Camadas ocultas não são desenhadas
  nem clicáveis (nem capturadas pelo OSNAP). O projeto já nasce com
  `0`, `BARRAMENTO`, `COMANDO`, `TEXTOS` e `MOLDURA`.
- **Pranchas (plotagem ABNT)**: seletor "Prancha" na barra superior
  (A4/A3/A2/A1). A borda cinza tracejada mostra os limites reais da
  folha (mm) e a linha interna mostra a margem ABNT NBR 10068 (10mm nas
  bordas, 25mm à esquerda para encadernação). O botão **Exportar PDF**
  gera, 100% no navegador, um PDF vetorial contendo só o que está dentro
  dos limites da prancha ativa — linhas, círculos e blocos são
  redesenhados como vetores (não é uma captura de tela), respeitando
  cor/espessura/visibilidade de cada camada.
- **Carimbo/legenda de título ABNT**: painel "Carimbo (ABNT)" na barra
  lateral, com os campos Título, Cliente, Responsável técnico, CREA/CFT,
  Escala, Data, Prancha e um upload opcional de logo (comprimido no
  navegador). É desenhado automaticamente no canto inferior direito da
  prancha ativa, dentro da margem ABNT, com tamanho **proporcional ao
  formato da folha** (cresce de A4 para A1, com um teto para não ficar
  enorme numa A1) — não precisa desenhar a moldura manualmente. Um botão
  "Visível/Oculto" permite escondê-lo temporariamente sem apagar os
  dados preenchidos. Aparece tanto no canvas quanto na exportação PDF.
- **Hachura (Hatch Tool)**: painel "Hachura" na barra lateral, com 6
  padrões (Sólido, ANSI31 diagonal, Pontilhado, Concreto, Terra,
  Cruzado), cor e escala configuráveis — os padrões são gerados
  dinamicamente em um `<canvas>` offscreen (`lib/hachura.ts`) e
  reaproveitados como preenchimento real das formas (o mesmo canvas do
  preview do seletor é o que é usado no desenho, então a prévia é
  sempre fiel). Aplica-se só a **retângulos** e **polígonos fechados**:
  escolha o padrão, ative a ferramenta "Hachurar" (botão na
  sidebar/toolbar ou comando `H`) e clique na forma — clicar de novo no
  mesmo elemento remove a hachura. Também dá pra selecionar várias
  formas fechadas (Selecionar + Shift+clique) e rodar `H` para aplicar
  em lote de uma vez. Útil para marcar áreas em croquis (lotes,
  edificações, zonas) depois de calibrar uma imagem de fundo. Na
  exportação PDF, cada padrão é redesenhado como um vetor de verdade
  (linhas/pontos recortados na forma via `doc.clip()`), não uma
  aproximação de cor sólida — o resultado impresso bate visualmente com
  o que aparece na tela.
- **Biblioteca de Blocos** (painel dobrável na barra lateral, clique no
  cabeçalho recolhe/expande): Disjuntor, Transformador, Tomada, DPS,
  Seccionadora CC, Fusível, Inversor, Stringbox e Malha de Aterramento
  (simbologia fotovoltaica/elétrica padrão ABNT). Dois jeitos de
  inserir, ambos respeitando OSNAP/snap de grid: **clique** no bloco
  para "armar o carimbo" e depois clique no canvas (`Esc` cancela), ou
  **arraste (Drag & Drop)** o bloco direto para o ponto exato do canvas
  onde deve entrar.
- **Padrão de Entrada/Concessionária** (comando `PE`, ou botão "⚡" no
  fim da Biblioteca de Blocos): insere em **2 cliques** o conjunto
  vetorial completo de uma entrada de energia -- 1º clique posiciona o
  **poste**, 2º clique posiciona o **medidor**; ao completar, o sistema
  já desenha a **linha de ramal** entre os dois e cria **2 textos
  editáveis**: o tipo de ramal ("RAMAL AÉREO" por padrão -- edite para
  "RAMAL SUBTERRÂNEO" quando for o caso) e a cota de afastamento em
  relação ao limite do lote ("AFASTAMENTO: 0,00 m" -- edite com o valor
  medido). As 5 peças entram no histórico de undo/redo como **um único
  passo**: `Ctrl+Z` desfaz o conjunto inteiro de uma vez. Os textos são
  elementos normais (`tipo: "texto"`), editáveis depois pela barra de
  propriedades como qualquer outro. `Esc` cancela antes do 2º clique.
- **Importar XREF (imagem/PDF)**: botão "Importar imagem / PDF" na barra
  lateral. O arquivo **nunca sobe para nenhum servidor** — vira um
  Object URL local (Blob) e é salvo no IndexedDB do navegador para
  sobreviver a um F5. Um PDF é rasterizado no próprio navegador antes de
  virar XREF: se tiver só 1 página, importa direto; se tiver **mais de
  1**, abre um seletor visual (miniaturas de todas as páginas) para
  escolher qual delas vira o XREF — o nome salvo indica a página (ex.:
  `planta.pdf (pág. 2)`). O Firestore recebe só os metadados (nome do
  arquivo, X, Y, escala) — exatamente como um `IMAGEATTACH` do AutoCAD.
- **Painel JSON** (canto direito, botão `{ } JSON`): mostra em tempo real
  o exato documento que seria salvo no Firestore, incluindo o dicionário
  de camadas.
- **Autenticação e Gerenciador de Projetos na nuvem**: botão "👤 Entrar"
  na barra superior abre um modal simples de e-mail/senha (Entrar ou
  Criar conta). Sem credenciais do Firebase configuradas, entra em modo
  mock: qualquer e-mail válido + senha com 4+ caracteres autentica,
  sempre no mesmo usuário para o mesmo e-mail (nada é validado contra um
  backend real). Uma vez logado, o botão "📁 Meus Projetos" abre o
  Gerenciador: **Novo Projeto**, **Salvar projeto atual** (grava o
  projeto com o seu usuário como dono) e a lista dos seus projetos já
  salvos, com **Abrir**, **Renomear** (inline) e **Excluir** (confirmação
  de 2 cliques no próprio card). O fluxo antigo de "Salvar no
  Firestore"/"Carregar" por `id_projeto` manual continua funcionando
  normalmente, com ou sem login.
- **Rotação e escala de blocos/texto pelo painel de propriedades**: ao
  selecionar um único bloco, a barra lateral mostra campos **Rotação
  (0-360°)**, **Escala X** e **Escala Y** -- editáveis ao vivo, o bloco
  gira/redimensiona em volta do próprio ponto de inserção. Ao selecionar
  um único texto, aparece também um campo **Rotação**. Ao selecionar
  **2 ou mais** elementos (um "grupo"), aparece um campo de ângulo
  (delta) + botão "Aplicar" que gira **todos** os selecionados de uma
  vez em torno do centro da caixa envolvente combinada da seleção --
  equivalente ao `ROTATE` do AutoCAD com seleção múltipla e ponto-base no
  centro da seleção.
- **Calibrar imagem por referência (Scale by Reference)**: para usar um
  print do Google Maps (ou qualquer imagem) como base de um croqui/planta
  de situação em escala real. No item do XREF na barra lateral, clique em
  **"📐 Calibrar por referência"**. O cursor entra em modo de calibração:
  clique em dois pontos de referência conhecidos na imagem (ex.: as duas
  pontas da barra de escala gráfica do mapa) — uma linha amarela
  acompanha o cursor entre o 1º e o 2º clique, mostrando ao vivo a
  distância (em mm de desenho) já medida. Ao dar o 2º clique, um modal
  pergunta a **distância real, em metros**, entre esses dois pontos (ex.:
  digitar `50` se a barra de escala representa 50m). Ao confirmar, o
  sistema calcula a distância em pixels/mm medida no desenho e resolve
  `novaEscala = escalaAtual × (distânciaReal_mm / distânciaMedida_mm)`
  — exatamente a lógica do comando `SCALE` com a opção `Reference` do
  AutoCAD. A propriedade `escala` do XREF é atualizada na hora (o campo
  "Escala" no painel lateral reflete o novo valor), a imagem se
  redimensiona automaticamente no canvas e fica "travada" em escala 1:1
  com o restante do desenho (mm) — pronta para servir de base para
  desenhar por cima. Um selo **📐** aparece ao lado do nome do arquivo
  para indicar que aquele XREF já foi calibrado; editar a "Escala"
  manualmente depois remove o selo. `Esc` cancela a calibração em
  qualquer momento antes do 2º clique.
- **Ferramentas de precisão (TRIM/OFFSET/FILLET)**: réplicas das
  ferramentas de edição geométrica mais usadas do AutoCAD, ver os
  comandos `TR`/`O`/`F` acima. Todas operam sobre linhas retas (`tipo:
  "linha"`); o FILLET com raio > 0 cria um novo elemento `tipo: "arco"`.
  A matemática (interseção de segmentos/retas, vetor perpendicular,
  pontos de tangência) fica isolada em `lib/geom.ts` e `lib/trim.ts`,
  puras e sem dependência de UI.
- **Régua de ferramentas reposicionável**: painel "Configurações" na
  barra lateral (embaixo, seletor "Régua de ferramentas") alterna a
  posição do `ToolRuler` entre **Topo** (padrão, barra horizontal acima
  do canvas), **Esquerda** e **Direita** (coluna vertical ao lado do
  canvas). O estado (`toolbarPosicao`) fica no Zustand, então é salvo
  junto do resto da sessão do navegador.
- **Texto**: ferramenta `T` (ver comando acima). O tamanho da fonte
  (`fontSize`) é definido em **mm de mundo**, não em pixels de tela --
  por isso já "respeita a escala da prancha ativa" automaticamente, sem
  nenhuma conversão extra: a exportação PDF já mapeia 1 unidade de mundo
  = 1mm de papel em qualquer formato A1-A4 (ver `pdfExport.ts`), então o
  mesmo texto sai do mesmo tamanho físico em qualquer prancha. O painel
  "Texto" na barra lateral tem dois modos: sempre mostra o **tamanho
  padrão** (mm) usado no próximo texto inserido (lembrado entre usos,
  mesmo espírito do raio do FILLET); quando exatamente **um** elemento
  de texto já existente está selecionado, mostra também os campos de
  conteúdo/tamanho **daquele elemento específico**, editáveis ao vivo.
- **Cota (Dimension/Ruler)**: ferramenta `DIM` (ver comando acima). O
  elemento `tipo: "cota"` guarda os dois pontos medidos e o 3º ponto
  clicado (que define o deslocamento perpendicular da linha de cota);
  as linhas de extensão e a linha de cota em si são **derivadas** desses
  3 pontos em tempo de renderização (`lib/geom.ts#linhaDeCota`), tanto
  no canvas quanto na exportação PDF. O texto da distância é calculado e
  **congelado** no momento da criação -- mover a geometria medida depois
  não atualiza o número (igual a uma cota "explodida" do AutoCAD).
- **Viewport / Janela de Impressão (comando `MV`/`MVIEW`)**: insere um
  retângulo na prancha que funciona como uma "janela mágica" para uma
  vista independente do MESMO espaço de geometria compartilhado do
  projeto -- não existe um "Model Space" fisicamente separado nesta
  versão do app; o Viewport é só uma vista recortada/reescalada desse
  mesmo mundo (ver `ViewportShape.tsx` e o comentário de
  `ViewportGeometria` em `lib/types.ts`).
  - **Duplo clique DENTRO** do retângulo entra em **"Model Ativo"**: a
    roda do mouse e o pan (botão do meio/direito) passam a controlar
    **só a câmera local desse viewport** (zoom/pan independentes da
    prancha principal) até um **duplo clique FORA** de qualquer viewport
    devolver o foco à prancha. As ferramentas de **desenho** continuam
    sempre operando nas coordenadas da prancha (papel), mesmo com um
    viewport em Model Ativo -- só o zoom/pan é redirecionado (ver
    limitação abaixo).
  - **Escala de impressão automática**: a barra de propriedades, com o
    viewport selecionado, mostra/edita a **Escala 1:N** (`modelScale`)
    diretamente -- o mesmo valor é calculado sozinho pelo `ZOOM WINDOW`
    (`Z`/`W`) quando executado dentro de um viewport em Model Ativo, e
    aparece também como rótulo (`ESC 1:N`) no canto do retângulo, tanto
    no canvas quanto na exportação PDF.
  - Um checkbox **"Borda visível no PDF"** permite ocultar a moldura do
    retângulo (e o rótulo de escala) só na exportação -- no editor a
    borda sempre aparece, para dar para selecionar/mover o viewport.
  - Redimensionar (grips de canto) e mover um viewport funcionam como um
    retângulo normal -- o enquadramento interno (`modelScale`/
    `modelOffsetX/Y`) não muda ao arrastar um canto ou mover o retângulo
    inteiro, só ao usar `ZOOM WINDOW` dentro dele. **Rotação não é
    suportada** (ver limitação abaixo).
- **Zoom Window (comando `Z`/`W`/`ZW`)**: 2 cliques definem um retângulo
  de seleção; a área enquadrada preenche 100% da tela ativa (fora de um
  viewport) ou 100% do viewport em Model Ativo (dentro de um), com a
  escala de impressão recalculada automaticamente nesse segundo caso.
  Sempre volta para `Selecionar` ao concluir.

## Estrutura de pastas

```
src/
  app/                 Rotas Next.js (App Router)
  components/          Componentes React (canvas, toolbar, sidebar...)
    LayersPanel.tsx      Painel de camadas (criar/ligar-desligar/ativar)
    HatchPanel.tsx         Painel de hachura (padrão/cor/escala + amostras)
    PropertiesPanel.tsx      Barra de propriedades de texto (tamanho padrão + edição do selecionado)
    SettingsPanel.tsx          Painel de Configurações (posição da régua de ferramentas)
    ToolRuler.tsx                 Régua de ferramentas reposicionável (TOP/LEFT/RIGHT)
    CalibrationModal.tsx            Modal "distância real" da calibração de XREF
    ArcoShape.tsx                      Desenha o arco do FILLET (Konva.Shape/sceneFunc)
    TitleBlockLayer.tsx                  Carimbo/legenda ABNT desenhado no canvas (canto inferior direito)
    TitleBlockPanel.tsx                    Painel da sidebar que edita os campos do carimbo + logo
    PdfPageModal.tsx                         Seletor visual de página ao importar um PDF multipáginas
    AuthPanel.tsx                              Widget de conta na Toolbar (Entrar/e-mail+Sair)
    LoginModal.tsx                               Modal de login/cadastro (Firebase Auth ou mock)
    ProjectManagerModal.tsx                        Gerenciador de Projetos (novo/salvar/listar/renomear/excluir)
    VertexContextMenu.tsx                            Menu de contexto (botão direito) p/ remover vértice
    BlockLibraryPanel.tsx                               Biblioteca de Blocos dobrável (clique ou drag&drop) + botão do Padrão de Entrada
    ViewportShape.tsx                                      Renderiza um Viewport: clip + "câmera local" (Group aninhado) reprojetando o resto da geometria em modo somente-leitura
  lib/
    types.ts           Modelo de dados (espelha o schema do Firestore;
                        inclui Camada, camadasIniciais, MARGENS_ABNT,
                        TextoGeometria, CotaGeometria, PolilinhaGeometria,
                        PosicaoToolbar, Carimbo, dimensoesCarimbo,
                        ViewportGeometria)
    store.ts            Estado global (Zustand) -- ferramenta, seleção
                         múltipla/por caixa, camadas, prancha ativa,
                         OSNAP, TRIM/OFFSET/FILLET, texto, cota, régua,
                         undo/redo (past/future), grips/STRETCH, PLINE,
                         Padrão de Entrada/Concessionária (5 peças/1 undo),
                         Viewport (viewportAtivoId/setViewportAtivo/
                         atualizarViewport)
    blocks.ts           Biblioteca de blocos elétricos (SVG) -- inclui os
                        2 blocos internos (poste/medidor) do Padrão de
                        Entrada, marcados `interno: true`
    snap.ts              Grid snap + conversões de coordenadas
    osnap.ts              OSNAP Endpoint/Midpoint/Center/Intersection
                           (atração magnética, com filtro de candidatos
                           antes do O(k²) de Intersection)
    grips.ts               Vértices editáveis (grips) + STRETCH puro:
                            `gripsDeGeometria`/`aplicarStretchNaGeometria`,
                            + grips intermediários (meio de aresta) para
                            inserir vértice: `gripsIntermediariosDeGeometria`
    auth.ts                 Autenticação (Firebase Auth real ou mock local
                             determinístico por e-mail) -- `lib/auth.ts`
    layers.ts              Resolve estilo/visibilidade de uma camada
    hachura.ts               Motor de padrões de hachura (canvas offscreen)
    selection.ts                Bounding box por tipo de geometria + testes
                                 contido/cruzado (Window/Crossing Select)
    geom.ts                       Álgebra vetorial 2D pura (interseções,
                                   distância ponto-segmento, ângulos,
                                   linha de cota)
    trim.ts                         Lógica do TRIM (segmentos de corte,
                                     linha sob o cursor)
    commands.ts            Interpretador da linha de comando (L/C/REC/
                            POL/PL/TR/O/F/T/DIM/S/E/DEL/M/CO/CP/H/PE/MV/
                            MVIEW/Z/W/ZW)
    firebase.ts              Persistência (Firestore + mock local)
    xrefDb.ts                  IndexedDB dos binários de XREF
    pdfImport.ts                 Rasterização de PDF importado (pdf.js),
                                  inclui inspeção multipágina + miniaturas
    pdfExport.ts                   Exportação vetorial da prancha (jsPDF):
                                    hachuras vetoriais reais (via doc.clip)
                                    + carimbo ABNT + Viewport (`desenharUmaGeometria`
                                    reutilizável + `desenharViewportPdf`, que clipa
                                    e redesenha o conteúdo através de um
                                    `paraFolhaModelo` composto)
    useImage.ts / useHydrateXrefs.ts   Hooks auxiliares
```

## Limitações conhecidas do MVP (próximos passos sugeridos)

- **Viewport (MV/MVIEW)**: rotação não é suportada (`girarSelecao` em
  grupo passa por cima de um viewport selecionado sem efeito nele --
  equivalente ao `VPROTATEASSOC` do AutoCAD, fora de escopo). As
  ferramentas de **desenho** (linha, círculo, retângulo...) sempre
  operam nas coordenadas da prancha (papel), mesmo com um viewport em
  "Model Ativo" -- só o zoom/pan da roda do mouse/arraste são
  redirecionados para a câmera local do viewport; não há como desenhar
  "dentro" de um viewport apontando direto para o mundo através dele
  (o app não tem um Model Space fisicamente separado, ver comentário em
  `lib/types.ts`).
- **Exportação PDF de Viewport -- clip de texto**: o `doc.clip()` do
  jsPDF recorta com segurança formas vetoriais (linha/retângulo/
  polígono/arco/hachura) dentro de um viewport, verificado
  empiricamente (rasterização via `pdftoppm`/poppler) -- mas **não
  recorta `doc.text()`**: um texto cujo ponto de inserção caia dentro do
  viewport mas cujo conteúdo se estenda além da borda "vaza"
  visualmente no PDF exportado (limitação do próprio jsPDF/formato PDF,
  não um bug do app). Evite textos longos perto da borda de um viewport,
  ou redimensione o viewport para dar folga.
- O "Padrão de Entrada/Concessionária" sempre desenha uma linha reta
  entre o poste e o medidor (representando um ramal aéreo) -- trocar o
  texto para "RAMAL SUBTERRÂNEO" muda só a anotação, não o traçado da
  linha (o app não modela um percurso enterrado/curvo).
- A cota de "AFASTAMENTO" do Padrão de Entrada nasce com valor
  placeholder ("0,00 m") -- meça a distância real (ex.: com a
  ferramenta COTA) e edite o texto manualmente depois.
- Autenticação mock (sem credenciais reais do Firebase) não valida
  senha nenhuma de verdade -- qualquer e-mail válido + 4+ caracteres
  entra, sempre no mesmo usuário para o mesmo e-mail. As regras do
  Firestore sugeridas acima também ainda são abertas
  (`allow read, write: if true`); uma vez com Firebase Auth real
  habilitado, troque para exigir
  `request.auth.uid == resource.data.owner_uid`.
- Rotação de bloco/texto gira em volta do próprio ponto de
  inserção/âncora, não necessariamente do centro visual do desenho.
- Edição por vértices (grips/STRETCH, inserir/remover vértice) cobre
  linha, retângulo, polígono e polilinha; não edita vértice individual
  de círculo/arco/texto/cota (não fazem sentido como "vértices soltos").
  Um retângulo promovido a polígono (ao girar em grupo ou editar um
  vértice) não volta a ser retângulo automaticamente -- só via Ctrl+Z.
- OSNAP cobre Endpoint/Midpoint/Center/Intersection; ainda não tem
  Perpendicular nem Tangent.
- TRIM/OFFSET/FILLET operam só sobre linhas retas (`tipo: "linha"`) --
  não apara/desloca/concorda círculos, retângulos, polígonos ou
  polilinhas.
- FILLET com raio 0 sempre estende/corta as duas linhas até o vértice
  teórico (interseção das retas infinitas), mesmo que isso "puxe" a
  linha bem além do que o usuário talvez esperasse visualmente --
  comportamento fiel ao FILLET R=0 do AutoCAD, mas vale ter em mente.
- XREF em PDF: só a página escolhida pelo usuário é rasterizada em alta
  resolução (todas as páginas geram uma miniatura de baixa resolução
  para o seletor, mas a importação em si continua sendo de uma página
  por vez).
- Cada clique do comando `LINE` ainda gera segmentos independentes (não
  vira uma polilinha única automaticamente) -- para unir segmentos num
  único objeto, use o comando `PL`/`PLINE` desde o início.
- O histórico de undo/redo vive só na sessão do navegador (array em
  memória no Zustand, até 50 estados); não é persistido no
  Firestore/localStorage junto do projeto -- um F5 limpa o histórico
  (a geometria salva continua intacta, só o botão Desfazer "esquece").
- O logo do carimbo é comprimido no navegador (~160px, JPEG) para caber
  no limite de 1MB por documento do Firestore -- não serve para
  impressão em altíssima resolução, só como identificação visual.
- A seleção por caixa (Window/Crossing Select) usa a bounding box de
  cada elemento, não o contorno exato -- um "quase toque" na diagonal de
  um círculo/arco pode contar como cruzado mesmo que a curva em si não
  encoste na caixa (é a mesma aproximação que o AutoCAD faz para formas
  não-retangulares).
- A COTA (Dimension) não tem seta/ponta de flecha nas extremidades (só
  as linhas de extensão + linha de cota + texto), e o texto não é
  editável depois de criado -- pra mudar, apague e meça de novo.
- O texto não tem alinhamento (esquerda/centro/direita) nem rotação;
  sempre nasce alinhado à esquerda, horizontal, na camada ativa.
- A régua de ferramentas (`ToolRuler`) reposicionada para LEFT/RIGHT
  ainda mostra os mesmos botões da posição TOP (sem ícones dedicados
  para o modo vertical) -- funcional, mas os rótulos ficam mais
  apertados numa coluna estreita.
