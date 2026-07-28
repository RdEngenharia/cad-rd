"use client";

import { XrefImportButton } from "./XrefImportButton";
import { LayersPanel } from "./LayersPanel";
import { HatchPanel } from "./HatchPanel";
import { PropertiesPanel } from "./PropertiesPanel";
import { TitleBlockPanel } from "./TitleBlockPanel";
import { SettingsPanel } from "./SettingsPanel";
import { BlockLibraryPanel } from "./BlockLibraryPanel";
import { DiagramaFvButton } from "./DiagramaFvButton";
import { SistemaSoloButton } from "./SistemaSoloButton";
import { CargasEletricasButton } from "./CargasEletricasButton";
import { LancamentoEletricoButton } from "./LancamentoEletricoButton";

/**
 * Sidebar
 * -----------------------------------------------------------------------
 * Barra lateral esquerda: painel de camadas (criar/ligar-desligar/
 * escolher a camada ativa), painel de hachura (padrão/cor/escala da
 * ferramenta "Hachurar"), painel de propriedades de texto/bloco (tamanho
 * padrão + edição do selecionado), a Biblioteca de Blocos (painel
 * dobrável -- `BlockLibraryPanel.tsx` -- clique para armar carimbo OU
 * arraste/drag&drop direto pro canvas; inclui a ferramenta "Padrão de
 * Entrada/Concessionária"), o botão do Gerador de diagrama fotovoltaico
 * (`DiagramaFvButton.tsx` -- abre `DiagramaFvModal.tsx`, Iteração 13) e o
 * botão de Dimensionar sistema fotovoltaico no solo (`SistemaSoloButton.tsx`
 * -- abre `SistemaSoloModal.tsx`, Iteração 29), o botão de importação de
 * XREF (imagem/PDF), o painel do Carimbo/legenda
 * ABNT (título, cliente, responsável, escala, data, prancha, logo) e o
 * painel de Configurações (posição da régua de ferramentas).
 * -----------------------------------------------------------------------
 */
export function Sidebar() {
  return (
    <aside className="flex h-full w-60 shrink-0 flex-col gap-4 overflow-y-auto border-r border-slate-200 bg-white p-3">
      <LayersPanel />

      <div className="border-t border-slate-200 pt-3">
        <HatchPanel />
      </div>

      <div className="border-t border-slate-200 pt-3">
        <PropertiesPanel />
      </div>

      <div className="border-t border-slate-200 pt-3">
        <BlockLibraryPanel />
      </div>

      <div className="border-t border-slate-200 pt-3">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Gerador automático
        </h2>
        <DiagramaFvButton />
        <div className="mt-2">
          <SistemaSoloButton />
        </div>
        <div className="mt-2">
          <CargasEletricasButton />
        </div>
        <div className="mt-2">
          <LancamentoEletricoButton />
        </div>
      </div>

      <div className="border-t border-slate-200 pt-3">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Referência externa (XREF)
        </h2>
        <XrefImportButton />
      </div>

      <div className="border-t border-slate-200 pt-3">
        <TitleBlockPanel />
      </div>

      <div className="border-t border-slate-200 pt-3">
        <SettingsPanel />
      </div>
    </aside>
  );
}
