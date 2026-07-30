"use client";

import { useRef, useState } from "react";
import { useCadStore } from "@/lib/store";
import {
  ESCALA_CARIMBO_MAX,
  ESCALA_CARIMBO_MIN,
  ROTULOS_TIPO_LIGACAO,
  type Carimbo,
  type TipoLigacaoConcessionaria,
} from "@/lib/types";

/**
 * Redimensiona/comprime uma imagem de logo para um data-URL pequeno
 * (lado maior <= 160px, JPEG qualidade 0.85) antes de guardar no
 * projeto -- o logo vai direto no JSON persistido (junto de
 * cliente/título/etc.), sem um sistema de blob separado como o dos
 * XREFs, então precisa ficar pequeno o bastante para não estourar o
 * limite de tamanho de documento do Firestore (1MB).
 */
async function comprimirLogo(file: File, ladoMax = 160): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const escala = Math.min(1, ladoMax / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * escala));
  const h = Math.max(1, Math.round(bitmap.height * escala));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Não foi possível processar a imagem.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", 0.85);
}

/**
 * Iteração 19: mesma ideia de `comprimirLogo`, mas preservando
 * TRANSPARÊNCIA (PNG, sem preencher fundo branco) -- ao contrário do
 * logo (sempre opaco, ocupa uma célula própria com fundo branco), a
 * rubrica de assinatura é desenhada por CIMA de uma linha/rótulo já
 * existentes no carimbo, então precisa continuar transparente ao redor
 * do traço da caneta pra não virar um retângulo branco cobrindo tudo.
 */
async function comprimirAssinatura(file: File, ladoMax = 220): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const escala = Math.min(1, ladoMax / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * escala));
  const h = Math.max(1, Math.round(bitmap.height * escala));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Não foi possível processar a imagem.");
  ctx.drawImage(bitmap, 0, 0, w, h);
  return canvas.toDataURL("image/png");
}

/**
 * Campos de texto livre do carimbo, na ordem em que aparecem no painel --
 * segue a mesma ordem de leitura do layout desenhado em
 * `TitleBlockLayer.tsx`/`pdfExport.ts` (título -> endereço -> cliente/
 * responsável -> conta contrato -> escala/data/prancha). `tipoLigacao`
 * fica de fora deste array (é um `<select>` de opções fixas, não texto
 * livre -- ver o campo dedicado logo abaixo no JSX).
 */
type CampoTexto = { chave: keyof Omit<Carimbo, "visivel" | "logoDataUrl" | "tipoLigacao">; label: string; placeholder: string };

/** 1ª parte: até "conta contrato" -- logo em seguida vem o `<select>` de Tipo de Ligação (fora deste array). */
const CAMPOS_ANTES_TIPO_LIGACAO: CampoTexto[] = [
  { chave: "titulo", label: "Título do projeto", placeholder: "Ex.: Sistema Fotovoltaico 10kWp" },
  { chave: "cliente", label: "Cliente", placeholder: "Nome do cliente" },
  // Iteração 46 -- pedido do usuário: "falta o campo de digitar o cpf do
  // cliente". Logo em seguida do nome do cliente (aparece numa 2ª linha
  // abaixo dele no carimbo desenhado, mesmo padrão do CREA abaixo do
  // responsável técnico -- ver `campoClienteComCpf` em `TitleBlockLayer.tsx`).
  { chave: "cpfCliente", label: "CPF do cliente", placeholder: "Ex.: 123.456.789-00" },
  { chave: "enderecoCliente", label: "Endereço do cliente", placeholder: "Rua, número, bairro, cidade/UF" },
  { chave: "responsavel", label: "Responsável técnico", placeholder: "Nome do engenheiro/projetista" },
  { chave: "crea", label: "CREA/CFT", placeholder: "Ex.: 123456-D/SP" },
  { chave: "contaContrato", label: "Conta contrato (concessionária)", placeholder: "Ex.: 123456789" },
];

/** 2ª parte: depois do `<select>` de Tipo de Ligação. */
const CAMPOS_DEPOIS_TIPO_LIGACAO: CampoTexto[] = [
  { chave: "escala", label: "Escala", placeholder: "Ex.: 1:50" },
  { chave: "data", label: "Data", placeholder: "Ex.: 20/07/2026" },
  { chave: "prancha", label: "Prancha", placeholder: "Ex.: 01/03" },
];

/** Opções do seletor "Tipo de ligação" -- ver `TipoLigacaoConcessionaria`/`ROTULOS_TIPO_LIGACAO` em lib/types.ts. */
const OPCOES_TIPO_LIGACAO: TipoLigacaoConcessionaria[] = ["", "B1_RESIDENCIAL", "B1_RURAL", "B3_COMERCIAL"];

/**
 * TitleBlockPanel
 * -----------------------------------------------------------------------
 * Painel "Carimbo" da barra lateral: edição dos campos do quadro de
 * título ABNT desenhado automaticamente no canto inferior direito da
 * prancha ativa (ver `TitleBlockLayer.tsx` para o desenho no canvas e
 * `lib/pdfExport.ts` para a versão exportada). Um botão liga/desliga a
 * visibilidade do carimbo inteiro (útil se o usuário quiser desenhar seu
 * próprio quadro de título manualmente na camada MOLDURA, como já era
 * possível antes desta ferramenta existir).
 * -----------------------------------------------------------------------
 */
export function TitleBlockPanel() {
  const prenchaAtivaId = useCadStore((s) => s.prenchaAtivaId);
  const carimbo = useCadStore((s) => s.projeto.carimbo);
  const atualizarCarimbo = useCadStore((s) => s.atualizarCarimbo);
  const setLogoCarimbo = useCadStore((s) => s.setLogoCarimbo);
  const setAssinaturaCarimbo = useCadStore((s) => s.setAssinaturaCarimbo);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputAssinaturaRef = useRef<HTMLInputElement>(null);
  const [erroLogo, setErroLogo] = useState<string | null>(null);
  const [erroAssinatura, setErroAssinatura] = useState<string | null>(null);

  // Sem Prancha ativa (vendo o Desenho/Model Space), não faz sentido
  // editar o carimbo aqui (não tem pra onde olhar o resultado) -- mas o
  // carimbo em si é ÚNICO e COMPARTILHADO entre todas as Pranchas
  // (Iteração 12g: "ao preencher o carimbo ele apareça automaticamente em
  // todas as pranchas ao mesmo tempo, se ajustando ao tamanho da
  // prancha"). Ver `PaginaTabs` em `StatusBar.tsx` pra trocar de página.
  if (!prenchaAtivaId) {
    return (
      <div>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Carimbo (ABNT)</h2>
        <p className="text-[11px] text-slate-400">
          O Desenho (Model Space) não mostra o carimbo -- selecione uma Prancha no rodapé (canto direito) para editar
          (o carimbo é único e aparece em todas as Pranchas).
        </p>
      </div>
    );
  }

  async function handleLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErroLogo(null);
    try {
      const dataUrl = await comprimirLogo(file);
      setLogoCarimbo(dataUrl);
    } catch (err) {
      setErroLogo(err instanceof Error ? err.message : String(err));
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  // Iteração 19: mesmo pipeline de compressão do logo -- a rubrica é uma
  // imagem PNG (normalmente com fundo transparente) que o usuário sempre
  // reaproveita entre projetos, então também precisa ficar pequena o
  // bastante pra caber no limite de documento do Firestore.
  async function handleAssinatura(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErroAssinatura(null);
    try {
      const dataUrl = await comprimirAssinatura(file);
      setAssinaturaCarimbo(dataUrl);
    } catch (err) {
      setErroAssinatura(err instanceof Error ? err.message : String(err));
    } finally {
      if (inputAssinaturaRef.current) inputAssinaturaRef.current.value = "";
    }
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Carimbo (ABNT)</h2>
        <button
          type="button"
          onClick={() => atualizarCarimbo({ visivel: !carimbo.visivel })}
          className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
            carimbo.visivel ? "bg-blue-100 text-blue-700" : "bg-slate-200 text-slate-500"
          }`}
          title="Mostrar/ocultar o carimbo no canvas e na exportação PDF"
        >
          {carimbo.visivel ? "Visível" : "Oculto"}
        </button>
      </div>

      <div className={`space-y-1.5 ${carimbo.visivel ? "" : "opacity-50"}`}>
        {/* Tamanho do carimbo (Iteração 12c): multiplicador sobre as
            dimensões padrão (ver `dimensoesCarimbo`) -- os tamanhos de
            fonte crescem junto (são frações da altura do carimbo), então
            isso resolve nomes/endereços compridos ficando cortados
            ("...") no tamanho padrão. */}
        <label className="block text-[11px] text-slate-600">
          Tamanho do carimbo ({Math.round((carimbo.escalaCarimbo ?? 1) * 100)}%)
          <input
            type="range"
            min={ESCALA_CARIMBO_MIN}
            max={ESCALA_CARIMBO_MAX}
            step={0.1}
            value={carimbo.escalaCarimbo ?? 1}
            onChange={(e) => atualizarCarimbo({ escalaCarimbo: Number(e.target.value) })}
            className="mt-0.5 w-full"
            title="Aumenta o carimbo (e o tamanho das letras) para os valores dos campos não ficarem cortados"
          />
        </label>

        {CAMPOS_ANTES_TIPO_LIGACAO.map((c) => (
          <label key={c.chave} className="block text-[11px] text-slate-600">
            {c.label}
            <input
              type="text"
              value={carimbo[c.chave]}
              placeholder={c.placeholder}
              // Iteração 46 -- pedido do usuário: "preciso que todo o texto
              // digitado fique maiusculo" (convenção real de carimbo/
              // quadro de título ABNT, sempre em letras maiúsculas).
              // Transforma no PRÓPRIO valor salvo (não só visualmente),
              // pra sair maiúsculo também no PDF/DXF exportado.
              onChange={(e) => atualizarCarimbo({ [c.chave]: e.target.value.toUpperCase() } as Partial<Carimbo>)}
              className="mt-0.5 w-full rounded border border-slate-200 px-1.5 py-1 text-[11px]"
            />
          </label>
        ))}

        {/* Tipo de ligação (Iteração 12c): opções fixas exigidas pela
            concessionária -- B1 Residencial/Rural ou B3 Comercial --, não
            texto livre, então é um `<select>` dedicado em vez de mais uma
            entrada em CAMPOS_*. */}
        <label className="block text-[11px] text-slate-600">
          Tipo de ligação
          <select
            value={carimbo.tipoLigacao}
            onChange={(e) => atualizarCarimbo({ tipoLigacao: e.target.value as TipoLigacaoConcessionaria })}
            className="mt-0.5 w-full rounded border border-slate-200 px-1.5 py-1 text-[11px]"
          >
            {OPCOES_TIPO_LIGACAO.map((op) => (
              <option key={op} value={op}>
                {op === "" ? "— selecione —" : ROTULOS_TIPO_LIGACAO[op]}
              </option>
            ))}
          </select>
        </label>

        {CAMPOS_DEPOIS_TIPO_LIGACAO.map((c) => (
          <label key={c.chave} className="block text-[11px] text-slate-600">
            {c.label}
            <input
              type="text"
              value={carimbo[c.chave]}
              placeholder={c.placeholder}
              // Iteração 46 -- pedido do usuário: "preciso que todo o texto
              // digitado fique maiusculo" (convenção real de carimbo/
              // quadro de título ABNT, sempre em letras maiúsculas).
              // Transforma no PRÓPRIO valor salvo (não só visualmente),
              // pra sair maiúsculo também no PDF/DXF exportado.
              onChange={(e) => atualizarCarimbo({ [c.chave]: e.target.value.toUpperCase() } as Partial<Carimbo>)}
              className="mt-0.5 w-full rounded border border-slate-200 px-1.5 py-1 text-[11px]"
            />
          </label>
        ))}

        <div className="pt-1">
          <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleLogo} />
          <div className="flex items-center gap-2">
            {carimbo.logoDataUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- preview local de um data-URL pequeno, não faz sentido passar pelo otimizador de imagem do Next.
              <img src={carimbo.logoDataUrl} alt="Logo" className="h-8 w-8 rounded border border-slate-200 object-contain" />
            )}
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex-1 rounded border border-dashed border-slate-300 px-2 py-1 text-[11px] text-slate-600 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700"
            >
              {carimbo.logoDataUrl ? "Trocar logo" : "+ Logo (opcional)"}
            </button>
            {carimbo.logoDataUrl && (
              <button
                type="button"
                onClick={() => setLogoCarimbo(null)}
                className="text-[11px] text-red-500 hover:text-red-700"
                title="Remover logo"
              >
                ✕
              </button>
            )}
          </div>
          {erroLogo && <p className="mt-1 text-[10px] text-red-600">{erroLogo}</p>}
        </div>

        {/* Iteração 19: assinatura/rubrica -- mesmo padrão do logo (upload +
            preview + remover), agora desenhada em CIMA da linha de
            assinatura no topo do carimbo (ver `TitleBlockLayer.tsx`/
            `pdfExport.ts`), junto do logo -- "quero que a imagem logo e
            assinatura fiquem na parte de cima do carimbo e nao do lado". */}
        <div className="pt-1">
          <input ref={inputAssinaturaRef} type="file" accept="image/*" className="hidden" onChange={handleAssinatura} />
          <div className="flex items-center gap-2">
            {carimbo.assinaturaDataUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- preview local de um data-URL pequeno.
              <img
                src={carimbo.assinaturaDataUrl}
                alt="Assinatura"
                className="h-8 w-8 rounded border border-slate-200 bg-[repeating-conic-gradient(#e2e8f0_0%_25%,white_0%_50%)] bg-[length:8px_8px] object-contain"
              />
            )}
            <button
              type="button"
              onClick={() => inputAssinaturaRef.current?.click()}
              className="flex-1 rounded border border-dashed border-slate-300 px-2 py-1 text-[11px] text-slate-600 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700"
            >
              {carimbo.assinaturaDataUrl ? "Trocar assinatura" : "+ Assinatura (PNG, opcional)"}
            </button>
            {carimbo.assinaturaDataUrl && (
              <button
                type="button"
                onClick={() => setAssinaturaCarimbo(null)}
                className="text-[11px] text-red-500 hover:text-red-700"
                title="Remover assinatura"
              >
                ✕
              </button>
            )}
          </div>
          {erroAssinatura && <p className="mt-1 text-[10px] text-red-600">{erroAssinatura}</p>}
          <p className="mt-1 text-[10px] text-slate-400">
            Sem imagem, a linha de assinatura continua aparecendo (pra assinar à mão numa impressão física).
          </p>
        </div>

        {/* Iteração 19: notas técnicas -- caixa própria ACIMA do carimbo
            (não faz parte da grade de campos), texto livre multilinha que
            muda conforme o projeto -- "as notas ficam na parte superior do
            carimbo... esse campo pode ser editavel". Iteração 46: já vem
            preenchido com o texto padrão de projetos fotovoltaicos do
            usuário (`NOTAS_PADRAO_FOTOVOLTAICO`, ver `lib/types.ts`) em
            todo projeto NOVO -- continua 100% editável/ajustável. */}
        <label className="block text-[11px] text-slate-600">
          Notas (aparecem numa caixa acima do carimbo)
          <textarea
            value={carimbo.notas ?? ""}
            placeholder={
              "Ex.: 1. A seção transversal dos condutores foi dimensionada em função da corrente máxima...\n2. Cabos em corrente contínua isolados em XLPE..."
            }
            // Iteração 46: mesmo pedido de maiúsculas dos campos acima.
            onChange={(e) => atualizarCarimbo({ notas: e.target.value.toUpperCase() })}
            rows={5}
            className="mt-0.5 w-full resize-y rounded border border-slate-200 px-1.5 py-1 text-[11px]"
          />
        </label>
      </div>

      <p className="mt-1.5 text-[10px] text-slate-400">
        Desenhado automaticamente no canto inferior direito da prancha ativa, com tamanho proporcional ao formato
        (A4-A1).
      </p>
    </div>
  );
}
