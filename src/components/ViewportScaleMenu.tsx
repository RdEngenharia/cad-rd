"use client";

import { useEffect, useState } from "react";
import { useCadStore } from "@/lib/store";
import { ESCALAS_RAPIDAS } from "@/lib/escalasViewport";

/**
 * ViewportScaleMenu
 * -----------------------------------------------------------------------
 * Iteração 46 -- menu de escala flutuante que abre ao clicar no rótulo
 * "ESC 1:X" desenhado embaixo de um viewport (`ViewportShape.tsx`).
 *
 * Pedido do usuário: "preciso implantar um jeito de colocar um desenho
 * na escala na prancha da viewport, exemplo escala igual o autocad.
 * atualmente so temos zoom window lá na prancha." -- o controle de
 * escala exata JÁ EXISTIA (painel "Propriedades" à direita, quando se
 * seleciona a BORDA do viewport), só não era visível/fácil de achar.
 * Este menu não substitui aquele painel (continua funcionando igual) --
 * só oferece o MESMO ajuste direto no canvas, sem precisar procurar na
 * lateral. Pergunta feita ao usuário, resposta: "Deixar mais visível/
 * fácil de achar (recomendado)".
 *
 * Mesmo padrão de `VertexContextMenu.tsx`: `<div>` HTML comum, fixado em
 * coordenadas de TELA (client X/Y do clique), fora do Stage do Konva.
 * Fecha ao escolher uma escala, clicar fora, ou Esc (ver
 * `CanvasStage.tsx`).
 * -----------------------------------------------------------------------
 */
export function ViewportScaleMenu() {
  const menu = useCadStore((s) => s.menuEscalaViewport);
  const fecharMenuEscalaViewport = useCadStore((s) => s.fecharMenuEscalaViewport);
  const atualizarViewport = useCadStore((s) => s.atualizarViewport);
  const atualizarViewportDaPrancha = useCadStore((s) => s.atualizarViewportDaPrancha);

  // Campo de escala customizada (digitar um valor fora da lista rápida) --
  // string separada do valor numérico aplicado, pra deixar digitar livre
  // (ex.: apagar tudo pra escrever de novo) sem "brigar" com o valor já
  // aplicado a cada tecla. Reinicializado toda vez que um menu NOVO abre
  // (`menu` troca de referência) -- ajustado DURANTE a renderização (o
  // padrão recomendado pelo React pra "resetar estado quando uma prop
  // muda", mesmo usado em `GeometryLayer.tsx#ferramentaAnteriorParaHover`),
  // em vez de um `useEffect` chamando `setState` no corpo (dispara o lint
  // `react-hooks/set-state-in-effect`).
  const [menuAnterior, setMenuAnterior] = useState(menu);
  const [valorCustom, setValorCustom] = useState(menu ? String(Math.round(menu.modelScaleAtual * 1000) / 1000) : "");
  if (menu !== menuAnterior) {
    setMenuAnterior(menu);
    if (menu) setValorCustom(String(Math.round(menu.modelScaleAtual * 1000) / 1000));
  }

  // Fecha ao clicar em qualquer lugar fora do menu -- mesmo padrão de
  // `VertexContextMenu.tsx`.
  useEffect(() => {
    if (!menu) return;
    function onPointerDown() {
      fecharMenuEscalaViewport();
    }
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [menu, fecharMenuEscalaViewport]);

  if (!menu) return null;

  function aplicarEscala(modelScale: number) {
    if (!menu) return;
    const valor = Math.max(0.001, modelScale || 1);
    if (menu.alvo.tipo === "geometria") {
      atualizarViewport(menu.alvo.id, { modelScale: valor });
    } else {
      atualizarViewportDaPrancha(menu.alvo.pranchaId, menu.alvo.viewportId, { modelScale: valor });
    }
  }

  return (
    <div
      className="fixed z-50 min-w-[190px] rounded-md border border-slate-200 bg-white p-2 text-xs shadow-lg"
      style={{ left: menu.x, top: menu.y }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-purple-700">Escala de impressão (1 : N)</p>
      <div className="flex items-center gap-1">
        <input
          type="number"
          min={0.001}
          step={1}
          value={valorCustom}
          onChange={(e) => setValorCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              aplicarEscala(Number(valorCustom) || 1);
              fecharMenuEscalaViewport();
            }
          }}
          className="w-full rounded border border-slate-200 px-1.5 py-1 text-[11px]"
          title="mm de mundo por mm de papel dentro da janela -- Enter aplica"
        />
        <button
          type="button"
          onClick={() => {
            aplicarEscala(Number(valorCustom) || 1);
            fecharMenuEscalaViewport();
          }}
          className="shrink-0 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
        >
          OK
        </button>
      </div>
      <p className="mb-1 mt-2 text-[10px] font-medium uppercase tracking-wide text-purple-700">Escolha rápida</p>
      <div className="grid grid-cols-4 gap-1">
        {ESCALAS_RAPIDAS.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => {
              aplicarEscala(n);
              fecharMenuEscalaViewport();
            }}
            className={`rounded border px-1.5 py-1 text-[11px] ${
              Math.round(menu.modelScaleAtual) === n
                ? "border-purple-400 bg-purple-100 font-semibold text-purple-700"
                : "border-slate-200 text-slate-700 hover:bg-slate-100"
            }`}
          >
            1:{n}
          </button>
        ))}
      </div>
    </div>
  );
}
