"use client";

import { useState } from "react";
import { useCadStore } from "@/lib/store";
import { CargasEletricasModal } from "./CargasEletricasModal";

/**
 * CargasEletricasButton
 * -----------------------------------------------------------------------
 * Iteração 30 -- ponto de entrada do gerador de dimensionamento de cargas
 * elétricas (NBR 5410): um botão na sidebar que abre
 * `CargasEletricasModal.tsx`.
 *
 * Iteração 31 -- quando o projeto já tem um dimensionamento gerado
 * (`projeto.dadosCargasEletricas` salvo pelo store), o botão muda de
 * rótulo pra deixar claro que reabrir NÃO recomeça do zero: o modal volta
 * preenchido com a última entrada, pro usuário só ajustar ou acrescentar
 * um item (pedido explícito: "caso eu esqueça ou precise adicionar algum
 * item preciso de um botao para voltar no modal inicial e apenas ajustar
 * a informacao").
 * -----------------------------------------------------------------------
 */
export function CargasEletricasButton() {
  const [aberto, setAberto] = useState(false);
  const temDimensionamento = useCadStore((s) => Boolean(s.projeto.dadosCargasEletricas));

  return (
    <div>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="w-full rounded-lg border border-dashed border-amber-300 bg-amber-50 px-2 py-2 text-xs font-medium text-amber-700 hover:border-amber-400 hover:bg-amber-100"
        title={
          temDimensionamento
            ? "Reabre o formulário já preenchido com a última geração -- ajuste e gere de novo (substitui o desenho anterior)"
            : "Abre o formulário de ambientes/tomadas/TUEs e gera tabela, lista de material e diagrama do QDC"
        }
      >
        {temDimensionamento ? "✏️ Ajustar dimensionamento de cargas" : "🔌 Dimensionar cargas elétricas (NBR 5410)"}
      </button>
      {aberto && <CargasEletricasModal onFechar={() => setAberto(false)} />}
    </div>
  );
}
