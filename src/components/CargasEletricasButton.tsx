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
 *
 * Iteração 42 -- pedido do usuário: "interligue... o botao de lançamento
 * de dimensionamento de cargas ao selecionar a planta baixa com os
 * circuitos lançados". Quando ainda não existe nenhum dimensionamento
 * salvo E a seleção atual (mesma "casa" usada no Lançamento Elétrico) tem
 * cômodos detectáveis, o modal (`CargasEletricasModal.tsx`) já abre com
 * os ambientes pré-preenchidos a partir da planta baixa -- este botão só
 * avisa isso no tooltip; continua funcionando igual (formulário manual)
 * quando não há seleção/planta baixa.
 * -----------------------------------------------------------------------
 */
export function CargasEletricasButton() {
  const [aberto, setAberto] = useState(false);
  const temDimensionamento = useCadStore((s) => Boolean(s.projeto.dadosCargasEletricas));
  const temSelecaoParaPlanta = useCadStore((s) => s.selecionadoIds.length > 0);

  return (
    <div>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="w-full rounded-lg border border-dashed border-amber-300 bg-amber-50 px-2 py-2 text-xs font-medium text-amber-700 hover:border-amber-400 hover:bg-amber-100"
        title={
          temDimensionamento
            ? "Reabre o formulário já preenchido com a última geração -- ajuste e gere de novo (substitui o desenho anterior)"
            : temSelecaoParaPlanta
              ? "Se a seleção atual for a planta baixa com os cômodos nomeados (a mesma do Lançamento Elétrico), o formulário já abre com os ambientes preenchidos automaticamente. Sem seleção/planta baixa, abre em branco pra preenchimento manual."
              : "Abre o formulário de ambientes/tomadas/TUEs e gera tabela, lista de material e diagrama do QDC"
        }
      >
        {temDimensionamento ? "✏️ Ajustar dimensionamento de cargas" : "🔌 Dimensionar cargas elétricas (NBR 5410)"}
      </button>
      {aberto && <CargasEletricasModal onFechar={() => setAberto(false)} />}
    </div>
  );
}
