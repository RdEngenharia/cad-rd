"use client";

/**
 * SistemaSoloModal.tsx
 * -----------------------------------------------------------------------
 * Iteração 29 -- modal do "dimensionar sistema fotovoltaico no solo"
 * (usuário: "sobre o terreno voce vai criar um modal perguntando o
 * tamanho das laterais... voce vai perguntar qual lado do terreno esta
 * apontado para o norte, vai deixar a opcao de inverter o layaut tanto
 * para paisagem quanto para retrato"). Segue o mesmo padrão BOTÃO + MODAL
 * de `DiagramaFvButton.tsx`/`DiagramaFvModal.tsx` (Iteração 13).
 *
 * Iteração 29b -- REVISÃO a pedido do usuário (ver `lib/sistemaSolo.ts`
 * pro detalhe técnico completo das 2 correções):
 *  a) módulo deixou de ser uma lista fixa de 6 variantes do datasheet
 *     Jinko -- agora são 3 campos livres (comprimento/largura/potência),
 *     pré-preenchidos com os números do Jinko só como sugestão/exemplo,
 *     editáveis pra qualquer marca ("existem diversas marcas no mercado").
 *  b) inclinação e altura máxima da estrutura deixaram de ser só
 *     calculadas/mostradas -- agora são campos editáveis (com sugestão
 *     automática a partir do lastro Fortlev selecionado), porque a
 *     fórmula de afastamento realmente PRECISA da altura do ponto mais
 *     alto da estrutura acima do solo (não só o ganho de inclinação do
 *     módulo) -- ver o comentário completo em `calcularAfastamentoEntreFileirasMm`.
 *
 * Campos que o usuário NÃO pediu explicitamente mas são estruturalmente
 * indispensáveis pro cálculo: latitude (define a altura solar crítica),
 * zona de vento/isopleta (espaçamento estrutural entre lastros ao longo
 * da fileira) e margem/recuo do terreno. Todos vêm com um valor padrão
 * sensato, sempre editável.
 *
 * Iteração 29c -- novo checkbox "gerar 2º diagrama" (`gerarDiagramaLastros`,
 * default true): usuário pediu cotas de espaçamento entre as caixas de
 * lastro (não só entre módulos) e a opção de um diagrama separado só com
 * lastros + cotas, ao lado do diagrama completo, pra facilitar a
 * implantação em campo (ver `lib/sistemaSolo.ts` pro detalhe de como as
 * cotas são geradas).
 * -----------------------------------------------------------------------
 */

import { useState } from "react";
import { useCadStore } from "@/lib/store";
import { LASTRO_COMPATIBILIDADE_MODULO, calcularTiltGrausLastro, type LastroCompatibilidadeModulo } from "@/lib/lastroSolar";
import { PAINEL_JINKO_66HL4M_BDV } from "@/lib/painelFotovoltaico";
import type { DadosSistemaSolo, LadoNorte, OrientacaoModulo, ResumoSistemaSolo } from "@/lib/sistemaSolo";

interface SistemaSoloModalProps {
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
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={INPUT}
      />
      {hint && <span className="text-[9px] text-slate-400">{hint}</span>}
    </label>
  );
}

function numero(v: string): number {
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

const LABELS_LADO_NORTE: Record<LadoNorte, string> = {
  superior: "Superior (topo do desenho)",
  inferior: "Inferior (base do desenho)",
  esquerda: "Esquerda",
  direita: "Direita",
};

type FamiliaLastroLocal = "550" | "670";
type RevisaoLastroLocal = "novo" | "antigo";

export function SistemaSoloModal({ onFechar }: SistemaSoloModalProps) {
  const gerarSistemaSolo = useCadStore((s) => s.gerarSistemaSolo);

  const [larguraTerrenoM, setLarguraTerrenoM] = useState("50");
  const [profundidadeTerrenoM, setProfundidadeTerrenoM] = useState("30");
  const [margemM, setMargemM] = useState("1");
  const [ladoNorte, setLadoNorte] = useState<LadoNorte>("superior");
  const [orientacaoModulo, setOrientacaoModulo] = useState<OrientacaoModulo>("retrato");
  const [latitude, setLatitude] = useState("");

  // Módulo -- livre, qualquer marca (pré-preenchido com o painel Jinko
  // anexado só como sugestão de partida, ver premissa "a" no cabeçalho).
  const [comprimentoModuloMm, setComprimentoModuloMm] = useState(String(PAINEL_JINKO_66HL4M_BDV.comprimentoMm));
  const [larguraModuloMm, setLarguraModuloMm] = useState(String(PAINEL_JINKO_66HL4M_BDV.larguraMm));
  const [potenciaModuloWp, setPotenciaModuloWp] = useState("630");
  const [rotuloModulo, setRotuloModulo] = useState(`${PAINEL_JINKO_66HL4M_BDV.fabricante} ${PAINEL_JINKO_66HL4M_BDV.modelo}`);

  // Estrutura -- inclinação e altura máxima são campos editáveis (premissa
  // "b"), com sugestão automática vinda do lastro Fortlev selecionado.
  const [familiaLastro, setFamiliaLastro] = useState<FamiliaLastroLocal>("670");
  const [revisaoLastro, setRevisaoLastro] = useState<RevisaoLastroLocal>("novo");
  const compatInicial = LASTRO_COMPATIBILIDADE_MODULO.find(
    (c) => c.familiaModulo === "670" && c.revisaoLastro === "novo"
  ) as LastroCompatibilidadeModulo;
  const [tiltGraus, setTiltGraus] = useState(calcularTiltGrausLastro(compatInicial).toFixed(1));
  const [alturaMaximaEstruturaM, setAlturaMaximaEstruturaM] = useState(
    ((compatInicial.distanciaMaximaSoloMm ?? 0) / 1000).toFixed(2)
  );
  const [isopletaExplicita, setIsopletaExplicita] = useState(true);

  // Iteração 29c: "consegue a opcao de criar dois diagramas ao mesmo
  // tempo? um so com as caixas e cotas de distanciamento e outro do lado
  // com tudo?" -- default ligado, já que foi o próprio pedido do usuário.
  const [gerarDiagramaLastros, setGerarDiagramaLastros] = useState(true);

  const [erros, setErros] = useState<string[]>([]);
  const [gerando, setGerando] = useState(false);
  const [resumo, setResumo] = useState<ResumoSistemaSolo | null>(null);

  // Só oferece revisões de lastro que de fato têm distância ao solo
  // aplicável pra família escolhida (ex.: "670"+"antigo" é "Não aplicável"
  // no datasheet -- ver `lib/lastroSolar.ts#LASTRO_COMPATIBILIDADE_MODULO`).
  function revisoesDisponiveisPara(f: FamiliaLastroLocal): RevisaoLastroLocal[] {
    return LASTRO_COMPATIBILIDADE_MODULO.filter((c) => c.familiaModulo === f && c.distanciaMinimaSoloMm != null).map(
      (c) => c.revisaoLastro
    );
  }

  /** Aplica a inclinação/altura máxima sugeridas pro lastro Fortlev família+revisão informados -- só uma SUGESTÃO de partida, os 2 campos continuam livres pra editar depois (ex.: pra usar uma estrutura de outro fabricante). */
  function sugerirDaFamilia(f: FamiliaLastroLocal, r: RevisaoLastroLocal) {
    const compat = LASTRO_COMPATIBILIDADE_MODULO.find((c) => c.familiaModulo === f && c.revisaoLastro === r);
    if (!compat || compat.distanciaMaximaSoloMm == null) return;
    setTiltGraus(calcularTiltGrausLastro(compat).toFixed(1));
    setAlturaMaximaEstruturaM((compat.distanciaMaximaSoloMm / 1000).toFixed(2));
  }

  function trocarFamilia(f: FamiliaLastroLocal) {
    setFamiliaLastro(f);
    const disponiveis = revisoesDisponiveisPara(f);
    const revisaoFinal = disponiveis.includes(revisaoLastro) ? revisaoLastro : disponiveis[0] ?? "novo";
    setRevisaoLastro(revisaoFinal);
    sugerirDaFamilia(f, revisaoFinal);
  }

  function trocarRevisao(r: RevisaoLastroLocal) {
    setRevisaoLastro(r);
    sugerirDaFamilia(familiaLastro, r);
  }

  function validar(): string[] {
    const lista: string[] = [];
    if (!(numero(larguraTerrenoM) > 0)) lista.push("Informe a largura do terreno (m), maior que zero.");
    if (!(numero(profundidadeTerrenoM) > 0)) lista.push("Informe a profundidade do terreno (m), maior que zero.");
    if (!(numero(margemM) >= 0)) lista.push("Margem/recuo inválida.");
    const lat = numero(latitude);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      lista.push("Informe a latitude do local, em graus decimais (-90 a 90; negativo = hemisfério sul, ex.: -23.55 para São Paulo).");
    }
    if (!(numero(comprimentoModuloMm) > 0)) lista.push("Informe o comprimento do módulo (mm, lado maior), maior que zero.");
    if (!(numero(larguraModuloMm) > 0)) lista.push("Informe a largura do módulo (mm, lado menor), maior que zero.");
    if (!(numero(potenciaModuloWp) > 0)) lista.push("Informe a potência do módulo (Wp), maior que zero.");
    const tilt = numero(tiltGraus);
    if (!(tilt > 0 && tilt < 90)) lista.push("Ângulo de inclinação inválido -- precisa estar entre 0° e 90°.");
    if (!(numero(alturaMaximaEstruturaM) > 0)) {
      lista.push("Informe a altura do ponto mais alto da estrutura acima do solo (m), maior que zero.");
    }
    return lista;
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
      const dados: DadosSistemaSolo = {
        larguraTerrenoMm: numero(larguraTerrenoM) * 1000,
        profundidadeTerrenoMm: numero(profundidadeTerrenoM) * 1000,
        margemMm: numero(margemM) * 1000,
        ladoNorte,
        orientacaoModulo,
        latitudeGraus: numero(latitude),
        comprimentoModuloMm: numero(comprimentoModuloMm),
        larguraModuloMm: numero(larguraModuloMm),
        potenciaModuloWp: numero(potenciaModuloWp),
        rotuloModulo: rotuloModulo.trim() || undefined,
        tiltGraus: numero(tiltGraus),
        alturaMaximaEstruturaMm: numero(alturaMaximaEstruturaM) * 1000,
        isopletaExplicita,
        gerarDiagramaLastros,
      };
      const res = gerarSistemaSolo(dados);
      setResumo(res);
    } catch (err) {
      setErros([err instanceof Error ? err.message : String(err)]);
    } finally {
      setGerando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-[1px]">
      <div className="flex max-h-[92vh] w-[38rem] flex-col overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">☀ Dimensionar sistema fotovoltaico no solo</h2>
            <p className="text-[11px] text-slate-500">
              Informe o terreno e as dimensões do seu módulo (qualquer marca) -- o leiaute respeita o afastamento
              anti-sombreamento com base na inclinação e altura da estrutura informadas.
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
              <h3 className={SUBTITULO}>1. Terreno</h3>
              <div className="grid grid-cols-2 gap-2" data-testid="campos-terreno-solo">
                <Campo
                  label="Largura do terreno (m)"
                  value={larguraTerrenoM}
                  onChange={setLarguraTerrenoM}
                  hint="Lado do terreno no eixo horizontal do desenho"
                />
                <Campo
                  label="Profundidade do terreno (m)"
                  value={profundidadeTerrenoM}
                  onChange={setProfundidadeTerrenoM}
                  hint="Lado do terreno no eixo vertical do desenho"
                />
                <Campo
                  label="Margem/recuo nas 4 bordas (m)"
                  value={margemM}
                  onChange={setMargemM}
                  hint="Simplificação: mesmo recuo nas 4 bordas (ajuste conforme divisa/norma local)"
                />
                <label className="flex flex-col gap-0.5">
                  <span className={LABEL}>Qual lado do terreno aponta para o norte?</span>
                  <select value={ladoNorte} onChange={(e) => setLadoNorte(e.target.value as LadoNorte)} className={INPUT}>
                    {(Object.keys(LABELS_LADO_NORTE) as LadoNorte[]).map((l) => (
                      <option key={l} value={l}>
                        {LABELS_LADO_NORTE[l]}
                      </option>
                    ))}
                  </select>
                </label>
                <Campo
                  label="Latitude do local (graus decimais)"
                  value={latitude}
                  onChange={setLatitude}
                  placeholder="ex.: -23.55"
                  hint="Negativo = hemisfério sul. Define a altura do sol no dia mais crítico do ano (usada no afastamento entre fileiras)."
                />
              </div>

              <h3 className={SUBTITULO}>2. Módulo (qualquer marca) e orientação</h3>
              <p className="mb-2 text-[9px] text-slate-400">
                Campos pré-preenchidos com o painel Jinko 66HL4M-BDV só como sugestão de partida -- edite livremente
                para o módulo/marca que você for usar de verdade.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Campo
                  label="Comprimento do módulo -- lado maior (mm)"
                  value={comprimentoModuloMm}
                  onChange={setComprimentoModuloMm}
                />
                <Campo
                  label="Largura do módulo -- lado menor (mm)"
                  value={larguraModuloMm}
                  onChange={setLarguraModuloMm}
                />
                <Campo label="Potência do módulo (Wp)" value={potenciaModuloWp} onChange={setPotenciaModuloWp} />
                <Campo
                  label="Marca/modelo (opcional, só pro texto-resumo)"
                  value={rotuloModulo}
                  onChange={setRotuloModulo}
                  placeholder="ex.: Jinko Tiger Neo 66HL4M-BDV"
                />
                <label className="flex flex-col gap-0.5">
                  <span className={LABEL}>Orientação do módulo</span>
                  <div className="flex overflow-hidden rounded border border-slate-200">
                    <button
                      type="button"
                      onClick={() => setOrientacaoModulo("retrato")}
                      className={`flex-1 px-2 py-1 text-[11px] ${
                        orientacaoModulo === "retrato" ? "bg-amber-500 text-white" : "bg-white text-slate-600"
                      }`}
                    >
                      Retrato
                    </button>
                    <button
                      type="button"
                      onClick={() => setOrientacaoModulo("paisagem")}
                      className={`flex-1 px-2 py-1 text-[11px] ${
                        orientacaoModulo === "paisagem" ? "bg-amber-500 text-white" : "bg-white text-slate-600"
                      }`}
                    >
                      Paisagem
                    </button>
                  </div>
                </label>
              </div>

              <h3 className={SUBTITULO}>3. Estrutura (inclinação e altura -- editáveis)</h3>
              <p className="mb-2 text-[9px] text-slate-400">
                A inclinação e a altura do ponto mais alto da estrutura acima do solo são o que determina a sombra na
                fileira de trás -- os botões abaixo só SUGEREM valores a partir do lastro Fortlev selecionado; edite os
                2 campos livremente se for usar uma estrutura diferente (outro fabricante, rack fixo com outra altura).
              </p>
              <div className="grid grid-cols-3 gap-2">
                <label className="flex flex-col gap-0.5">
                  <span className={LABEL}>Sugestão -- família do lastro</span>
                  <select value={familiaLastro} onChange={(e) => trocarFamilia(e.target.value as FamiliaLastroLocal)} className={INPUT}>
                    <option value="550">550 (ref. 1135×2280mm)</option>
                    <option value="670">670 (ref. 1303×2384mm)</option>
                  </select>
                </label>
                <label className="flex flex-col gap-0.5">
                  <span className={LABEL}>Sugestão -- revisão</span>
                  <select
                    value={revisaoLastro}
                    onChange={(e) => trocarRevisao(e.target.value as RevisaoLastroLocal)}
                    className={INPUT}
                  >
                    {revisoesDisponiveisPara(familiaLastro).map((r) => (
                      <option key={r} value={r}>
                        {r === "novo" ? "Novo" : "Antigo"}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-0.5">
                  <span className={LABEL}>Zona de vento (espaçamento entre lastros)</span>
                  <select
                    value={isopletaExplicita ? "isopleta5" : "padrao"}
                    onChange={(e) => setIsopletaExplicita(e.target.value === "isopleta5")}
                    className={INPUT}
                  >
                    <option value="isopleta5">Isopleta 5 (mais crítico)</option>
                    <option value="padrao">Padrão</option>
                  </select>
                </label>
                <Campo
                  label="Ângulo de inclinação da estrutura (graus)"
                  value={tiltGraus}
                  onChange={setTiltGraus}
                  hint="Editável -- sugerido a partir do lastro acima"
                />
                <Campo
                  label="Altura máx. da estrutura acima do solo (m)"
                  value={alturaMaximaEstruturaM}
                  onChange={setAlturaMaximaEstruturaM}
                  hint="Ponto mais alto -- é isso que projeta sombra na fileira de trás"
                />
              </div>

              <h3 className={SUBTITULO}>4. Cotas e 2º diagrama</h3>
              <label className="flex items-start gap-2 rounded border border-slate-200 p-2">
                <input
                  type="checkbox"
                  checked={gerarDiagramaLastros}
                  onChange={(e) => setGerarDiagramaLastros(e.target.checked)}
                  className="mt-0.5"
                />
                <span className="text-[11px] text-slate-600">
                  Gerar também um 2º diagrama, ao lado do principal, só com o terreno + lastros + cotas de
                  distanciamento (sem módulos) -- facilita medir/implantar as caixas em campo. O leiaute principal
                  sempre recebe as cotas de afastamento entre fileiras e entre lastros (1 ocorrência de cada,
                  marcada &quot;(TYP.)&quot; -- o valor se repete em todas as fileiras/vãos).
                </span>
              </label>

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
              <p className="mb-2 font-semibold">✓ Leiaute gerado com sucesso</p>
              <ul className="list-inside list-disc space-y-1">
                <li>
                  {resumo.numeroFileiras} fileiras × {resumo.modulosPorFileira} módulos/fileira = {resumo.totalModulos}{" "}
                  módulos ({resumo.potenciaTotalKwp.toFixed(2)} kWp)
                </li>
                <li>
                  Estrutura: inclinação {resumo.anguloInclinacaoGraus.toFixed(1)}°, altura máxima{" "}
                  {(resumo.alturaMaximaEstruturaMm / 1000).toFixed(2)}m acima do solo
                </li>
                <li>
                  Afastamento entre fileiras: {(resumo.afastamentoEntreFileirasMm / 1000).toFixed(2)}m (ângulo solar
                  crítico: {resumo.anguloSolarCriticoGraus.toFixed(1)}°, base: solstício de{" "}
                  {resumo.declinacaoCriticaGraus > 0 ? "junho" : "dezembro"} -- o inverno astronômico do hemisfério do
                  local, não o verão)
                </li>
                <li>Zona de vento usada: {resumo.isopletaUsada}</li>
                <li>
                  Cotas de distanciamento (afastamento entre fileiras + espaçamento entre lastros) desenhadas no
                  leiaute principal.{" "}
                  {resumo.diagramaLastrosGerado
                    ? "2º diagrama (só lastros + cotas) gerado ao lado do principal."
                    : "2º diagrama separado não foi gerado (opção desmarcada)."}
                </li>
              </ul>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-3">
          <button
            type="button"
            onClick={onFechar}
            className="rounded border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
          >
            {resumo ? "Fechar" : "Cancelar"}
          </button>
          {!resumo && (
            <button
              type="button"
              onClick={handleGerar}
              disabled={gerando}
              className="rounded bg-amber-500 px-4 py-1.5 text-xs font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
            >
              {gerando ? "Gerando..." : "☀ Gerar leiaute"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
