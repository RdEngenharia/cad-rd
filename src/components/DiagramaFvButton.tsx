"use client";

import { useState } from "react";
import { DiagramaFvModal } from "./DiagramaFvModal";

/**
 * DiagramaFvButton
 * -----------------------------------------------------------------------
 * Iteração 13 -- ponto de entrada do gerador de diagrama fotovoltaico:
 * um botão na sidebar que abre `DiagramaFvModal.tsx`. Local e efêmero
 * (nenhum estado no Zustand, mesmo espírito de `XrefImportButton.tsx`
 * abrindo `PdfPageModal.tsx`).
 * -----------------------------------------------------------------------
 */
export function DiagramaFvButton() {
  const [aberto, setAberto] = useState(false);

  return (
    <div>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="w-full rounded-lg border border-dashed border-amber-300 bg-amber-50 px-2 py-2 text-xs font-medium text-amber-700 hover:border-amber-400 hover:bg-amber-100"
      >
        ⚡ Gerar diagrama fotovoltaico
      </button>
      {aberto && <DiagramaFvModal onFechar={() => setAberto(false)} />}
    </div>
  );
}
