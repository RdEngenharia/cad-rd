"use client";

import { useEffect, useRef, useState } from "react";
import { useCadStore } from "@/lib/store";
import { obterPadraoHachura, HACHURA_OPCOES } from "@/lib/hachura";
import type { HachuraTipo } from "@/lib/types";

interface AmostraProps {
  tipo: HachuraTipo;
  cor: string;
  ativa: boolean;
  onClick: () => void;
}

/**
 * Amostra (swatch) de um padrão de hachura, desenhada com o MESMO motor
 * usado no canvas real (`obterPadraoHachura`) -- a prévia aqui é fiel
 * ao resultado que aparece na forma depois de aplicada.
 */
function Amostra({ tipo, cor, ativa, onClick }: AmostraProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (tipo === "SOLID") {
      ctx.fillStyle = cor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      return;
    }
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const ladrilho = obterPadraoHachura(tipo, cor, 0.6);
    if (!ladrilho) return;
    const pattern = ctx.createPattern(ladrilho, "repeat");
    if (!pattern) return;
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, [tipo, cor]);

  const label = HACHURA_OPCOES.find((o) => o.valor === tipo)?.label ?? tipo;

  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={`h-8 overflow-hidden rounded border ${
        ativa ? "border-blue-500 ring-1 ring-blue-400" : "border-slate-200 hover:border-slate-300"
      }`}
    >
      <canvas ref={canvasRef} width={64} height={28} className="block h-full w-full" />
    </button>
  );
}

/**
 * HatchPanel
 * -----------------------------------------------------------------------
 * Seletor de padrão/cor/escala da ferramenta de Hachura (Hatch Tool),
 * na barra lateral. Escolher um padrão aqui só define a config ATIVA
 * (`activeHatch`/`hatchColor`/`hatchScale`) -- para aplicar, o usuário
 * arma a ferramenta "Hachurar" (botão na toolbar ou comando `H`) e
 * clica num retângulo/polígono já desenhado no canvas (clicar de novo
 * no mesmo elemento remove a hachura).
 * -----------------------------------------------------------------------
 */
export function HatchPanel() {
  const activeHatch = useCadStore((s) => s.activeHatch);
  const hatchScale = useCadStore((s) => s.hatchScale);
  const hatchColor = useCadStore((s) => s.hatchColor);
  const setActiveHatch = useCadStore((s) => s.setActiveHatch);
  const setHatchScale = useCadStore((s) => s.setHatchScale);
  const setHatchColor = useCadStore((s) => s.setHatchColor);
  const ferramenta = useCadStore((s) => s.ferramenta);
  const setFerramenta = useCadStore((s) => s.setFerramenta);
  // Recolhido por padrão (pedido do usuário, Iteração 12f) -- mesmo
  // padrão dobrável de `BlockLibraryPanel.tsx`/`LayersPanel.tsx`.
  const [aberto, setAberto] = useState(false);

  return (
    <div>
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        className="mb-2 flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500"
      >
        <span>Hachura</span>
        <span className="text-slate-400">{aberto ? "▾" : "▸"}</span>
      </button>
      {aberto && (
        <>
      <div className="grid grid-cols-3 gap-1.5">
        {HACHURA_OPCOES.map((o) => (
          <Amostra
            key={o.valor}
            tipo={o.valor}
            cor={hatchColor}
            ativa={activeHatch === o.valor}
            onClick={() => setActiveHatch(o.valor)}
          />
        ))}
      </div>

      <div className="mt-2 flex items-center gap-2">
        <label className="flex items-center gap-1 text-[11px] text-slate-600" title="Cor da hachura">
          <input
            type="color"
            value={hatchColor}
            onChange={(e) => setHatchColor(e.target.value)}
            className="h-5 w-5 shrink-0 cursor-pointer border-0 bg-transparent p-0"
          />
          Cor
        </label>
        <label className="flex flex-1 items-center gap-1 text-[11px] text-slate-600" title="Escala do padrão (espaçamento em mm no desenho)">
          Escala
          <input
            type="number"
            min={0.2}
            step={0.2}
            value={hatchScale}
            onChange={(e) => setHatchScale(Number(e.target.value))}
            className="w-14 min-w-0 rounded border border-slate-200 px-1 py-0.5"
          />
        </label>
      </div>

      <button
        type="button"
        onClick={() => setFerramenta(ferramenta === "hachurar" ? "selecionar" : "hachurar")}
        className={`mt-2 w-full rounded border px-2 py-1 text-[11px] font-medium ${
          ferramenta === "hachurar"
            ? "border-blue-400 bg-blue-50 text-blue-700"
            : "border-slate-200 text-slate-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
        }`}
      >
        {ferramenta === "hachurar" ? "Hachurando... (Esc sai)" : "Ativar ferramenta Hachurar"}
      </button>

      {ferramenta === "hachurar" && (
        <p className="mt-1.5 rounded bg-blue-50 p-1.5 text-[10px] leading-snug text-blue-700">
          Clique num retângulo/polígono/círculo para aplicar a hachura ativa (clique de novo para remover).
        </p>
      )}
      <p className="mt-1 text-[10px] text-slate-400">
        Vale para qualquer forma fechada: retângulos, polígonos (inclui triângulos) e círculos.
      </p>
        </>
      )}
    </div>
  );
}
