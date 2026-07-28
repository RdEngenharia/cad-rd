/**
 * unidades.ts
 * -----------------------------------------------------------------------
 * Iteração 12s -- unidade de exibição/digitação (mm/cm/m). Pedido do
 * usuário: "preciso ter a opcao de escolher a escalas dos desenhos se é
 * em metros, cm ou mm... assim o desenho já é desenhado em escala real".
 *
 * IMPORTANTE: isso é só uma camada de EXIBIÇÃO/DIGITAÇÃO por cima do
 * mundo -- a geometria em si continua guardada em mm internamente, em
 * TODO o app, exatamente como sempre foi (ver `types.ts`, `pdfExport.ts`,
 * hachura, Pranchas/Viewports, etc.) -- nada disso muda. Trocar a
 * unidade não migra nem re-escala nenhuma geometria já desenhada; só
 * muda (a) como os números são MOSTRADOS na tela (coordenadas do
 * cursor, campo de grid, rótulo de comprimento ao vivo, texto de COTA
 * NOVA ou já criada com `distanciaMm` guardado) e (b) qual unidade um
 * número digitado SEM sufixo explícito (ex.: só "10") assume por padrão
 * -- digitar com sufixo explícito ("500mm", "2m", "10cm") sempre
 * funciona do jeito que já funcionava, unidade nenhuma muda isso.
 * -----------------------------------------------------------------------
 */

export type UnidadeDesenho = "mm" | "cm" | "m";

export const FATOR_POR_UNIDADE: Record<UnidadeDesenho, number> = {
  mm: 1,
  cm: 10,
  m: 1000,
};

export const ROTULO_UNIDADE: Record<UnidadeDesenho, string> = {
  mm: "mm",
  cm: "cm",
  m: "m",
};

/** mm de mundo -> valor na unidade escolhida (ex.: 1500mm, "m" -> 1.5). */
export function deMm(valorMm: number, unidade: UnidadeDesenho): number {
  return valorMm / FATOR_POR_UNIDADE[unidade];
}

/** Valor na unidade escolhida -> mm de mundo (ex.: 1.5, "m" -> 1500mm). */
export function paraMm(valor: number, unidade: UnidadeDesenho): number {
  return valor * FATOR_POR_UNIDADE[unidade];
}

/**
 * Formata um valor em mm de mundo pra exibição na unidade escolhida, com
 * o número de casas decimais ajustado pra unidade não virar "0.0" ou um
 * monte de zeros à toa (mm inteiro, cm com 1 casa, m com 2 casas -- dá
 * ~0.01m = 10mm de resolução visível, suficiente pra um rótulo de tela).
 */
export function formatarComUnidade(valorMm: number, unidade: UnidadeDesenho): string {
  const casas = unidade === "mm" ? 1 : unidade === "cm" ? 1 : 2;
  return `${deMm(valorMm, unidade).toFixed(casas)} ${ROTULO_UNIDADE[unidade]}`;
}
