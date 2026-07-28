/**
 * pdfExport.ts
 * -----------------------------------------------------------------------
 * Exportação vetorial da prancha ativa para PDF, usando jsPDF. Roda
 * inteiramente no navegador (sem servidor) e gera um PDF no tamanho
 * exato da folha (mm), focado estritamente no que está dentro dos
 * limites da prancha -- geometria fora da folha é ignorada.
 *
 * Cada bloco elétrico é redesenhado com primitivas vetoriais do jsPDF
 * (linha/retângulo/círculo) espelhando o SVG de `lib/blocks.ts`, em vez
 * de rasterizar -- assim o PDF final continua 100% vetorial.
 *
 * Retângulos/polígonos hachurados são exportados com o PADRÃO VETORIAL
 * REAL (linhas/pontos desenhados com as primitivas do jsPDF, clipadas ao
 * contorno exato da forma via `doc.clip()`) -- não uma aproximação de
 * cor sólida clareada. "SOLID" continua sendo um preenchimento sólido
 * de verdade (`doc.rect(..., "FD")`/`doc.lines(..., "FD")`), já que é
 * literalmente o que esse padrão representa.
 * -----------------------------------------------------------------------
 */

import { jsPDF } from "jspdf";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { getBlockDef } from "./blocks";
import { resolverCamada } from "./layers";
import { linhaDeCota } from "./geom";
import { formatarComUnidade, type UnidadeDesenho } from "./unidades";
import {
  FORMATOS_FOLHA,
  MARGENS_ABNT,
  PADRAO_TRACEJADO_MM,
  ROTULOS_TIPO_LIGACAO,
  dimensoesCarimbo,
  dimensoesFolhaOrientada,
  type BlocoGeometria,
  type Camada,
  type Carimbo,
  type FormatoFolha,
  type Geometria,
  type HachuraConfig,
  type Prancha,
  type Projeto,
  type ViewportGeometria,
  type XRef,
} from "./types";

/** Converte um tamanho de fonte em mm (unidade de mundo) para pontos (unidade que o jsPDF usa para fonte, independente do `unit` do documento). */
const MM_PARA_PT = 72 / 25.4;

/** Converte uma cor hex ("#f59e0b") em componentes RGB 0-255. */
function hexParaRgb(hex: string): [number, number, number] {
  const limpo = hex.replace("#", "");
  const seis = limpo.length === 3
    ? limpo.split("").map((c) => c + c).join("")
    : limpo.padEnd(6, "0");
  const bigint = parseInt(seis, 16);
  return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
}

/**
 * Iteração 20: `doc.clip()` do jsPDF recorta operações de PREENCHIMENTO
 * (`doc.rect(..., "F")`, `doc.circle(..., "F")`, `doc.lines(..., "F")`)
 * mas NÃO recorta operações de TRAÇO (`doc.line()`) -- confirmado com um
 * script jsPDF isolado (fora deste app: um clip 40x40mm + uma linha
 * cruzando bem por fora dele saiu inteira, sem cortar nada, enquanto um
 * círculo/retângulo PREENCHIDO do mesmo tamanho saiu corretamente
 * recortado). Isso é uma segunda limitação de `doc.clip()` no jsPDF,
 * irmã da já documentada pra `doc.text()` desde a Iteração 11 -- e
 * explica um bug real (relatado pelo usuário: "se eu aumentar a escala
 * da rachura... [ela] nao deve... sair para fora" do desenho): como
 * TODO o padrão vetorial de hachura à base de linha (ANSI31/CRUZADO/
 * CONCRETO/TERRA/BLOCO -- todos usam `doc.line()`) dependia só do
 * `doc.clip()` já ativo pra ficar contido na forma, o padrão sempre
 * vazou um pouco além do contorno -- só que em escalas pequenas
 * (espaçamento ~10mm, o padrão default) o vazamento ficava pequeno
 * o bastante pra passar despercebido numa inspeção visual casual;
 * numa escala bem maior (o comprimento de cada traço cresce junto com o
 * espaçamento, ver `desenharFamiliaDiagonais`) o vazamento virava
 * dramático -- listras inteiras atravessando a folha, foi assim que o
 * bug ficou óbvio o bastante pra ser relatado.
 *
 * Corrigido recortando cada segmento MANUALMENTE contra o polígono da
 * forma antes de desenhá-lo (`recortarSegmentoNoPoligono`), sem depender
 * do `doc.clip()` pra linhas -- o `doc.clip()` continua ativo (e
 * continua sendo o que recorta corretamente o PONTILHADO, que usa
 * círculos PREENCHIDOS) só que agora é só uma segunda camada de
 * segurança, não a única.
 */
function pontoDentroPoligono(p: [number, number], poligono: [number, number][]): boolean {
  // Ray casting (regra par-ímpar) -- padrão, O(n) no número de vértices.
  let dentro = false;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const [xi, yi] = poligono[i];
    const [xj, yj] = poligono[j];
    const intersecta = yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi;
    if (intersecta) dentro = !dentro;
  }
  return dentro;
}

/**
 * Recorta o segmento (a,b) contra o polígono (convexo ou não), devolvendo
 * só os sub-trechos que caem DENTRO dele -- interseção com cada aresta do
 * polígono dá os pontos de entrada/saída; o ponto médio de cada intervalo
 * entre interseções consecutivas (ordenadas ao longo do segmento) decide
 * se aquele trecho fica dentro ou fora.
 */
function recortarSegmentoNoPoligono(
  a: [number, number],
  b: [number, number],
  poligono: [number, number][]
): [[number, number], [number, number]][] {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const compr2 = dx * dx + dy * dy;
  if (compr2 < 1e-9) return [];

  const ts = new Set<number>([0, 1]);
  for (let i = 0; i < poligono.length; i++) {
    const p1 = poligono[i];
    const p2 = poligono[(i + 1) % poligono.length];
    // Interseção reta-reta (não segmento-segmento) parametrizada em t
    // ao longo de (a,b) -- clampada em seguida a [0,1] só se cair
    // dentro do trecho da ARESTA do polígono também.
    const ex = p2[0] - p1[0];
    const ey = p2[1] - p1[1];
    const denom = dx * ey - dy * ex;
    if (Math.abs(denom) < 1e-9) continue; // paralelas
    const t = ((p1[0] - a[0]) * ey - (p1[1] - a[1]) * ex) / denom;
    const u = ((p1[0] - a[0]) * dy - (p1[1] - a[1]) * dx) / denom;
    if (t >= -1e-9 && t <= 1 + 1e-9 && u >= -1e-9 && u <= 1 + 1e-9) {
      ts.add(Math.min(1, Math.max(0, t)));
    }
  }

  const ordenados = [...ts].sort((x, y) => x - y);
  const resultado: [[number, number], [number, number]][] = [];
  for (let i = 0; i < ordenados.length - 1; i++) {
    const t0 = ordenados[i];
    const t1 = ordenados[i + 1];
    if (t1 - t0 < 1e-9) continue;
    const tMeio = (t0 + t1) / 2;
    const pMeio: [number, number] = [a[0] + dx * tMeio, a[1] + dy * tMeio];
    if (pontoDentroPoligono(pMeio, poligono)) {
      resultado.push([
        [a[0] + dx * t0, a[1] + dy * t0],
        [a[0] + dx * t1, a[1] + dy * t1],
      ]);
    }
  }
  return resultado;
}

/** Desenha só os trechos de (x1,y1)-(x2,y2) que caem dentro do polígono. */
function linhaClipada(doc: jsPDF, poligono: [number, number][], x1: number, y1: number, x2: number, y2: number) {
  const trechos = recortarSegmentoNoPoligono([x1, y1], [x2, y2], poligono);
  for (const [p, q] of trechos) doc.line(p[0], p[1], q[0], q[1]);
}

/**
 * Varre uma família de linhas paralelas (ângulo em graus) cobrindo todo
 * o retângulo [minX,minY]-[maxX,maxY] com espaçamento `espacamento` --
 * usada tanto para ANSI31_DIAGONAL (uma família, 45°) quanto para
 * CRUZADO (duas famílias perpendiculares). Cada traço é recortado contra
 * `poligono` via `linhaClipada` (ver comentário acima -- `doc.clip()`
 * sozinho NÃO contém `doc.line()` no jsPDF).
 */
function desenharFamiliaDiagonais(
  doc: jsPDF,
  poligono: [number, number][],
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  espacamento: number,
  anguloGraus: number
) {
  const rad = (anguloGraus * Math.PI) / 180;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);
  // Direção perpendicular -- é ao longo dela que as linhas da família são espaçadas.
  const px = -dy;
  const py = dx;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const meiaDiagonal = Math.hypot(maxX - minX, maxY - minY) / 2 + espacamento;
  const nLinhas = Math.max(1, Math.ceil(meiaDiagonal / espacamento));

  for (let i = -nLinhas; i <= nLinhas; i++) {
    const ox = cx + px * i * espacamento;
    const oy = cy + py * i * espacamento;
    linhaClipada(doc, poligono, ox - dx * meiaDiagonal, oy - dy * meiaDiagonal, ox + dx * meiaDiagonal, oy + dy * meiaDiagonal);
  }
}

/**
 * Desenha o padrão VETORIAL real de uma hachura (linhas/pontos com as
 * primitivas nativas do jsPDF), recortado exatamente ao contorno da
 * forma via `doc.clip()` -- em vez da antiga aproximação de cor sólida
 * clareada. `pontosAbs` é o contorno fechado da forma já convertido
 * para coordenadas absolutas do PDF (mm), na ordem dos vértices.
 * "SOLID" não passa por aqui (é preenchido direto com `doc.rect`/
 * `doc.lines` no chamador, mais simples e mais fiel ao que "sólido"
 * significa).
 */
function desenharPadraoVetorialPdf(doc: jsPDF, hachura: HachuraConfig, pontosAbs: [number, number][]) {
  if (hachura.tipo === "SOLID" || pontosAbs.length < 3) return;

  const [r, g, b] = hexParaRgb(hachura.cor);
  // Mesma escala usada no ladrilho do canvas (`lib/hachura.ts`): a
  // "escala" do usuário multiplica um espaçamento-base de ~10mm de
  // mundo -- como 1 unidade de mundo = 1mm de papel na exportação, o
  // espaçamento em mm do PDF é literalmente o mesmo número.
  const espacamento = Math.max(1, 10 * (hachura.escala || 1));

  const minX = Math.min(...pontosAbs.map((p) => p[0]));
  const maxX = Math.max(...pontosAbs.map((p) => p[0]));
  const minY = Math.min(...pontosAbs.map((p) => p[1]));
  const maxY = Math.max(...pontosAbs.map((p) => p[1]));

  doc.saveGraphicsState();
  doc.moveTo(pontosAbs[0][0], pontosAbs[0][1]);
  for (let i = 1; i < pontosAbs.length; i++) doc.lineTo(pontosAbs[i][0], pontosAbs[i][1]);
  doc.close();
  doc.clip();
  doc.discardPath();

  doc.setDrawColor(r, g, b);
  doc.setFillColor(r, g, b);
  doc.setLineWidth(Math.max(0.08, espacamento / 14));
  // O padrão da hachura em si NUNCA sai tracejado, mesmo que a camada da
  // forma preenchida seja "tracejada" (Iteração 12c) -- só o CONTORNO da
  // forma (desenhado por quem chama esta função, com o dash já ativo de
  // `aplicarEstiloCamada`) deve respeitar o estilo da camada.
  doc.setLineDashPattern([], 0);

  if (hachura.tipo === "ANSI31_DIAGONAL") {
    desenharFamiliaDiagonais(doc, pontosAbs, minX, minY, maxX, maxY, espacamento, 45);
  } else if (hachura.tipo === "CRUZADO") {
    desenharFamiliaDiagonais(doc, pontosAbs, minX, minY, maxX, maxY, espacamento, 45);
    desenharFamiliaDiagonais(doc, pontosAbs, minX, minY, maxX, maxY, espacamento, -45);
  } else if (hachura.tipo === "PONTILHADO") {
    // `doc.circle(..., "F")` é um PREENCHIMENTO -- o `doc.clip()` já
    // ativo recorta corretamente sozinho aqui (confirmado, ver comentário
    // acima de `pontoDentroPoligono`), sem precisar de recorte manual.
    const raio = Math.max(0.15, espacamento / 10);
    for (let y = minY; y <= maxY; y += espacamento) {
      // Linhas alternadas deslocadas por meio espaçamento -- grade de
      // pontos "quincôncio", visualmente mais uniforme que uma grade reta.
      const linha = Math.round((y - minY) / espacamento);
      const offset = linha % 2 === 0 ? 0 : espacamento / 2;
      for (let x = minX + offset; x <= maxX; x += espacamento) {
        doc.circle(x, y, raio, "F");
      }
    }
  } else if (hachura.tipo === "CONCRETO") {
    // Grade retangular (blocos/juntas) -- mesmo motivo do ladrilho do canvas.
    for (let y = minY; y <= maxY; y += espacamento) linhaClipada(doc, pontosAbs, minX, y, maxX, y);
    for (let x = minX; x <= maxX; x += espacamento) linhaClipada(doc, pontosAbs, x, minY, x, maxY);
  } else if (hachura.tipo === "TERRA") {
    // Linhas horizontais de base (fiadas) + traços diagonais curtos por
    // baixo de cada uma -- convenção de corte de terreno.
    const passo = espacamento * 0.6;
    for (let y = minY; y <= maxY; y += espacamento) {
      linhaClipada(doc, pontosAbs, minX, y, maxX, y);
      for (let x = minX; x <= maxX; x += passo) {
        linhaClipada(doc, pontosAbs, x, y, x - passo * 0.5, y + espacamento * 0.35);
      }
    }
  } else if (hachura.tipo === "BLOCO") {
    // Parede de bloco (running bond) -- mesmo motivo do ladrilho do
    // canvas (`lib/hachura.ts`): fiadas horizontais + juntas verticais
    // alternadas a cada fiada (meio bloco de defasagem).
    let linha = 0;
    for (let y = minY; y <= maxY; y += espacamento) {
      linhaClipada(doc, pontosAbs, minX, y, maxX, y);
      const yFim = Math.min(y + espacamento, maxY);
      const offset = linha % 2 === 0 ? 0 : espacamento / 2;
      for (let x = minX + offset; x <= maxX; x += espacamento) {
        linhaClipada(doc, pontosAbs, x, y, x, yFim);
      }
      linha++;
    }
  }

  doc.restoreGraphicsState();
}

/**
 * Desenha um bloco elétrico usando primitivas vetoriais, mapeando as
 * coordenadas do viewBox 0-100 (mesmo sistema de `lib/blocks.ts`) para
 * milímetros absolutos na folha, centrado no ponto de inserção do bloco.
 */
function desenharBloco(
  doc: jsPDF,
  geo: BlocoGeometria,
  paraFolha: (x: number, y: number) => [number, number],
  // Iteração 18: ver `desenharUmaGeometria` -- o bloco INTEIRO é uma
  // grandeza de tamanho (fx/fy), não um par de pontos que `paraFolha`
  // escale sozinho, então precisa do mesmo fator de correção de
  // `modelScale` que retângulo/círculo já recebem.
  escalaGeom: number = 1
) {
  const def = getBlockDef(geo.nome);
  if (!def) return;

  // `escalaX`/`escalaY` (Sprint 3, controle independente por eixo) têm
  // prioridade sobre o antigo `escala` (uniforme) -- mesmo fallback de
  // `BlocoShape.tsx`, pra manter o PDF fiel ao que aparece no canvas
  // mesmo pra blocos salvos antes dessa mudança.
  const larguraMm = def.largura * (geo.escalaX ?? geo.escala ?? 1) * escalaGeom;
  const alturaMm = def.altura * (geo.escalaY ?? geo.escala ?? 1) * escalaGeom;
  const fx = larguraMm / 100;
  const fy = alturaMm / 100;
  const [cx, cy] = paraFolha(geo.x, geo.y);

  // Rotação (Sprint 3): `geo.rotacao` em graus, sentido horário -- mesma
  // convenção do `rotation` do Konva no canvas (ver `BlocoShape.tsx`).
  // Como `paraFolha` é uma translação pura (sem flip/escala), o mesmo
  // ângulo aplicado aqui, em mm, produz a MESMA rotação visual do canvas.
  // (Rotaciona os PONTOS diretamente, sem usar a opção `angle` do jsPDF
  // -- que é sentido ANTI-horário, ver o texto abaixo neste mesmo arquivo
  // -- então não há inversão de sinal necessária aqui.)
  const anguloRad = ((geo.rotacao ?? 0) * Math.PI) / 180;
  const cosA = Math.cos(anguloRad);
  const sinA = Math.sin(anguloRad);

  // (vx, vy) em coordenadas do viewBox (0-100) -> mm absolutos na folha,
  // já com a rotação aplicada em volta do ponto de inserção (cx, cy).
  const pt = (vx: number, vy: number): [number, number] => {
    const lx = (vx - 50) * fx;
    const ly = (vy - 50) * fy;
    return [cx + lx * cosA - ly * sinA, cy + lx * sinA + ly * cosA];
  };

  const linha = (x1: number, y1: number, x2: number, y2: number) => {
    const [ax, ay] = pt(x1, y1);
    const [bx, by] = pt(x2, y2);
    doc.line(ax, ay, bx, by);
  };
  const circulo = (vx: number, vy: number, r: number) => {
    const [ax, ay] = pt(vx, vy);
    doc.circle(ax, ay, r * Math.min(fx, fy), "S");
  };
  // Desenhado como um quadrilátero fechado (não `doc.rect`, que só sabe
  // desenhar eixo-alinhado) -- os 4 cantos já passam por `pt()`, então
  // saem rotacionados corretamente junto com o resto do bloco.
  const retangulo = (x: number, y: number, w: number, h: number) => {
    const abs = [pt(x, y), pt(x + w, y), pt(x + w, y + h), pt(x, y + h)];
    const deltas: [number, number][] = abs.slice(1).map((p, i) => [p[0] - abs[i][0], p[1] - abs[i][1]]);
    doc.lines(deltas, abs[0][0], abs[0][1], [1, 1], "S", true);
  };
  /** Polígono fechado arbitrário (coordenadas do viewBox 0-100) -- `preenchido` usa a cor de fill já setada por `aplicarEstiloCamada`. */
  const poligono = (pontos: [number, number][], preenchido = false) => {
    const abs = pontos.map(([vx, vy]) => pt(vx, vy));
    const deltas: [number, number][] = abs.slice(1).map((p, i) => [p[0] - abs[i][0], p[1] - abs[i][1]]);
    doc.lines(deltas, abs[0][0], abs[0][1], [1, 1], preenchido ? "F" : "S", true);
  };
  const circuloPreenchido = (vx: number, vy: number, r: number) => {
    const [ax, ay] = pt(vx, vy);
    doc.circle(ax, ay, r * Math.min(fx, fy), "F");
  };
  /** Sequência de segmentos ABERTA (não fecha o último ponto no primeiro) -- usada pra aproximar curvas (ex.: a onda senoidal do símbolo de inversor). */
  const polilinhaAberta = (pontos: [number, number][]) => {
    for (let i = 1; i < pontos.length; i++) linha(pontos[i - 1][0], pontos[i - 1][1], pontos[i][0], pontos[i][1]);
  };
  /**
   * Iteração 21: helper que faltava -- todo `<text>` embutido no SVG de um
   * bloco (`blocks.ts`) nunca tinha um equivalente aqui, então "sumia" no
   * PDF (bug relatado pelo usuário: "no pdf os nomes dos blocos somem, nao
   * mostra KWH" -- confirmado por grep: só `medidor_kwh` e
   * `padrao_entrada_detalhe` têm `<text>` no SVG, exatamente os 2 casos
   * corrigidos abaixo). `vx`/`vy`/`fontSize` são os MESMOS valores de
   * `x`/`y`/`font-size` do `<text>` no SVG (coordenadas do viewBox 0-100)
   * -- `fontSize` escala por `Math.min(fx, fy)` (mesma convenção de
   * `circulo`, que já escala raio por essa combinação) pra acompanhar o
   * tamanho do bloco na folha, e a rotação do bloco (`geo.rotacao`) é
   * repassada pro `angle` do jsPDF, negada pela mesma razão de sinal já
   * documentada nesta função (jsPDF é anti-horário, o resto do app é
   * horário).
   */
  const texto = (vx: number, vy: number, conteudo: string, fontSize: number, align: "left" | "center" = "center") => {
    const [ax, ay] = pt(vx, vy);
    doc.setFontSize(Math.max(0.1, fontSize * Math.min(fx, fy)) * MM_PARA_PT);
    doc.text(conteudo, ax, ay, { align, angle: geo.rotacao ? -geo.rotacao : undefined });
  };

  // Precisa espelhar exatamente o svgInner de cada bloco em lib/blocks.ts.
  switch (geo.nome) {
    case "disjuntor":
      // Iteração 16: símbolo de mola/coil (ver `blocks.ts`) -- a curva
      // Bézier `Q 37.5 45` do SVG é aproximada aqui pelos mesmos 5 pontos
      // amostrados (mesma técnica já usada pra onda senoidal do "inversor").
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
      // Iteração 19: mesma mola do "disjuntor" (monopolar), com o 2º traço
      // cruzando -- ver comentário em `blocks.ts`.
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
      // Iteração 19: mesma mola, 3 traços = tripolar.
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
    // Iteração 35: família de tomadas/interruptor/luz do gerador automático
    // (ver `blocks.ts` e `lib/lancamentoEletrico.ts`) -- espelha exatamente
    // o `svgInner` de cada bloco lá.
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
      texto(50, 60, "S", 30);
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
      poligono(
        [
          [62, 63],
          [51, 59],
          [59, 49],
        ],
        true
      );
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
      // Aproximação poligonal da onda senoidal do símbolo (o SVG original
      // usa uma curva Bézier `<path>` -- jsPDF não tem um helper direto de
      // curva suave aqui, então uma polilinha com pontos amostrados dá o
      // mesmo efeito visual de "onda" numa exportação vetorial de traço fino).
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
      // Iteração 15: estirões verticais novos (ver `blocks.ts`) -- o
      // gerador de diagrama FV usa este bloco no fluxo VERTICAL, então sem
      // isto o PDF mostrava um gap acima/abaixo do retângulo.
      linha(50, 0, 50, 20);
      linha(50, 80, 50, 100);
      break;
    case "inversor_vertical":
      // Iteração 17: mesmo desenho do "inversor" acima, SEM os 2 estirões
      // horizontais (ver `blocks.ts` sobre por quê -- variante interna só
      // do gerador de diagrama FV).
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
      // Iteração 15: DPS em derivação lateral (ramal em T) -- ver `blocks.ts`.
      linha(8, 50, 8, 20);
      linha(2, 20, 14, 20);
      linha(4, 12, 12, 12);
      linha(6, 5, 10, 5);
      linha(8, 50, 30, 50);
      retangulo(30, 32, 34, 36);
      linha(37, 60, 57, 40);
      poligono(
        [
          [57, 40],
          [47, 42],
          [54, 50],
        ],
        true
      );
      linha(64, 50, 100, 50);
      break;
    case "terra":
      // Iteração 15: símbolo de aterramento pontual -- ver `blocks.ts`.
      linha(50, 0, 50, 40);
      linha(20, 40, 80, 40);
      linha(30, 60, 70, 60);
      linha(40, 80, 60, 80);
      break;
    case "padrao_entrada_detalhe":
      // Iteração 18: desenho representativo da caixa de medição -- ver
      // `blocks.ts`.
      // Iteração 21: o rótulo "kWh" (elemento <text> do SVG, x=50 y=33
      // font-size=13) agora É reproduzido aqui via o novo helper `texto`
      // -- bug relatado pelo usuário ("no pdf os nomes dos blocos somem")
      // confirmado e corrigido (ver comentário no helper, acima).
      linha(35, 0, 35, 10);
      linha(65, 0, 65, 10);
      retangulo(10, 10, 80, 60);
      retangulo(20, 16, 60, 24);
      texto(50, 33, "kWh", 13);
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
      // Iteração 21: o rótulo "KWH" do SVG (elemento <text>, x=50 y=50
      // font-size=22) agora É reproduzido aqui via o novo helper `texto`
      // -- bug relatado pelo usuário ("no pdf os nomes dos blocos somem,
      // nao mostra KWH"), confirmado por grep (só este bloco e
      // `padrao_entrada_detalhe` têm `<text>` no SVG) e corrigido nos 2.
      linha(50, 0, 50, 14);
      retangulo(14, 14, 72, 60);
      texto(50, 50, "KWH", 22);
      linha(50, 74, 50, 100);
      break;
    case "modulo_fotovoltaico":
      // Iteração 15: ápice movido pra y=0 (encostando na borda do viewBox,
      // sem gap) + traço de saída na base pro terminal de baixo -- ver
      // `blocks.ts` (mesmo motivo do comentário lá).
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
      // Iteração 28: espelha exatamente o SVG de `blocks.ts` -- contorno
      // do lastro, hachura diagonal indicando a base lastreada, círculo no
      // topo (extremidade alta/fundo) e triângulo preenchido na base
      // (extremidade baixa/frente), ver o comentário lá pra convenção de
      // orientação.
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
      // Bloco desconhecido: desenha ao menos a caixa delimitadora.
      retangulo(0, 0, 100, 100);
  }
}

/**
 * Substitui caracteres que a fonte padrão "helvetica" do jsPDF (Standard14,
 * sem os glifos de sobrescrito) simplesmente NÃO desenha -- saem como um
 * espaço em branco no PDF final, sem aviso nenhum. Achado ao testar o
 * campo de Notas com texto técnico real ("6mm² ... resistente a UV"), que
 * é exatamente o tipo de anotação (seção transversal de condutor em mm²)
 * que aparece o tempo todo em projetos elétricos -- então em vez de deixar
 * o usuário perder silenciosamente esse caractere, trocamos por um
 * equivalente legível ANTES de medir/desenhar (aplicado em todo texto
 * livre do carimbo, não só Notas, já que qualquer campo pode conter isso).
 */
function saneParaFontePdf(texto: string): string {
  return texto.replace(/²/g, "2").replace(/³/g, "3");
}

/** Encurta `texto` (com "…") até caber em `larguraMaxMm`, medido com o tamanho de fonte JÁ setado no `doc`. */
function truncarTexto(doc: jsPDF, texto: string, larguraMaxMm: number): string {
  const t0 = saneParaFontePdf(texto);
  if (larguraMaxMm <= 0 || doc.getTextWidth(t0) <= larguraMaxMm) return t0;
  let t = t0;
  while (t.length > 1 && doc.getTextWidth(t + "…") > larguraMaxMm) t = t.slice(0, -1);
  return t.length > 1 ? t + "…" : t;
}

/**
 * Quebra `texto` em linhas que cabem em `larguraMaxMm`, medido com o
 * tamanho/estilo de fonte JÁ setado no `doc` (Iteração 19, campo "Notas"
 * do carimbo -- texto livre/multilinha, cada `\n` é um parágrafo explícito
 * e cada parágrafo quebra automaticamente palavra-por-palavra dentro da
 * largura disponível, igual um textarea normal). `maxLinhas` corta o
 * resultado e adiciona "…" na última linha exibida, pra não deixar o
 * carimbo crescer sem limite se o usuário colar um texto enorme.
 */
function quebrarLinhasTexto(doc: jsPDF, texto: string, larguraMaxMm: number, maxLinhas: number): string[] {
  const paragrafos = saneParaFontePdf(texto || "").split("\n");
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
      if (doc.getTextWidth(candidata) <= larguraMaxMm) {
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
    cortadas[maxLinhas - 1] = truncarTexto(doc, cortadas[maxLinhas - 1] + "…", larguraMaxMm);
    return cortadas;
  }
  return linhas;
}

/**
 * Iteração 26: mesmo helper de "fit-and-contain" de `TitleBlockLayer.tsx`
 * (ver o comentário completo lá) -- encaixa uma imagem (logo/assinatura do
 * carimbo) dentro de uma caixa reservada sem esticar, preservando a
 * proporção original via uma única escala (`Math.min` das 2 razões).
 * Duplicado aqui (não importado de `TitleBlockLayer.tsx`) porque esse
 * arquivo é `"use client"`/React -- `pdfExport.ts` roda também em
 * contextos sem DOM completo; a função em si é matemática pura, sem
 * nenhuma dependência de um lado ou de outro, então duplicar essas poucas
 * linhas é mais simples e seguro que criar um módulo compartilhado só
 * para isso (mesmo espírito de baixo-risco já aplicado em outras
 * duplicações intencionais do projeto, ver Iteração 13).
 */
function encaixarImagemNaCaixaPdf(
  larguraNatural: number,
  alturaNatural: number,
  caixaX: number,
  caixaY: number,
  caixaLargura: number,
  caixaAltura: number
): { x: number; y: number; width: number; height: number } {
  if (!larguraNatural || !alturaNatural) {
    return { x: caixaX, y: caixaY, width: caixaLargura, height: caixaAltura };
  }
  const escala = Math.min(caixaLargura / larguraNatural, caixaAltura / alturaNatural);
  const width = larguraNatural * escala;
  const height = alturaNatural * escala;
  return {
    x: caixaX + (caixaLargura - width) / 2,
    y: caixaY + (caixaAltura - height) / 2,
    width,
    height,
  };
}

/**
 * Desenha o Carimbo/legenda ABNT no canto inferior direito da prancha,
 * espelhando ao pé da letra o layout de `TitleBlockLayer.tsx` (mesmas
 * proporções, mesmas dimensões via `dimensoesCarimbo`) -- assim o PDF
 * exportado sai idêntico ao que o usuário vê no canvas. `offX`/`offY`
 * são os mesmos deslocamentos de `exportarPranchaPdf` (a folha, no
 * mundo do canvas, é centrada na origem; no PDF, (0,0) é o canto
 * superior esquerdo) -- como não há mudança de escala (1 unidade de
 * mundo = 1mm de papel), a tradução é só uma soma direta.
 */
function desenharCarimboPdf(
  doc: jsPDF,
  carimbo: Carimbo,
  activeSheet: FormatoFolha,
  offX: number,
  offY: number,
  orientacao?: "paisagem" | "retrato",
  // Iteração 27: até aqui o carimbo SEMPRE desenhava seu texto no tamanho
  // nativo, mesmo quando a prancha ia ser bem reduzida pra caber numa A4
  // física -- diferente do texto do próprio diagrama (`desenharUmaGeometria`),
  // que já recebe esse mesmo `boostTexto` desde a Iteração 18. Resultado: com
  // uma prancha bem maior que A4 (ex. A1), o texto do diagrama era um pouco
  // compensado, mas o do carimbo (nome do responsável, cliente, notas...)
  // ficava do tamanho ORIGINAL, ainda menor na folha física -- parte do
  // motivo do usuário achar "o texto ainda está pequeno quando imprimo na
  // folha A4". Default 1 preserva o comportamento de sempre (canvas, PDF
  // nativo, DXF -- nenhum desses passa um valor aqui).
  escalaTexto: number = 1
) {
  if (!carimbo.visivel) return;

  // O carimbo é sempre desenhado com traço SÓLIDO, independente do estilo
  // de linha da ÚLTIMA camada de geometria desenhada antes dele (Iteração
  // 12c: `setLineDashPattern` é estado persistente do jsPDF -- sem este
  // reset explícito, uma camada tracejada "vazaria" o tracejado pra toda
  // a moldura do carimbo, já que esta função não passa por
  // `aplicarEstiloCamada`).
  doc.setLineDashPattern([], 0);

  const folha = dimensoesFolhaOrientada(activeSheet, orientacao);
  const folhaX = -folha.largura / 2;
  const folhaY = -folha.altura / 2;
  const { largura, altura } = dimensoesCarimbo(activeSheet, carimbo.escalaCarimbo, orientacao);

  const brXmundo = folhaX + folha.largura - MARGENS_ABNT.direita;
  const brYmundo = folhaY + folha.altura - MARGENS_ABNT.inferior;

  // Iteração 19: logo e assinatura saem de "do lado" (Iteração 12g) pra uma
  // FAIXA no TOPO do carimbo (logo esquerda / assinatura direita), a
  // pedido do usuário ("quero que a imagem logo e assinatura fiquem na
  // parte de cima do carimbo e nao do lado, assim aproveitamos mais a
  // folha") -- a grade de 5 linhas abaixo não muda de largura.
  const larguraTotal = largura;
  const alturaTopo = altura * 0.52;
  const bx = brXmundo - larguraTotal + offX;
  const by = brYmundo - altura + offY; // topo da GRADE (sem contar faixa de topo/notas, que crescem pra cima a partir daqui)
  const textoX = bx;
  const larguraTexto = largura;

  const corBorda: [number, number, number] = [51, 65, 85];
  const corLabel: [number, number, number] = [100, 116, 139];
  const corValor: [number, number, number] = [15, 23, 42];

  // --- Campo de Notas (Iteração 19): caixa de texto livre/editável, SEMPRE
  // posicionada logo ACIMA de tudo (igual ao PDF de referência do usuário,
  // que tem uma caixa "NOTAS:" imediatamente acima do carimbo) -- muda de
  // projeto pra projeto, por isso vem de `carimbo.notas` em vez de fixo.
  const larguraNotas = larguraTotal - 4;
  const fsNotasLabelMm = 2.6;
  const fsNotasCorpoMm = 2.3;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(fsNotasCorpoMm * escalaTexto * MM_PARA_PT);
  const linhasNotas = quebrarLinhasTexto(doc, carimbo.notas || "", larguraNotas, 10);
  const linhasNotasExibidas = linhasNotas.length > 0 ? linhasNotas : [""];
  const alturaLinhaNotas = fsNotasCorpoMm * 1.5;
  const alturaNotas = fsNotasLabelMm + 2 + linhasNotasExibidas.length * alturaLinhaNotas + 2;
  const byTopo = by - alturaTopo;
  const byNotas = byTopo - alturaNotas;

  doc.setDrawColor(...corBorda);
  doc.setLineWidth(0.25);
  doc.rect(bx, byNotas, larguraTotal, alturaNotas, "S");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(fsNotasLabelMm * escalaTexto * MM_PARA_PT);
  doc.setTextColor(...corValor);
  doc.text("NOTAS:", bx + 2, byNotas + fsNotasLabelMm + 0.6);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(fsNotasCorpoMm * escalaTexto * MM_PARA_PT);
  doc.setTextColor(...corValor);
  linhasNotasExibidas.forEach((linha, i) => {
    doc.text(linha, bx + 2, byNotas + fsNotasLabelMm + 2 + (i + 1) * alturaLinhaNotas);
  });

  // --- Faixa de topo: logo (esquerda) + assinatura (direita), Iteração 19.
  doc.setDrawColor(...corBorda);
  doc.setLineWidth(0.25);
  doc.rect(bx, byTopo, larguraTotal / 2, alturaTopo, "S"); // célula da logo
  doc.rect(bx + larguraTotal / 2, byTopo, larguraTotal / 2, alturaTopo, "S"); // célula da assinatura

  if (carimbo.logoDataUrl) {
    try {
      const formato = carimbo.logoDataUrl.includes("image/png")
        ? "PNG"
        : carimbo.logoDataUrl.includes("image/webp")
        ? "WEBP"
        : "JPEG";
      const padX = larguraTotal * 0.02;
      const padY = alturaTopo * 0.1;
      const caixaX = bx + padX;
      const caixaY = byTopo + padY;
      const caixaLargura = larguraTotal / 2 - padX * 2;
      const caixaAltura = alturaTopo - padY * 2;
      // Iteração 26: dimensões NATURAIS da imagem (`doc.getImageProperties`
      // decodifica só o cabeçalho PNG/JPEG/WEBP, síncrono, sem precisar
      // pré-carregar um `<img>`) -- sem isso, `addImage` sempre esticava a
      // logo pro tamanho exato da caixa reservada, distorcendo qualquer
      // logo que não tivesse essa proporção específica (bug relatado pelo
      // usuário: "a logo no carimbo esta ficando esticada perdendo a
      // proporcao de escala").
      let larguraNatural = 0;
      let alturaNatural = 0;
      try {
        const props = doc.getImageProperties(carimbo.logoDataUrl);
        larguraNatural = props.width;
        alturaNatural = props.height;
      } catch {
        // Não conseguiu ler as dimensões naturais -- cai no fallback de
        // caixa cheia (comportamento de antes desta correção).
      }
      const caixa = encaixarImagemNaCaixaPdf(larguraNatural, alturaNatural, caixaX, caixaY, caixaLargura, caixaAltura);
      doc.addImage(carimbo.logoDataUrl, formato, caixa.x, caixa.y, caixa.width, caixa.height);
    } catch {
      // Logo corrompido/formato não suportado -- ignora silenciosamente, o resto do carimbo continua saindo normalmente.
    }
  }

  // Célula de assinatura: linha pra assinar + legenda; a imagem da rubrica
  // (se houver) é desenhada por CIMA da linha, já que "tenho rubrica em
  // imagem png e sempre uso" -- sem imagem, a linha ainda serve pra
  // assinar à mão numa impressão física.
  const assinaturaCx = bx + larguraTotal * 0.75;
  const assinaturaLarguraLinha = larguraTotal * 0.42;
  const yLinhaAssinatura = byTopo + alturaTopo * 0.72;
  if (carimbo.assinaturaDataUrl) {
    try {
      const formato = carimbo.assinaturaDataUrl.includes("image/jpeg") ? "JPEG" : "PNG";
      const caixaLargura = assinaturaLarguraLinha * 0.9;
      const caixaAltura = Math.min(alturaTopo * 0.55, caixaLargura * 0.5);
      const caixaX = assinaturaCx - caixaLargura / 2;
      const caixaY = yLinhaAssinatura - caixaAltura - 0.5;
      // Iteração 26: mesma correção de "fit-and-contain" do logo, aqui
      // pra rubrica -- ver o comentário completo acima.
      let larguraNatural = 0;
      let alturaNatural = 0;
      try {
        const props = doc.getImageProperties(carimbo.assinaturaDataUrl);
        larguraNatural = props.width;
        alturaNatural = props.height;
      } catch {
        // Fallback de caixa cheia, ver acima.
      }
      const caixa = encaixarImagemNaCaixaPdf(larguraNatural, alturaNatural, caixaX, caixaY, caixaLargura, caixaAltura);
      doc.addImage(carimbo.assinaturaDataUrl, formato, caixa.x, caixa.y, caixa.width, caixa.height);
    } catch {
      // Assinatura corrompida/formato não suportado -- ignora, a linha em branco continua disponível pra assinar à mão.
    }
  }
  doc.setDrawColor(...corBorda);
  doc.setLineWidth(0.2);
  doc.line(
    assinaturaCx - assinaturaLarguraLinha / 2,
    yLinhaAssinatura,
    assinaturaCx + assinaturaLarguraLinha / 2,
    yLinhaAssinatura
  );
  const fsAssinaturaMm = Math.max(1.6, alturaTopo * 0.09);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(fsAssinaturaMm * escalaTexto * MM_PARA_PT);
  doc.setTextColor(...corLabel);
  doc.text(
    truncarTexto(doc, "Assinatura do responsável técnico", assinaturaLarguraLinha),
    assinaturaCx,
    yLinhaAssinatura + fsAssinaturaMm + 1,
    { align: "center" }
  );

  // 5 linhas de conteúdo (Iteração 12c, espelha exatamente TitleBlockLayer.tsx):
  // título / endereço do cliente / cliente+responsável / conta contrato+
  // tipo de ligação / escala+data+prancha.
  const alturaTitulo = altura * 0.24;
  const alturaLinha2 = altura * 0.19; // endereço
  const alturaLinha3 = altura * 0.19; // cliente | responsável
  const alturaLinha4 = altura * 0.19; // conta contrato | tipo de ligação
  const yLinha2 = by + alturaTitulo;
  const yLinha3 = yLinha2 + alturaLinha2;
  const yLinha4 = yLinha3 + alturaLinha3;
  const yLinha5 = yLinha4 + alturaLinha4;
  const yFim = by + altura;

  doc.setDrawColor(...corBorda);
  doc.setLineWidth(0.25);
  // Moldura externa da grade principal.
  doc.rect(bx, by, larguraTotal, altura, "S");
  doc.line(textoX, yLinha2, textoX + larguraTexto, yLinha2);
  doc.line(textoX, yLinha3, textoX + larguraTexto, yLinha3);
  doc.line(textoX, yLinha4, textoX + larguraTexto, yLinha4);
  doc.line(textoX, yLinha5, textoX + larguraTexto, yLinha5);
  doc.line(textoX + larguraTexto / 2, yLinha3, textoX + larguraTexto / 2, yLinha4);
  doc.line(textoX + larguraTexto / 2, yLinha4, textoX + larguraTexto / 2, yLinha5);
  doc.line(textoX + larguraTexto / 3, yLinha5, textoX + larguraTexto / 3, yFim);
  doc.line(textoX + (larguraTexto * 2) / 3, yLinha5, textoX + (larguraTexto * 2) / 3, yFim);

  const fsTituloMm = Math.max(2.2, alturaTitulo * 0.4);
  const fsLabelMm = Math.max(1.7, alturaLinha2 * 0.26);
  const fsValorMm = Math.max(1.9, alturaLinha2 * 0.32);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(fsTituloMm * escalaTexto * MM_PARA_PT);
  doc.setTextColor(...corValor);
  const tituloTxt = truncarTexto(doc, carimbo.titulo || "TÍTULO DO PROJETO", larguraTexto - 4);
  doc.text(tituloTxt, textoX + larguraTexto / 2, by + alturaTitulo * 0.62, { align: "center" });

  const campo = (x: number, y: number, w: number, label: string, valor: string) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(fsLabelMm * escalaTexto * MM_PARA_PT);
    doc.setTextColor(...corLabel);
    doc.text(truncarTexto(doc, label, w - 3), x + 1.5, y + fsLabelMm + 0.6);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(fsValorMm * escalaTexto * MM_PARA_PT);
    doc.setTextColor(...corValor);
    doc.text(truncarTexto(doc, valor || "—", w - 3), x + 1.5, y + fsLabelMm + fsValorMm + 1.4);
  };

  /**
   * Iteração 25: campo dedicado pro "RESPONSÁVEL TÉCNICO" -- ver o mesmo
   * raciocínio/comentário completo em `TitleBlockLayer.tsx`. Antes
   * concatenava nome+CREA numa string só, truncada em 1 linha só por
   * `truncarTexto` -- um nome mais longo cortava o próprio número do CREA
   * com "…" (relatado pelo usuário no PDF exportado, exatamente o dado que
   * ele precisa visível pra concessionária). Corrigido com 2 linhas de
   * VALOR empilhadas, cada uma truncada independentemente, numa fonte um
   * pouco menor pra caber as 2 linhas na mesma altura de linha da grade.
   */
  const campoResponsavelTecnico = (x: number, y: number, w: number) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(fsLabelMm * escalaTexto * MM_PARA_PT);
    doc.setTextColor(...corLabel);
    doc.text(truncarTexto(doc, "RESPONSÁVEL TÉCNICO", w - 3), x + 1.5, y + fsLabelMm + 0.6);

    const temCrea = !!carimbo.crea;
    const fsValorRespMm = temCrea ? fsValorMm * 0.72 : fsValorMm;
    const linhaAlturaResp = fsValorRespMm * 1.2;
    const yValor = y + fsLabelMm + fsValorRespMm + 1.4;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(fsValorRespMm * escalaTexto * MM_PARA_PT);
    doc.setTextColor(...corValor);
    doc.text(truncarTexto(doc, carimbo.responsavel || "—", w - 3), x + 1.5, yValor);
    if (temCrea) {
      doc.text(truncarTexto(doc, `CREA ${carimbo.crea}`, w - 3), x + 1.5, yValor + linhaAlturaResp);
    }
  };

  // Linha 2 (Iteração 12c): endereço completo do cliente -- linha inteira
  campo(textoX, yLinha2, larguraTexto, "ENDEREÇO DO CLIENTE", carimbo.enderecoCliente);

  // Linha 3: Cliente | Responsável técnico
  campo(textoX, yLinha3, larguraTexto / 2, "CLIENTE", carimbo.cliente);
  campoResponsavelTecnico(textoX + larguraTexto / 2, yLinha3, larguraTexto / 2);

  // Linha 4 (Iteração 12c): Conta Contrato | Tipo de Ligação -- exigidos pela concessionária
  campo(textoX, yLinha4, larguraTexto / 2, "CONTA CONTRATO", carimbo.contaContrato);
  campo(textoX + larguraTexto / 2, yLinha4, larguraTexto / 2, "TIPO DE LIGAÇÃO", ROTULOS_TIPO_LIGACAO[carimbo.tipoLigacao]);

  // Linha 5: Escala | Data | Prancha
  campo(textoX, yLinha5, larguraTexto / 3, "ESCALA", carimbo.escala);
  campo(textoX + larguraTexto / 3, yLinha5, larguraTexto / 3, "DATA", carimbo.data);
  campo(textoX + (larguraTexto * 2) / 3, yLinha5, larguraTexto / 3, "PRANCHA", carimbo.prancha);

  doc.setFont("helvetica", "normal"); // restaura o padrão pro resto do documento
}

function aplicarEstiloCamada(doc: jsPDF, camada: Camada) {
  const [r, g, b] = hexParaRgb(camada.cor);
  doc.setDrawColor(r, g, b);
  // Também define a cor de PREENCHIMENTO igual à de traço -- blocos com
  // elementos preenchidos (ex.: a seta do DPS, os terminais da
  // Seccionadora CC) usam essa cor por padrão em `desenharBloco` (ver
  // `poligono`/`circuloPreenchido` ali). Quem precisar de um preenchimento
  // DIFERENTE (ex.: hachura SOLID) chama `doc.setFillColor` de novo depois
  // desta função, sobrescrevendo -- não quebra nada já existente.
  doc.setFillColor(r, g, b);
  // Espessura em px de tela -> mm: heurística simples só para manter a
  // proporção visual entre camadas finas/grossas no PDF final.
  doc.setLineWidth(Math.max(0.08, camada.espessuraDaLinha * 0.15));
  // Estilo do traço (Iteração 12c): o documento usa `unit: "mm"` (ver
  // `exportarPranchaPdf`), então o mesmo array em mm de
  // `PADRAO_TRACEJADO_MM` (compartilhado com o `dash` do Konva no canvas,
  // ver `dashDaCamada` em GeometryLayer.tsx) pode ser passado direto pra
  // `setLineDashPattern` sem nenhuma conversão -- o tracejado do PDF "bate"
  // com o tracejado mostrado no editor. `[]` restaura o traço contínuo
  // (preciso resetar aqui porque `setLineDashPattern` fica valendo pra
  // TODOS os `doc.line()`/`doc.rect()` seguintes até ser trocado de novo).
  doc.setLineDashPattern(camada.estiloLinha === "tracejada" ? PADRAO_TRACEJADO_MM : [], 0);
}

/**
 * Desenha UMA geometria (qualquer tipo exceto "viewport", que tem sua
 * própria função -- ver `desenharViewportPdf`) no PDF, através de um par
 * `paraFolha`/`dentroDaFolha` injetado -- normalmente o par "mundo -> mm
 * da folha" de `exportarPranchaPdf`, mas `desenharViewportPdf` passa um
 * par COMPOSTO ("modelo local do viewport -> mm da folha") pra
 * reaproveitar exatamente esta função no conteúdo espelhado dentro de um
 * viewport, sem duplicar nenhuma lógica de desenho. Extraído do antigo
 * corpo inline de `exportarPranchaPdf` (Sprint 5) especificamente por
 * isso -- antes dessa extração, o viewport não tinha como reusar o
 * desenho de cada tipo de geometria.
 */
function desenharUmaGeometria(
  doc: jsPDF,
  g: Geometria,
  camada: Camada,
  paraFolha: (x: number, y: number) => [number, number],
  dentroDaFolha: (x: number, y: number) => boolean,
  unidade: UnidadeDesenho = "mm",
  // Iteração 18: fator de TAMANHO (não-posição) aplicado a qualquer
  // grandeza que `paraFolha` sozinho não escala -- `largura`/`altura` de
  // retângulo, `raio` de círculo/arco, e o tamanho (fx/fy) de um bloco
  // inteiro. Ver o comentário grande em `desenharViewportPdf` sobre a
  // causa raiz: só a POSIÇÃO de um ponto passa por `paraFolha` (que já
  // divide por `modelScale` dentro de um viewport); qualquer distância
  // "solta" (não um par de pontos transformados individualmente) fica de
  // fora dessa conta e continua do tamanho absoluto do MUNDO, mesmo
  // quando o viewport está bem afastado -- é isso que fazia o contorno
  // da legenda (retângulo) e os ícones da legenda (blocos) saírem
  // enormes/vazando por cima de tudo numa prancha pequena (A4) tentando
  // enquadrar um diagrama grande. `1` (padrão) preserva o comportamento
  // de sempre (fora de um viewport, ou dentro de um com modelScale 1).
  escalaGeom: number = 1,
  // Fator EXTRA de fonte, por cima de `escalaGeom` -- ver
  // `desenharViewportPdf`/`boostTextoParaA4`.
  escalaTexto: number = escalaGeom
) {
  if (g.tipo === "linha") {
    if (!dentroDaFolha(g.x1, g.y1) && !dentroDaFolha(g.x2, g.y2)) return;
    aplicarEstiloCamada(doc, camada);
    const [x1, y1] = paraFolha(g.x1, g.y1);
    const [x2, y2] = paraFolha(g.x2, g.y2);
    doc.line(x1, y1, x2, y2);
  } else if (g.tipo === "circulo") {
    if (!dentroDaFolha(g.x, g.y)) return;
    aplicarEstiloCamada(doc, camada);
    const [cx, cy] = paraFolha(g.x, g.y);
    const raioPapel = g.raio * escalaGeom;
    if (g.hachura?.tipo === "SOLID") {
      const [r, gc, b] = hexParaRgb(g.hachura.cor);
      doc.setFillColor(r, gc, b);
      doc.circle(cx, cy, raioPapel, "FD");
    } else {
      doc.circle(cx, cy, raioPapel, "S");
      if (g.hachura) {
        // Círculo não tem uma lista de vértices própria como
        // retângulo/polígono -- aproxima o contorno por um polígono de
        // muitos lados (64) só para servir de caminho de CLIP do padrão
        // vetorial; o CONTORNO visível continua sendo o `doc.circle` "S"
        // acima (redondo de verdade), só o RECORTE do preenchimento é
        // poligonal (imperceptível com 64 lados).
        const N = 64;
        const pontosAbs: [number, number][] = [];
        for (let i = 0; i < N; i++) {
          const ang = (i / N) * Math.PI * 2;
          pontosAbs.push([cx + raioPapel * Math.cos(ang), cy + raioPapel * Math.sin(ang)]);
        }
        desenharPadraoVetorialPdf(doc, g.hachura, pontosAbs);
      }
    }
  } else if (g.tipo === "bloco") {
    if (!dentroDaFolha(g.x, g.y)) return;
    aplicarEstiloCamada(doc, camada);
    // Blocos (símbolos SVG espelhados) NUNCA saem tracejados, mesmo numa
    // camada "tracejada" -- consistente com o canvas (`BlocoShape.tsx` não
    // recebe/aplica `dash`, ver `Camada.estiloLinha` em lib/types.ts):
    // tracejado é pensado para linhas de traçado (ex.: ramal subterrâneo),
    // não para o contorno do próprio símbolo.
    doc.setLineDashPattern([], 0);
    desenharBloco(doc, g, paraFolha, escalaGeom);
  } else if (g.tipo === "retangulo") {
    const cantos: [number, number][] = [
      [g.x, g.y],
      [g.x + g.largura, g.y],
      [g.x, g.y + g.altura],
      [g.x + g.largura, g.y + g.altura],
    ];
    if (!cantos.some(([cx, cy]) => dentroDaFolha(cx, cy))) return;
    aplicarEstiloCamada(doc, camada);
    // Iteração 16: `tracejado` no próprio retângulo (independente da
    // camada -- ver `RetanguloGeometria.tracejado` em lib/types.ts) tem
    // prioridade sobre o traço da camada, aplicado por cima de
    // `aplicarEstiloCamada` (que acabou de rodar uma linha acima).
    if (g.tracejado) doc.setLineDashPattern(PADRAO_TRACEJADO_MM, 0);
    const [ax, ay] = paraFolha(g.x, g.y);
    const larguraPapel = g.largura * escalaGeom;
    const alturaPapel = g.altura * escalaGeom;
    if (g.hachura?.tipo === "SOLID") {
      const [r, gc, b] = hexParaRgb(g.hachura.cor);
      doc.setFillColor(r, gc, b);
      doc.rect(ax, ay, larguraPapel, alturaPapel, "FD");
    } else {
      doc.rect(ax, ay, larguraPapel, alturaPapel, "S");
      if (g.hachura) {
        desenharPadraoVetorialPdf(doc, g.hachura, [
          [ax, ay],
          [ax + larguraPapel, ay],
          [ax + larguraPapel, ay + alturaPapel],
          [ax, ay + alturaPapel],
        ]);
      }
    }
  } else if (g.tipo === "poligono") {
    if (g.pontos.length < 3 || !g.pontos.some((p) => dentroDaFolha(p.x, p.y))) return;
    aplicarEstiloCamada(doc, camada);
    const abs = g.pontos.map((p) => paraFolha(p.x, p.y));
    const deltas: [number, number][] = abs.slice(1).map((p, i) => [p[0] - abs[i][0], p[1] - abs[i][1]]);
    if (g.hachura?.tipo === "SOLID") {
      const [r, gc, b] = hexParaRgb(g.hachura.cor);
      doc.setFillColor(r, gc, b);
      doc.lines(deltas, abs[0][0], abs[0][1], [1, 1], "FD", true);
    } else {
      doc.lines(deltas, abs[0][0], abs[0][1], [1, 1], "S", true);
      if (g.hachura) desenharPadraoVetorialPdf(doc, g.hachura, abs);
    }
  } else if (g.tipo === "arco") {
    if (!dentroDaFolha(g.x, g.y)) return; // heurística simples (baseada no centro -- ok para os arcos pequenos que o FILLET gera)
    aplicarEstiloCamada(doc, camada);
    // jsPDF não tem uma primitiva de arco nativa -- aproxima com uma
    // polilinha de segmentos curtos amostrados ao longo do arco (técnica
    // padrão, suficientemente precisa visualmente).
    const passos = 24;
    const a0 = (g.anguloInicial * Math.PI) / 180;
    const a1 = (g.anguloFinal * Math.PI) / 180;
    let anterior = paraFolha(g.x + g.raio * Math.cos(a0), g.y + g.raio * Math.sin(a0));
    for (let i = 1; i <= passos; i++) {
      const ang = a0 + ((a1 - a0) * i) / passos;
      const atual = paraFolha(g.x + g.raio * Math.cos(ang), g.y + g.raio * Math.sin(ang));
      doc.line(anterior[0], anterior[1], atual[0], atual[1]);
      anterior = atual;
    }
  } else if (g.tipo === "texto") {
    if (!dentroDaFolha(g.x, g.y)) return;
    const [r, gc, b] = hexParaRgb(camada.cor);
    doc.setTextColor(r, gc, b);
    doc.setFontSize(g.fontSize * escalaTexto * MM_PARA_PT);
    const [tx, ty] = paraFolha(g.x, g.y);
    // O `angle` do jsPDF é sentido ANTI-horário (verificado empiricamente
    // -- ver comentário em `desenharBloco`); negado aqui pra bater com a
    // convenção horária de `rotacao` usada em todo o resto do app (mesma
    // do `rotation` do Konva no canvas).
    doc.text(g.conteudo, tx, ty, g.rotacao ? { angle: -g.rotacao } : undefined);
  } else if (g.tipo === "cota") {
    if (!dentroDaFolha(g.x1, g.y1) && !dentroDaFolha(g.x2, g.y2)) return;
    aplicarEstiloCamada(doc, camada);
    const { q1, q2 } = linhaDeCota({ x: g.x1, y: g.y1 }, { x: g.x2, y: g.y2 }, { x: g.px, y: g.py });
    const [e1x, e1y] = paraFolha(g.x1, g.y1);
    const [f1x, f1y] = paraFolha(q1.x, q1.y);
    doc.line(e1x, e1y, f1x, f1y);
    const [e2x, e2y] = paraFolha(g.x2, g.y2);
    const [f2x, f2y] = paraFolha(q2.x, q2.y);
    doc.line(e2x, e2y, f2x, f2y);
    doc.line(f1x, f1y, f2x, f2y);
    const [r, gc, b] = hexParaRgb(camada.cor);
    doc.setTextColor(r, gc, b);
    // Iteração 29d: cotas com `fontSize` próprio (ver `CotaGeometria` em
    // `types.ts`) escalam como qualquer texto normal -- o fixo "9" de
    // sempre continua servindo de fallback pras cotas manuais (sem esse
    // campo), preservando 100% o tamanho/comportamento de antes pra elas.
    doc.setFontSize((g.fontSize ?? 9) * escalaTexto * MM_PARA_PT);
    // Iteração 12s: mesma reformatação ao vivo do canvas (ver GeometryLayer)
    // -- cotas sem `distanciaMm` (salvas antes desta iteração) caem no
    // `texto` congelado de sempre.
    const textoCota = g.distanciaMm !== undefined ? formatarComUnidade(g.distanciaMm, unidade) : g.texto;
    doc.text(textoCota, (f1x + f2x) / 2, (f1y + f2y) / 2 - 1.5);
  } else if (g.tipo === "polilinha") {
    // PLINE: segmentos unidos, mas ABERTOS (sem fechar entre o último e o
    // primeiro vértice) e nunca preenchidos/hachurados.
    if (g.pontos.length < 2 || !g.pontos.some((p) => dentroDaFolha(p.x, p.y))) return;
    aplicarEstiloCamada(doc, camada);
    const abs = g.pontos.map((p) => paraFolha(p.x, p.y));
    const deltas: [number, number][] = abs.slice(1).map((p, i) => [p[0] - abs[i][0], p[1] - abs[i][1]]);
    doc.lines(deltas, abs[0][0], abs[0][1], [1, 1], "S", false);
  }
  // "viewport" nunca chega aqui -- tratado à parte por `desenharViewportPdf`.
}

/**
 * Pré-carrega os XREFs (imagens/PDFs rasterizados de fundo) VISÍVEIS do
 * projeto como data-URIs PNG, prontos para `doc.addImage` -- precisa
 * acontecer ANTES de montar o PDF porque carregar uma imagem é
 * assíncrono (`Image.onload`), mas todo o resto de `desenharPaginaPdf`/
 * `desenharViewportPdf` é síncrono (não dá pra `await` no meio do
 * desenho). Sem isso, os XREFs eram simplesmente ignorados na exportação
 * (Iteração 12f, bug reportado pelo usuário: "a impressao fica quebrada"
 * -- a imagem de fundo desaparecia por completo ao exportar/imprimir,
 * mesmo aparecendo normalmente no editor).
 *
 * Retorna um Map id -> data-URI; um XREF cuja imagem falhe ao carregar
 * (Blob URL expirado, arquivo corrompido...) simplesmente fica de fora
 * do Map e é pulado por `desenharXrefsPdf`, sem quebrar a exportação
 * inteira.
 */
async function precarregarImagensXref(xrefs: XRef[]): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  await Promise.all(
    xrefs
      .filter((x) => x.visivel !== false && x.objectUrl)
      .map(
        (x) =>
          new Promise<void>((resolve) => {
            const img = new window.Image();
            img.onload = () => {
              try {
                const canvas = document.createElement("canvas");
                canvas.width = img.naturalWidth || x.largura_px;
                canvas.height = img.naturalHeight || x.altura_px;
                const ctx = canvas.getContext("2d");
                if (ctx) {
                  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                  mapa.set(x.id, canvas.toDataURL("image/png"));
                }
              } catch {
                // Falha ao rasterizar num <canvas> (ex.: imagem "tainted"
                // por CORS) -- só não entra no PDF, exportação continua.
              }
              resolve();
            };
            img.onerror = () => resolve();
            img.src = x.objectUrl!;
          })
      )
  );
  return mapa;
}

/**
 * Desenha os XREFs visíveis do projeto no PDF, usando as imagens já
 * pré-carregadas por `precarregarImagensXref`. Chamado ANTES do loop de
 * geometria (mesma ordem do canvas: `XrefLayer` embaixo de
 * `GeometryLayer`, ver CanvasStage.tsx) e de dentro do mesmo bloco
 * `doc.clip()` de quem chama -- então a imagem sai recortada certinho
 * nos limites da folha/viewport, igual qualquer outra geometria.
 */
function desenharXrefsPdf(
  doc: jsPDF,
  xrefs: XRef[],
  imagensXref: Map<string, string>,
  paraFolha: (x: number, y: number) => [number, number],
  dentroDaFolha: (x: number, y: number) => boolean,
  // Iteração 18: ver `desenharUmaGeometria` -- precisa do MESMO fator
  // usado agora por `retangulo`, pelo motivo exato descrito abaixo
  // (manter a imagem do tamanho do retângulo em que foi encaixada).
  escalaGeom: number = 1
) {
  for (const x of xrefs) {
    if (x.visivel === false) continue;
    const dataUri = imagensXref.get(x.id);
    if (!dataUri) continue;
    const larguraMundo = x.largura_px * x.escala;
    const alturaMundo = x.altura_px * x.escala;
    const cantos: [number, number][] = [
      [x.x, x.y],
      [x.x + larguraMundo, x.y],
      [x.x + larguraMundo, x.y + alturaMundo],
      [x.x, x.y + alturaMundo],
    ];
    // Cull grosseiro (nenhum canto dentro da área útil) -- só uma
    // otimização; o `doc.clip()` ativo é quem garante o recorte fino.
    if (!cantos.some(([mx, my]) => dentroDaFolha(mx, my))) continue;
    const [px, py] = paraFolha(x.x, x.y);
    // Largura/altura NÃO passam por `paraFolha` ponto a ponto (só a
    // origem passa) -- de propósito, pro mesmo motivo/convenção usada em
    // `desenharUmaGeometria` pro `retangulo`/`circulo`/`bloco` (ver ali):
    // dentro de um Viewport (Prancha com `modelScale` != 1), diferenciar
    // 2 cantos transformados dava um tamanho de imagem INCONSISTENTE com
    // o tamanho do retângulo em que ela devia caber, fazendo a foto do
    // "Padrão de Entrada Representativo" ultrapassar a borda do quadro
    // no PDF exportado (bug encontrado via inspeção visual do PDF
    // rasterizado, Iteração 13). Usar `escalaGeom` aqui (Iteração 18: a
    // mesma correção agora aplicada em `retangulo`/`circulo`/`bloco`)
    // garante que a imagem sempre fica do tamanho exato do retângulo em
    // que foi encaixada (`box.largura`/`box.altura`, ver
    // `DiagramaFvModal.tsx`), dentro ou fora de um Viewport, mesmo
    // quando este está bem afastado (modelScale grande).
    doc.addImage(dataUri, "PNG", px, py, larguraMundo * escalaGeom, alturaMundo * escalaGeom);
  }
}

/**
 * Desenha o conteúdo "espelhado" de um Viewport (Sprint 5, comando MV/
 * MVIEW) no PDF: recorta (via `doc.clip()`, mesmo padrão de
 * `desenharPadraoVetorialPdf`) exatamente o retângulo do viewport e
 * redesenha TODA a geometria visível do projeto -- exceto o próprio
 * viewport e quaisquer outros (nunca aninha viewport dentro de viewport)
 * -- através de um `paraFolhaModelo` COMPOSTO: a mesma matemática "papel =
 * geo.x + (modelo - modelOffset) / modelScale" usada por `ViewportShape`
 * no canvas (ver comentário lá), encadeada com o `paraFolha` normal da
 * folha (mundo -> mm do PDF) já usado no resto da exportação. Assim o
 * conteúdo sai no PDF EXATAMENTE enquadrado como o Model Ativo mostra no
 * editor, na escala de impressão `modelScale` (1:N).
 *
 * IMPORTANTE (limitação conhecida): o `doc.clip()` do jsPDF recorta com
 * segurança formas vetoriais (linha/retângulo/polígono/arco/hachura) --
 * mas não há garantia de que `doc.text()` respeite o clip em todos os
 * leitores de PDF (o clipping de texto depende de como cada leitor
 * interpreta o content stream). Um texto cujo PONTO DE INSERÇÃO caia
 * dentro do viewport mas cujo conteúdo se estenda pra fora da borda pode
 * "vazar" visualmente em alguns leitores. Ver nota de verificação em
 * `claude/mvp-cad-unifilar.md` (Iteração 11).
 */
function desenharViewportPdf(
  doc: jsPDF,
  vp: ViewportGeometria,
  projeto: Projeto,
  paraFolha: (x: number, y: number) => [number, number],
  imagensXref: Map<string, string>,
  unidade: UnidadeDesenho = "mm",
  // Iteração 18: multiplicador EXTRA de fonte, por cima da correção de
  // `modelScale` -- usado só pelo fluxo "Ajustar para A4" (ver
  // `renderizarPranchaNativaBytes`) pra deixar o texto mais generoso
  // depois da folha inteira ser reduzida pra caber numa A4 física. `1`
  // (padrão) preserva a exportação nativa de sempre.
  boostTexto: number = 1
) {
  const [ax, ay] = paraFolha(vp.x, vp.y);
  const modelScale = vp.modelScale || 1;

  // Iteração 18: bug corrigido -- QUALQUER grandeza de TAMANHO (não um
  // par de pontos) desenhada dentro de um viewport -- `fontSize` de
  // texto/cota, `largura`/`altura` de retângulo, `raio` de círculo, o
  // tamanho inteiro (fx/fy) de um bloco -- usava sempre o valor bruto do
  // MUNDO, ignorando a escala LOCAL deste viewport, enquanto POSIÇÃO já
  // era corretamente dividida por `modelScale` (ver `paraFolhaModelo`
  // abaixo, que aplica isso ponto a ponto). Numa prancha cujo viewport
  // precisa se afastar bastante pra enquadrar o desenho inteiro
  // (`modelScale` bem maior que 1 -- típico de uma prancha A4 tentando
  // mostrar um diagrama grande, projetado pensando numa A1), as posições
  // ficavam corretamente comprimidas mas texto/retângulos/ícones de
  // bloco continuavam do MESMO tamanho absoluto em mm de papel --
  // produzindo tanto texto quanto CONTORNOS (ex.: a caixa da legenda) e
  // ÍCONES sobrepostos/vazando muito além de onde deveriam (reportado
  // pelo usuário: "o desenho se sobrepõe" / "o contorno da legenda
  // sobe"). `escalaGeom` aqui é o inverso do `modelScale`: quanto mais o
  // viewport precisa se afastar, menor cada elemento fica no papel --
  // exatamente como uma posição (par de pontos) já se comporta.
  const escalaGeom = 1 / modelScale;
  // Fator extra SÓ de fonte, por cima de `escalaGeom` -- ver
  // `boostTextoParaA4`.
  const escalaTexto = escalaGeom * boostTexto;

  const paraFolhaModelo = (mx: number, my: number): [number, number] =>
    paraFolha(vp.x + (mx - vp.modelOffsetX) / modelScale, vp.y + (my - vp.modelOffsetY) / modelScale);

  // Bounding box, em coordenadas de MODELO, do que o retângulo do
  // viewport efetivamente mostra -- equivalente ao `dentroDaFolha` normal,
  // só que testando contra a janela local em vez da folha inteira.
  const modelMinX = vp.modelOffsetX;
  const modelMinY = vp.modelOffsetY;
  const modelMaxX = vp.modelOffsetX + vp.largura * modelScale;
  const modelMaxY = vp.modelOffsetY + vp.altura * modelScale;
  const dentroDoModelo = (mx: number, my: number) =>
    mx >= modelMinX && mx <= modelMaxX && my >= modelMinY && my <= modelMaxY;

  doc.saveGraphicsState();
  doc.moveTo(ax, ay);
  doc.lineTo(ax + vp.largura, ay);
  doc.lineTo(ax + vp.largura, ay + vp.altura);
  doc.lineTo(ax, ay + vp.altura);
  doc.close();
  doc.clip();
  doc.discardPath();

  desenharXrefsPdf(doc, projeto.xrefs, imagensXref, paraFolhaModelo, dentroDoModelo, escalaGeom);

  for (const g of projeto.geometria) {
    if (g.id === vp.id || g.tipo === "viewport") continue;
    const camada = resolverCamada(projeto.camadas, g.camada);
    if (!camada.visible) continue;
    desenharUmaGeometria(doc, g, camada, paraFolhaModelo, dentroDoModelo, unidade, escalaGeom, escalaTexto);
  }

  doc.restoreGraphicsState();

  // A borda (e o rótulo de escala) só saem no PDF se `bordaVisivel` --
  // diferente do editor, onde a borda SEMPRE aparece (pra dar pra
  // selecionar/mover o viewport mesmo com a borda marcada como "oculta no
  // PDF"). Ver `ViewportGeometria` em types.ts.
  if (vp.bordaVisivel) {
    doc.setDrawColor(100, 116, 139);
    doc.setLineWidth(0.2);
    // A borda do viewport é sempre sólida, independente do estilo de
    // linha da ÚLTIMA camada desenhada (Iteração 12c: `setLineDashPattern`
    // é estado persistente do jsPDF, não algo que `desenharUmaGeometria`
    // reseta sozinho -- sem este reset explícito, uma camada tracejada
    // desenhada por último "vazaria" o tracejado pra cá).
    doc.setLineDashPattern([], 0);
    doc.rect(ax, ay, vp.largura, vp.altura, "S");

    doc.setFont("helvetica", "normal");
    doc.setFontSize(2.6 * MM_PARA_PT);
    doc.setTextColor(100, 116, 139);
    doc.text(`ESC 1:${Math.round(modelScale)}`, ax + 1, ay + vp.altura - 1);
  }
}

/**
 * Desenha UMA página (moldura + margem ABNT + viewports + carimbo) dentro
 * de um jsPDF já criado no tamanho certo -- função de baixo nível
 * compartilhada por `exportarPagina` (1 PDF por prancha) e
 * `exportarTodasPranchas` (1 PDF multi-página, um `doc.addPage()` por
 * prancha).
 *
 * Iteração 12g: em vez de 1 câmera única cobrindo a área útil inteira
 * (Iteração 12e), a Prancha tem uma LISTA de Viewports
 * (`prancha.viewports`) -- cada um já em coordenadas de PAPEL desta
 * prancha (mesmo sistema da moldura/margem abaixo), desenhado através da
 * MESMA função usada pelos viewports MV/MVIEW clássicos do Desenho
 * (`desenharViewportPdf`, Sprint 5): só precisa de uma função `paraFolha`
 * (papel -> mm do PDF) simples, sem nenhuma câmera composta por cima.
 */
function desenharPaginaPdf(
  doc: jsPDF,
  projeto: Projeto,
  prancha: Prancha,
  imagensXref: Map<string, string>,
  unidade: UnidadeDesenho = "mm",
  // Iteração 18: ver `desenharViewportPdf` -- só repassado adiante,
  // `1` em toda exportação nativa normal.
  boostTexto: number = 1
) {
  const folha = dimensoesFolhaOrientada(prancha.formato, prancha.orientacao);

  // A folha, no mundo do canvas, é centrada na origem (0,0) -- traduz
  // para o sistema do PDF, que tem (0,0) no canto superior esquerdo.
  const offX = folha.largura / 2;
  const offY = folha.altura / 2;
  const paraFolha = (mx: number, my: number): [number, number] => [mx + offX, my + offY];

  // Moldura externa (limite físico da folha) -- sempre sólida (estado
  // inicial padrão do jsPDF já é sólido, mas fixamos explicitamente pra
  // não depender de um default implícito da biblioteca).
  doc.setLineDashPattern([], 0);
  doc.setDrawColor(107, 114, 128);
  doc.setLineWidth(0.3);
  doc.rect(0, 0, folha.largura, folha.altura);

  // Margem interna ABNT (10mm / 25mm à esquerda).
  const m = MARGENS_ABNT;
  doc.setDrawColor(150, 150, 150);
  doc.setLineWidth(0.2);
  const utilX = m.esquerda;
  const utilY = m.superior;
  const larguraUtil = folha.largura - m.esquerda - m.direita;
  const alturaUtil = folha.altura - m.superior - m.inferior;
  doc.rect(utilX, utilY, larguraUtil, alturaUtil);

  for (const vp of prancha.viewports) {
    desenharViewportPdf(doc, vp, projeto, paraFolha, imagensXref, unidade, boostTexto);
  }

  desenharCarimboPdf(doc, projeto.carimbo, prancha.formato, offX, offY, prancha.orientacao, boostTexto);
}

/**
 * Gera e baixa (client-side) o PDF vetorial de UMA prancha. Só entra no
 * PDF o que estiver dentro da área útil (através da câmera da prancha) e
 * em uma camada visível -- exatamente o que o usuário vê no canvas
 * naquela página.
 *
 * Assíncrona (Iteração 12f) porque precisa pré-carregar as imagens dos
 * XREFs (ver `precarregarImagensXref`) antes de desenhar -- veja o
 * comentário lá para o porquê disso ser necessário.
 */
export async function exportarPagina(projeto: Projeto, prancha: Prancha, unidade: UnidadeDesenho = "mm") {
  const imagensXref = await precarregarImagensXref(projeto.xrefs);
  const folha = dimensoesFolhaOrientada(prancha.formato, prancha.orientacao);
  const doc = new jsPDF({
    orientation: folha.largura >= folha.altura ? "landscape" : "portrait",
    unit: "mm",
    format: [folha.largura, folha.altura],
  });
  desenharPaginaPdf(doc, projeto, prancha, imagensXref, unidade);
  const nomeArquivo = `${(projeto.nome || "diagrama").trim().replace(/\s+/g, "_")}-${prancha.nome.trim().replace(/\s+/g, "_")}.pdf`;
  doc.save(nomeArquivo);
}

/**
 * Gera e baixa (client-side) 1 PDF multi-página com TODAS as pranchas do
 * projeto, uma por página, na ordem em que aparecem nas abas (Iteração
 * 12e) -- equivalente a um "plotar tudo" do AutoCAD. Assíncrona pelo
 * mesmo motivo de `exportarPagina` (ver `precarregarImagensXref`). Cada
 * página pode ter formato E ORIENTAÇÃO diferentes (Iteração 12g).
 */
export async function exportarTodasPranchas(projeto: Projeto, unidade: UnidadeDesenho = "mm") {
  if (projeto.pranchas.length === 0) return;
  const imagensXref = await precarregarImagensXref(projeto.xrefs);
  const primeiraFolha = dimensoesFolhaOrientada(projeto.pranchas[0].formato, projeto.pranchas[0].orientacao);
  const doc = new jsPDF({
    orientation: primeiraFolha.largura >= primeiraFolha.altura ? "landscape" : "portrait",
    unit: "mm",
    format: [primeiraFolha.largura, primeiraFolha.altura],
  });

  projeto.pranchas.forEach((prancha, i) => {
    if (i > 0) {
      const folha = dimensoesFolhaOrientada(prancha.formato, prancha.orientacao);
      doc.addPage([folha.largura, folha.altura], folha.largura >= folha.altura ? "landscape" : "portrait");
    }
    desenharPaginaPdf(doc, projeto, prancha, imagensXref, unidade);
  });

  const nomeArquivo = `${(projeto.nome || "diagrama").trim().replace(/\s+/g, "_")}-todas-as-pranchas.pdf`;
  doc.save(nomeArquivo);
}

/**
 * "Ajustar para impressão em A4" (Iteração 14) -- pedido do usuário:
 * imprimindo em casa/escritório (impressora comum, não plotter), uma
 * prancha A1/A2/A3 não cabe fisicamente numa folha A4.
 *
 * PRIMEIRA versão disto tentou escalar tudo com uma matriz de
 * transformação do próprio PDF (`setCurrentTransformationMatrix`) em
 * volta da chamada de `desenharPaginaPdf` -- funcionava na teoria, mas
 * o jsPDF converte Y internamente usando a altura da PÁGINA ATUAL do
 * documento (`getVerticalCoordinate`), não da folha "virtual" A1/A2/A3
 * que a gente queria desenhar por cima -- resultado: o conteúdo saía
 * deslocado/cortado (só a metade de baixo aparecia). Corrigir a conta
 * do flip exigiria depender de um detalhe interno não-documentado do
 * jsPDF, frágil a qualquer atualização da lib.
 *
 * Solução mais robusta: gerar a prancha no tamanho NATIVO dela (exatamente
 * como `exportarPagina` já faz, sem nenhuma mudança), e então usar
 * `pdf-lib` para EMBUTIR essa página inteira (como uma "figura") dentro
 * de uma folha A4 nova, escalada e centralizada com `page.drawPage(...,
 * { xScale, yScale })` -- uma técnica padrão de "imprimir reduzido"
 * (como um N-up de 1 página só) que não depende de nenhum detalhe
 * interno de coordenadas do jsPDF.
 */
const PT_POR_MM = 72 / 25.4;

/** Escolhe a orientação/dimensões da folha A4 de destino que melhor combina com a prancha original (evita desperdiçar área girando uma prancha retrato numa A4 paisagem, e vice-versa). */
function folhaA4DeDestino(prancha: Prancha): { largura: number; altura: number; orientation: "landscape" | "portrait" } {
  const folhaOriginal = dimensoesFolhaOrientada(prancha.formato, prancha.orientacao);
  const paisagem = folhaOriginal.largura >= folhaOriginal.altura;
  return paisagem
    ? { largura: FORMATOS_FOLHA.A4.largura, altura: FORMATOS_FOLHA.A4.altura, orientation: "landscape" }
    : { largura: FORMATOS_FOLHA.A4.altura, altura: FORMATOS_FOLHA.A4.largura, orientation: "portrait" };
}

/** Renderiza UMA prancha no tamanho nativo dela (mesma lógica de `exportarPagina`) e devolve os bytes do PDF de 1 página resultante, sem baixar nada -- usado como fonte pra embutir/reduzir em `adicionarPranchaAjustadaEmA4`. */
function renderizarPranchaNativaBytes(
  projeto: Projeto,
  prancha: Prancha,
  imagensXref: Map<string, string>,
  unidade: UnidadeDesenho,
  boostTexto: number = 1
): ArrayBuffer {
  const folha = dimensoesFolhaOrientada(prancha.formato, prancha.orientacao);
  const doc = new jsPDF({
    orientation: folha.largura >= folha.altura ? "landscape" : "portrait",
    unit: "mm",
    format: [folha.largura, folha.altura],
  });
  desenharPaginaPdf(doc, projeto, prancha, imagensXref, unidade, boostTexto);
  return doc.output("arraybuffer") as ArrayBuffer;
}

/**
 * Calcula, ANTES de renderizar, qual vai ser o fator de redução aplicado
 * por `adicionarPranchaAjustadaEmA4` (mesma conta feita lá em cima da
 * página já embutida -- mas aqui só precisa das dimensões físicas da
 * folha ORIGEM, que já são conhecidas sem precisar renderizar nada).
 * Permite decidir o `boostTexto` (ver `desenharViewportPdf`) ANTES de
 * gerar os bytes nativos, em vez de renderizar 2x.
 */
function fatorReducaoParaA4(prancha: Prancha): number {
  const a4 = folhaA4DeDestino(prancha);
  const folhaOrigem = dimensoesFolhaOrientada(prancha.formato, prancha.orientacao);
  const larguraA4Pt = a4.largura * PT_POR_MM;
  const alturaA4Pt = a4.altura * PT_POR_MM;
  const folgaPt = 10 * PT_POR_MM;
  const larguraOrigemPt = folhaOrigem.largura * PT_POR_MM;
  const alturaOrigemPt = folhaOrigem.altura * PT_POR_MM;
  return Math.min((larguraA4Pt - folgaPt * 2) / larguraOrigemPt, (alturaA4Pt - folgaPt * 2) / alturaOrigemPt, 1);
}

/**
 * Deriva o multiplicador de fonte (Iteração 18, pedido do usuário: "o
 * texto ... está ficando muito pequeno ... aumente ... seja generoso")
 * a partir do quanto a prancha vai encolher pra caber numa A4 física --
 * quanto maior a redução, mais generoso o boost, mas sempre limitado a
 * 1.15x: um teste com 1.3x (verificação visual via PDF rasterizado)
 * mostrou o texto de blocos de especificação bem compactos (ex.: lista
 * "CONDUTORES CC" logo acima do rótulo "QUADRO DE PROTEÇÃO CC", ~4.9mm
 * de distância entre as duas linhas de base) quase encostando no rótulo
 * abaixo -- essas distâncias vêm de valores fixos no gerador
 * (`diagramaFv.ts`, ex. `pular(2 + ... + 6)`) que NÃO crescem junto com
 * o boost (só o tamanho da fonte cresce; a POSIÇÃO já foi decidida na
 * hora de gerar o diagrama). 1.15x se mantém confortavelmente dentro de
 * todas as folgas existentes nos testes de referência. Sem encolhimento
 * nenhum (prancha já cabe em A4), o boost fica ~1 (não há necessidade de
 * aumentar nada).
 */
function boostTextoParaA4(fator: number): number {
  return Math.min(1.15, 1 + (1 - fator) * 0.3);
}

/**
 * Embute a prancha (já renderizada em tamanho nativo) como 1 página nova
 * do documento `outDoc` (pdf-lib), reduzida pra caber numa folha A4 e
 * centralizada, com uma nota de rodapé avisando a % de redução aplicada.
 */
async function adicionarPranchaAjustadaEmA4(
  outDoc: PDFDocument,
  fonte: PDFFont,
  projeto: Projeto,
  prancha: Prancha,
  imagensXref: Map<string, string>,
  unidade: UnidadeDesenho
) {
  const a4 = folhaA4DeDestino(prancha);
  const boostTexto = boostTextoParaA4(fatorReducaoParaA4(prancha));
  const bytesNativos = renderizarPranchaNativaBytes(projeto, prancha, imagensXref, unidade, boostTexto);
  const [paginaEmbutida] = await outDoc.embedPdf(bytesNativos);

  const larguraA4Pt = a4.largura * PT_POR_MM;
  const alturaA4Pt = a4.altura * PT_POR_MM;
  const pagina = outDoc.addPage([larguraA4Pt, alturaA4Pt]);

  // Respiro (mm) nas bordas da A4 de destino, além da margem ABNT que a
  // própria prancha já desenha por dentro -- evita que a moldura externa
  // encoste exatamente no limite físico imprimível da folha A4, e reserva
  // espaço suficiente (10mm) para a nota de rodapé abaixo caber sem
  // sobrepor a moldura nem sair da área imprimível da impressora.
  const folgaMm = 10;
  const folgaPt = folgaMm * PT_POR_MM;
  const fator = Math.min(
    (larguraA4Pt - folgaPt * 2) / paginaEmbutida.width,
    (alturaA4Pt - folgaPt * 2) / paginaEmbutida.height,
    1 // nunca AMPLIA uma prancha que já é menor que A4 (ex.: A4 -> A4) -- só reduz.
  );
  const larguraReduzidaPt = paginaEmbutida.width * fator;
  const alturaReduzidaPt = paginaEmbutida.height * fator;
  const xPt = (larguraA4Pt - larguraReduzidaPt) / 2;
  const yPt = (alturaA4Pt - alturaReduzidaPt) / 2;

  pagina.drawPage(paginaEmbutida, { x: xPt, y: yPt, xScale: fator, yScale: fator });

  // Nota de rodapé avisando que essa cópia é uma redução, com a % de
  // redução aplicada -- pra não confundir com uma exportação em escala
  // 1:1 real quando reimpressa/medida com régua. Fonte pequena (4mm) e
  // baseline a 2.5mm da borda física -- cabe folgado dentro dos >=10mm
  // de respiro garantidos acima, sem encostar na moldura nem na margem
  // não-imprimível de impressoras comuns.
  const notaTexto = `Ajustado para caber em A4 (${Math.round(fator * 1000) / 10}% do tamanho original -- prancha nativa: ${prancha.formato})`;
  const notaTamanho = 4 * PT_POR_MM;
  const notaLargura = fonte.widthOfTextAtSize(notaTexto, notaTamanho);
  pagina.drawText(notaTexto, {
    x: (larguraA4Pt - notaLargura) / 2,
    y: 2.5 * PT_POR_MM,
    size: notaTamanho,
    font: fonte,
    color: rgb(140 / 255, 140 / 255, 140 / 255),
  });
}

/** Baixa (client-side) um PDF já pronto em bytes, criando um link temporário -- mesmo efeito de `jsPDF#save`, mas pra bytes vindos do `pdf-lib`. */
function baixarBytesComoPdf(bytes: Uint8Array, nomeArquivo: string) {
  const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
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
 * Gera e baixa um PDF de UMA prancha reduzida para caber numa folha A4
 * física (impressora comum de casa/escritório) -- opção SEPARADA de
 * `exportarPagina` (decisão do usuário): esta função nunca substitui a
 * exportação em tamanho nativo, que continua útil para gráfica/plotter
 * que aceita A1/A2/A3 direto.
 */
export async function exportarPaginaA4(projeto: Projeto, prancha: Prancha, unidade: UnidadeDesenho = "mm") {
  const imagensXref = await precarregarImagensXref(projeto.xrefs);
  const outDoc = await PDFDocument.create();
  const fonte = await outDoc.embedFont(StandardFonts.Helvetica);
  await adicionarPranchaAjustadaEmA4(outDoc, fonte, projeto, prancha, imagensXref, unidade);
  const bytes = await outDoc.save();
  const nomeArquivo = `${(projeto.nome || "diagrama").trim().replace(/\s+/g, "_")}-${prancha.nome.trim().replace(/\s+/g, "_")}-A4.pdf`;
  baixarBytesComoPdf(bytes, nomeArquivo);
}

/**
 * Mesma ideia de `exportarPaginaA4`, mas para TODAS as pranchas do
 * projeto de uma vez, uma por página -- cada página sai numa A4 física
 * (paisagem ou retrato conforme a prancha original de cada uma), com o
 * conteúdo da respectiva prancha original reduzido para caber.
 */
export async function exportarTodasPranchasA4(projeto: Projeto, unidade: UnidadeDesenho = "mm") {
  if (projeto.pranchas.length === 0) return;
  const imagensXref = await precarregarImagensXref(projeto.xrefs);
  const outDoc = await PDFDocument.create();
  const fonte = await outDoc.embedFont(StandardFonts.Helvetica);
  for (const prancha of projeto.pranchas) {
    await adicionarPranchaAjustadaEmA4(outDoc, fonte, projeto, prancha, imagensXref, unidade);
  }
  const bytes = await outDoc.save();
  const nomeArquivo = `${(projeto.nome || "diagrama").trim().replace(/\s+/g, "_")}-todas-as-pranchas-A4.pdf`;
  baixarBytesComoPdf(bytes, nomeArquivo);
}
