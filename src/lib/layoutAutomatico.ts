/**
 * layoutAutomatico.ts
 * -----------------------------------------------------------------------
 * Iteração 41 -- pedido do usuário (verbatim): "quando faço um
 * lançamento automatico de diagramas ele sobrepoe o desenho existente,
 * faça testes com varios lançamentos automaticos e garanta que nunca um
 * lançamento sobreponha um desenho ou outros lançamentos".
 *
 * BUG: os 3 geradores automáticos que desenham um BLOCO/DIAGRAMA próprio
 * num canto fixo da folha (Diagrama Unifilar FV, Dimensionamento de
 * Cargas/QDC, Sistema no Solo -- ver `store.ts#gerarDiagramaFotovoltaico`/
 * `gerarDimensionamentoCargas`/`gerarSistemaSolo`) sempre ancoravam no
 * MESMO ponto fixo (canto superior-esquerdo da área útil da folha ABNT
 * ativa), sem nenhuma noção do que já existe no projeto. Cada gerador já
 * removia sua PRÓPRIA geração anterior antes de inserir a nova (Iteração
 * 29h, via `origemGeradorId`) -- exceto o Diagrama FV, que nem isso
 * fazia -- mas nenhum deles jamais considerava (a) o desenho manual do
 * usuário (a planta baixa da casa, por ex.) nem (b) a saída de OUTRO
 * gerador automático já lançado no mesmo projeto. Resultado: gerar o
 * Diagrama FV e depois o QDC de Cargas (ou regenerar o mesmo diagrama)
 * sempre colidia tudo no mesmo canto.
 *
 * FIX: em vez de um ponto fixo, cada gerador agora pede a `origemLivre`
 * abaixo -- que desloca a origem padrão pra DIREITA de tudo que já
 * existe no projeto e não pertence a essa MESMA geração (desenho manual
 * do usuário + qualquer OUTRO gerador automático já lançado), com uma
 * margem de respiro. Como o deslocamento é só no eixo X, dois
 * retângulos com faixas de X que não se sobrepõem NUNCA se sobrepõem
 * (independente de Y) -- garantia geométrica simples e barata de
 * verificar, sem precisar de nenhum algoritmo de bin-packing.
 * -----------------------------------------------------------------------
 */

import type { Geometria } from "./types";
import { bboxCombinada } from "./selection";

/** Espaço (mm de mundo) sempre deixado entre o fim do que já existe e o início de uma nova geração automática -- generoso o bastante pra nunca "encostar" visualmente, mesmo com o traço mais grosso de uma camada. */
export const MARGEM_ENTRE_LANCAMENTOS_MM = 500;

export interface OrigemPadrao {
  x: number;
  y: number;
}

/** Retângulo candidato (canto superior-esquerdo + tamanho) onde uma geração NASCERIA por padrão, caso nada precisasse ser evitado -- ver `origemLivreParaGerador`. */
export interface CandidatoRetangulo extends OrigemPadrao {
  largura: number;
  altura: number;
}

/**
 * Calcula a origem (canto superior-esquerdo) onde uma nova geração do
 * gerador `origemGeradorIdAtual` deve nascer, garantindo que ela nunca
 * sobreponha nenhuma geometria que não seja uma geração ANTERIOR dela
 * mesma -- ou seja, nunca sobrepõe o desenho manual do usuário nem a
 * saída de outro gerador automático.
 *
 * Recebe o retângulo CANDIDATO completo (posição padrão + tamanho real
 * que a geração vai ocupar, não só o ponto) -- precisa do tamanho pra
 * checar sobreposição de verdade (2D, X E Y), em vez de só comparar
 * coordenadas X isoladas: sem o tamanho, um desenho manual bem longe
 * (ex.: a casa desenhada a 500m da origem) dispararia um deslocamento
 * desnecessário só por "existir" em algum lugar do mundo, mesmo sem
 * nenhum risco real de encostar no candidato.
 *
 * Só desloca (pra DIREITA de tudo que precisa ser evitado, com margem de
 * respiro) quando o retângulo candidato realmente sobrepõe algo; caso
 * contrário devolve a posição candidata como está -- preserva o
 * comportamento de sempre (canto da folha ABNT) sempre que não há
 * conflito de verdade.
 */
export function origemLivreParaGerador(
  geometriaAtual: Geometria[],
  origemGeradorIdAtual: string,
  candidato: CandidatoRetangulo
): OrigemPadrao {
  const paraEvitar = geometriaAtual.filter((g) => g.origemGeradorId !== origemGeradorIdAtual);
  if (paraEvitar.length === 0) return { x: candidato.x, y: candidato.y };

  const bbox = bboxCombinada(paraEvitar);
  if (!bbox) return { x: candidato.x, y: candidato.y };

  const sobrepoe =
    candidato.x < bbox.maxX &&
    candidato.x + candidato.largura > bbox.minX &&
    candidato.y < bbox.maxY &&
    candidato.y + candidato.altura > bbox.minY;
  if (!sobrepoe) return { x: candidato.x, y: candidato.y };

  return { x: bbox.maxX + MARGEM_ENTRE_LANCAMENTOS_MM, y: candidato.y };
}
