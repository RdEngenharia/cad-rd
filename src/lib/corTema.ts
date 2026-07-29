/**
 * corTema.ts
 * -----------------------------------------------------------------------
 * Iteração 45 -- pedido do usuário: "se a tela estiver em modo escuro a
 * cor de todas as camadas da mesma cor devem ser brancas ou ficam
 * camufladas na tela" + (mensagem seguinte) "faça o mesmo com a cor dos
 * blocos, devem ser brancos se o fundo for escuro".
 *
 * Causa raiz: o tema escuro (`temaCanvas.ts`, Iteração 44) só troca o
 * FUNDO do Desenho (canvas) -- as cores de camada/bloco continuam fixas,
 * do jeito que foram configuradas (documentado ali como limitação
 * deliberada, no mesmo espírito do AutoCAD para cores customizadas). O
 * problema real descoberto agora: os valores PADRÃO usados no app inteiro
 * pra "cor automática" (camada "0" cinza-escuro `#475569`, TEXTOS
 * quase-preto `#0f172a`, e o traço de TODOS os blocos/símbolos elétricos
 * em `blocks.ts`, também `#0f172a`) são a mesma cor (ou bem perto) do
 * fundo escuro (`bg-slate-900`, também `#0f172a`) -- ficam literalmente
 * invisíveis, não só "com baixo contraste", exatamente como o usuário
 * relatou ("ficam camufladas").
 *
 * Em vez de exigir que o usuário reconfigure manualmente a cor de cada
 * camada/bloco toda vez que troca de tema, esta função generaliza o
 * tratamento que o AutoCAD dá pra sua cor "automática" (índice 7: preto
 * no fundo claro, branco no fundo escuro) pra QUALQUER cor
 * suficientemente escura -- clareia automaticamente na EXIBIÇÃO (nunca no
 * dado salvo/exportado: PDF/DXF sempre usam fundo branco, papel impresso
 * nunca muda) quando o tema escuro está ativo. Cores já claras (ex.:
 * âmbar/ciano/verde escolhidas deliberadamente pelo usuário pra uma
 * camada) continuam do jeito que estão -- só o que ficaria camuflado
 * muda.
 * -----------------------------------------------------------------------
 */

import type { TemaCanvas } from "./temaCanvas";

/** Converte "#rgb"/"#rrggbb" em [r,g,b] (0-255). Entrada inválida cai em preto (tratado como "escura demais", lado seguro). */
function hexParaRgb(hex: string): [number, number, number] {
  const limpo = hex.replace("#", "");
  const seis = limpo.length === 3 ? limpo.split("").map((c) => c + c).join("") : limpo.padEnd(6, "0").slice(0, 6);
  const bigint = parseInt(seis, 16);
  if (Number.isNaN(bigint)) return [0, 0, 0];
  return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
}

/** Luminância relativa perceptual (0 = preto, 1 = branco) -- mesma ponderação (0.299/0.587/0.114) já usada em `pdfExport.ts`. */
function luminanciaRelativa(hex: string): number {
  const [r, g, b] = hexParaRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/**
 * Abaixo deste limiar, uma cor é considerada "escura demais" pro fundo
 * escuro do Desenho -- calibrado pra pegar os valores "automáticos" do
 * app (camada "0" `#475569` ~0.34, TEXTOS/traço de blocos `#0f172a`
 * ~0.07, MOLDURA `#64748b` ~0.44) e ainda deixar cores vivas escolhidas
 * pelo usuário (âmbar `#f59e0b` ~0.65, ciano `#38bdf8` ~0.65, verde
 * `#22c55e` ~0.6) intocadas.
 */
const LIMIAR_ESCURA_DEMAIS = 0.5;

/** Branco puro -- substituta de exibição no tema escuro, exatamente como pedido ("devem ser brancas"). */
export const COR_CLARA_TEMA_ESCURO = "#ffffff";

/**
 * Cor "efetiva" pra EXIBIÇÃO no canvas -- devolve `cor` sem alteração
 * exceto quando `tema === "escuro"` E `cor` é escura demais pro fundo
 * escuro, caso em que devolve branco no lugar. Nunca muda o dado salvo
 * (`Camada.cor` no projeto/Firestore, nem o SVG "cravado" de
 * `blocks.ts`) -- só a exibição ao vivo no Desenho (ver `GeometryLayer.tsx`
 * e `blocks.ts#recolorirParaTema`).
 */
export function corParaTema(cor: string, tema: TemaCanvas): string {
  if (tema !== "escuro") return cor;
  return luminanciaRelativa(cor) < LIMIAR_ESCURA_DEMAIS ? COR_CLARA_TEMA_ESCURO : cor;
}
