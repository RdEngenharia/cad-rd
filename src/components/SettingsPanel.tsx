"use client";

import { useCadStore } from "@/lib/store";
import type { PosicaoToolbar } from "@/lib/types";

const OPCOES: { valor: PosicaoToolbar; label: string }[] = [
  { valor: "TOP", label: "Topo" },
  { valor: "LEFT", label: "Esquerda" },
  { valor: "RIGHT", label: "Direita" },
];

/**
 * SettingsPanel
 * -----------------------------------------------------------------------
 * Painel de Configurações da barra lateral: por ora, só a posição da
 * régua de ferramentas (`ToolRuler`) -- TOP (padrão, barra horizontal
 * acima do canvas), LEFT/RIGHT (coluna vertical ao lado do canvas).
 * -----------------------------------------------------------------------
 */
export function SettingsPanel() {
  const toolbarPosicao = useCadStore((s) => s.toolbarPosicao);
  const setToolbarPosicao = useCadStore((s) => s.setToolbarPosicao);

  return (
    <div>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Configurações</h2>
      <label className="flex items-center justify-between gap-2 text-[11px] text-slate-600">
        Régua de ferramentas
        <select
          value={toolbarPosicao}
          onChange={(e) => setToolbarPosicao(e.target.value as PosicaoToolbar)}
          className="rounded border border-slate-200 px-1 py-1 text-[11px]"
        >
          {OPCOES.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
