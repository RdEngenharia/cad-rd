"use client";

/**
 * DiagramaFvModal.tsx
 * -----------------------------------------------------------------------
 * Iteração 13 -- gerador de diagrama unifilar fotovoltaico via BOTÃO +
 * MODAL estruturado, substituindo por completo o antigo comando de IA
 * "GERAR_PROJETO_FV" (Iteração 12b, removido -- decisão explícita do
 * usuário quando perguntado: "substituir completamente o gerador por
 * IA"). O usuário anexou 2 diagramas de referência reais (1 monofásico,
 * 1 trifásico com 2 MPPTs) pedindo um resultado "idêntico" a eles
 * (ignorando só o carimbo, que já é preenchido pelo painel próprio).
 *
 * As perguntas seguem a MESMA ORDEM dos diagramas de referência (pedido
 * explícito do usuário): 1) Padrão de entrada, 2) Inversor(es)
 * (dinâmico -- "+ Adicionar inversor", cada um com seus próprios MPPTs),
 * 3) Placas fotovoltaicas (um modelo só, usado no projeto inteiro --
 * mesmo padrão dos 2 diagramas de referência). Todo texto/número gerado
 * vira geometria `tipo: "texto"`/normal -- editável depois direto no
 * canvas como qualquer outro elemento, exatamente como pedido.
 *
 * DECISÃO DE PRODUTO (confirmada com o usuário via AskUserQuestion antes
 * de implementar, ver `lib/diagramaFv.ts` para o texto completo): NENHUM
 * disjuntor/bitola/especificação de DPS é sugerido/calculado por norma de
 * concessionária -- o modal só pede pra digitar esses valores. A corrente
 * de proteção CC por MPPT mostra `estimarCorrenteFusivel` como
 * PLACEHOLDER (dica visual, nunca aplicada automaticamente) -- o campo
 * fica vazio até o usuário confirmar/digitar o valor final.
 *
 * FOTO DO PADRÃO DE ENTRADA (campo de upload, pedido explícito do
 * usuário): reaproveita o MESMO mecanismo de importação de XREF já usado
 * por `XrefImportButton.tsx` (Object URL + IndexedDB via `xrefDb.ts`) --
 * só que, em vez de nascer em (0,0) pro usuário posicionar manualmente, é
 * automaticamente encaixada dentro do retângulo "PADRÃO DE ENTRADA
 * REPRESENTATIVO" que `construirGeometriaDiagramaFv` acabou de desenhar
 * (devolvido como `boxPadraoEntradaRepresentativo` pela ação do store) --
 * decisão confirmada com o usuário via AskUserQuestion.
 * -----------------------------------------------------------------------
 */

import { useState, type ChangeEvent } from "react";
import { useCadStore } from "@/lib/store";
import { saveXrefBlob } from "@/lib/xrefDb";
import { PLACA_ADVERTENCIA_PADRAO_DATA_URL, dataUrlParaBlob } from "@/lib/placaAdvertenciaPadrao";
import {
  estimarCorrenteFusivel,
  ramalLigacaoPadrao,
  type DadosDiagramaFv,
  type DadosDiagramaFvInversor,
  type DadosDiagramaFvMppt,
  type TipoRedeFv,
} from "@/lib/diagramaFv";

interface DiagramaFvModalProps {
  onFechar: () => void;
}

interface FormMppt {
  numeroStrings: string;
  modulosPorString: string;
  correnteProtecaoCcA: string;
}

interface FormInversor {
  modelo: string;
  potenciaW: string;
  tensaoEntradaMinV: string;
  tensaoEntradaMaxV: string;
  tensaoMaxCcV: string;
  correnteMaxPorMpptA: string;
  tensaoSaidaV: string;
  correnteSaidaA: string;
  /** Iteração 24: corrente do disjuntor de saída INDIVIDUAL deste inversor -- ver `DadosDiagramaFvInversor.correnteDisjuntorSaidaA` em `lib/diagramaFv.ts`. */
  correnteDisjuntorSaidaA: string;
  caboCcMm2: string;
  especificacaoDpsCc: string;
  mppts: FormMppt[];
}

interface FormPadraoEntrada {
  tipoRede: TipoRedeFv;
  ramalLigacao: string;
  correnteDisjuntorPadraoA: string;
  caboPadraoAteDistribuicao: string;
  correnteDisjuntorDistribuicaoA: string;
  especificacaoDpsCa: string;
  caboDistribuicaoAteProtecaoCa: string;
  correnteDisjuntorProtecaoCaA: string;
  caboProtecaoCaAteInversor: string;
}

interface FormModulo {
  marca: string;
  modelo: string;
  potenciaWp: string;
  vmp: string;
  voc: string;
  imp: string;
  eficiencia: string;
}

function novoMppt(): FormMppt {
  return { numeroStrings: "1", modulosPorString: "1", correnteProtecaoCcA: "" };
}

function novoInversor(): FormInversor {
  return {
    modelo: "",
    potenciaW: "",
    tensaoEntradaMinV: "",
    tensaoEntradaMaxV: "",
    tensaoMaxCcV: "",
    correnteMaxPorMpptA: "",
    tensaoSaidaV: "220",
    correnteSaidaA: "",
    correnteDisjuntorSaidaA: "",
    caboCcMm2: "4mm²",
    especificacaoDpsCc: "classe II\nIn:18KA Imax:400KA 600/1040v",
    mppts: [novoMppt()],
  };
}

function padraoEntradaInicial(): FormPadraoEntrada {
  return {
    tipoRede: "monofasico",
    ramalLigacao: ramalLigacaoPadrao("monofasico"),
    correnteDisjuntorPadraoA: "40",
    caboPadraoAteDistribuicao: "1#10(10)MM²",
    correnteDisjuntorDistribuicaoA: "40",
    especificacaoDpsCa: "classe II\nIn:10KA Imax:20KA 275Vca",
    caboDistribuicaoAteProtecaoCa: "1#10(10)+T10mm²",
    correnteDisjuntorProtecaoCaA: "32",
    caboProtecaoCaAteInversor: "1#6(6)+T6mm²",
  };
}

function moduloInicial(): FormModulo {
  return { marca: "", modelo: "", potenciaWp: "", vmp: "", voc: "", imp: "", eficiencia: "" };
}

/** Mesma técnica de `XrefImportButton.tsx#medirImagem` -- mede as dimensões naturais de uma imagem a partir de um Object URL temporário. */
function medirImagem(objectUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    img.src = objectUrl;
  });
}

function numero(v: string): number {
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

function campoValido(v: string): boolean {
  return v.trim().length > 0;
}

function numeroValido(v: string, permitirZero = false): boolean {
  const n = numero(v);
  return Number.isFinite(n) && (permitirZero ? n >= 0 : n > 0);
}

const LABEL = "text-[10px] font-medium text-slate-500";
const INPUT = "w-full rounded border border-slate-200 px-1.5 py-1 text-[11px] text-slate-800";
const SUBTITULO = "mb-2 mt-4 text-[11px] font-semibold uppercase tracking-wide text-slate-500";

function Campo({
  label,
  value,
  onChange,
  placeholder,
  textarea,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  textarea?: boolean;
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className={LABEL}>{label}</span>
      {textarea ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={2}
          className={`${INPUT} resize-none font-mono`}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={INPUT}
        />
      )}
      {hint && <span className="text-[9px] text-slate-400">{hint}</span>}
    </label>
  );
}

export function DiagramaFvModal({ onFechar }: DiagramaFvModalProps) {
  const gerarDiagramaFotovoltaico = useCadStore((s) => s.gerarDiagramaFotovoltaico);
  const addXref = useCadStore((s) => s.addXref);

  const [padraoEntrada, setPadraoEntrada] = useState<FormPadraoEntrada>(padraoEntradaInicial);
  const [cargaInstaladaKw, setCargaInstaladaKw] = useState("");
  const [inversores, setInversores] = useState<FormInversor[]>([novoInversor()]);
  const [modulo, setModulo] = useState<FormModulo>(moduloInicial);
  const [imagemPlaquinha, setImagemPlaquinha] = useState<File | null>(null);
  const [erros, setErros] = useState<string[]>([]);
  const [gerando, setGerando] = useState(false);

  function atualizarPadrao<K extends keyof FormPadraoEntrada>(campo: K, valor: FormPadraoEntrada[K]) {
    setPadraoEntrada((p) => {
      const atualizado = { ...p, [campo]: valor };
      // Trocar o tipo de rede reaplica o "molde" de ramal padrão daquele
      // tipo -- só um ponto de partida, o campo continua 100% editável.
      if (campo === "tipoRede") atualizado.ramalLigacao = ramalLigacaoPadrao(valor as TipoRedeFv);
      return atualizado;
    });
  }

  function atualizarInversor<K extends keyof FormInversor>(idx: number, campo: K, valor: FormInversor[K]) {
    setInversores((lista) => lista.map((inv, i) => (i === idx ? { ...inv, [campo]: valor } : inv)));
  }

  function atualizarMppt<K extends keyof FormMppt>(idxInversor: number, idxMppt: number, campo: K, valor: FormMppt[K]) {
    setInversores((lista) =>
      lista.map((inv, i) =>
        i !== idxInversor
          ? inv
          : { ...inv, mppts: inv.mppts.map((m, j) => (j === idxMppt ? { ...m, [campo]: valor } : m)) }
      )
    );
  }

  function adicionarInversor() {
    setInversores((lista) => [...lista, novoInversor()]);
  }
  function removerInversor(idx: number) {
    setInversores((lista) => (lista.length > 1 ? lista.filter((_, i) => i !== idx) : lista));
  }
  function adicionarMppt(idxInversor: number) {
    setInversores((lista) =>
      lista.map((inv, i) => (i === idxInversor ? { ...inv, mppts: [...inv.mppts, novoMppt()] } : inv))
    );
  }
  function removerMppt(idxInversor: number, idxMppt: number) {
    setInversores((lista) =>
      lista.map((inv, i) =>
        i === idxInversor ? { ...inv, mppts: inv.mppts.length > 1 ? inv.mppts.filter((_, j) => j !== idxMppt) : inv.mppts } : inv
      )
    );
  }

  function handleImagem(e: ChangeEvent<HTMLInputElement>) {
    setImagemPlaquinha(e.target.files?.[0] ?? null);
  }

  function validar(): string[] {
    const lista: string[] = [];
    const pe = padraoEntrada;
    if (!campoValido(pe.ramalLigacao)) lista.push("Padrão de entrada: informe o ramal de ligação.");
    if (!numeroValido(pe.correnteDisjuntorPadraoA)) lista.push("Padrão de entrada: corrente do disjuntor do padrão inválida.");
    if (!campoValido(pe.caboPadraoAteDistribuicao)) lista.push("Padrão de entrada: informe o cabo até o quadro de distribuição.");
    if (!numeroValido(pe.correnteDisjuntorDistribuicaoA)) lista.push("Quadro de distribuição: corrente do disjuntor inválida.");
    if (!campoValido(pe.especificacaoDpsCa)) lista.push("Informe a especificação do DPS CA.");
    if (!campoValido(pe.caboDistribuicaoAteProtecaoCa)) lista.push("Informe o cabo até o quadro de proteção CA.");
    if (!numeroValido(pe.correnteDisjuntorProtecaoCaA)) lista.push("Quadro de proteção CA: corrente do disjuntor inválida.");
    if (!campoValido(pe.caboProtecaoCaAteInversor)) lista.push("Informe o cabo entre a proteção CA e o(s) inversor(es).");
    if (cargaInstaladaKw && !numeroValido(cargaInstaladaKw, true)) lista.push("Carga instalada: valor inválido.");

    if (inversores.length === 0) lista.push("Adicione pelo menos 1 inversor.");
    inversores.forEach((inv, i) => {
      const n = i + 1;
      if (!campoValido(inv.modelo)) lista.push(`Inversor ${n}: informe o modelo.`);
      if (!numeroValido(inv.potenciaW)) lista.push(`Inversor ${n}: potência inválida.`);
      if (!numeroValido(inv.tensaoEntradaMinV, true)) lista.push(`Inversor ${n}: tensão de entrada mínima inválida.`);
      if (!numeroValido(inv.tensaoEntradaMaxV)) lista.push(`Inversor ${n}: tensão de entrada máxima inválida.`);
      if (!numeroValido(inv.tensaoMaxCcV)) lista.push(`Inversor ${n}: tensão CC máxima admissível inválida.`);
      if (!numeroValido(inv.correnteMaxPorMpptA)) lista.push(`Inversor ${n}: corrente máxima por MPPT inválida.`);
      if (!numeroValido(inv.tensaoSaidaV)) lista.push(`Inversor ${n}: tensão de saída inválida.`);
      if (!numeroValido(inv.correnteSaidaA)) lista.push(`Inversor ${n}: corrente de saída inválida.`);
      if (!numeroValido(inv.correnteDisjuntorSaidaA)) lista.push(`Inversor ${n}: corrente do disjuntor de saída inválida.`);
      if (!campoValido(inv.caboCcMm2)) lista.push(`Inversor ${n}: informe a bitola do cabo CC.`);
      if (!campoValido(inv.especificacaoDpsCc)) lista.push(`Inversor ${n}: informe a especificação do DPS CC.`);
      if (inv.mppts.length === 0) lista.push(`Inversor ${n}: adicione pelo menos 1 MPPT.`);
      inv.mppts.forEach((m, j) => {
        const mn = j + 1;
        if (!numeroValido(m.numeroStrings)) lista.push(`Inversor ${n}, MPPT ${mn}: número de strings inválido.`);
        if (!numeroValido(m.modulosPorString)) lista.push(`Inversor ${n}, MPPT ${mn}: módulos por string inválido.`);
        if (!numeroValido(m.correnteProtecaoCcA)) lista.push(`Inversor ${n}, MPPT ${mn}: corrente da proteção CC inválida.`);
      });
    });

    if (!campoValido(modulo.marca)) lista.push("Módulo fotovoltaico: informe a marca.");
    if (!campoValido(modulo.modelo)) lista.push("Módulo fotovoltaico: informe o modelo.");
    if (!numeroValido(modulo.potenciaWp)) lista.push("Módulo fotovoltaico: potência (Wp) inválida.");
    if (!numeroValido(modulo.vmp)) lista.push("Módulo fotovoltaico: tensão Vmp inválida.");
    if (!numeroValido(modulo.voc)) lista.push("Módulo fotovoltaico: tensão Voc inválida.");
    if (!numeroValido(modulo.imp)) lista.push("Módulo fotovoltaico: corrente Imp inválida.");
    if (!numeroValido(modulo.eficiencia)) lista.push("Módulo fotovoltaico: eficiência inválida.");

    return lista;
  }

  function montarDados(): DadosDiagramaFv {
    const pe = padraoEntrada;
    return {
      padraoEntrada: {
        tipoRede: pe.tipoRede,
        ramalLigacao: pe.ramalLigacao.trim(),
        correnteDisjuntorPadraoA: numero(pe.correnteDisjuntorPadraoA),
        caboPadraoAteDistribuicao: pe.caboPadraoAteDistribuicao.trim(),
        correnteDisjuntorDistribuicaoA: numero(pe.correnteDisjuntorDistribuicaoA),
        especificacaoDpsCa: pe.especificacaoDpsCa.trim(),
        caboDistribuicaoAteProtecaoCa: pe.caboDistribuicaoAteProtecaoCa.trim(),
        correnteDisjuntorProtecaoCaA: numero(pe.correnteDisjuntorProtecaoCaA),
        caboProtecaoCaAteInversor: pe.caboProtecaoCaAteInversor.trim(),
      },
      cargaInstaladaKw: cargaInstaladaKw ? numero(cargaInstaladaKw) : undefined,
      inversores: inversores.map(
        (inv): DadosDiagramaFvInversor => ({
          modelo: inv.modelo.trim(),
          potenciaW: numero(inv.potenciaW),
          tensaoEntradaMinV: numero(inv.tensaoEntradaMinV),
          tensaoEntradaMaxV: numero(inv.tensaoEntradaMaxV),
          tensaoMaxCcV: numero(inv.tensaoMaxCcV),
          correnteMaxPorMpptA: numero(inv.correnteMaxPorMpptA),
          tensaoSaidaV: numero(inv.tensaoSaidaV),
          correnteSaidaA: numero(inv.correnteSaidaA),
          correnteDisjuntorSaidaA: numero(inv.correnteDisjuntorSaidaA),
          caboCcMm2: inv.caboCcMm2.trim(),
          especificacaoDpsCc: inv.especificacaoDpsCc.trim(),
          mppts: inv.mppts.map(
            (m): DadosDiagramaFvMppt => ({
              numeroStrings: numero(m.numeroStrings),
              modulosPorString: numero(m.modulosPorString),
              correnteProtecaoCcA: numero(m.correnteProtecaoCcA),
            })
          ),
        })
      ),
      modulo: {
        marca: modulo.marca.trim(),
        modelo: modulo.modelo.trim(),
        potenciaWp: numero(modulo.potenciaWp),
        vmp: numero(modulo.vmp),
        voc: numero(modulo.voc),
        imp: numero(modulo.imp),
        eficiencia: numero(modulo.eficiencia),
      },
      // Iteração 18: já sabemos aqui (síncrono, antes de gerar) se o
      // usuário selecionou uma foto no campo de upload -- passa adiante
      // pro gerador decidir entre desenhar o esquema representativo
      // (`padrao_entrada_detalhe`) ou deixar o espaço livre pra foto real
      // que este mesmo componente encaixa logo abaixo, em `handleGerar`.
      temFotoPadraoEntrada: !!imagemPlaquinha,
    };
  }

  async function handleGerar() {
    const problemas = validar();
    if (problemas.length > 0) {
      setErros(problemas);
      return;
    }
    setErros([]);
    setGerando(true);
    try {
      const dados = montarDados();
      const { boxPadraoEntradaRepresentativo: box, boxDetalhePlaca } = gerarDiagramaFotovoltaico(dados);

      // Iteração 46 -- pedido do usuário: trocar o desenho vetorial da
      // placa de advertência pela imagem padrão real ("ja deixe tambem o
      // campo da placa com essa imagem padrao"), inserida SEMPRE
      // automaticamente (ao contrário da foto do padrão de entrada
      // abaixo, que é opcional e varia por projeto) -- ver
      // `lib/placaAdvertenciaPadrao.ts`.
      try {
        const blobPlaca = await dataUrlParaBlob(PLACA_ADVERTENCIA_PADRAO_DATA_URL);
        const objectUrlTempPlaca = URL.createObjectURL(blobPlaca);
        const dimsPlaca = await medirImagem(objectUrlTempPlaca);
        URL.revokeObjectURL(objectUrlTempPlaca);

        const escalaPlaca = Math.min(boxDetalhePlaca.largura / dimsPlaca.width, boxDetalhePlaca.altura / dimsPlaca.height);
        const xPlaca = boxDetalhePlaca.x + (boxDetalhePlaca.largura - dimsPlaca.width * escalaPlaca) / 2;
        const yPlaca = boxDetalhePlaca.y + (boxDetalhePlaca.altura - dimsPlaca.height * escalaPlaca) / 2;

        const objectUrlPlaca = URL.createObjectURL(blobPlaca);
        const idPlaca = addXref({
          nome_arquivo: "placa-advertencia-padrao.jpg",
          tipo: "imagem",
          x: xPlaca,
          y: yPlaca,
          escala: Number(escalaPlaca.toFixed(4)),
          largura_px: dimsPlaca.width,
          altura_px: dimsPlaca.height,
          objectUrl: objectUrlPlaca,
        });
        await saveXrefBlob(idPlaca, blobPlaca);
      } catch (err) {
        setErros([
          `O diagrama foi gerado, mas houve uma falha ao inserir a imagem padrão da placa de advertência: ${
            err instanceof Error ? err.message : String(err)
          }. Você pode importar ela manualmente pelo painel de XREF.`,
        ]);
        setGerando(false);
        return;
      }

      if (imagemPlaquinha) {
        try {
          const objectUrlTemp = URL.createObjectURL(imagemPlaquinha);
          const dims = await medirImagem(objectUrlTemp);
          URL.revokeObjectURL(objectUrlTemp);

          // Encaixa a foto inteira dentro do retângulo reservado, sem
          // distorcer (fit-and-contain, mesma lógica de "caber sem
          // esticar" usada em qualquer redimensionamento uniforme deste
          // app -- ver Iteração 12u para o precedente).
          const escala = Math.min(box.largura / dims.width, box.altura / dims.height);
          const xCentralizado = box.x + (box.largura - dims.width * escala) / 2;
          const yCentralizado = box.y + (box.altura - dims.height * escala) / 2;

          const objectUrl = URL.createObjectURL(imagemPlaquinha);
          const id = addXref({
            nome_arquivo: imagemPlaquinha.name,
            tipo: "imagem",
            x: xCentralizado,
            y: yCentralizado,
            escala: Number(escala.toFixed(4)),
            largura_px: dims.width,
            altura_px: dims.height,
            objectUrl,
          });
          await saveXrefBlob(id, imagemPlaquinha);
        } catch (err) {
          setErros([
            `O diagrama foi gerado, mas houve uma falha ao importar a foto do padrão de entrada: ${
              err instanceof Error ? err.message : String(err)
            }. Você pode importar ela manualmente pelo painel de XREF.`,
          ]);
          setGerando(false);
          return;
        }
      }

      onFechar();
    } finally {
      setGerando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-[1px]">
      <div className="flex max-h-[92vh] w-[50rem] flex-col overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">⚡ Gerar diagrama unifilar fotovoltaico</h2>
            <p className="text-[11px] text-slate-500">
              Preencha na ordem do diagrama: padrão de entrada → inversor(es) → placas. Todo texto gerado continua
              editável depois, direto no desenho.
            </p>
          </div>
          <button
            type="button"
            onClick={onFechar}
            className="shrink-0 rounded px-2 py-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            title="Fechar sem gerar"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {/* 1) PADRÃO DE ENTRADA ------------------------------------------ */}
          <h3 className={SUBTITULO}>1. Padrão de entrada</h3>
          <div className="grid grid-cols-2 gap-2" data-testid="campos-padrao-entrada">
            <label className="flex flex-col gap-0.5">
              <span className={LABEL}>Tipo de rede</span>
              <select
                value={padraoEntrada.tipoRede}
                onChange={(e) => atualizarPadrao("tipoRede", e.target.value as TipoRedeFv)}
                className={INPUT}
              >
                <option value="monofasico">Monofásico</option>
                <option value="bifasico">Bifásico</option>
                <option value="trifasico">Trifásico</option>
              </select>
            </label>
            <Campo
              label="Ramal de ligação (fios da concessionária)"
              value={padraoEntrada.ramalLigacao}
              onChange={(v) => atualizarPadrao("ramalLigacao", v)}
            />
            <Campo
              label="Corrente do disjuntor do padrão (A)"
              value={padraoEntrada.correnteDisjuntorPadraoA}
              onChange={(v) => atualizarPadrao("correnteDisjuntorPadraoA", v)}
            />
            <Campo
              label="Cabo: padrão de medição → quadro de distribuição"
              value={padraoEntrada.caboPadraoAteDistribuicao}
              onChange={(v) => atualizarPadrao("caboPadraoAteDistribuicao", v)}
            />
            <Campo
              label="Corrente do disjuntor do quadro de distribuição (A)"
              value={padraoEntrada.correnteDisjuntorDistribuicaoA}
              onChange={(v) => atualizarPadrao("correnteDisjuntorDistribuicaoA", v)}
            />
            <Campo
              label="Carga instalada (kW) -- opcional"
              value={cargaInstaladaKw}
              onChange={setCargaInstaladaKw}
            />
            <Campo
              label="Cabo: quadro de distribuição → quadro de proteção CA"
              value={padraoEntrada.caboDistribuicaoAteProtecaoCa}
              onChange={(v) => atualizarPadrao("caboDistribuicaoAteProtecaoCa", v)}
            />
            <Campo
              label="Corrente do disjuntor do quadro de proteção CA (A)"
              value={padraoEntrada.correnteDisjuntorProtecaoCaA}
              onChange={(v) => atualizarPadrao("correnteDisjuntorProtecaoCaA", v)}
            />
            <Campo
              label="Especificação do DPS CA (distribuição e proteção CA)"
              value={padraoEntrada.especificacaoDpsCa}
              onChange={(v) => atualizarPadrao("especificacaoDpsCa", v)}
              textarea
            />
            <Campo
              label="Cabo: quadro de proteção CA → inversor(es) (conforme datasheet)"
              value={padraoEntrada.caboProtecaoCaAteInversor}
              onChange={(v) => atualizarPadrao("caboProtecaoCaAteInversor", v)}
            />
          </div>

          <label className="mt-3 flex flex-col gap-0.5">
            <span className={LABEL}>Foto real do padrão de entrada (a &quot;plaquinha&quot;) -- opcional</span>
            <input type="file" accept="image/*" onChange={handleImagem} className="text-[11px]" />
            <span className="text-[9px] text-slate-400">
              Se anexada, entra automaticamente encaixada no quadro &quot;PADRÃO DE ENTRADA REPRESENTATIVO&quot; do
              diagrama gerado. Pode ser trocada depois pelo painel de XREF, como qualquer imagem importada.
            </span>
          </label>

          {/* 2) INVERSOR(ES) ------------------------------------------------ */}
          <h3 className={SUBTITULO}>2. Inversor(es)</h3>
          <div className="flex flex-col gap-3">
            {inversores.map((inv, idxInv) => (
              <div key={idxInv} className="rounded-md border border-slate-200 p-2">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-slate-600">Inversor {idxInv + 1}</span>
                  {inversores.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removerInversor(idxInv)}
                      className="text-[10px] text-red-500 hover:text-red-700"
                    >
                      ✕ remover inversor
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Campo label="Modelo" value={inv.modelo} onChange={(v) => atualizarInversor(idxInv, "modelo", v)} placeholder="ex.: FOXESS (F6000-G2)" />
                  <Campo label="Potência (W)" value={inv.potenciaW} onChange={(v) => atualizarInversor(idxInv, "potenciaW", v)} />
                  <Campo
                    label="Tensão de entrada mínima (V)"
                    value={inv.tensaoEntradaMinV}
                    onChange={(v) => atualizarInversor(idxInv, "tensaoEntradaMinV", v)}
                  />
                  <Campo
                    label="Tensão de entrada máxima -- faixa MPPT (V)"
                    value={inv.tensaoEntradaMaxV}
                    onChange={(v) => atualizarInversor(idxInv, "tensaoEntradaMaxV", v)}
                  />
                  <Campo
                    label="Tensão CC máxima admissível / Voc (V)"
                    value={inv.tensaoMaxCcV}
                    onChange={(v) => atualizarInversor(idxInv, "tensaoMaxCcV", v)}
                    hint="Tensão máxima de curto-circuito suportada pelo inversor"
                  />
                  <Campo
                    label="Corrente máxima por MPPT (A)"
                    value={inv.correnteMaxPorMpptA}
                    onChange={(v) => atualizarInversor(idxInv, "correnteMaxPorMpptA", v)}
                  />
                  <Campo label="Tensão de saída (V)" value={inv.tensaoSaidaV} onChange={(v) => atualizarInversor(idxInv, "tensaoSaidaV", v)} />
                  <Campo label="Corrente de saída (A)" value={inv.correnteSaidaA} onChange={(v) => atualizarInversor(idxInv, "correnteSaidaA", v)} />
                  <Campo
                    label="Corrente do disjuntor de saída deste inversor (A)"
                    value={inv.correnteDisjuntorSaidaA}
                    onChange={(v) => atualizarInversor(idxInv, "correnteDisjuntorSaidaA", v)}
                    hint="Disjuntor individual deste inversor, entre ele e o barramento CA compartilhado"
                  />
                  <Campo
                    label="Bitola do cabo CC (positivo/negativo/proteção)"
                    value={inv.caboCcMm2}
                    onChange={(v) => atualizarInversor(idxInv, "caboCcMm2", v)}
                    hint="Conforme datasheet do inversor/módulo"
                  />
                  <Campo
                    label="Especificação do DPS CC"
                    value={inv.especificacaoDpsCc}
                    onChange={(v) => atualizarInversor(idxInv, "especificacaoDpsCc", v)}
                    textarea
                  />
                </div>

                <div className="mt-2">
                  <span className="text-[10px] font-medium text-slate-500">MPPTs deste inversor</span>
                  <div className="mt-1 flex flex-col gap-1.5">
                    {inv.mppts.map((m, idxM) => {
                      const dica =
                        modulo.imp && numeroValido(modulo.imp) && numeroValido(m.numeroStrings)
                          ? `sugestão: ~${estimarCorrenteFusivel(numero(modulo.imp), numero(m.numeroStrings))}A (confirme)`
                          : undefined;
                      return (
                        <div key={idxM} className="grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-1.5 rounded border border-slate-100 bg-slate-50 p-1.5">
                          <Campo
                            label={`MPPT ${idxM + 1} -- strings`}
                            value={m.numeroStrings}
                            onChange={(v) => atualizarMppt(idxInv, idxM, "numeroStrings", v)}
                          />
                          <Campo
                            label="Módulos/string"
                            value={m.modulosPorString}
                            onChange={(v) => atualizarMppt(idxInv, idxM, "modulosPorString", v)}
                          />
                          <Campo
                            label="Proteção CC (A)"
                            value={m.correnteProtecaoCcA}
                            onChange={(v) => atualizarMppt(idxInv, idxM, "correnteProtecaoCcA", v)}
                            placeholder={dica}
                          />
                          {inv.mppts.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removerMppt(idxInv, idxM)}
                              className="mb-1 text-[10px] text-red-500 hover:text-red-700"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() => adicionarMppt(idxInv)}
                    className="mt-1.5 rounded border border-dashed border-slate-300 px-2 py-0.5 text-[10px] text-slate-500 hover:border-blue-400 hover:text-blue-700"
                  >
                    + Adicionar MPPT
                  </button>
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={adicionarInversor}
            className="mt-2 w-full rounded-lg border border-dashed border-slate-300 bg-slate-50 px-2 py-1.5 text-xs font-medium text-slate-600 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700"
          >
            + Adicionar inversor
          </button>

          {/* 3) MÓDULOS FOTOVOLTAICOS ---------------------------------------- */}
          <h3 className={SUBTITULO}>3. Placas fotovoltaicas</h3>
          <p className="mb-2 text-[10px] text-slate-400">Um único modelo de módulo, usado no projeto inteiro (mesmo padrão dos diagramas de referência).</p>
          <div className="grid grid-cols-2 gap-2" data-testid="campos-modulo">
            <Campo label="Marca" value={modulo.marca} onChange={(v) => setModulo((m) => ({ ...m, marca: v }))} placeholder="ex.: JINKO" />
            <Campo label="Modelo" value={modulo.modelo} onChange={(v) => setModulo((m) => ({ ...m, modelo: v }))} placeholder="ex.: 66HL4M-BDV-630" />
            <Campo label="Potência (Wp)" value={modulo.potenciaWp} onChange={(v) => setModulo((m) => ({ ...m, potenciaWp: v }))} />
            <Campo label="Tensão nominal Vmp (V)" value={modulo.vmp} onChange={(v) => setModulo((m) => ({ ...m, vmp: v }))} />
            <Campo label="Tensão de circuito aberto Voc (V)" value={modulo.voc} onChange={(v) => setModulo((m) => ({ ...m, voc: v }))} />
            <Campo label="Corrente Imp (A)" value={modulo.imp} onChange={(v) => setModulo((m) => ({ ...m, imp: v }))} />
            <Campo label="Eficiência (%)" value={modulo.eficiencia} onChange={(v) => setModulo((m) => ({ ...m, eficiencia: v }))} />
          </div>

          {erros.length > 0 && (
            <div className="mt-4 rounded border border-red-200 bg-red-50 p-2 text-[11px] text-red-700">
              <p className="mb-1 font-medium">Corrija antes de gerar:</p>
              <ul className="list-inside list-disc space-y-0.5">
                {erros.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-3">
          <button
            type="button"
            onClick={onFechar}
            disabled={gerando}
            className="rounded border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleGerar}
            disabled={gerando}
            className="rounded bg-amber-500 px-4 py-1.5 text-xs font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
          >
            {gerando ? "Gerando..." : "⚡ Gerar diagrama"}
          </button>
        </div>
      </div>
    </div>
  );
}
