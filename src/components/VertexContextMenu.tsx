"use client";

import { useEffect } from "react";
import { useCadStore } from "@/lib/store";

/**
 * VertexContextMenu
 * -----------------------------------------------------------------------
 * Menu de contexto flutuante (botão direito num grip de vértice sólido,
 * ver `GeometryLayer.tsx#handleGripContextMenu`) com a ação "Remover
 * vértice" -- Sprint 3, item 3 ("...ou remover vértices existentes via
 * menu de contexto"). Posicionado em coordenadas de TELA (client X/Y do
 * evento de clique), não de mundo -- é um `<div>` HTML comum sobreposto
 * ao canvas, fora do Stage do Konva.
 *
 * Fecha sozinho ao: escolher "Remover vértice", clicar em qualquer lugar
 * fora do menu, ou apertar Esc (tratado junto com o resto dos atalhos de
 * "cancelar" em `CanvasStage.tsx`).
 * -----------------------------------------------------------------------
 */
export function VertexContextMenu() {
  const menu = useCadStore((s) => s.menuVerticeContexto);
  const removerVertice = useCadStore((s) => s.removerVertice);
  const fecharMenuVertice = useCadStore((s) => s.fecharMenuVertice);
  const pushComando = useCadStore((s) => s.pushComando);

  // Fecha ao clicar em qualquer lugar fora do menu (inclusive fora do
  // canvas) -- registrado só enquanto o menu está aberto.
  useEffect(() => {
    if (!menu) return;
    function onPointerDown() {
      fecharMenuVertice();
    }
    // Um pequeno atraso via captura no próximo tick evitaria fechar no
    // MESMO clique que abriu o menu (contextmenu e um possível click
    // sintético não disparam pointerdown em conjunto aqui, mas o
    // listener só é registrado depois deste efeito rodar, então não há
    // risco de fechamento imediato).
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [menu, fecharMenuVertice]);

  if (!menu) return null;

  function handleRemover() {
    if (!menu) return;
    const resultado = removerVertice(menu.id, menu.indice);
    if (!resultado.ok && resultado.erro) pushComando(resultado.erro);
    fecharMenuVertice();
  }

  return (
    <div
      className="fixed z-50 min-w-[160px] rounded-md border border-slate-200 bg-white py-1 text-xs shadow-lg"
      style={{ left: menu.x, top: menu.y }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={handleRemover}
        className="block w-full px-3 py-1.5 text-left text-slate-700 hover:bg-red-50 hover:text-red-700"
      >
        🗑 Remover vértice
      </button>
    </div>
  );
}
