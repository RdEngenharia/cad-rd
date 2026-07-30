"use client";

import { useCadStore } from "@/lib/store";
import { AjudaModal } from "./AjudaModal";

/**
 * AjudaPanel
 * -----------------------------------------------------------------------
 * Wrapper fino (mesmo padrão de `SuportePanel.tsx`): lê `ajudaAberto` do
 * store e renderiza o `AjudaModal` quando aberto. Montado 1x em
 * `Editor.tsx`, aberto pelo botão "❓ Ajuda" da `AuthPanel`.
 * -----------------------------------------------------------------------
 */
export function AjudaPanel() {
  const ajudaAberto = useCadStore((s) => s.ajudaAberto);
  const fecharAjuda = useCadStore((s) => s.fecharAjuda);

  if (!ajudaAberto) return null;
  return <AjudaModal onFechar={fecharAjuda} />;
}
