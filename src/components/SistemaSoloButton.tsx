"use client";

import { useState } from "react";
import { SistemaSoloModal } from "./SistemaSoloModal";

/**
 * SistemaSoloButton
 * -----------------------------------------------------------------------
 * Iteração 29 -- ponto de entrada do gerador de sistema fotovoltaico no
 * solo: um botão na sidebar que abre `SistemaSoloModal.tsx`. Mesmo
 * espírito de `DiagramaFvButton.tsx` (Iteração 13): local e efêmero,
 * nenhum estado no Zustand.
 * -----------------------------------------------------------------------
 */
export function SistemaSoloButton() {
  const [aberto, setAberto] = useState(false);

  return (
    <div>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="w-full rounded-lg border border-dashed border-amber-300 bg-amber-50 px-2 py-2 text-xs font-medium text-amber-700 hover:border-amber-400 hover:bg-amber-100"
      >
        ☀ Dimensionar sistema no solo
      </button>
      {aberto && <SistemaSoloModal onFechar={() => setAberto(false)} />}
    </div>
  );
}
