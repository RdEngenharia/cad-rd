"use client";

import { useEffect, useState } from "react";
import { useCadStore } from "@/lib/store";
import { HACHURA_OPCOES } from "@/lib/hachura";
import type { HachuraTipo } from "@/lib/types";

/**
 * Escalas de impressão "padrão" (1:N) mais comuns em desenho técnico/
 * ABNT -- botão de escolha rápida (Iteração 14), equivalente ao
 * comando de zoom/escala "nXP" do AutoCAD: em vez de digitar o número
 * cru no campo de "Escala de impressão", o usuário escolhe direto de
 * uma lista e o `modelScale` do Viewport é ajustado com 1 clique.
 */
const ESCALAS_RAPIDAS = [1, 2, 5, 10, 20, 25, 50, 75, 100, 125, 150, 200, 250, 500, 1000, 2000];

/**
 * PropertiesPanel
 * -----------------------------------------------------------------------
 * Barra de propriedades: sempre mostra o tamanho padrão (mm) usado no
 * PRÓXIMO texto inserido pela ferramenta "Texto" (`textoFontSizeAtivo`
 * -- "lembrado" entre usos, mesmo espírito do raio do FILLET). Conforme o
 * que está selecionado, mostra também (Sprint 3 -- "Propriedades do
 * Elemento Selecionado"):
 *   - Exatamente 1 "texto": conteúdo/tamanho/rotação DELE, editáveis ao
 *     vivo.
 *   - Exatamente 1 "bloco": rotação (0-360°) + escala X/Y independentes,
 *     editáveis ao vivo, girando/redimensionando em volta do próprio
 *     ponto de inserção.
 *   - 1 ou mais elementos selecionados ("Seleção"): um campo de ângulo
 *     (delta) + botão "Aplicar" que gira TODOS os selecionados de uma vez
 *     em volta do centro da bounding box combinada da seleção
 *     (`girarSelecao`) -- equivalente ao ROTATE do AutoCAD com ponto-base
 *     = centro da seleção -- e, do mesmo jeito, campos de fator X/Y +
 *     botão "Aplicar" que ESCALAM todos de uma vez em volta do mesmo
 *     centro (`escalarSelecao`) -- equivalente ao SCALE do AutoCAD. Um
 *     checkbox "Proporcional (automático)" (marcado por padrão) mantém
 *     X e Y sempre iguais -- digitar um espelha automaticamente no
 *     outro, dando uma escala uniforme (ex.: 2 dobra de tamanho, 0.5
 *     reduz pela metade); desmarcado, X e Y ficam independentes,
 *     permitindo esticar/comprimir cada eixo separadamente. Funciona com
 *     1 elemento só (qualquer tipo -- linha, círculo, retângulo, etc.)
 *     ou vários de uma vez. Enquanto os campos de fator estão sendo
 *     digitados (ANTES de clicar "Aplicar"), `setEscalaPreview` avisa o
 *     `GeometryLayer` a desenhar um "fantasma" tracejado mostrando como a
 *     seleção ficaria com aquele fator -- a geometria real só muda de
 *     fato ao clicar "Aplicar" (`escalarSelecao`, que entra no histórico
 *     de undo); o preview em si nunca é persistido nem desfazível.
 *
 * `fontSize`/rotação/escala são todos em unidades de MUNDO (mm/graus),
 * não de tela -- por construção já "respeitam a escala da prancha ativa"
 * sem nenhuma conversão extra (ver `pdfExport.ts`).
 * -----------------------------------------------------------------------
 */
export function PropertiesPanel() {
  const textoFontSizeAtivo = useCadStore((s) => s.textoFontSizeAtivo);
  const setTextoFontSizeAtivo = useCadStore((s) => s.setTextoFontSizeAtivo);
  const filletRaio = useCadStore((s) => s.filletRaio);
  const setFilletRaio = useCadStore((s) => s.setFilletRaio);
  const selecionadoIds = useCadStore((s) => s.selecionadoIds);
  const geometria = useCadStore((s) => s.projeto.geometria);
  const atualizarTexto = useCadStore((s) => s.atualizarTexto);
  const atualizarBloco = useCadStore((s) => s.atualizarBloco);
  const girarSelecao = useCadStore((s) => s.girarSelecao);
  const escalarSelecao = useCadStore((s) => s.escalarSelecao);
  const setEscalaPreview = useCadStore((s) => s.setEscalaPreview);
  const atualizarViewport = useCadStore((s) => s.atualizarViewport);
  const atualizarHachuraObjeto = useCadStore((s) => s.atualizarHachuraObjeto);
  const atualizarCamadaSelecao = useCadStore((s) => s.atualizarCamadaSelecao);
  const camadas = useCadStore((s) => s.projeto.camadas);
  // Viewport de PRANCHA (Iteração 12g -- lista `Prancha.viewports`, o
  // mecanismo REALMENTE usado no fluxo normal de hoje: cada Prancha já
  // nasce com um viewport, e o botão "Viewport" da régua adiciona MAIS
  // um nessa mesma lista quando uma Prancha está ativa). É DIFERENTE do
  // "viewport" de `projeto.geometria` (MVIEW clássico, só existe fora de
  // uma Prancha) tratado no bloco `viewportSelecionado` abaixo -- os
  // dois têm o mesmo formato de dado (`ViewportGeometria`/`modelScale`),
  // mas vivem em lugares/ações diferentes do store.
  const pranchas = useCadStore((s) => s.projeto.pranchas);
  const prenchaAtivaId = useCadStore((s) => s.prenchaAtivaId);
  const viewportPranchaSelecionadoId = useCadStore((s) => s.viewportPranchaSelecionadoId);
  const atualizarViewportDaPrancha = useCadStore((s) => s.atualizarViewportDaPrancha);
  const pranchaAtiva = pranchas.find((pr) => pr.id === prenchaAtivaId);
  const viewportPranchaSelecionado = pranchaAtiva?.viewports.find((v) => v.id === viewportPranchaSelecionadoId);

  const [anguloGrupo, setAnguloGrupo] = useState("0");
  const [fatorXGrupo, setFatorXGrupo] = useState("1");
  const [fatorYGrupo, setFatorYGrupo] = useState("1");
  const [escalaProporcional, setEscalaProporcional] = useState(true);

  const alvo =
    selecionadoIds.length === 1 ? geometria.find((g) => g.id === selecionadoIds[0]) : undefined;
  const textoSelecionado = alvo && alvo.tipo === "texto" ? alvo : undefined;
  const blocoSelecionado = alvo && alvo.tipo === "bloco" ? alvo : undefined;
  const viewportSelecionado = alvo && alvo.tipo === "viewport" ? alvo : undefined;
  // Iteração 14: objeto único selecionado que aceita hachura (retângulo/
  // polígono/círculo) E já tem uma aplicada -- expõe tipo/escala/cor
  // pra edição pós-criação, sem entrar aqui pra formas sem hachura.
  const hachuravelSelecionado =
    alvo && (alvo.tipo === "retangulo" || alvo.tipo === "poligono" || alvo.tipo === "circulo") ? alvo : undefined;
  const hachuraSelecionada = hachuravelSelecionado?.hachura;

  // Iteração 17: camada comum da seleção (pra pré-selecionar o dropdown
  // corretamente) -- se a seleção tiver elementos em camadas DIFERENTES,
  // não há uma "camada comum" única, então o dropdown mostra vazio (o
  // usuário escolhe uma camada e ela é aplicada a TODOS os selecionados,
  // igual ao dropdown de camada do AutoCAD com seleção múltipla mista).
  const geometriaSelecionada = geometria.filter((g) => selecionadoIds.includes(g.id));
  const camadaComumSelecao =
    geometriaSelecionada.length > 0 && geometriaSelecionada.every((g) => g.camada === geometriaSelecionada[0].camada)
      ? geometriaSelecionada[0].camada
      : "";
  const listaCamadas = Object.values(camadas).sort((a, b) => a.nome.localeCompare(b.nome));

  // A seleção mudou (novo clique, Shift+clique, box-select, ou tudo
  // desmarcado) -- zera os campos de fator e qualquer preview de escala
  // que tenha ficado armado da seleção ANTERIOR. Sem isso, um fator "2"
  // deixado de uma seleção prévia ficaria pré-visualizando a seleção NOVA
  // escalada por 2x sem o usuário ter digitado nada de novo.
  useEffect(() => {
    // `setState` síncrono direto no corpo do efeito dispara o lint
    // `react-hooks/set-state-in-effect` (mesmo padrão já visto em outros
    // efeitos deste projeto) -- envolvido num `queueMicrotask` pra não
    // rodar sincronamente durante a fase de commit do React.
    queueMicrotask(() => {
      setFatorXGrupo("1");
      setFatorYGrupo("1");
      setEscalaPreview(null);
    });
  }, [selecionadoIds, setEscalaPreview]);

  function handleAplicarGiroGrupo() {
    const n = Number(anguloGrupo.replace(",", "."));
    if (Number.isFinite(n) && n !== 0) girarSelecao(n);
    setAnguloGrupo("0");
  }

  // Preview ao vivo (Iteração 12p): avisa o `GeometryLayer` a desenhar o
  // "fantasma" da seleção com esse fator, SEM tocar na geometria real
  // (`escalaPreview` é um estado de UI só, não entra no histórico de
  // undo -- ver `lib/store.ts`). `null` quando os valores digitados ainda
  // não formam um fator válido (>0) ou equivalem a um no-op (1x1) --
  // nesses casos o preview simplesmente não aparece, mostrando só a
  // geometria real de sempre.
  function sincronizarPreview(xBruto: string, yBruto: string) {
    const nx = Number(xBruto.replace(",", "."));
    const ny = Number(yBruto.replace(",", "."));
    if (Number.isFinite(nx) && Number.isFinite(ny) && nx > 0 && ny > 0 && !(nx === 1 && ny === 1)) {
      setEscalaPreview({ fatorX: nx, fatorY: ny });
    } else {
      setEscalaPreview(null);
    }
  }

  // Enquanto "Proporcional" está marcado, X e Y ficam travados juntos --
  // editar um espelha o valor no outro (dá uma escala uniforme sem
  // precisar digitar o mesmo número duas vezes). Desmarcar solta os dois
  // campos pra valores independentes (esticar/comprimir cada eixo).
  function handleFatorXChange(v: string) {
    const yEfetivo = escalaProporcional ? v : fatorYGrupo;
    setFatorXGrupo(v);
    if (escalaProporcional) setFatorYGrupo(v);
    sincronizarPreview(v, yEfetivo);
  }

  function handleFatorYChange(v: string) {
    const xEfetivo = escalaProporcional ? v : fatorXGrupo;
    setFatorYGrupo(v);
    if (escalaProporcional) setFatorXGrupo(v);
    sincronizarPreview(xEfetivo, v);
  }

  function handleToggleProporcional(marcado: boolean) {
    setEscalaProporcional(marcado);
    if (marcado) setFatorYGrupo(fatorXGrupo); // re-trava Y no valor atual de X
    sincronizarPreview(fatorXGrupo, marcado ? fatorXGrupo : fatorYGrupo);
  }

  function handleAplicarEscalaGrupo() {
    const nx = Number(fatorXGrupo.replace(",", "."));
    const ny = escalaProporcional ? nx : Number(fatorYGrupo.replace(",", "."));
    if (Number.isFinite(nx) && Number.isFinite(ny) && nx > 0 && ny > 0 && !(nx === 1 && ny === 1)) {
      escalarSelecao(nx, ny);
    }
    setFatorXGrupo("1");
    setFatorYGrupo("1");
    setEscalaPreview(null);
  }

  return (
    <div>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Texto</h2>

      <label className="flex items-center justify-between gap-2 text-[11px] text-slate-600">
        Tamanho padrão (mm)
        <input
          type="number"
          min={1}
          step={0.5}
          value={textoFontSizeAtivo}
          onChange={(e) => setTextoFontSizeAtivo(Number(e.target.value))}
          className="w-16 rounded border border-slate-200 px-1 py-0.5"
          title="Tamanho de fonte (mm) usado no próximo texto inserido"
        />
      </label>

      {textoSelecionado && (
        <div className="mt-2 space-y-1.5 rounded border border-blue-200 bg-blue-50/50 p-1.5">
          <p className="text-[10px] font-medium uppercase tracking-wide text-blue-700">Texto selecionado</p>
          <label className="block text-[11px] text-slate-600">
            Conteúdo <span className="font-normal text-slate-400">(Enter = nova linha)</span>
            <textarea
              value={textoSelecionado.conteudo}
              onChange={(e) => atualizarTexto(textoSelecionado.id, { conteudo: e.target.value })}
              rows={Math.min(8, Math.max(2, textoSelecionado.conteudo.split("\n").length))}
              className="mt-0.5 w-full resize-y rounded border border-slate-200 px-1.5 py-1 font-mono text-[11px]"
            />
          </label>
          <div className="flex gap-1.5">
            <label className="block flex-1 text-[11px] text-slate-600">
              Tamanho (mm)
              <input
                type="number"
                min={1}
                step={0.5}
                value={textoSelecionado.fontSize}
                onChange={(e) =>
                  atualizarTexto(textoSelecionado.id, { fontSize: Math.max(1, Number(e.target.value) || 1) })
                }
                className="mt-0.5 w-full rounded border border-slate-200 px-1.5 py-1 text-[11px]"
              />
            </label>
            <label className="block flex-1 text-[11px] text-slate-600">
              Rotação (°)
              <input
                type="number"
                step={1}
                value={Math.round(textoSelecionado.rotacao ?? 0)}
                onChange={(e) => atualizarTexto(textoSelecionado.id, { rotacao: Number(e.target.value) || 0 })}
                className="mt-0.5 w-full rounded border border-slate-200 px-1.5 py-1 text-[11px]"
                title="Ângulo em graus (0-360), sentido horário, em volta do ponto de inserção"
              />
            </label>
          </div>
        </div>
      )}

      {/* Iteração 38 -- controle SEMPRE visível do raio do FILLET
          (`filletRaio`, "lembrado" entre usos, mesmo espírito do
          `textoFontSizeAtivo` acima), pra não depender de o usuário
          saber que dá pra digitar "R" + um número na linha de comando.
          0 = canto reto ("em bico"); qualquer valor > 0 arredonda o
          canto com um arco desse raio no próximo FILLET (tecla F/botão
          "Fillet"). Pedido do usuário: "quero ter a opcao de fechar um
          canto de linhas arredondado tambem". */}
      <label className="mt-3 flex items-center justify-between gap-2 text-[11px] text-slate-600">
        Raio do canto -- Fillet (mm)
        <input
          type="number"
          min={0}
          step={10}
          value={filletRaio}
          onChange={(e) => setFilletRaio(Number(e.target.value))}
          className="w-16 rounded border border-slate-200 px-1 py-0.5"
          title={'0 = canto reto ("em bico"); um valor > 0 arredonda o canto com um arco desse raio no próximo FILLET (clique em duas linhas)'}
        />
      </label>

      {blocoSelecionado && (
        <div className="mt-2 space-y-1.5 rounded border border-blue-200 bg-blue-50/50 p-1.5">
          <p className="text-[10px] font-medium uppercase tracking-wide text-blue-700">Bloco selecionado</p>
          <label className="block text-[11px] text-slate-600">
            Rotação (° -- 0 a 360)
            <input
              type="number"
              step={1}
              value={Math.round(blocoSelecionado.rotacao ?? 0)}
              onChange={(e) => atualizarBloco(blocoSelecionado.id, { rotacao: Number(e.target.value) || 0 })}
              className="mt-0.5 w-full rounded border border-slate-200 px-1.5 py-1 text-[11px]"
              title="Gira em tempo real em volta do ponto de inserção"
            />
          </label>
          <div className="flex gap-1.5">
            <label className="block flex-1 text-[11px] text-slate-600">
              Escala X
              <input
                type="number"
                min={0.05}
                step={0.1}
                value={blocoSelecionado.escalaX ?? blocoSelecionado.escala ?? 1}
                onChange={(e) =>
                  atualizarBloco(blocoSelecionado.id, { escalaX: Math.max(0.05, Number(e.target.value) || 1) })
                }
                className="mt-0.5 w-full rounded border border-slate-200 px-1.5 py-1 text-[11px]"
              />
            </label>
            <label className="block flex-1 text-[11px] text-slate-600">
              Escala Y
              <input
                type="number"
                min={0.05}
                step={0.1}
                value={blocoSelecionado.escalaY ?? blocoSelecionado.escala ?? 1}
                onChange={(e) =>
                  atualizarBloco(blocoSelecionado.id, { escalaY: Math.max(0.05, Number(e.target.value) || 1) })
                }
                className="mt-0.5 w-full rounded border border-slate-200 px-1.5 py-1 text-[11px]"
              />
            </label>
          </div>
        </div>
      )}

      {hachuraSelecionada && hachuravelSelecionado && (
        <div className="mt-2 space-y-1.5 rounded border border-amber-200 bg-amber-50/50 p-1.5">
          <p className="text-[10px] font-medium uppercase tracking-wide text-amber-700">Hachura do objeto selecionado</p>
          <label className="block text-[11px] text-slate-600">
            Padrão
            <select
              value={hachuraSelecionada.tipo}
              onChange={(e) =>
                atualizarHachuraObjeto(hachuravelSelecionado.id, { tipo: e.target.value as HachuraTipo })
              }
              className="mt-0.5 w-full rounded border border-slate-200 px-1.5 py-1 text-[11px]"
            >
              {HACHURA_OPCOES.map((o) => (
                <option key={o.valor} value={o.valor}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end gap-1.5">
            <label className="block flex-1 text-[11px] text-slate-600">
              Escala (zoom do padrão)
              <input
                type="number"
                min={0.1}
                step={0.1}
                value={hachuraSelecionada.escala}
                onChange={(e) =>
                  atualizarHachuraObjeto(hachuravelSelecionado.id, {
                    escala: Math.max(0.1, Number(e.target.value) || 1),
                  })
                }
                className="mt-0.5 w-full rounded border border-slate-200 px-1.5 py-1 text-[11px]"
                title="Aumenta/diminui o zoom do padrão de hachura SEM alterar o tamanho da forma"
              />
            </label>
            <label className="flex items-center gap-1 pb-0.5 text-[11px] text-slate-600" title="Cor da hachura">
              <input
                type="color"
                value={hachuraSelecionada.cor}
                onChange={(e) => atualizarHachuraObjeto(hachuravelSelecionado.id, { cor: e.target.value })}
                className="h-6 w-6 shrink-0 cursor-pointer border-0 bg-transparent p-0"
              />
              Cor
            </label>
          </div>
        </div>
      )}

      {viewportSelecionado && (
        <div className="mt-2 space-y-1.5 rounded border border-purple-200 bg-purple-50/50 p-1.5">
          <p className="text-[10px] font-medium uppercase tracking-wide text-purple-700">Viewport selecionado</p>
          <label className="block text-[11px] text-slate-600">
            Escala de impressão (1 : N)
            <input
              type="number"
              min={0.001}
              step={1}
              value={Math.round(viewportSelecionado.modelScale * 1000) / 1000}
              onChange={(e) =>
                atualizarViewport(viewportSelecionado.id, {
                  modelScale: Math.max(0.001, Number(e.target.value) || 1),
                })
              }
              className="mt-0.5 w-full rounded border border-slate-200 px-1.5 py-1 text-[11px]"
              title="mm de mundo por mm de papel dentro da janela -- calculado automaticamente pelo ZOOM WINDOW (Z/W), editável direto aqui também"
            />
          </label>
          <label className="block text-[11px] text-slate-600">
            Escala rápida (padrão)
            <select
              value={
                ESCALAS_RAPIDAS.includes(Math.round(viewportSelecionado.modelScale))
                  ? String(Math.round(viewportSelecionado.modelScale))
                  : ""
              }
              onChange={(e) => {
                const v = Number(e.target.value);
                if (v) atualizarViewport(viewportSelecionado.id, { modelScale: v });
              }}
              className="mt-0.5 w-full rounded border border-slate-200 px-1.5 py-1 text-[11px]"
              title="Escolha rápida de escala -- equivalente ao comando de zoom/escala nXP do AutoCAD, sem precisar digitar o número"
            >
              <option value="">Escolher 1:N...</option>
              {ESCALAS_RAPIDAS.map((n) => (
                <option key={n} value={n}>
                  1:{n}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-[11px] text-slate-600">
            <input
              type="checkbox"
              checked={viewportSelecionado.bordaVisivel}
              onChange={(e) => atualizarViewport(viewportSelecionado.id, { bordaVisivel: e.target.checked })}
            />
            Borda visível no PDF
          </label>
        </div>
      )}

      {pranchaAtiva && viewportPranchaSelecionado && (
        <div className="mt-2 space-y-1.5 rounded border border-purple-200 bg-purple-50/50 p-1.5">
          <p className="text-[10px] font-medium uppercase tracking-wide text-purple-700">
            Viewport da prancha selecionado
          </p>
          <label className="block text-[11px] text-slate-600">
            Escala de impressão (1 : N)
            <input
              type="number"
              min={0.001}
              step={1}
              value={Math.round(viewportPranchaSelecionado.modelScale * 1000) / 1000}
              onChange={(e) =>
                atualizarViewportDaPrancha(pranchaAtiva.id, viewportPranchaSelecionado.id, {
                  modelScale: Math.max(0.001, Number(e.target.value) || 1),
                })
              }
              className="mt-0.5 w-full rounded border border-slate-200 px-1.5 py-1 text-[11px]"
              title="mm de mundo por mm de papel dentro da janela -- calculado automaticamente pelo ZOOM WINDOW (Z/W), editável direto aqui também"
            />
          </label>
          <label className="block text-[11px] text-slate-600">
            Escala rápida (padrão)
            <select
              value={
                ESCALAS_RAPIDAS.includes(Math.round(viewportPranchaSelecionado.modelScale))
                  ? String(Math.round(viewportPranchaSelecionado.modelScale))
                  : ""
              }
              onChange={(e) => {
                const v = Number(e.target.value);
                if (v) atualizarViewportDaPrancha(pranchaAtiva.id, viewportPranchaSelecionado.id, { modelScale: v });
              }}
              className="mt-0.5 w-full rounded border border-slate-200 px-1.5 py-1 text-[11px]"
              title="Escolha rápida de escala -- equivalente ao comando de zoom/escala nXP do AutoCAD, sem precisar digitar o número"
            >
              <option value="">Escolher 1:N...</option>
              {ESCALAS_RAPIDAS.map((n) => (
                <option key={n} value={n}>
                  1:{n}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-[11px] text-slate-600">
            <input
              type="checkbox"
              checked={viewportPranchaSelecionado.bordaVisivel}
              onChange={(e) =>
                atualizarViewportDaPrancha(pranchaAtiva.id, viewportPranchaSelecionado.id, {
                  bordaVisivel: e.target.checked,
                })
              }
            />
            Borda visível no PDF
          </label>
        </div>
      )}

      {selecionadoIds.length >= 1 && (
        <div className="mt-2 space-y-1.5 rounded border border-blue-200 bg-blue-50/50 p-1.5">
          <p className="text-[10px] font-medium uppercase tracking-wide text-blue-700">
            Seleção ({selecionadoIds.length})
          </p>
          <label className="block text-[11px] text-slate-600">
            Camada
            <select
              value={camadaComumSelecao}
              onChange={(e) => {
                if (e.target.value) atualizarCamadaSelecao(e.target.value);
              }}
              className="mt-0.5 w-full rounded border border-slate-200 px-1.5 py-1 text-[11px]"
              title="Move todos os elementos selecionados pra esta camada"
            >
              <option value="" disabled>
                {geometriaSelecionada.length > 1 ? "(camadas diferentes)" : "Selecione..."}
              </option>
              {listaCamadas.map((c) => (
                <option key={c.nome} value={c.nome}>
                  {c.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-[11px] text-slate-600">
            Girar seleção (Δ°, em volta do centro da seleção)
            <div className="mt-0.5 flex gap-1">
              <input
                type="number"
                step={1}
                value={anguloGrupo}
                onChange={(e) => setAnguloGrupo(e.target.value)}
                className="w-full rounded border border-slate-200 px-1.5 py-1 text-[11px]"
              />
              <button
                type="button"
                onClick={handleAplicarGiroGrupo}
                className="shrink-0 rounded bg-blue-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-blue-700"
              >
                Aplicar
              </button>
            </div>
          </label>
          <div className="text-[11px] text-slate-600">
            Escalar seleção (em volta do centro da seleção)
            <label className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-600">
              <input
                type="checkbox"
                checked={escalaProporcional}
                onChange={(e) => handleToggleProporcional(e.target.checked)}
              />
              Proporcional (automático)
            </label>
            <div className="mt-0.5 flex gap-1">
              <label className="block flex-1 text-[10px] text-slate-500">
                Escala X
                <input
                  type="number"
                  min={0.01}
                  step={0.1}
                  value={fatorXGrupo}
                  onChange={(e) => handleFatorXChange(e.target.value)}
                  className="mt-0.5 w-full rounded border border-slate-200 px-1.5 py-1 text-[11px]"
                  title="Ex.: 2 dobra de tamanho no eixo X, 0.5 reduz pela metade -- espelha pro Y se 'Proporcional' estiver marcado"
                />
              </label>
              <label className="block flex-1 text-[10px] text-slate-500">
                Escala Y
                <input
                  type="number"
                  min={0.01}
                  step={0.1}
                  value={fatorYGrupo}
                  disabled={escalaProporcional}
                  onChange={(e) => handleFatorYChange(e.target.value)}
                  className="mt-0.5 w-full rounded border border-slate-200 px-1.5 py-1 text-[11px] disabled:bg-slate-100 disabled:text-slate-400"
                  title="Fator de escala no eixo Y -- editável direto só com 'Proporcional' desmarcado"
                />
              </label>
              <button
                type="button"
                onClick={handleAplicarEscalaGrupo}
                className="shrink-0 self-end rounded bg-blue-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-blue-700"
              >
                Aplicar
              </button>
            </div>
          </div>
        </div>
      )}

      {selecionadoIds.length === 0 && (
        <p className="mt-1.5 text-[10px] text-slate-400">
          Selecione 1 ou mais elementos (ferramenta Selecionar) para girar/escalar, ou um único texto, bloco ou
          viewport para editar as propriedades específicas dele.
        </p>
      )}
    </div>
  );
}
