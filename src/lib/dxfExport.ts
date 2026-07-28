/**
 * dxfExport.ts
 * -----------------------------------------------------------------------
 * Exportação para DXF (formato nativo do AutoCAD/qualquer CAD), a pedido
 * do usuário: "inclua a opcao de baixar em DXF tambem, assim vamos
 * conseguir abrir nossos arquivos no autocad". Usa a lib `dxf-writer`
 * (gera o texto ASCII do DXF -- sem depender de nenhum serviço externo,
 * 100% no navegador, mesma filosofia do `pdfExport.ts`).
 *
 * DECISÃO DE ESCOPO -- Model Space, não a Prancha/folha: como o projeto
 * NÃO tem um Model Space fisicamente separado (ver comentário grande em
 * `ViewportGeometria` em `lib/types.ts` -- todo elemento sempre vive num
 * único sistema de coordenadas em mm; uma Prancha/Viewport é só uma
 * "janela" recortada/reescalada desse mesmo mundo), a exportação DXF
 * escreve TODA a `projeto.geometria` nas coordenadas de mundo originais
 * (sem cortar pelos limites de nenhuma folha, ao contrário do PDF) -- é
 * isso que faz sentido pra abrir no AutoCAD: o desenho completo, em
 * escala real (1 unidade = 1mm), não um "recorte de página". O carimbo
 * (título) da Prancha ativa entra também, na mesma posição fixa
 * (canto inferior direito de uma folha centrada na origem) que ele já
 * ocupa em `desenharCarimboPdf`.
 *
 * CONVENÇÃO DE EIXOS -- o `Y` do app cresce pra BAIXO (convenção de
 * tela/canvas, igual o PDF -- ver `paraFolha` em pdfExport.ts, que é só
 * uma translação, sem flip). DXF/AutoCAD usa a convenção matemática
 * padrão (`Y` cresce pra CIMA). Pra o desenho abrir no AutoCAD com a
 * MESMA orientação visual que aparece no editor (em vez de de cabeça pra
 * baixo), todo ponto final é espelhado verticalmente com `dxfY(y) = -y`
 * (função `flip` abaixo) -- aplicado numa ÚNICA camada (o ponto já
 * totalmente calculado em mundo), nunca em ângulos/rotações intermediárias,
 * então nenhuma outra conta (rotação de bloco/texto, hachura, etc.) precisa
 * de ajuste: o mesmo ângulo `geo.rotacao` (sentido horário) usado em
 * qualquer lugar do app já produz o resultado visual correto depois do
 * flip final, contanto que os PONTOS resultantes (não os ângulos) sejam
 * espelhados.
 *
 * SIMPLIFICAÇÕES CONHECIDAS (documentadas, mesma prática do resto do
 * projeto -- ver cabeçalho de `diagramaFv.ts`):
 *  - Hachuras exportam só o CONTORNO vetorial (retângulo/polígono/círculo),
 *    sem o padrão de preenchimento interno (linhas/pontos) nem "SOLID" --
 *    a lib usada não expõe uma entidade HATCH; o usuário pode aplicar um
 *    HATCH nativo do AutoCAD por cima do contorno exportado, se quiser.
 *  - XREFs (imagens/PDFs importados) NÃO são exportados -- anexar uma
 *    imagem externa a um DXF exige um arquivo separado (IMAGEDEF com
 *    caminho de arquivo) que quebra fácil ao mover o DXF pra outra
 *    máquina; fora de escopo pra essa 1ª versão.
 *  - Logo/assinatura do carimbo (imagens PNG/JPEG) NÃO são exportados,
 *    mesmo motivo -- as células do carimbo saem com a borda e a legenda
 *    ("LOGOTIPO"/"ASSINATURA") mas sem a imagem em si.
 *  - Texto do carimbo (campo "Notas") usa uma quebra de linha
 *    APROXIMADA (largura média de caractere, não a métrica exata de
 *    nenhuma fonte -- o AutoCAD vai renderizar com a fonte dele mesmo,
 *    então uma métrica pixel-perfect de outra fonte não ajudaria).
 * -----------------------------------------------------------------------
 */
import Drawing from "dxf-writer";
import { getBlockDef } from "./blocks";
import { resolverCamada } from "./layers";
import { linhaDeCota } from "./geom";
import {
  MARGENS_ABNT,
  ROTULOS_TIPO_LIGACAO,
  dimensoesCarimbo,
  dimensoesFolhaOrientada,
  type BlocoGeometria,
  type Camada,
  type Carimbo,
  type FormatoFolha,
  type Geometria,
  type Prancha,
  type Projeto,
} from "./types";

/** Espelha o eixo Y (ver comentário de convenção de eixos no topo do arquivo) -- ÚNICO lugar que faz essa conta, sempre aplicado por último, com o ponto já 100% calculado em mundo. */
function flip(p: [number, number]): [number, number] {
  return [p[0], -p[1]];
}

/** "#RRGGBB" -> inteiro 0xRRGGBB (formato que `Layer.setTrueColor` espera). */
function hexParaInt(hex: string): number {
  const limpo = hex.replace("#", "");
  const n = parseInt(limpo, 16);
  return Number.isFinite(n) ? n : 0x000000;
}

/** Nome de camada DXF só pode ter caracteres "seguros" -- sanitiza a CHAVE (estável) da camada, não o `nome` livre (pode ter acento/espaço/emoji). */
function nomeCamadaDxf(chave: string, sufixo: string): string {
  const limpo = chave.replace(/[^A-Za-z0-9_-]/g, "_") || "CAMADA";
  return `${limpo}${sufixo}`.slice(0, 255);
}

/**
 * Registra, para CADA camada do projeto, 3 variantes de layer DXF com a
 * MESMA cor:
 *  - "" (base): traço contínuo ou tracejado conforme `camada.estiloLinha`
 *    -- usada por linha/polilinha/arco/cota.
 *  - "_SOLID": SEMPRE contínua -- usada por blocos (símbolos nunca saem
 *    tracejados, mesma regra de `desenharUmaGeometria`/pdfExport.ts) e texto.
 *  - "_DASH": SEMPRE tracejada -- usada quando a FORMA (não a camada) tem
 *    seu próprio `tracejado: true` (só `RetanguloGeometria`, ver types.ts).
 * Devolve um resolvedor `(camadaKey) => { base, solid, dash }` com os 3
 * nomes DXF já prontos pra usar em `setActiveLayer`.
 */
function registrarCamadasDxf(d: Drawing, camadas: Record<string, Camada>) {
  const linetypeDashado = "DASHED"; // built-in do dxf-writer (README: CONTINUOUS/DASHED/DOTTED "out of the box")
  const resolvidos: Record<string, { base: string; solid: string; dash: string }> = {};
  for (const [chave, camada] of Object.entries(camadas)) {
    const corInt = hexParaInt(camada.cor);
    const base = nomeCamadaDxf(chave, "");
    const solid = nomeCamadaDxf(chave, "_SOLID");
    const dash = nomeCamadaDxf(chave, "_DASH");
    const ehTracejadaPorPadrao = camada.estiloLinha === "tracejada";
    d.addLayer(base, 7, ehTracejadaPorPadrao ? linetypeDashado : "CONTINUOUS");
    d.addLayer(solid, 7, "CONTINUOUS");
    d.addLayer(dash, 7, linetypeDashado);
    d.layers[base]?.setTrueColor(corInt);
    d.layers[solid]?.setTrueColor(corInt);
    d.layers[dash]?.setTrueColor(corInt);
    resolvidos[chave] = { base, solid, dash };
  }
  return resolvidos;
}

const CAMADA_FALLBACK_KEY = "__fallback__";

/**
 * Desenha um bloco elétrico (símbolo SVG de `lib/blocks.ts`) em DXF,
 * espelhando PONTO A PONTO o switch de `pdfExport.ts#desenharBloco` --
 * mesmas coordenadas de viewBox (0-100), mesma transformação de
 * posição+rotação+escala (`pt`). Cada ponto final passa por `flip` (ver
 * comentário de convenção de eixos no topo do arquivo) bem no momento de
 * desenhar, então a lógica de `pt()`/rotação em si é IDÊNTICA à do PDF.
 */
function desenharBlocoDxf(d: Drawing, geo: BlocoGeometria, escalaGeom: number = 1) {
  const def = getBlockDef(geo.nome);
  if (!def) return;

  const larguraMm = def.largura * (geo.escalaX ?? geo.escala ?? 1) * escalaGeom;
  const alturaMm = def.altura * (geo.escalaY ?? geo.escala ?? 1) * escalaGeom;
  const fx = larguraMm / 100;
  const fy = alturaMm / 100;
  const cx = geo.x;
  const cy = geo.y;

  const anguloRad = ((geo.rotacao ?? 0) * Math.PI) / 180;
  const cosA = Math.cos(anguloRad);
  const sinA = Math.sin(anguloRad);

  const pt = (vx: number, vy: number): [number, number] => {
    const lx = (vx - 50) * fx;
    const ly = (vy - 50) * fy;
    return [cx + lx * cosA - ly * sinA, cy + lx * sinA + ly * cosA];
  };

  const linha = (x1: number, y1: number, x2: number, y2: number) => {
    const [ax, ay] = flip(pt(x1, y1));
    const [bx, by] = flip(pt(x2, y2));
    d.drawLine(ax, ay, bx, by);
  };
  const circulo = (vx: number, vy: number, r: number) => {
    const [ax, ay] = flip(pt(vx, vy));
    d.drawCircle(ax, ay, r * Math.min(fx, fy));
  };
  const circuloPreenchido = circulo; // sem HATCH -- ver simplificações no cabeçalho; o contorno já comunica o símbolo.
  const retangulo = (x: number, y: number, w: number, h: number) => {
    const pontos = [pt(x, y), pt(x + w, y), pt(x + w, y + h), pt(x, y + h)].map(flip) as [number, number][];
    d.drawPolyline(pontos, true);
  };
  const poligono = (pontos: [number, number][]) => {
    const abs = pontos.map(([vx, vy]) => flip(pt(vx, vy)));
    d.drawPolyline(abs, true);
  };
  const polilinhaAberta = (pontos: [number, number][]) => {
    const abs = pontos.map(([vx, vy]) => flip(pt(vx, vy)));
    d.drawPolyline(abs, false);
  };
  /**
   * Iteração 35: helper de TEXT dentro do desenho de bloco -- faltava aqui
   * (ver comentário antigo no `case "medidor_kwh"` abaixo, que documentava
   * isso como limitação conhecida). Precisava existir pra família nova de
   * tomadas/interruptor (rótulos "30"/"130"/"200"/"CH"/"S" dentro do
   * símbolo, ver `blocks.ts`) não sumir no DXF -- mesmo espírito do
   * `texto()` de `pdfExport.ts#desenharBloco`: escala a altura da fonte por
   * `Math.min(fx, fy)` e repassa a rotação do bloco (negada, mesma
   * convenção já usada pro `case "texto"` de geometria solta logo abaixo
   * neste arquivo).
   */
  const texto = (vx: number, vy: number, valor: string, fontSize: number) => {
    const [tx, ty] = flip(pt(vx, vy));
    d.drawText(tx, ty, Math.max(0.1, fontSize * Math.min(fx, fy)), geo.rotacao ? -geo.rotacao : 0, valor, "center", "middle");
  };

  // Mesmo switch de `pdfExport.ts#desenharBloco` -- ver aquele arquivo
  // pra comentários sobre cada símbolo (mantidos só lá, pra não duplicar).
  switch (geo.nome) {
    case "disjuntor":
      linha(50, 0, 50, 22);
      circuloPreenchido(50, 22, 3.5);
      polilinhaAberta([
        [50, 22],
        [45.31, 33.5],
        [43.75, 45],
        [45.31, 56.5],
        [50, 68],
      ]);
      linha(26, 45, 37.5, 45);
      circuloPreenchido(50, 68, 3.5);
      linha(50, 68, 50, 100);
      break;
    case "disjuntor_bipolar":
      linha(50, 0, 50, 22);
      circuloPreenchido(50, 22, 3.5);
      polilinhaAberta([
        [50, 22],
        [45.31, 33.5],
        [43.75, 45],
        [45.31, 56.5],
        [50, 68],
      ]);
      linha(26, 41, 37.5, 41);
      linha(26, 49, 37.5, 49);
      circuloPreenchido(50, 68, 3.5);
      linha(50, 68, 50, 100);
      break;
    case "disjuntor_tripolar":
      linha(50, 0, 50, 22);
      circuloPreenchido(50, 22, 3.5);
      polilinhaAberta([
        [50, 22],
        [45.31, 33.5],
        [43.75, 45],
        [45.31, 56.5],
        [50, 68],
      ]);
      linha(26, 37, 37.5, 37);
      linha(26, 45, 37.5, 45);
      linha(26, 53, 37.5, 53);
      circuloPreenchido(50, 68, 3.5);
      linha(50, 68, 50, 100);
      break;
    case "transformador":
      linha(50, 0, 50, 22);
      circulo(50, 38, 20);
      circulo(50, 62, 20);
      linha(50, 78, 50, 100);
      break;
    case "tomada":
      circulo(50, 50, 34);
      linha(50, 16, 50, 40);
      linha(22, 65, 78, 65);
      break;
    case "tomada_baixa":
      poligono([
        [50, 8],
        [14, 82],
        [86, 82],
      ]);
      texto(50, 74, "30", 20);
      break;
    case "tomada_media":
      poligono([
        [50, 8],
        [14, 82],
        [86, 82],
      ]);
      texto(50, 74, "130", 18);
      break;
    case "tomada_alta":
      poligono([
        [50, 8],
        [14, 82],
        [86, 82],
      ]);
      texto(50, 74, "200", 18);
      break;
    case "tomada_chuveiro":
      poligono([
        [50, 8],
        [12, 84],
        [88, 84],
      ]);
      texto(50, 76, "CH", 16);
      break;
    case "interruptor_simples":
      circulo(50, 50, 30);
      texto(50, 55, "S", 30);
      break;
    case "ponto_luz_teto":
      circulo(50, 50, 36);
      linha(26, 26, 74, 74);
      linha(74, 26, 26, 74);
      break;
    case "dps":
      linha(50, 0, 50, 25);
      retangulo(30, 25, 40, 45);
      linha(38, 32, 62, 63);
      poligono([
        [62, 63],
        [51, 59],
        [59, 49],
      ]);
      linha(50, 70, 50, 82);
      linha(35, 82, 65, 82);
      linha(40, 89, 60, 89);
      linha(44, 96, 56, 96);
      break;
    case "seccionadora_cc":
      linha(50, 0, 50, 34);
      circuloPreenchido(50, 34, 4.5);
      linha(50, 34, 74, 68);
      circuloPreenchido(74, 68, 4.5);
      linha(50, 66, 50, 100);
      break;
    case "fusivel":
      linha(50, 0, 50, 30);
      retangulo(35, 30, 30, 40);
      linha(35, 50, 65, 50);
      linha(50, 70, 50, 100);
      break;
    case "inversor":
      retangulo(15, 20, 70, 60);
      polilinhaAberta([
        [25, 50],
        [31, 38],
        [37, 30],
        [43, 38],
        [50, 50],
        [57, 62],
        [63, 70],
        [69, 62],
        [75, 50],
      ]);
      linha(0, 50, 15, 50);
      linha(85, 50, 100, 50);
      linha(50, 0, 50, 20);
      linha(50, 80, 50, 100);
      break;
    case "inversor_vertical":
      retangulo(15, 20, 70, 60);
      polilinhaAberta([
        [25, 50],
        [31, 38],
        [37, 30],
        [43, 38],
        [50, 50],
        [57, 62],
        [63, 70],
        [69, 62],
        [75, 50],
      ]);
      linha(50, 0, 50, 20);
      linha(50, 80, 50, 100);
      break;
    case "dps_lateral":
      linha(8, 50, 8, 20);
      linha(2, 20, 14, 20);
      linha(4, 12, 12, 12);
      linha(6, 5, 10, 5);
      linha(8, 50, 30, 50);
      retangulo(30, 32, 34, 36);
      linha(37, 60, 57, 40);
      poligono([
        [57, 40],
        [47, 42],
        [54, 50],
      ]);
      linha(64, 50, 100, 50);
      break;
    case "terra":
      linha(50, 0, 50, 40);
      linha(20, 40, 80, 40);
      linha(30, 60, 70, 60);
      linha(40, 80, 60, 80);
      break;
    case "padrao_entrada_detalhe":
      linha(35, 0, 35, 10);
      linha(65, 0, 65, 10);
      retangulo(10, 10, 80, 60);
      retangulo(20, 16, 60, 24);
      retangulo(37, 48, 26, 15);
      linha(42, 61, 57, 50);
      linha(30, 70, 30, 88);
      linha(50, 70, 50, 88);
      linha(70, 70, 70, 92);
      linha(58, 92, 82, 92);
      linha(62, 97, 78, 97);
      break;
    case "stringbox":
      retangulo(20, 25, 60, 55);
      linha(35, 0, 35, 25);
      linha(50, 0, 50, 25);
      linha(65, 0, 65, 25);
      linha(50, 80, 50, 100);
      break;
    case "malha_aterramento":
      linha(15, 30, 85, 30);
      linha(15, 50, 85, 50);
      linha(15, 70, 85, 70);
      linha(30, 15, 30, 85);
      linha(50, 15, 50, 85);
      linha(70, 15, 70, 85);
      break;
    case "poste_concessionaria":
      linha(50, 4, 50, 92);
      linha(24, 14, 76, 14);
      linha(30, 92, 70, 92);
      break;
    case "medidor_concessionaria":
      retangulo(12, 12, 76, 76);
      circulo(50, 50, 24);
      linha(50, 50, 50, 30);
      linha(50, 50, 65, 60);
      break;
    case "medidor_kwh":
      // Iteração 21: o `<text>` "KWH" do SVG (ver `blocks.ts`) foi
      // corrigido no PDF (`pdfExport.ts#desenharBloco`, bug relatado pelo
      // usuário) mas continua sem equivalente aqui no DXF -- fora do
      // escopo relatado ("no PDF os nomes dos blocos somem") e o DXF
      // não tem, neste arquivo, nenhum helper de TEXT dentro do desenho
      // de bloco (só a geometria "texto" solta usa `quebrarLinhas`
      // abaixo). Documentado como limitação conhecida em vez de corrigido
      // "de brinde" aqui, pra não misturar 2 correções não relacionadas
      // no mesmo commit.
      linha(50, 0, 50, 14);
      retangulo(14, 14, 72, 60);
      linha(50, 74, 50, 100);
      break;
    case "modulo_fotovoltaico":
      poligono([
        [8, 90],
        [92, 90],
        [50, 0],
      ]);
      linha(26, 90, 55, 23);
      linha(44, 90, 62, 53);
      linha(50, 90, 50, 100);
      break;
    case "lastro_solar":
      // Iteração 28: mesmo símbolo de `pdfExport.ts#desenharBloco` -- ver
      // aquele arquivo/`blocks.ts` pros comentários (não duplicados aqui,
      // mesma disciplina do resto deste switch).
      retangulo(4, 2, 92, 96);
      linha(8, 34, 34, 8);
      linha(8, 58, 58, 8);
      linha(8, 82, 82, 8);
      linha(18, 92, 92, 18);
      linha(42, 92, 92, 42);
      linha(66, 92, 92, 66);
      circulo(50, 8, 4);
      poligono([
        [50, 98],
        [42, 88],
        [58, 88],
      ]);
      break;
    default:
      retangulo(0, 0, 100, 100);
  }
}

/**
 * Quebra `texto` em linhas que cabem em `larguraMaxMm`, usando uma
 * largura MÉDIA de caractere (aproximação -- ver simplificação no
 * cabeçalho do arquivo; sem métrica de fonte real disponível aqui).
 */
function quebrarLinhasTextoDxf(texto: string, larguraMaxMm: number, fontSizeMm: number, maxLinhas: number): string[] {
  const larguraMediaChar = fontSizeMm * 0.58;
  const charsPorLinha = Math.max(1, Math.floor(larguraMaxMm / larguraMediaChar));
  const paragrafos = (texto || "").split("\n");
  const linhas: string[] = [];
  for (const paragrafo of paragrafos) {
    const palavras = paragrafo.split(/\s+/).filter(Boolean);
    if (palavras.length === 0) {
      linhas.push("");
      continue;
    }
    let atual = "";
    for (const palavra of palavras) {
      const candidata = atual ? `${atual} ${palavra}` : palavra;
      if (candidata.length <= charsPorLinha) {
        atual = candidata;
      } else {
        if (atual) linhas.push(atual);
        atual = palavra;
      }
    }
    if (atual) linhas.push(atual);
  }
  if (linhas.length > maxLinhas) {
    const cortadas = linhas.slice(0, maxLinhas);
    cortadas[maxLinhas - 1] = cortadas[maxLinhas - 1] + "…";
    return cortadas;
  }
  return linhas;
}

/**
 * Desenha o Carimbo/legenda ABNT em DXF -- mesma estrutura (Iteração 19)
 * de `pdfExport.ts#desenharCarimboPdf`: campo de Notas acima de tudo,
 * faixa de topo (logo esquerda / assinatura direita -- só as células e
 * legendas, SEM a imagem em si, ver simplificações no cabeçalho), depois
 * a grade principal de 5 linhas. Posicionado no canto inferior direito de
 * uma folha CENTRADA NA ORIGEM (mesmo `folhaX`/`folhaY` do PDF, sem a
 * translação extra `offX`/`offY` -- essa translação existe só porque uma
 * página PDF precisa começar em (0,0); o DXF não tem esse limite, então
 * fica nas coordenadas de mundo "cruas").
 */
function desenharCarimboDxf(
  d: Drawing,
  carimbo: Carimbo,
  activeSheet: FormatoFolha,
  layerTexto: string,
  orientacao?: "paisagem" | "retrato"
) {
  if (!carimbo.visivel) return;
  d.setActiveLayer(layerTexto);

  const folha = dimensoesFolhaOrientada(activeSheet, orientacao);
  const folhaX = -folha.largura / 2;
  const folhaY = -folha.altura / 2;
  const { largura, altura } = dimensoesCarimbo(activeSheet, carimbo.escalaCarimbo, orientacao);

  const brX = folhaX + folha.largura - MARGENS_ABNT.direita;
  const brY = folhaY + folha.altura - MARGENS_ABNT.inferior;

  const bx = brX - largura;
  const by = brY - altura;

  const rect = (x: number, y: number, w: number, h: number) => {
    d.drawPolyline([flip([x, y]), flip([x + w, y]), flip([x + w, y + h]), flip([x, y + h])], true);
  };
  const linha = (x1: number, y1: number, x2: number, y2: number) => {
    const [ax, ay] = flip([x1, y1]);
    const [bx2, by2] = flip([x2, y2]);
    d.drawLine(ax, ay, bx2, by2);
  };
  const texto = (x: number, y: number, valor: string, alturaFonte: number) => {
    const [tx, ty] = flip([x, y]);
    d.drawText(tx, ty, alturaFonte, 0, valor, "left", "top");
  };

  // Campo de Notas -----------------------------------------------------
  const larguraNotas = largura - 4;
  const fsNotasLabel = 2.6;
  const fsNotasCorpo = 2.3;
  const linhasNotas = quebrarLinhasTextoDxf(carimbo.notas || "", larguraNotas, fsNotasCorpo, 10);
  const linhasNotasExibidas = linhasNotas.length > 0 ? linhasNotas : [""];
  const alturaLinhaNotas = fsNotasCorpo * 1.5;
  const alturaNotas = fsNotasLabel + 2 + linhasNotasExibidas.length * alturaLinhaNotas + 2;
  const alturaTopo = altura * 0.52;
  const byTopo = by - alturaTopo;
  const byNotas = byTopo - alturaNotas;

  rect(bx, byNotas, largura, alturaNotas);
  texto(bx + 2, byNotas + 0.6, "NOTAS:", fsNotasLabel);
  linhasNotasExibidas.forEach((l, i) => texto(bx + 2, byNotas + fsNotasLabel + 1.4 + i * alturaLinhaNotas, l, fsNotasCorpo));

  // Faixa de topo: logo (esquerda) / assinatura (direita) --------------
  rect(bx, byTopo, largura / 2, alturaTopo);
  rect(bx + largura / 2, byTopo, largura / 2, alturaTopo);
  texto(bx + 2, byTopo + 2, "LOGOTIPO", 2.6);
  texto(bx + largura / 2 + 2, byTopo + 2, "ASSINATURA DO RESPONSÁVEL TÉCNICO", 2.2);
  const assinaturaCx = bx + largura * 0.75;
  const assinaturaLarguraLinha = largura * 0.42;
  const yLinhaAssinatura = byTopo + alturaTopo * 0.72;
  linha(assinaturaCx - assinaturaLarguraLinha / 2, yLinhaAssinatura, assinaturaCx + assinaturaLarguraLinha / 2, yLinhaAssinatura);

  // Grade principal (5 linhas, mesma estrutura de sempre) ---------------
  const alturaTitulo = altura * 0.24;
  const alturaLinha2 = altura * 0.19;
  const alturaLinha3 = altura * 0.19;
  const alturaLinha4 = altura * 0.19;
  const yLinha2 = by + alturaTitulo;
  const yLinha3 = yLinha2 + alturaLinha2;
  const yLinha4 = yLinha3 + alturaLinha3;
  const yLinha5 = yLinha4 + alturaLinha4;
  const yFim = by + altura;

  rect(bx, by, largura, altura);
  linha(bx, yLinha2, bx + largura, yLinha2);
  linha(bx, yLinha3, bx + largura, yLinha3);
  linha(bx, yLinha4, bx + largura, yLinha4);
  linha(bx, yLinha5, bx + largura, yLinha5);
  linha(bx + largura / 2, yLinha3, bx + largura / 2, yLinha4);
  linha(bx + largura / 2, yLinha4, bx + largura / 2, yLinha5);
  linha(bx + largura / 3, yLinha5, bx + largura / 3, yFim);
  linha(bx + (largura * 2) / 3, yLinha5, bx + (largura * 2) / 3, yFim);

  const fsTitulo = Math.max(2.2, alturaTitulo * 0.4);
  const fsLabel = Math.max(1.7, alturaLinha2 * 0.26);
  const fsValor = Math.max(1.9, alturaLinha2 * 0.32);

  const campoTitulo = (valor: string) => {
    const [tx, ty] = flip([bx + largura / 2, by + alturaTitulo * 0.5]);
    d.drawText(tx, ty, fsTitulo, 0, valor, "center", "middle");
  };
  const campo = (x: number, y: number, w: number, label: string, valor: string) => {
    texto(x + 1.5, y + 0.6, label, fsLabel);
    texto(x + 1.5, y + fsLabel + 1.4, valor || "—", fsValor);
  };

  /**
   * Iteração 25: campo dedicado pro "RESPONSÁVEL TÉCNICO" -- mesmo
   * raciocínio de `TitleBlockLayer.tsx`/`pdfExport.ts` (ver comentário
   * completo lá): nome+CREA concatenados numa string só arriscava cortar o
   * CREA visualmente no PDF (onde há truncamento de verdade); o DXF não
   * tem truncamento (texto sempre desenhado por inteiro, sem `doc.clip()`
   * nem largura máxima), mas a mesma string longa colidiria visualmente
   * com a célula vizinha em qualquer visualizador CAD -- corrigido em
   * paralelo aqui também, por consistência entre os 3 renderizadores
   * (mesma disciplina de sempre), com 2 linhas de valor empilhadas.
   */
  const campoResponsavelTecnico = (x: number, y: number) => {
    texto(x + 1.5, y + 0.6, "RESPONSÁVEL TÉCNICO", fsLabel);
    const temCrea = !!carimbo.crea;
    const fsValorResp = temCrea ? fsValor * 0.72 : fsValor;
    const linhaAlturaResp = fsValorResp * 1.2;
    const yValor = y + fsLabel + 1.4;
    texto(x + 1.5, yValor, carimbo.responsavel || "—", fsValorResp);
    if (temCrea) {
      texto(x + 1.5, yValor + linhaAlturaResp, `CREA ${carimbo.crea}`, fsValorResp);
    }
  };

  campoTitulo(carimbo.titulo || "TÍTULO DO PROJETO");
  campo(bx, yLinha2, largura, "ENDEREÇO DO CLIENTE", carimbo.enderecoCliente);
  campo(bx, yLinha3, largura / 2, "CLIENTE", carimbo.cliente);
  campoResponsavelTecnico(bx + largura / 2, yLinha3);
  campo(bx, yLinha4, largura / 2, "CONTA CONTRATO", carimbo.contaContrato);
  campo(bx + largura / 2, yLinha4, largura / 2, "TIPO DE LIGAÇÃO", ROTULOS_TIPO_LIGACAO[carimbo.tipoLigacao]);
  campo(bx, yLinha5, largura / 3, "ESCALA", carimbo.escala);
  campo(bx + largura / 3, yLinha5, largura / 3, "DATA", carimbo.data);
  campo(bx + (largura * 2) / 3, yLinha5, largura / 3, "PRANCHA", carimbo.prancha);
}

/**
 * Monta o DXF (texto ASCII) com TODA a geometria do projeto (Model Space
 * completo, ver decisão de escopo no cabeçalho) + o carimbo da Prancha
 * ativa. Síncrona (ao contrário do PDF, não depende de pré-carregar XREF
 * -- XREFs não são exportados, ver simplificações no cabeçalho).
 */
export function gerarDxfDoProjeto(projeto: Projeto, prancha: Prancha): string {
  const d = new Drawing();
  d.setUnits("Millimeters");

  const layersPorCamada = registrarCamadasDxf(d, projeto.camadas);
  const layersFallback = (() => {
    const corInt = hexParaInt("#94a3b8");
    const base = nomeCamadaDxf(CAMADA_FALLBACK_KEY, "");
    const solid = nomeCamadaDxf(CAMADA_FALLBACK_KEY, "_SOLID");
    const dash = nomeCamadaDxf(CAMADA_FALLBACK_KEY, "_DASH");
    d.addLayer(base, 7, "CONTINUOUS");
    d.addLayer(solid, 7, "CONTINUOUS");
    d.addLayer(dash, 7, "DASHED");
    d.layers[base]?.setTrueColor(corInt);
    d.layers[solid]?.setTrueColor(corInt);
    d.layers[dash]?.setTrueColor(corInt);
    return { base, solid, dash };
  })();
  const layersDe = (chave: string) => layersPorCamada[chave] ?? layersFallback;

  const linhaPts = (x1: number, y1: number, x2: number, y2: number) => {
    const [ax, ay] = flip([x1, y1]);
    const [bx, by] = flip([x2, y2]);
    d.drawLine(ax, ay, bx, by);
  };

  for (const g of projeto.geometria as Geometria[]) {
    const camada = resolverCamada(projeto.camadas, g.camada);
    const layers = layersDe(g.camada);
    const camadaTracejadaPorPadrao = camada.estiloLinha === "tracejada";

    if (g.tipo === "linha") {
      d.setActiveLayer(camadaTracejadaPorPadrao ? layers.dash : layers.base);
      linhaPts(g.x1, g.y1, g.x2, g.y2);
    } else if (g.tipo === "polilinha") {
      if (g.pontos.length < 2) continue;
      d.setActiveLayer(camadaTracejadaPorPadrao ? layers.dash : layers.base);
      d.drawPolyline(g.pontos.map((p) => flip([p.x, p.y])), false);
    } else if (g.tipo === "circulo") {
      d.setActiveLayer(camadaTracejadaPorPadrao ? layers.dash : layers.base);
      const [cx, cy] = flip([g.x, g.y]);
      d.drawCircle(cx, cy, g.raio);
    } else if (g.tipo === "retangulo") {
      const tracejado = g.tracejado === true || camadaTracejadaPorPadrao;
      d.setActiveLayer(tracejado ? layers.dash : layers.base);
      const cantos: [number, number][] = [
        [g.x, g.y],
        [g.x + g.largura, g.y],
        [g.x + g.largura, g.y + g.altura],
        [g.x, g.y + g.altura],
      ];
      d.drawPolyline(cantos.map(flip), true);
    } else if (g.tipo === "poligono") {
      if (g.pontos.length < 3) continue;
      d.setActiveLayer(camadaTracejadaPorPadrao ? layers.dash : layers.base);
      d.drawPolyline(
        g.pontos.map((p) => flip([p.x, p.y])),
        true
      );
    } else if (g.tipo === "arco") {
      d.setActiveLayer(camadaTracejadaPorPadrao ? layers.dash : layers.base);
      const passos = 24;
      const a0 = (g.anguloInicial * Math.PI) / 180;
      const a1 = (g.anguloFinal * Math.PI) / 180;
      const pontosArco: [number, number][] = [];
      for (let i = 0; i <= passos; i++) {
        const ang = a0 + ((a1 - a0) * i) / passos;
        pontosArco.push(flip([g.x + g.raio * Math.cos(ang), g.y + g.raio * Math.sin(ang)]));
      }
      d.drawPolyline(pontosArco, false);
    } else if (g.tipo === "bloco") {
      d.setActiveLayer(layers.solid); // blocos nunca saem tracejados, mesma regra do PDF.
      desenharBlocoDxf(d, g);
    } else if (g.tipo === "texto") {
      d.setActiveLayer(layers.solid);
      const [tx, ty] = flip([g.x, g.y]);
      // Ângulo do DXF é anti-horário a partir de +X; `geo.rotacao` é
      // horário (mesma convenção de todo o resto do app) -- negado aqui
      // pelo mesmo motivo (e mesmo sinal) que `pdfExport.ts` já usa pro
      // `angle` do jsPDF (ver comentário lá) -- ver também a nota de
      // convenção de eixos no topo deste arquivo.
      const linhasTexto = (g.conteudo || "").split("\n");
      const alturaLinha = g.fontSize * 1.25;
      linhasTexto.forEach((linha, i) => {
        d.drawText(tx, ty - i * alturaLinha, g.fontSize, g.rotacao ? -g.rotacao : 0, linha, "left", "top");
      });
    } else if (g.tipo === "cota") {
      d.setActiveLayer(camadaTracejadaPorPadrao ? layers.dash : layers.base);
      const { q1, q2 } = linhaDeCota({ x: g.x1, y: g.y1 }, { x: g.x2, y: g.y2 }, { x: g.px, y: g.py });
      linhaPts(g.x1, g.y1, q1.x, q1.y);
      linhaPts(g.x2, g.y2, q2.x, q2.y);
      linhaPts(q1.x, q1.y, q2.x, q2.y);
      d.setActiveLayer(layers.solid);
      const [mx, my] = flip([(q1.x + q2.x) / 2, (q1.y + q2.y) / 2 - 1.5]);
      // Iteração 29d: mesmo `fontSize` opcional do PDF (ver `CotaGeometria`
      // em types.ts) -- "3" (mm de mundo) continua o fallback de sempre
      // pras cotas manuais, sem `fontSize` próprio.
      d.drawText(mx, my, g.fontSize ?? 3, 0, g.texto, "left", "bottom");
    }
    // "viewport": conceito só de folha/papel, sem equivalente em Model Space -- não exportado (mesmo motivo do PDF).
  }

  // Carimbo da Prancha ativa --------------------------------------------
  desenharCarimboDxf(d, projeto.carimbo, prancha.formato, layersFallback.solid, prancha.orientacao);

  return d.toDxfString();
}

/** Dispara o download client-side de um conteúdo de texto (o `dxf-writer` só devolve a string -- sem um `.save()` embutido como o jsPDF). */
function baixarTextoComoArquivo(conteudo: string, nomeArquivo: string, mimeType: string) {
  const blob = new Blob([conteudo], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Gera e baixa (client-side) o DXF da Prancha ativa -- mesmo padrão de
 * `exportarPagina` (PDF), só que síncrono (sem XREF pra pré-carregar).
 * Mantida `async` por consistência de assinatura com as funções de PDF
 * (facilita reaproveitar o mesmo `await` no `Toolbar.tsx`).
 */
export async function exportarPranchaDxf(projeto: Projeto, prancha: Prancha) {
  const conteudo = gerarDxfDoProjeto(projeto, prancha);
  const nomeArquivo = `${(projeto.nome || "diagrama").trim().replace(/\s+/g, "_")}-${prancha.nome.trim().replace(/\s+/g, "_")}.dxf`;
  baixarTextoComoArquivo(conteudo, nomeArquivo, "application/dxf");
}
