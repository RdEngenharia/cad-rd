"use client";

/**
 * AiCommandLine.tsx
 * -----------------------------------------------------------------------
 * Barra de comando IA, no mesmo espírito visual da `CommandLine.tsx`
 * estilo AutoCAD já existente, mas para pedidos em LINGUAGEM NATURAL
 * (ex.: "trace uma linha de 0,0 até 100,0 na camada BARRAMENTO") em vez
 * de comandos abreviados (L/C/REC...).
 *
 * Fluxo, em 2 etapas -- cada uma rodando no lugar certo:
 *   1. Envia `{ userPrompt, cadContextJson }` para a rota de servidor
 *      `app/api/ai-command/route.ts` via `fetch`, que é quem de fato
 *      chama `lib/anthropicService.ts#sendCadCommand` (só no servidor,
 *      onde a chave de API pode ficar segura).
 *   2. Com o JSON bruto devolvido, chama `lib/cadCommandParser.ts#executeAiCommand`
 *      AQUI no cliente, contra um pequeno adaptador (`cadEngineApi`) que
 *      traduz as ações suportadas (DRAW_LINE/DRAW_CIRCLE/ERASE/SET_COLOR)
 *      para as ações reais do Zustand store (`addGeometria`/
 *      `removeGeometria`/`atualizarCamada`) -- é aqui, no navegador, que
 *      o estado real do desenho vive, então a execução TEM que acontecer
 *      no cliente.
 *
 * IMPORTANTE: este componente NUNCA importa `lib/anthropicService.ts`
 * diretamente -- só a rota de servidor pode chamá-lo (ver o comentário
 * de segurança no topo daquele arquivo e da rota). Ver também a nota de
 * integração no topo de `lib/cadCommandParser.ts`: o vocabulário de
 * ações que o `System Prompt` de `anthropicService.ts` hoje instrui o
 * modelo a usar (`criar_linha`, `apagar`, etc., em português) ainda
 * precisa ser reconciliado com o vocabulário que `cadCommandParser.ts`
 * entende (`DRAW_LINE`, `ERASE`, etc.) para este fluxo funcionar
 * ponta a ponta -- fora do escopo deste componente corrigir isso.
 * -----------------------------------------------------------------------
 */

import { useCallback, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useCadStore } from "@/lib/store";
import { executeAiCommand } from "@/lib/cadCommandParser";

type StatusTipo = "idle" | "sucesso" | "erro";

export function AiCommandLine() {
  const [prompt, setPrompt] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [status, setStatus] = useState<{ tipo: StatusTipo; mensagem: string }>({ tipo: "idle", mensagem: "" });

  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const projeto = useCadStore((s) => s.projeto);
  const activeLayer = useCadStore((s) => s.activeLayer);
  const addGeometria = useCadStore((s) => s.addGeometria);
  const removeGeometria = useCadStore((s) => s.removeGeometria);
  const atualizarCamada = useCadStore((s) => s.atualizarCamada);
  const pushComando = useCadStore((s) => s.pushComando);

  /**
   * Adaptador `cadEngineApi` esperado por `executeAiCommand` (tipo `any`
   * do lado de `cadCommandParser.ts`) -- traduz as 4 ações suportadas
   * para as ações reais do store. Reconstruído a cada envio (não
   * memoizado): é barato e evita qualquer stale closure sobre
   * `projeto`/`activeLayer`, que mudam a cada desenho.
   */
  function criarCadEngineApi() {
    return {
      drawLine: (x1: number, y1: number, x2: number, y2: number) => {
        addGeometria({ tipo: "linha", camada: activeLayer, x1, y1, x2, y2 });
      },
      drawCircle: (x: number, y: number, radius: number) => {
        addGeometria({ tipo: "circulo", camada: activeLayer, x, y, raio: radius });
      },
      erase: (id: string) => {
        removeGeometria(id);
      },
      // O modelo de dados atual só tem cor POR CAMADA (não por elemento
      // individual, ver `Camada.cor` em lib/types.ts) -- então SET_COLOR
      // é aproximado recolorindo a camada do elemento-alvo inteira, não
      // só aquele elemento. Documentado aqui de propósito: se o projeto
      // ganhar cor por elemento no futuro, esta função é o único lugar a
      // ajustar.
      setColor: (id: string, color: string) => {
        const alvo = projeto.geometria.find((g) => g.id === id);
        if (!alvo) throw new Error(`Elemento "${id}" não encontrado no projeto.`);
        atualizarCamada(alvo.camada, { cor: color });
      },
      // GERAR_PROJETO_FV (Iteração 12b) foi removido na Iteração 13 -- o
      // gerador de diagrama fotovoltaico agora é um botão + modal
      // dedicado (`DiagramaFvModal.tsx`), sem depender de IA/chave de API.
    };
  }

  const cancelarRequisicaoEmAndamento = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const enviar = useCallback(async () => {
    const texto = prompt.trim();
    if (!texto || carregando) return;

    cancelarRequisicaoEmAndamento();
    const controller = new AbortController();
    abortRef.current = controller;

    setCarregando(true);
    setStatus({ tipo: "idle", mensagem: "" });

    try {
      const resposta = await fetch("/api/ai-command", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userPrompt: texto, cadContextJson: JSON.stringify(projeto) }),
        signal: controller.signal,
      });

      const corpo = (await resposta.json()) as { raw?: string; error?: string };

      if (!resposta.ok || !corpo.raw) {
        const mensagemErro = corpo.error || `Erro HTTP ${resposta.status} ao consultar a IA.`;
        setStatus({ tipo: "erro", mensagem: mensagemErro });
        pushComando(`IA: ${mensagemErro}`);
        return;
      }

      const cadEngineApi = criarCadEngineApi();
      const resultado: { message: string } = { message: "" };
      const sucesso = executeAiCommand(corpo.raw, cadEngineApi, resultado);

      setStatus({ tipo: sucesso ? "sucesso" : "erro", mensagem: resultado.message });
      pushComando(`IA: ${resultado.message}`);
      if (sucesso) setPrompt("");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        // Cancelado pelo próprio usuário (Esc) -- não é um erro a reportar.
        return;
      }
      const detalhe = err instanceof Error ? err.message : String(err);
      const mensagemErro = `Falha de rede ao consultar a IA: ${detalhe}`;
      setStatus({ tipo: "erro", mensagem: mensagemErro });
      pushComando(`IA: ${mensagemErro}`);
    } finally {
      setCarregando(false);
      abortRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `criarCadEngineApi` depende de closures do store recriadas a cada render; capturar tudo aqui geraria uma função nova a cada tecla sem benefício real.
  }, [prompt, carregando, projeto, pushComando, cancelarRequisicaoEmAndamento]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void enviar();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Escape") return;
    e.preventDefault();
    if (carregando) {
      // Esc durante uma requisição em andamento cancela a chamada, sem
      // limpar o que o usuário já digitou.
      cancelarRequisicaoEmAndamento();
      setCarregando(false);
      setStatus({ tipo: "idle", mensagem: "" });
      return;
    }
    // Esc sem requisição em andamento: limpa o campo, igual ao Esc do
    // resto do editor (cancela o que estiver "em andamento").
    setPrompt("");
    setStatus({ tipo: "idle", mensagem: "" });
    inputRef.current?.blur();
  }

  const corStatus =
    status.tipo === "sucesso" ? "text-emerald-400" : status.tipo === "erro" ? "text-red-400" : "text-slate-400";

  return (
    <div className="flex shrink-0 flex-col border-t border-slate-700 bg-slate-900 text-slate-100">
      {status.mensagem && (
        <div className={`truncate px-2 pt-1 font-mono text-[11px] leading-snug ${corStatus}`} title={status.mensagem}>
          {status.mensagem}
        </div>
      )}
      <form onSubmit={handleSubmit} className="flex items-center gap-2 px-2 py-1.5">
        <span className="shrink-0 font-mono text-[11px] text-violet-400">🤖 IA:</span>
        <input
          ref={inputRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={carregando}
          placeholder='Descreva o que desenhar (ex.: "trace uma linha de 0,0 até 100,0") · Enter envia · Esc cancela'
          className="flex-1 bg-transparent font-mono text-[12px] text-slate-50 outline-none placeholder:text-slate-500 disabled:opacity-50"
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="submit"
          disabled={carregando || !prompt.trim()}
          className="flex shrink-0 items-center gap-1.5 rounded bg-violet-600 px-2.5 py-1 font-mono text-[11px] font-medium text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
        >
          {carregando ? (
            <>
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              Pensando...
            </>
          ) : (
            "Enviar"
          )}
        </button>
      </form>
    </div>
  );
}
