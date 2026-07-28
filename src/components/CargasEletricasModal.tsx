"use client";

/**
 * CargasEletricasModal.tsx
 * -----------------------------------------------------------------------
 * Iteração 30 -- modal do "Dimensionamento de cargas elétricas (NBR
 * 5410)": ambientes → tomadas/lâmpadas → TUEs → circuitos + tabela +
 * diagrama do QDC gerados automaticamente.
 *
 * Iteração 31 -- melhorias pedidas pelo usuário após o primeiro uso real:
 *  1. Campo "Qtd. de lâmpadas" por ambiente (entra na tabela de cargas e
 *     na lista de material -- a CARGA de iluminação segue a mínima
 *     normativa por área).
 *  2. TUE agora tem CATEGORIA (chuveiro/aquecimento, ar-condicionado,
 *     outro) -- é ela que define qual tabela de fator de demanda se
 *     aplica no cálculo do disjuntor geral (ver `lib/cargasEletricas.ts`).
 *  3. Ar-condicionado ficou fácil: o usuário escolhe os BTUs e o tipo
 *     (split convencional x inverter) e a POTÊNCIA JÁ VEM PREENCHIDA
 *     (`OPCOES_BTU_AR_CONDICIONADO` -- valores típicos, editáveis), já
 *     que nem todo mundo sabe a potência real por BTUs, e split e
 *     inverter são diferentes.
 *  4. Fatores de demanda POR CATEGORIA no lugar do fator geral único --
 *     3 campos opcionais (em branco = tabela automática da concessionária).
 *  5. REABRIR PRA AJUSTAR sem redigitar: a última entrada fica salva no
 *     projeto (`projeto.dadosCargasEletricas`, ver `store.ts`) e o modal
 *     reabre já preenchido; na tela de sucesso há um botão "← Voltar e
 *     ajustar" que volta ao formulário mantendo tudo.
 * -----------------------------------------------------------------------
 */

import { useState } from "react";
import { useCadStore } from "@/lib/store";
import {
  OPCOES_BTU_AR_CONDICIONADO,
  ROTULO_CATEGORIA_TUE,
  ROTULO_TIPO_AMBIENTE,
  type AmbienteInput,
  type CategoriaTue,
  type DadosCargasEletricas,
  type ResumoCargasEletricas,
  type TipoAmbiente,
  type TueInput,
} from "@/lib/cargasEletricas";

interface CargasEletricasModalProps {
  onFechar: () => void;
}

const LABEL = "text-[10px] font-medium text-slate-500";
const INPUT = "w-full rounded border border-slate-200 px-1.5 py-1 text-[11px] text-slate-800";
const SUBTITULO = "mb-2 mt-4 text-[11px] font-semibold uppercase tracking-wide text-slate-500";

function Campo({
  label,
  value,
  onChange,
  placeholder,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className={LABEL}>{label}</span>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={INPUT} />
      {hint && <span className="text-[9px] text-slate-400">{hint}</span>}
    </label>
  );
}

function numero(v: string): number {
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

/** Formata um número pra string de formulário no padrão pt-BR (vírgula decimal). */
function paraCampo(n: number | undefined): string {
  if (n === undefined || !Number.isFinite(n)) return "";
  return String(n).replace(".", ",");
}

interface FormTue {
  nome: string;
  categoria: CategoriaTue;
  potenciaW: string;
  tensaoV: string;
  trifasico: boolean;
  /** Só quando categoria === "ar_condicionado": BTUs escolhidos ("" = não escolhido ainda). */
  btus: string;
  /** Só quando categoria === "ar_condicionado": split convencional x inverter. */
  tipoAr: "split" | "inverter";
}

interface FormAmbiente {
  nome: string;
  tipo: TipoAmbiente;
  areaM2: string;
  quantidadeTomadas: string;
  quantidadeLampadas: string;
  tues: FormTue[];
}

function novoTue(): FormTue {
  return { nome: "", categoria: "outro", potenciaW: "", tensaoV: "220", trifasico: false, btus: "", tipoAr: "inverter" };
}

function novoAmbiente(nome: string, tipo: TipoAmbiente, areaM2 = "", quantidadeTomadas = "", quantidadeLampadas = "1"): FormAmbiente {
  return { nome, tipo, areaM2, quantidadeTomadas, quantidadeLampadas, tues: [] };
}

/** Converte a última entrada salva no projeto (Iteração 31) de volta pro estado do formulário. */
function dadosParaForm(dados: DadosCargasEletricas): FormAmbiente[] {
  return dados.ambientes.map((a) => ({
    nome: a.nome,
    tipo: a.tipo,
    areaM2: paraCampo(a.areaM2),
    quantidadeTomadas: paraCampo(a.quantidadeTomadas),
    quantidadeLampadas: paraCampo(a.quantidadeLampadas ?? 1),
    tues: a.tues.map((t): FormTue => ({
      nome: t.nome,
      categoria: t.categoria ?? "outro",
      potenciaW: paraCampo(t.potenciaW),
      tensaoV: paraCampo(t.tensaoV),
      trifasico: t.trifasico ?? false,
      btus: "",
      tipoAr: "inverter",
    })),
  }));
}

const TIPOS_AMBIENTE_ORDENADOS: TipoAmbiente[] = [
  "sala",
  "quarto",
  "cozinha",
  "area_servico",
  "banheiro",
  "varanda",
  "corredor",
  "garagem",
  "escritorio",
  "outro",
];

const CATEGORIAS_TUE_ORDENADAS: CategoriaTue[] = ["chuveiro", "ar_condicionado", "outro"];

export function CargasEletricasModal({ onFechar }: CargasEletricasModalProps) {
  const gerarDimensionamentoCargas = useCadStore((s) => s.gerarDimensionamentoCargas);
  // Iteração 31 -- última entrada salva junto do projeto: reabrir o modal
  // já preenchido pra só ajustar/acrescentar, sem redigitar tudo.
  const dadosSalvos = useCadStore((s) => s.projeto.dadosCargasEletricas);

  const [ambientes, setAmbientes] = useState<FormAmbiente[]>(() =>
    dadosSalvos
      ? dadosParaForm(dadosSalvos)
      : [
          novoAmbiente("Sala", "sala", "20", "4", "2"),
          novoAmbiente("Quarto 1", "quarto", "12", "3", "1"),
          novoAmbiente("Cozinha", "cozinha", "10", "6", "2"),
          novoAmbiente("Banheiro", "banheiro", "4", "1", "1"),
        ]
  );

  const [tensaoFaseV, setTensaoFaseV] = useState(() => (dadosSalvos ? paraCampo(dadosSalvos.config.tensaoFaseV) : "127"));
  const [tensaoEntradaV, setTensaoEntradaV] = useState(() => (dadosSalvos ? paraCampo(dadosSalvos.config.tensaoEntradaV) : "220"));
  const [numeroFases, setNumeroFases] = useState<"1" | "2" | "3">(() =>
    dadosSalvos ? (String(dadosSalvos.config.numeroFases) as "1" | "2" | "3") : "2"
  );
  const [fatorPotencia, setFatorPotencia] = useState(() => (dadosSalvos ? paraCampo(dadosSalvos.config.fatorPotencia) : "0,92"));
  // Iteração 31 -- overrides opcionais dos fatores de demanda POR
  // CATEGORIA ("" = automático pela tabela da concessionária).
  const [fdIlumTug, setFdIlumTug] = useState(() => paraCampo(dadosSalvos?.config.fatorDemandaIlumTug));
  const [fdChuveiro, setFdChuveiro] = useState(() => paraCampo(dadosSalvos?.config.fatorDemandaChuveiro));
  const [fdArCond, setFdArCond] = useState(() => paraCampo(dadosSalvos?.config.fatorDemandaArCondicionado));
  const [compCircuito, setCompCircuito] = useState(() => paraCampo(dadosSalvos?.config.comprimentoMedioCircuitoM ?? 25));

  const [erros, setErros] = useState<string[]>([]);
  const [gerando, setGerando] = useState(false);
  const [resumo, setResumo] = useState<ResumoCargasEletricas | null>(null);

  function atualizarAmbiente<K extends keyof FormAmbiente>(idx: number, campo: K, valor: FormAmbiente[K]) {
    setAmbientes((lista) => lista.map((a, i) => (i === idx ? { ...a, [campo]: valor } : a)));
  }
  function adicionarAmbiente() {
    setAmbientes((lista) => [...lista, novoAmbiente(`Ambiente ${lista.length + 1}`, "outro")]);
  }
  function removerAmbiente(idx: number) {
    setAmbientes((lista) => (lista.length > 1 ? lista.filter((_, i) => i !== idx) : lista));
  }

  function atualizarTue(idxAmbiente: number, idxTue: number, patch: Partial<FormTue>) {
    setAmbientes((lista) =>
      lista.map((a, i) =>
        i !== idxAmbiente ? a : { ...a, tues: a.tues.map((t, j) => (j === idxTue ? { ...t, ...patch } : t)) }
      )
    );
  }
  function adicionarTue(idxAmbiente: number) {
    setAmbientes((lista) => lista.map((a, i) => (i === idxAmbiente ? { ...a, tues: [...a.tues, novoTue()] } : a)));
  }
  function removerTue(idxAmbiente: number, idxTue: number) {
    setAmbientes((lista) =>
      lista.map((a, i) => (i === idxAmbiente ? { ...a, tues: a.tues.filter((_, j) => j !== idxTue) } : a))
    );
  }

  /**
   * Troca de categoria de um TUE -- pré-preenche nome/potência/tensão com
   * valores típicos quando os campos ainda estão vazios (nunca sobrescreve
   * o que o usuário já digitou).
   */
  function trocarCategoriaTue(idxAmbiente: number, idxTue: number, categoria: CategoriaTue, tueAtual: FormTue) {
    const patch: Partial<FormTue> = { categoria };
    if (categoria === "chuveiro") {
      if (!tueAtual.nome.trim()) patch.nome = "Chuveiro elétrico";
      if (!tueAtual.potenciaW.trim()) patch.potenciaW = "5500";
      if (!tueAtual.tensaoV.trim() || tueAtual.tensaoV === "127") patch.tensaoV = "220";
    } else if (categoria === "ar_condicionado") {
      if (!tueAtual.nome.trim()) patch.nome = "Ar-condicionado";
      // A potência vem da escolha de BTUs (abaixo) -- não chuta aqui.
    }
    atualizarTue(idxAmbiente, idxTue, patch);
  }

  /** Escolha de BTUs/tipo do ar-condicionado -- preenche a potência automaticamente (sempre, é o propósito do seletor). */
  function aplicarBtus(idxAmbiente: number, idxTue: number, btus: string, tipoAr: "split" | "inverter", tueAtual: FormTue) {
    const patch: Partial<FormTue> = { btus, tipoAr };
    const opcao = OPCOES_BTU_AR_CONDICIONADO.find((o) => String(o.btus) === btus);
    if (opcao) {
      patch.potenciaW = String(tipoAr === "split" ? opcao.splitW : opcao.inverterW);
      if (!tueAtual.nome.trim() || /^Ar-condicionado/.test(tueAtual.nome)) {
        patch.nome = `Ar-condicionado ${Number(btus).toLocaleString("pt-BR")} BTUs (${tipoAr === "split" ? "split" : "inverter"})`;
      }
    }
    atualizarTue(idxAmbiente, idxTue, patch);
  }

  function validar(): string[] {
    const lista: string[] = [];
    if (ambientes.length === 0) lista.push("Adicione ao menos 1 ambiente.");
    ambientes.forEach((a) => {
      if (!a.nome.trim()) lista.push("Todo ambiente precisa de um nome.");
      if (!(numero(a.areaM2) > 0)) lista.push(`Ambiente "${a.nome || "sem nome"}": informe uma área (m²) maior que zero.`);
      if (!(numero(a.quantidadeTomadas) >= 0)) lista.push(`Ambiente "${a.nome || "sem nome"}": quantidade de tomadas inválida.`);
      if (!(numero(a.quantidadeLampadas) >= 1))
        lista.push(`Ambiente "${a.nome || "sem nome"}": informe ao menos 1 lâmpada (todo cômodo precisa de um ponto de iluminação).`);
      a.tues.forEach((t) => {
        if (!t.nome.trim()) lista.push(`Ambiente "${a.nome}": todo equipamento (TUE) precisa de um nome.`);
        if (!(numero(t.potenciaW) > 0))
          lista.push(
            t.categoria === "ar_condicionado"
              ? `Ambiente "${a.nome}", equipamento "${t.nome || "sem nome"}": escolha os BTUs (a potência preenche sozinha) ou informe a potência (W).`
              : `Ambiente "${a.nome}", equipamento "${t.nome || "sem nome"}": informe a potência (W), maior que zero.`
          );
        if (!(numero(t.tensaoV) > 0)) lista.push(`Ambiente "${a.nome}", equipamento "${t.nome || "sem nome"}": informe a tensão (V), maior que zero.`);
      });
    });
    if (!(numero(tensaoFaseV) > 0)) lista.push("Informe a tensão de fase (V), maior que zero.");
    if (!(numero(tensaoEntradaV) > 0)) lista.push("Informe a tensão de entrada (V), maior que zero.");
    const fp = numero(fatorPotencia);
    if (!(fp > 0 && fp <= 1)) lista.push("Fator de potência deve ser maior que zero e no máximo 1 (ex.: 0,92).");
    for (const [rotulo, valor] of [
      ["iluminação + TUG", fdIlumTug],
      ["chuveiros/aquecimento", fdChuveiro],
      ["ar-condicionado", fdArCond],
    ] as const) {
      if (valor.trim() !== "") {
        const fd = numero(valor);
        if (!(fd > 0 && fd <= 1)) lista.push(`Fator de demanda de ${rotulo}: deixe em branco (tabela automática) ou informe um valor entre 0 e 1.`);
      }
    }
    if (compCircuito.trim() !== "" && !(numero(compCircuito) > 0)) {
      lista.push("Comprimento médio por circuito (m): deixe em branco (25m) ou informe um valor maior que zero.");
    }
    return lista;
  }

  function handleGerar() {
    const problemas = validar();
    if (problemas.length > 0) {
      setErros(problemas);
      return;
    }
    setErros([]);
    setGerando(true);
    try {
      // Campos opcionais entram por spread condicional -- chave AUSENTE, e
      // não `undefined` (o Firestore rejeita `undefined` ao salvar o
      // projeto, e `dadosCargasEletricas` agora é persistido nele).
      const dados: DadosCargasEletricas = {
        ambientes: ambientes.map(
          (a): AmbienteInput => ({
            nome: a.nome.trim(),
            tipo: a.tipo,
            areaM2: numero(a.areaM2),
            quantidadeTomadas: numero(a.quantidadeTomadas),
            quantidadeLampadas: numero(a.quantidadeLampadas),
            tues: a.tues.map(
              (t): TueInput => ({
                nome: t.nome.trim(),
                potenciaW: numero(t.potenciaW),
                tensaoV: numero(t.tensaoV),
                categoria: t.categoria,
                trifasico: t.trifasico,
              })
            ),
          })
        ),
        config: {
          tensaoFaseV: numero(tensaoFaseV),
          tensaoEntradaV: numero(tensaoEntradaV),
          numeroFases: Number(numeroFases) as 1 | 2 | 3,
          fatorPotencia: numero(fatorPotencia),
          ...(fdIlumTug.trim() !== "" ? { fatorDemandaIlumTug: numero(fdIlumTug) } : {}),
          ...(fdChuveiro.trim() !== "" ? { fatorDemandaChuveiro: numero(fdChuveiro) } : {}),
          ...(fdArCond.trim() !== "" ? { fatorDemandaArCondicionado: numero(fdArCond) } : {}),
          ...(compCircuito.trim() !== "" ? { comprimentoMedioCircuitoM: numero(compCircuito) } : {}),
        },
      };
      const res = gerarDimensionamentoCargas(dados);
      setResumo(res);
    } catch (err) {
      setErros([err instanceof Error ? err.message : String(err)]);
    } finally {
      setGerando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-[1px]">
      <div className="flex max-h-[92vh] w-[58rem] flex-col overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">🔌 Dimensionamento de cargas elétricas (NBR 5410)</h2>
            <p className="text-[11px] text-slate-500">
              Informe os ambientes da casa (tomadas, lâmpadas e equipamentos de uso específico) -- o gerador calcula a
              carga, monta os circuitos com fatores de demanda por categoria, desenha a tabela de cargas, a lista de
              material preliminar e o diagrama unifilar do QDC.
              {dadosSalvos && " Formulário recuperado da última geração -- ajuste só o que precisar."}
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
          {!resumo ? (
            <>
              <h3 className={SUBTITULO}>1. Ambientes, tomadas, lâmpadas e equipamentos de uso específico (TUE)</h3>
              <div className="flex flex-col gap-2" data-testid="campos-ambientes-cargas">
                {ambientes.map((amb, idxAmbiente) => (
                  <div key={idxAmbiente} className="rounded border border-slate-200 p-2">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-slate-600">Ambiente {idxAmbiente + 1}</span>
                      {ambientes.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removerAmbiente(idxAmbiente)}
                          className="text-[10px] text-red-500 hover:underline"
                        >
                          ✕ remover ambiente
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-5 gap-2">
                      <Campo label="Nome" value={amb.nome} onChange={(v) => atualizarAmbiente(idxAmbiente, "nome", v)} placeholder="ex.: Quarto 1" />
                      <label className="flex flex-col gap-0.5">
                        <span className={LABEL}>Tipo</span>
                        <select
                          value={amb.tipo}
                          onChange={(e) => atualizarAmbiente(idxAmbiente, "tipo", e.target.value as TipoAmbiente)}
                          className={INPUT}
                        >
                          {TIPOS_AMBIENTE_ORDENADOS.map((t) => (
                            <option key={t} value={t}>
                              {ROTULO_TIPO_AMBIENTE[t]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <Campo
                        label="Área (m²)"
                        value={amb.areaM2}
                        onChange={(v) => atualizarAmbiente(idxAmbiente, "areaM2", v)}
                        hint="Usada na carga mínima de iluminação"
                      />
                      <Campo
                        label="Qtd. de tomadas"
                        value={amb.quantidadeTomadas}
                        onChange={(v) => atualizarAmbiente(idxAmbiente, "quantidadeTomadas", v)}
                        hint={
                          amb.tipo === "cozinha" || amb.tipo === "area_servico"
                            ? "Regra: 600VA nas 3 primeiras, 100VA nas demais"
                            : "Regra: 100VA cada"
                        }
                      />
                      <Campo
                        label="Qtd. de lâmpadas"
                        value={amb.quantidadeLampadas}
                        onChange={(v) => atualizarAmbiente(idxAmbiente, "quantidadeLampadas", v)}
                        hint="Entra na tabela e na lista de material"
                      />
                    </div>

                    <div className="mt-2 pl-3">
                      <span className="text-[10px] font-medium text-slate-500">
                        Equipamentos de uso específico (TUE) -- cada um recebe circuito exclusivo
                      </span>
                      {amb.tues.map((tue, idxTue) => (
                        <div key={idxTue} className="mt-1 rounded border border-slate-100 bg-slate-50 p-1.5">
                          <div className="flex items-center gap-2">
                            <select
                              value={tue.categoria}
                              onChange={(e) => trocarCategoriaTue(idxAmbiente, idxTue, e.target.value as CategoriaTue, tue)}
                              className="w-44 rounded border border-slate-200 px-1.5 py-1 text-[11px]"
                              title="Categoria: define a tabela de fator de demanda aplicada no disjuntor geral"
                            >
                              {CATEGORIAS_TUE_ORDENADAS.map((c) => (
                                <option key={c} value={c}>
                                  {ROTULO_CATEGORIA_TUE[c]}
                                </option>
                              ))}
                            </select>
                            <input
                              type="text"
                              value={tue.nome}
                              onChange={(e) => atualizarTue(idxAmbiente, idxTue, { nome: e.target.value })}
                              placeholder="ex.: Chuveiro Elétrico"
                              className="flex-1 rounded border border-slate-200 px-1.5 py-1 text-[11px]"
                            />
                            <button
                              type="button"
                              onClick={() => removerTue(idxAmbiente, idxTue)}
                              className="text-[10px] text-red-500 hover:underline"
                            >
                              ✕
                            </button>
                          </div>
                          <div className="mt-1 flex items-center gap-2">
                            {tue.categoria === "ar_condicionado" && (
                              <>
                                <select
                                  value={tue.btus}
                                  onChange={(e) => aplicarBtus(idxAmbiente, idxTue, e.target.value, tue.tipoAr, tue)}
                                  className="w-32 rounded border border-slate-200 px-1.5 py-1 text-[11px]"
                                  title="Escolha os BTUs -- a potência preenche sozinha"
                                >
                                  <option value="">BTUs...</option>
                                  {OPCOES_BTU_AR_CONDICIONADO.map((o) => (
                                    <option key={o.btus} value={o.btus}>
                                      {o.btus.toLocaleString("pt-BR")} BTUs
                                    </option>
                                  ))}
                                </select>
                                <select
                                  value={tue.tipoAr}
                                  onChange={(e) =>
                                    aplicarBtus(idxAmbiente, idxTue, tue.btus, e.target.value as "split" | "inverter", tue)
                                  }
                                  className="w-36 rounded border border-slate-200 px-1.5 py-1 text-[11px]"
                                  title="Split convencional (on-off) ou inverter -- as potências são diferentes"
                                >
                                  <option value="inverter">Inverter</option>
                                  <option value="split">Split convencional</option>
                                </select>
                              </>
                            )}
                            <label className="flex items-center gap-1 text-[10px] text-slate-500">
                              Potência (W)
                              <input
                                type="text"
                                value={tue.potenciaW}
                                onChange={(e) => atualizarTue(idxAmbiente, idxTue, { potenciaW: e.target.value })}
                                placeholder="W"
                                className="w-20 rounded border border-slate-200 px-1.5 py-1 text-[11px]"
                                title={
                                  tue.categoria === "ar_condicionado"
                                    ? "Preenchida pela escolha de BTUs (valor típico) -- ajuste se souber a potência de placa do aparelho"
                                    : "Potência nominal do equipamento"
                                }
                              />
                            </label>
                            <label className="flex items-center gap-1 text-[10px] text-slate-500">
                              Tensão (V)
                              <input
                                type="text"
                                value={tue.tensaoV}
                                onChange={(e) => atualizarTue(idxAmbiente, idxTue, { tensaoV: e.target.value })}
                                placeholder="V"
                                className="w-16 rounded border border-slate-200 px-1.5 py-1 text-[11px]"
                              />
                            </label>
                            <label className="flex items-center gap-1 text-[10px] text-slate-500">
                              <input
                                type="checkbox"
                                checked={tue.trifasico}
                                onChange={(e) => atualizarTue(idxAmbiente, idxTue, { trifasico: e.target.checked })}
                              />
                              Trifásico
                            </label>
                          </div>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => adicionarTue(idxAmbiente)}
                        className="mt-1 w-full rounded border border-dashed border-slate-300 py-1 text-[10px] text-slate-500 hover:bg-slate-50"
                      >
                        + Adicionar equipamento (TUE) neste ambiente
                      </button>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={adicionarAmbiente}
                  className="w-full rounded border border-dashed border-slate-300 py-1.5 text-[11px] text-slate-500 hover:bg-slate-50"
                >
                  + Adicionar ambiente
                </button>
              </div>

              <h3 className={SUBTITULO}>2. Sistema elétrico e fatores (ajustáveis conforme a concessionária local)</h3>
              <div className="grid grid-cols-3 gap-2" data-testid="campos-config-cargas">
                <label className="flex flex-col gap-0.5">
                  <span className={LABEL}>Sistema de entrada</span>
                  <select value={numeroFases} onChange={(e) => setNumeroFases(e.target.value as "1" | "2" | "3")} className={INPUT}>
                    <option value="1">Monofásico</option>
                    <option value="2">Bifásico (127/220V)</option>
                    <option value="3">Trifásico</option>
                  </select>
                </label>
                <Campo label="Tensão de fase (V)" value={tensaoFaseV} onChange={setTensaoFaseV} hint="Iluminação e TUG comuns" />
                <Campo label="Tensão de entrada (V)" value={tensaoEntradaV} onChange={setTensaoEntradaV} hint="Referência do disjuntor geral e TUEs 220V" />
                <Campo
                  label="Fator de potência (cosφ)"
                  value={fatorPotencia}
                  onChange={setFatorPotencia}
                  hint="Use 1,00 p/ cargas resistivas (chuveiro/torneira); ajuste conforme a norma da concessionária"
                />
                <Campo
                  label="Comprimento médio por circuito (m)"
                  value={compCircuito}
                  onChange={setCompCircuito}
                  hint="Só p/ estimar os metros de cabo na lista de material (não afeta o cálculo elétrico)"
                />
              </div>

              <h3 className={SUBTITULO}>3. Fatores de demanda por categoria (em branco = tabela automática)</h3>
              <p className="mb-2 text-[10px] text-slate-400">
                O disjuntor geral é calculado com fatores de demanda SEPARADOS, como as normas de fornecimento fazem:
                iluminação+TUG pela faixa de carga (0,86 até 1kVA ... 0,24 acima de 10kVA), chuveiros/aquecimento pelo
                nº de aparelhos (1,00 com 1 chuveiro, decrescendo), ar-condicionado pelo nº de aparelhos (NDU
                001/Energisa: 1,00 / 0,88 / 0,82 / 0,78 / 0,76...). Demais TUEs entram com 100%. Preencha um campo só
                se a sua concessionária usar outro valor.
              </p>
              <div className="grid grid-cols-3 gap-2" data-testid="campos-fd-cargas">
                <Campo
                  label="FD iluminação + TUG (opcional)"
                  value={fdIlumTug}
                  onChange={setFdIlumTug}
                  placeholder="automático"
                  hint="Em branco: tabela por faixa de carga instalada"
                />
                <Campo
                  label="FD chuveiros/aquecimento (opcional)"
                  value={fdChuveiro}
                  onChange={setFdChuveiro}
                  placeholder="automático"
                  hint="Em branco: tabela pelo nº de chuveiros/aquecedores"
                />
                <Campo
                  label="FD ar-condicionado (opcional)"
                  value={fdArCond}
                  onChange={setFdArCond}
                  placeholder="automático"
                  hint="Em branco: tabela pelo nº de aparelhos"
                />
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
            </>
          ) : (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-[11px] text-emerald-900">
              <p className="mb-2 font-semibold">✓ Dimensionamento gerado com sucesso</p>
              <ul className="list-inside list-disc space-y-1">
                <li>
                  {resumo.circuitos.length} circuitos calculados -- {resumo.totalTomadas} tomadas e {resumo.totalLampadas}{" "}
                  lâmpadas no total (colunas novas na tabela de cargas)
                </li>
                <li>
                  Carga instalada: iluminação {resumo.cargaIluminacaoTotalVA.toFixed(0)}VA + TUG{" "}
                  {resumo.cargaTugTotalVA.toFixed(0)}VA + TUE {resumo.cargaTueTotalVA.toFixed(0)}VA ={" "}
                  {resumo.cargaInstaladaTotalVA.toFixed(0)}VA
                </li>
                <li>
                  Fatores de demanda aplicados: ilum.+TUG {resumo.fatorDemandaIlumTugAplicado.toFixed(2)} -- chuveiros (
                  {resumo.numChuveiros} un) {resumo.fatorDemandaChuveiroAplicado.toFixed(2)} -- ar-condicionado (
                  {resumo.numArCondicionados} un) {resumo.fatorDemandaArCondAplicado.toFixed(2)} -- demais TUE 1,00
                </li>
                <li>
                  Demanda calculada: {resumo.demandaCalculadaVA.toFixed(0)}VA (fator geral efetivo{" "}
                  {resumo.fatorDemandaGeralEfetivo.toFixed(2)})
                </li>
                <li>
                  Disjuntor geral: {resumo.disjuntorGeralA}A {resumo.polosGeral}P (corrente calculada {resumo.correnteGeralA.toFixed(1)}A)
                </li>
                {Number(numeroFases) > 1 && (
                  <li>
                    Balanceamento de fases: {Object.entries(resumo.cargaPorFaseVA)
                      .map(([f, v]) => `${f} ${(v ?? 0).toFixed(0)}VA`)
                      .join(" / ")}{" "}
                    (desequilíbrio {resumo.desequilibrioFasesPercentual.toFixed(0)}%) -- diagrama desenhado como MULTIFILAR, com uma
                    barra por fase + neutro
                  </li>
                )}
                <li>Lista de material preliminar com {resumo.listaMaterial.length} itens desenhada ao lado da tabela (texto editável)</li>
                {resumo.avisos.length > 0 && (
                  <li className="text-amber-700">
                    {resumo.avisos.length} aviso(s) -- ver detalhes na tabela desenhada no projeto.
                  </li>
                )}
              </ul>
              <p className="mt-2 text-[10px] text-emerald-700">
                Dimensionamento preliminar -- não substitui projeto elétrico assinado por responsável técnico. Os dados
                deste formulário ficam salvos no projeto: reabra o gerador a qualquer momento pra ajustar ou acrescentar
                itens sem redigitar.
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-3">
          {resumo && (
            <button
              type="button"
              onClick={() => setResumo(null)}
              className="mr-auto rounded border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100"
              title="Volta ao formulário preenchido pra ajustar ou acrescentar itens -- gerar de novo substitui o desenho anterior"
            >
              ← Voltar e ajustar
            </button>
          )}
          <button type="button" onClick={onFechar} className="rounded border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50">
            {resumo ? "Fechar" : "Cancelar"}
          </button>
          {!resumo && (
            <button
              type="button"
              onClick={handleGerar}
              disabled={gerando}
              className="rounded bg-amber-500 px-4 py-1.5 text-xs font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
            >
              {gerando ? "Gerando..." : "🔌 Gerar dimensionamento"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
