"use client";

import { useCadStore } from "@/lib/store";

/**
 * DivisorAmbienteButton
 * -----------------------------------------------------------------------
 * Iteração 45 -- pedido do usuário (verbatim): "estou usando retangulos,
 * comandos offset e fillit pra fechar os cantos, depois uso trim pra
 * aparar as pontas quando abro portas nos comodos [...] o lançamento
 * automatico [...] da erro [...] Pensei em [...] simplesmente criar um
 * botao com divisor de ambiente, assim posso fazer as portas normalmente
 * e depois aplicar essa linha, será uma linha pontilhada e com cor roxa".
 *
 * O detector de cômodos (`roomDetection.ts`) é um flood-fill puro: um vão
 * de porta/janela de verdade deixa o cômodo literalmente conectado ao
 * ambiente vizinho (ou ao exterior) -- geometricamente não tem como
 * diferenciar "aqui passa uma pessoa" de "aqui não tem parede nenhuma".
 * Por isso o botão de lançamento sempre vai acusar "área aberta"/
 * "mesclada" quando existe um vão de verdade (comportamento correto,
 * documentado em `roomDetection.ts` -- não é bug).
 *
 * Este botão ativa a camada dedicada "DIVISORIA_AMBIENTE" (roxa,
 * tracejada -- ver `store.ts#ativarFerramentaDivisorAmbiente`) e já troca
 * a ferramenta ativa pra "Linha": o usuário desenha uma linha reta
 * cobrindo o vão da porta/janela (fecha o cômodo só pros fins do
 * detector, sem mexer na parede de verdade), roda "Lançar tomadas/
 * iluminação" normalmente, e pode ocultar essa camada depois (ícone 💡 no
 * painel Camadas, "CAMADAS" no topo da barra lateral) antes de imprimir,
 * se não quiser vê-la no desenho final -- sem precisar apagar/redesenhar
 * uma linha temporária toda vez que for rodar o gerador de novo.
 * -----------------------------------------------------------------------
 */
export function DivisorAmbienteButton() {
  const ativarFerramentaDivisorAmbiente = useCadStore((s) => s.ativarFerramentaDivisorAmbiente);
  const ferramenta = useCadStore((s) => s.ferramenta);
  const activeLayer = useCadStore((s) => s.activeLayer);
  const ativo = ferramenta === "linha" && activeLayer === "DIVISORIA_AMBIENTE";

  return (
    <button
      type="button"
      onClick={ativarFerramentaDivisorAmbiente}
      title='Fecha (só pro detector automático) um vão de porta/janela: ativa a camada "DIVISORIA_AMBIENTE" (roxa/tracejada) e a ferramenta Linha -- desenhe cobrindo o vão, rode o lançamento, e oculte a camada depois se não quiser vê-la impressa.'
      className={`w-full rounded-lg border border-dashed px-2 py-2 text-xs font-medium ${
        ativo
          ? "border-purple-400 bg-purple-100 text-purple-700"
          : "border-purple-300 bg-purple-50 text-purple-700 hover:border-purple-400 hover:bg-purple-100"
      }`}
    >
      🚪 Divisor de ambiente (fecha vão de porta/janela)
    </button>
  );
}
