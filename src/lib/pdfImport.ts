/**
 * pdfImport.ts
 * -----------------------------------------------------------------------
 * Rasteriza a primeira página de um PDF para um <canvas> no navegador,
 * usando pdf.js. O canvas resultante é usado como fonte de imagem do
 * Konva.Image de fundo -- exatamente como um XREF de imagem, só que a
 * "imagem" foi gerada a partir do PDF em vez de carregada diretamente.
 *
 * Tudo roda no cliente (nenhum upload do PDF acontece); o arquivo nunca
 * sai do navegador do usuário.
 * -----------------------------------------------------------------------
 */

export interface PaginaRasterizada {
  canvas: HTMLCanvasElement;
  largura: number;
  altura: number;
}

/** Miniatura de baixa resolução de UMA página, usada pelo seletor de página do PDF multipáginas. */
export interface ThumbnailPagina {
  numero: number;
  dataUrl: string;
}

export interface InfoPdf {
  numPaginas: number;
  /** Só preenchido quando `numPaginas > 1` (ver `inspecionarPdf`). */
  thumbnails?: ThumbnailPagina[];
}

let workerConfigurado = false;

async function getPdfJs() {
  const pdfjs = await import("pdfjs-dist");
  if (!workerConfigurado) {
    // Worker servido pelo PRÓPRIO app (arquivo estático em public/,
    // copiado de node_modules/pdfjs-dist/build/pdf.worker.min.mjs --
    // ver o script `sync-pdf-worker` no package.json) em vez de um CDN
    // externo (unpkg): evita depender de rede de terceiros em tempo de
    // execução -- redes corporativas/sandboxes que bloqueiam CDNs
    // genéricos (mas liberam o próprio domínio do app) continuam
    // funcionando, e a versão do worker fica sempre travada exatamente
    // na versão instalada do pacote (sem risco de desalinhamento entre
    // `pdfjs.version` e o worker baixado em runtime). O PDF do usuário,
    // como antes, nunca sai do navegador -- só este script fixo (que já
    // vem junto do bundle do app) é servido a partir daqui.
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    workerConfigurado = true;
  }
  return pdfjs;
}

/**
 * Renderiza UMA página (1-indexada) do PDF em um canvas offscreen.
 * @param file Arquivo PDF selecionado pelo usuário.
 * @param numeroPagina Página a rasterizar (1 = primeira).
 * @param escalaRender Fator de resolução do rasterizado (2 = boa nitidez).
 */
export async function rasterizarPaginaPdf(
  file: File,
  numeroPagina = 1,
  escalaRender = 2
): Promise<PaginaRasterizada> {
  const pdfjs = await getPdfJs();
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buffer }).promise;
  const pagina = Math.min(Math.max(1, numeroPagina), pdf.numPages);
  const page = await pdf.getPage(pagina);
  const viewport = page.getViewport({ scale: escalaRender });

  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Não foi possível obter o contexto 2D do canvas.");

  await page.render({ canvasContext: ctx, viewport, canvas }).promise;

  return { canvas, largura: viewport.width, altura: viewport.height };
}

/** @deprecated mantido só por compatibilidade de nome -- use `rasterizarPaginaPdf(file, 1, escalaRender)`. */
export async function rasterizarPrimeiraPagina(file: File, escalaRender = 2): Promise<PaginaRasterizada> {
  return rasterizarPaginaPdf(file, 1, escalaRender);
}

/**
 * Inspeciona um PDF: conta as páginas e, se houver mais de uma, gera uma
 * miniatura (baixa resolução) de cada uma para o seletor visual de
 * página (`PdfPageModal.tsx`) -- evita rasterizar a página inteira em
 * alta resolução só para o usuário escolher qual quer importar.
 */
export async function inspecionarPdf(file: File, escalaThumb = 0.25): Promise<InfoPdf> {
  const pdfjs = await getPdfJs();
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buffer }).promise;
  const numPaginas = pdf.numPages;
  if (numPaginas <= 1) return { numPaginas };

  const thumbnails: ThumbnailPagina[] = [];
  for (let i = 1; i <= numPaginas; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: escalaThumb });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    thumbnails.push({ numero: i, dataUrl: canvas.toDataURL("image/png") });
  }
  return { numPaginas, thumbnails };
}
