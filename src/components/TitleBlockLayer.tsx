"use client";

import { Layer, Rect, Text, Line, Image as KonvaImage } from "react-konva";
import { useImage } from "@/lib/useImage";
import { MARGENS_ABNT, ROTULOS_TIPO_LIGACAO, dimensoesCarimbo, dimensoesFolhaOrientada, type Carimbo, type FormatoFolha } from "@/lib/types";

interface TitleBlockLayerProps {
  formato: FormatoFolha;
  /** Orientação da Prancha (Iteração 12g) -- ver `dimensoesFolhaOrientada`. */
  orientacao?: "paisagem" | "retrato";
  /**
   * Carimbo a desenhar -- sempre o COMPARTILHADO `projeto.carimbo`
   * (Iteração 12g reverte a 12e: em vez de um carimbo PRÓPRIO por
   * Prancha, volta a ser um único carimbo, o mesmo em todas as Pranchas,
   * cada uma só reescalando-o pro seu próprio tamanho de folha -- "ao
   * preencher o carimbo ele apareça automaticamente em todas as pranchas
   * ao mesmo tempo, se ajustando ao tamanho da prancha", pedido do
   * usuário). Ainda passado por PROP (não lido direto do store aqui) pra
   * manter o componente puro/testável.
   */
  carimbo: Carimbo;
}

const COR_BORDA = "#334155";
const COR_TEXTO = "#0f172a";
const COR_LABEL = "#64748b";

/**
 * Iteração 26: encaixa uma imagem (logo/assinatura do carimbo) dentro de
 * uma caixa reservada SEM esticar -- mesma técnica de "fit-and-contain"
 * já usada pela foto do Padrão de Entrada (`DiagramaFvModal.tsx`, "cabe
 * sem distorcer"): escala única (`Math.min` das 2 razões, nunca uma razão
 * por eixo) preserva a proporção original da imagem, com a imagem
 * centralizada dentro da caixa nos dois eixos. Antes, tanto o logo quanto
 * a assinatura eram desenhados com `width`/`height` = as dimensões FIXAS
 * da caixa, sempre esticando/achatando qualquer imagem que não tivesse
 * exatamente essa proporção -- bug relatado pelo usuário ("a logo no
 * carimbo esta ficando esticada perdendo a proporcao de escala"). Se as
 * dimensões naturais da imagem ainda não são conhecidas (raro -- só entre
 * o upload e o carregamento do `<img>`), cai de volta na caixa cheia
 * (mesmo comportamento de antes) em vez de não desenhar nada.
 */
function encaixarImagemNaCaixa(
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

// --- Quebra de linha do campo "Notas" (Iteração 19) ---------------------
// Espelha `quebrarLinhasTexto` de `pdfExport.ts` (mesmo algoritmo:
// parágrafos por `\n`, quebra palavra-por-palavra dentro da largura),
// mas medindo com Canvas 2D (`measureText`) em vez de `doc.getTextWidth`
// do jsPDF -- os dois lados precisam concordar em QUANTAS linhas o texto
// ocupa pra desenhar a mesma altura de caixa no canvas e no PDF exportado.
let _canvasMedicaoTexto: HTMLCanvasElement | null = null;
function medirLarguraTexto(texto: string, fontSizeMm: number): number {
  if (typeof document === "undefined") return texto.length * fontSizeMm * 0.55;
  if (!_canvasMedicaoTexto) _canvasMedicaoTexto = document.createElement("canvas");
  const ctx = _canvasMedicaoTexto.getContext("2d");
  if (!ctx) return texto.length * fontSizeMm * 0.55;
  ctx.font = `${fontSizeMm}px Arial`;
  return ctx.measureText(texto).width;
}
function quebrarLinhasTexto(texto: string, larguraMaxMm: number, fontSizeMm: number, maxLinhas: number): string[] {
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
      if (medirLarguraTexto(candidata, fontSizeMm) <= larguraMaxMm) {
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
 * TitleBlockLayer
 * -----------------------------------------------------------------------
 * Desenha o Carimbo/legenda ABNT (quadro de título) no canto inferior
 * direito da prancha ativa -- dentro da margem ABNT, "encostado" no
 * vértice inferior direito dela. Todo o layout é definido em milímetros
 * de MUNDO (não pixels de tela), igual ao resto do desenho: 1 unidade
 * de mundo = 1mm de papel, então o carimbo aparece com o tamanho físico
 * correto em qualquer zoom e é reaproveitado ao pé da letra em
 * `pdfExport.ts` (mesma matemática de layout dos dois lados).
 *
 * As dimensões (`dimensoesCarimbo`) mudam com o formato de folha ativo
 * ("reajuste proporcional ao trocar formato de folha") -- ver a
 * documentação daquela função em `lib/types.ts`.
 *
 * Puramente informativo (`listening={false}`): a edição dos campos
 * acontece no painel `TitleBlockPanel.tsx` da barra lateral, não
 * diretamente no canvas.
 * -----------------------------------------------------------------------
 */
export function TitleBlockLayer({ formato, orientacao, carimbo }: TitleBlockLayerProps) {
  const logo = useImage(carimbo.logoDataUrl);
  const assinatura = useImage(carimbo.assinaturaDataUrl);

  if (!carimbo.visivel) return null;

  const folha = dimensoesFolhaOrientada(formato, orientacao);
  const folhaX = -folha.largura / 2;
  const folhaY = -folha.altura / 2;
  const { largura, altura } = dimensoesCarimbo(formato, carimbo.escalaCarimbo, orientacao);

  const brX = folhaX + folha.largura - MARGENS_ABNT.direita;
  const brY = folhaY + folha.altura - MARGENS_ABNT.inferior;

  // Iteração 19: logo e assinatura saem de "do lado" (Iteração 12g) pra uma
  // FAIXA no TOPO do carimbo (logo esquerda / assinatura direita) -- ver
  // o mesmo raciocínio espelhado em `pdfExport.ts#desenharCarimboPdf`.
  const larguraTotal = largura;
  const bx = brX - larguraTotal;
  const by = brY - altura; // topo da GRADE principal (faixa de topo/notas crescem pra cima a partir daqui)
  const textoX = bx;
  const larguraTexto = largura;

  // --- Campo de Notas (Iteração 19) ---
  const larguraNotas = larguraTotal - 4;
  const fsNotasLabel = 2.6;
  const fsNotasCorpo = 2.3;
  const linhasNotas = quebrarLinhasTexto(carimbo.notas || "", larguraNotas, fsNotasCorpo, 10);
  const linhasNotasExibidas = linhasNotas.length > 0 ? linhasNotas : [""];
  const alturaLinhaNotas = fsNotasCorpo * 1.5;
  const alturaNotas = fsNotasLabel + 2 + linhasNotasExibidas.length * alturaLinhaNotas + 2;

  // --- Faixa de topo: logo (esquerda) + assinatura (direita) ---
  const alturaTopo = altura * 0.52;
  const byTopo = by - alturaTopo;
  const byNotas = byTopo - alturaNotas;
  const assinaturaCx = bx + larguraTotal * 0.75;
  const assinaturaLarguraLinha = larguraTotal * 0.42;
  const yLinhaAssinatura = byTopo + alturaTopo * 0.72;
  const fsAssinatura = Math.max(1.6, alturaTopo * 0.09);

  // 5 linhas de conteúdo (Iteração 12c, antes eram 3 -- ver
  // `dimensoesCarimbo` para o porquê da altura ter crescido junto):
  // título / endereço do cliente / cliente+responsável / conta contrato+
  // tipo de ligação / escala+data+prancha. Frações somam 1.0.
  const yTitulo = by;
  const alturaTitulo = altura * 0.24;
  const yLinha2 = by + alturaTitulo; // endereço do cliente
  const alturaLinha2 = altura * 0.19;
  const yLinha3 = yLinha2 + alturaLinha2; // cliente | responsável técnico
  const alturaLinha3 = altura * 0.19;
  const yLinha4 = yLinha3 + alturaLinha3; // conta contrato | tipo de ligação
  const alturaLinha4 = altura * 0.19;
  const yLinha5 = yLinha4 + alturaLinha4; // escala | data | prancha

  const fsTitulo = Math.max(2, alturaTitulo * 0.4);
  const fsLabel = Math.max(1.6, alturaLinha3 * 0.28);
  const fsValor = Math.max(1.8, alturaLinha3 * 0.34);

  const campo = (x: number, y: number, w: number, label: string, valor: string) => (
    <>
      <Text x={x + 1.5} y={y + 0.8} width={w - 3} text={label} fontSize={fsLabel} fill={COR_LABEL} />
      <Text
        x={x + 1.5}
        y={y + fsLabel + 1.2}
        width={w - 3}
        text={valor || "—"}
        fontSize={fsValor}
        fill={COR_TEXTO}
        fontStyle="bold"
        ellipsis
        wrap="none"
      />
    </>
  );

  /**
   * Iteração 25: campo dedicado pro "RESPONSÁVEL TÉCNICO" -- antes usava o
   * `campo()` genérico com nome+CREA concatenados numa string só
   * (`"${responsavel} — CREA ${crea}"`), que o Konva corta com "…" (mesmo
   * mecanismo de truncamento de linha única de todo campo do carimbo)
   * quando a soma dos dois não cabe na largura da célula -- responsáveis
   * com nome mais longo (ex.: "JONATAN C RODRIGUES") cortavam o próprio
   * número do CREA, exatamente o dado que o usuário precisa visível pra
   * concessionária ("o numero do crea esta cortado"). Corrigido separando
   * nome e CREA em 2 linhas de VALOR empilhadas (cada uma truncada
   * INDEPENDENTEMENTE, só no caso raro de uma delas sozinha já ser mais
   * longa que a célula) -- fonte um pouco menor que o `campo()` genérico
   * pra caber as 2 linhas dentro da mesma altura de linha da grade (sem
   * precisar aumentar a altura do carimbo inteiro). Sem CREA preenchido,
   * continua 1 linha só (não há nada pra cortar).
   */
  const campoResponsavelTecnico = (x: number, y: number, w: number) => {
    const temCrea = !!carimbo.crea;
    const fsValorResp = temCrea ? fsValor * 0.72 : fsValor;
    const linhaAlturaResp = fsValorResp * 1.2;
    const yValor = y + fsLabel + 1.2;
    return (
      <>
        <Text x={x + 1.5} y={y + 0.8} width={w - 3} text="RESPONSÁVEL TÉCNICO" fontSize={fsLabel} fill={COR_LABEL} />
        <Text
          x={x + 1.5}
          y={yValor}
          width={w - 3}
          text={carimbo.responsavel || "—"}
          fontSize={fsValorResp}
          fill={COR_TEXTO}
          fontStyle="bold"
          ellipsis
          wrap="none"
        />
        {temCrea && (
          <Text
            x={x + 1.5}
            y={yValor + linhaAlturaResp}
            width={w - 3}
            text={`CREA ${carimbo.crea}`}
            fontSize={fsValorResp}
            fill={COR_TEXTO}
            fontStyle="bold"
            ellipsis
            wrap="none"
          />
        )}
      </>
    );
  };

  return (
    <Layer listening={false}>
      {/* Campo de Notas (Iteração 19): SEMPRE acima de tudo, largura total do carimbo. */}
      <Rect x={bx} y={byNotas} width={larguraTotal} height={alturaNotas} stroke={COR_BORDA} strokeWidth={0.6} fill="#ffffff" />
      <Text x={bx + 2} y={byNotas + 0.6} text="NOTAS:" fontSize={fsNotasLabel} fontStyle="bold" fill={COR_TEXTO} />
      {linhasNotasExibidas.map((linha, i) => (
        <Text
          key={i}
          x={bx + 2}
          y={byNotas + fsNotasLabel + 1.4 + i * alturaLinhaNotas}
          text={linha}
          fontSize={fsNotasCorpo}
          fill={COR_TEXTO}
        />
      ))}

      {/* Faixa de topo (Iteração 19): logo (esquerda) + assinatura (direita). */}
      <Rect x={bx} y={byTopo} width={larguraTotal / 2} height={alturaTopo} stroke={COR_BORDA} strokeWidth={0.4} fill="#ffffff" />
      <Rect
        x={bx + larguraTotal / 2}
        y={byTopo}
        width={larguraTotal / 2}
        height={alturaTopo}
        stroke={COR_BORDA}
        strokeWidth={0.4}
        fill="#ffffff"
      />
      {carimbo.logoDataUrl && logo && (() => {
        const caixa = encaixarImagemNaCaixa(
          logo.naturalWidth || logo.width,
          logo.naturalHeight || logo.height,
          bx + larguraTotal * 0.02,
          byTopo + alturaTopo * 0.1,
          larguraTotal / 2 - larguraTotal * 0.04,
          alturaTopo * 0.8
        );
        return <KonvaImage image={logo} x={caixa.x} y={caixa.y} width={caixa.width} height={caixa.height} />;
      })()}

      {/* Célula de assinatura: rubrica em PNG (se houver) desenhada por
          CIMA da linha de assinatura, mais legenda -- ver mesmo raciocínio
          em `pdfExport.ts#desenharCarimboPdf`. Iteração 26: também passa
          por `encaixarImagemNaCaixa` -- mesma classe de bug de esticar a
          imagem do logo, só que aqui na rubrica. */}
      {carimbo.assinaturaDataUrl && assinatura && (() => {
        const caixaLargura = assinaturaLarguraLinha * 0.9;
        const caixaAltura = Math.min(alturaTopo * 0.55, caixaLargura * 0.5);
        const caixa = encaixarImagemNaCaixa(
          assinatura.naturalWidth || assinatura.width,
          assinatura.naturalHeight || assinatura.height,
          assinaturaCx - caixaLargura / 2,
          yLinhaAssinatura - caixaAltura - 0.5,
          caixaLargura,
          caixaAltura
        );
        return <KonvaImage image={assinatura} x={caixa.x} y={caixa.y} width={caixa.width} height={caixa.height} />;
      })()}
      <Line
        points={[
          assinaturaCx - assinaturaLarguraLinha / 2,
          yLinhaAssinatura,
          assinaturaCx + assinaturaLarguraLinha / 2,
          yLinhaAssinatura,
        ]}
        stroke={COR_BORDA}
        strokeWidth={0.35}
      />
      <Text
        x={assinaturaCx - assinaturaLarguraLinha / 2}
        y={yLinhaAssinatura + fsAssinatura + 1}
        width={assinaturaLarguraLinha}
        text="Assinatura do responsável técnico"
        fontSize={fsAssinatura}
        fill={COR_LABEL}
        align="center"
        ellipsis
        wrap="none"
      />

      {/* Moldura externa da grade principal */}
      <Rect x={bx} y={by} width={larguraTotal} height={altura} stroke={COR_BORDA} strokeWidth={0.6} fill="#ffffff" />

      {/* Linha 1: título do projeto (linha inteira) */}
      <Text
        x={textoX + 2}
        y={yTitulo + alturaTitulo * 0.22}
        width={larguraTexto - 4}
        text={carimbo.titulo || "TÍTULO DO PROJETO"}
        fontSize={fsTitulo}
        fontStyle="bold"
        fill={COR_TEXTO}
        align="center"
        ellipsis
        wrap="none"
      />
      <Line points={[textoX, yLinha2, textoX + larguraTexto, yLinha2]} stroke={COR_BORDA} strokeWidth={0.4} />

      {/* Linha 2 (Iteração 12c): endereço completo do cliente -- linha inteira */}
      {campo(textoX, yLinha2, larguraTexto, "ENDEREÇO DO CLIENTE", carimbo.enderecoCliente)}
      <Line points={[textoX, yLinha3, textoX + larguraTexto, yLinha3]} stroke={COR_BORDA} strokeWidth={0.4} />

      {/* Linha 3: Cliente | Responsável técnico (CREA) -- 2 colunas */}
      {campo(textoX, yLinha3, larguraTexto / 2, "CLIENTE", carimbo.cliente)}
      <Line points={[textoX + larguraTexto / 2, yLinha3, textoX + larguraTexto / 2, yLinha4]} stroke={COR_BORDA} strokeWidth={0.3} />
      {campoResponsavelTecnico(textoX + larguraTexto / 2, yLinha3, larguraTexto / 2)}
      <Line points={[textoX, yLinha4, textoX + larguraTexto, yLinha4]} stroke={COR_BORDA} strokeWidth={0.4} />

      {/* Linha 4 (Iteração 12c): Conta Contrato | Tipo de Ligação -- exigidos pela concessionária -- 2 colunas */}
      {campo(textoX, yLinha4, larguraTexto / 2, "CONTA CONTRATO", carimbo.contaContrato)}
      <Line points={[textoX + larguraTexto / 2, yLinha4, textoX + larguraTexto / 2, yLinha5]} stroke={COR_BORDA} strokeWidth={0.3} />
      {campo(textoX + larguraTexto / 2, yLinha4, larguraTexto / 2, "TIPO DE LIGAÇÃO", ROTULOS_TIPO_LIGACAO[carimbo.tipoLigacao])}
      <Line points={[textoX, yLinha5, textoX + larguraTexto, yLinha5]} stroke={COR_BORDA} strokeWidth={0.4} />

      {/* Linha 5: Escala | Data | Prancha -- 3 colunas */}
      {campo(textoX, yLinha5, larguraTexto / 3, "ESCALA", carimbo.escala)}
      <Line points={[textoX + larguraTexto / 3, yLinha5, textoX + larguraTexto / 3, by + altura]} stroke={COR_BORDA} strokeWidth={0.3} />
      {campo(textoX + larguraTexto / 3, yLinha5, larguraTexto / 3, "DATA", carimbo.data)}
      <Line
        points={[textoX + (larguraTexto * 2) / 3, yLinha5, textoX + (larguraTexto * 2) / 3, by + altura]}
        stroke={COR_BORDA}
        strokeWidth={0.3}
      />
      {campo(textoX + (larguraTexto * 2) / 3, yLinha5, larguraTexto / 3, "PRANCHA", carimbo.prancha)}
    </Layer>
  );
}
