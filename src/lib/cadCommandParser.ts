/**
 * cadCommandParser.ts
 * -----------------------------------------------------------------------
 * Interpretador de comandos (Command Pattern) para o CAD: recebe o JSON
 * bruto devolvido pela IA (ver `anthropicService.ts`) e roteia cada
 * comando reconhecido para a chamada correspondente na `cadEngineApi` já
 * existente do projeto. Não faz nenhuma chamada de rede (isso é
 * responsabilidade de `anthropicService.ts`) e não conhece nada de
 * UI/React/DOM -- só parseia e roteia.
 *
 * NOTA DE INTEGRAÇÃO: o vocabulário de ações aqui (`DRAW_LINE`/
 * `DRAW_CIRCLE`/`ERASE`/`SET_COLOR`, em inglês/UPPER_SNAKE) é o MESMO que
 * o System Prompt de `anthropicService.ts` instrui o modelo a usar -- os
 * dois arquivos precisam ficar sempre em sincronia (um novo `action` só
 * funciona ponta a ponta se existir dos dois lados, com os mesmos nomes
 * de parâmetro).
 *
 * NOTA (Iteração 13): o comando `GERAR_PROJETO_FV` (gerador de diagrama
 * fotovoltaico via IA, Iteração 12b) foi REMOVIDO deste arquivo -- a
 * pedido explícito do usuário, o gerador agora vive inteiramente atrás de
 * um botão + modal estruturado (`components/DiagramaFvModal.tsx`), sem
 * depender de IA/chave de API nenhuma. O "molde" puro que calcula o
 * layout (`lib/diagramaFv.ts#construirGeometriaDiagramaFv`) continua o
 * mesmo -- só a origem dos dados mudou (formulário em vez de linguagem
 * natural interpretada por IA).
 *
 * NOTA DE ASSINATURA: o requisito pediu
 * `executeAiCommand(jsonResponse: string, cadEngineApi: any): boolean`
 * E, ao mesmo tempo, que a função "retorne um booleano... e uma mensagem
 * explicativa" -- as duas coisas não cabem ao mesmo tempo num retorno
 * `: boolean` puro. Resolvido mantendo a assinatura pedida EXATAMENTE
 * (2 parâmetros obrigatórios, retorno `boolean`) e acrescentando um 3º
 * parâmetro OPCIONAL de saída (`resultado`, no espírito do `out` do C#/
 * `TryParse`) que recebe a mensagem quando informado -- quem só precisa
 * do booleano chama a função exatamente como pedido, sem quebrar nada.
 * `executeAiCommandWithResult`, no fim do arquivo, é um atalho opcional
 * pra quem preferir só um objeto `{ success, message }` de volta.
 * -----------------------------------------------------------------------
 */

/** Ações de CAD suportadas por este interpretador. */
export type CadCommandAction = "DRAW_LINE" | "DRAW_CIRCLE" | "ERASE" | "SET_COLOR" | "UNKNOWN";

/**
 * Um comando individual já normalizado: `action` é sempre um dos valores
 * válidos acima (uma ação não reconhecida vira `"UNKNOWN"`, nunca lança);
 * `params` carrega os argumentos específicos daquela ação (ex.: x1/y1/x2/y2
 * para `DRAW_LINE`), validados individualmente na hora de executar.
 */
export interface CadCommand {
  action: CadCommandAction;
  params: Record<string, unknown>;
}

/**
 * Envelope esperado no JSON da IA -- compatível com o contrato de
 * `anthropicService.ts` (`{ "commands": [...], "resposta_texto": "..." }`).
 * Um único comando solto na raiz (`{ "action": ..., "params": ... }`,
 * sem o envelope) também é aceito, ver `extrairComandos`.
 */
interface CadCommandEnvelope {
  commands?: unknown;
  resposta_texto?: string;
}

/** Conjunto das ações válidas, usado para normalizar qualquer string desconhecida em `"UNKNOWN"`. */
const ACOES_VALIDAS: ReadonlySet<string> = new Set<CadCommandAction>([
  "DRAW_LINE",
  "DRAW_CIRCLE",
  "ERASE",
  "SET_COLOR",
  "UNKNOWN",
]);

function normalizarAcao(valor: unknown): CadCommandAction {
  return typeof valor === "string" && ACOES_VALIDAS.has(valor) ? (valor as CadCommandAction) : "UNKNOWN";
}

/** Normaliza um item bruto (de qualquer shape) num `CadCommand` válido -- nunca lança. */
function normalizarComando(bruto: unknown): CadCommand {
  if (typeof bruto !== "object" || bruto === null) {
    return { action: "UNKNOWN", params: {} };
  }
  const obj = bruto as Record<string, unknown>;
  const params = typeof obj.params === "object" && obj.params !== null ? (obj.params as Record<string, unknown>) : {};
  return { action: normalizarAcao(obj.action), params };
}

/**
 * Extrai a lista de comandos do JSON já parseado (`JSON.parse` bruto,
 * tipo `unknown`) -- aceita tanto o envelope `{ commands: [...] }` quanto
 * um único comando solto na raiz (`{ action, params }`). Qualquer shape
 * inesperado devolve uma lista vazia (tratado como falha por
 * `executeAiCommand`, nunca como exceção).
 */
function extrairComandos(dados: unknown): CadCommand[] {
  if (typeof dados !== "object" || dados === null) return [];
  const envelope = dados as CadCommandEnvelope;

  if (Array.isArray(envelope.commands)) {
    return envelope.commands.map(normalizarComando);
  }
  if ("action" in envelope) {
    return [normalizarComando(envelope)];
  }
  return [];
}

// -- Validação defensiva de parâmetros -------------------------------------
// A resposta vem de um modelo de linguagem (via `anthropicService.ts`) e
// `cadEngineApi` é `any` -- nenhum dos dois é confiável em tempo de
// compilação, então cada parâmetro é validado em tempo de execução antes
// de ser repassado ao engine.

function numeroValido(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function textoValido(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- `cadEngineApi` é `any` por requisito explícito (engine existente do projeto, tipagem própria fora do escopo deste arquivo). */
function metodoDisponivel(cadEngineApi: any, nomeMetodo: string): boolean {
  return cadEngineApi != null && typeof cadEngineApi[nomeMetodo] === "function";
}

/**
 * Executa UM comando já normalizado contra a `cadEngineApi`. Nunca deixa
 * uma exceção escapar -- qualquer erro lançado pelo próprio engine (ex.:
 * um id que não existe mais) é capturado e reportado como falha, sem
 * derrubar o restante da execução em lote de `executeAiCommand`.
 *
 * Nomes de método assumidos (`drawLine`/`drawCircle`/`erase`/`setColor`):
 * só `drawLine` foi dado como exemplo no requisito -- os demais seguem a
 * mesma convenção de nomenclatura; ajuste aqui se a `cadEngineApi` real
 * do projeto usar nomes diferentes.
 */
function executarComando(comando: CadCommand, cadEngineApi: any): { sucesso: boolean; mensagem: string } {
  try {
    switch (comando.action) {
      case "DRAW_LINE": {
        const { x1, y1, x2, y2 } = comando.params;
        if (!numeroValido(x1) || !numeroValido(y1) || !numeroValido(x2) || !numeroValido(y2)) {
          return { sucesso: false, mensagem: "DRAW_LINE: parâmetros x1/y1/x2/y2 ausentes ou inválidos." };
        }
        if (!metodoDisponivel(cadEngineApi, "drawLine")) {
          return { sucesso: false, mensagem: "DRAW_LINE: cadEngineApi.drawLine não está disponível." };
        }
        cadEngineApi.drawLine(x1, y1, x2, y2);
        return { sucesso: true, mensagem: `Linha desenhada de (${x1}, ${y1}) até (${x2}, ${y2}).` };
      }

      case "DRAW_CIRCLE": {
        const { x, y, radius } = comando.params;
        if (!numeroValido(x) || !numeroValido(y) || !numeroValido(radius) || radius <= 0) {
          return { sucesso: false, mensagem: "DRAW_CIRCLE: parâmetros x/y/radius ausentes ou inválidos." };
        }
        if (!metodoDisponivel(cadEngineApi, "drawCircle")) {
          return { sucesso: false, mensagem: "DRAW_CIRCLE: cadEngineApi.drawCircle não está disponível." };
        }
        cadEngineApi.drawCircle(x, y, radius);
        return { sucesso: true, mensagem: `Círculo desenhado em (${x}, ${y}) com raio ${radius}.` };
      }

      case "ERASE": {
        const { id } = comando.params;
        if (!textoValido(id)) {
          return { sucesso: false, mensagem: "ERASE: parâmetro id ausente ou inválido." };
        }
        if (!metodoDisponivel(cadEngineApi, "erase")) {
          return { sucesso: false, mensagem: "ERASE: cadEngineApi.erase não está disponível." };
        }
        cadEngineApi.erase(id);
        return { sucesso: true, mensagem: `Elemento "${id}" apagado.` };
      }

      case "SET_COLOR": {
        const { id, color } = comando.params;
        if (!textoValido(id) || !textoValido(color)) {
          return { sucesso: false, mensagem: "SET_COLOR: parâmetros id/color ausentes ou inválidos." };
        }
        if (!metodoDisponivel(cadEngineApi, "setColor")) {
          return { sucesso: false, mensagem: "SET_COLOR: cadEngineApi.setColor não está disponível." };
        }
        cadEngineApi.setColor(id, color);
        return { sucesso: true, mensagem: `Cor do elemento "${id}" alterada para ${color}.` };
      }

      case "UNKNOWN":
        return { sucesso: false, mensagem: 'Comando desconhecido ou não suportado (action = "UNKNOWN").' };
    }
  } catch (err) {
    const detalhe = err instanceof Error ? err.message : String(err);
    return { sucesso: false, mensagem: `Erro ao executar ${comando.action}: ${detalhe}` };
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Saída opcional (por referência) de `executeAiCommand` -- ver nota de assinatura no topo do arquivo. */
export interface CadCommandExecutionResult {
  message: string;
}

/**
 * Função principal: interpreta `jsonResponse` (a resposta bruta da IA,
 * ainda como string) e executa cada comando reconhecido contra
 * `cadEngineApi`. `JSON.parse` roda dentro de um try/catch dedicado --
 * um JSON malformatado nunca derruba o chamador, só resulta em `false` +
 * mensagem de erro.
 *
 * @param jsonResponse  Resposta bruta da IA (string; ver `anthropicService.ts#sendCadCommand`).
 * @param cadEngineApi  Engine de CAD existente do projeto (tipo `any` -- fora do escopo deste arquivo).
 * @param resultado     Parâmetro de saída opcional: se informado, `resultado.message` é preenchido com a mensagem explicativa do que foi executado (ou do erro).
 * @returns `true` somente se TODOS os comandos da resposta foram executados com sucesso; `false` em qualquer falha de parse, comando desconhecido, parâmetro inválido, ou erro do engine.
 */
export function executeAiCommand(
  jsonResponse: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- requisito explícito da assinatura.
  cadEngineApi: any,
  resultado?: CadCommandExecutionResult
): boolean {
  let dados: unknown;
  try {
    dados = JSON.parse(jsonResponse);
  } catch (err) {
    const detalhe = err instanceof Error ? err.message : String(err);
    if (resultado) resultado.message = `Falha ao interpretar o JSON retornado pela IA: ${detalhe}`;
    return false;
  }

  const comandos = extrairComandos(dados);
  if (comandos.length === 0) {
    if (resultado) resultado.message = "Nenhum comando reconhecível encontrado na resposta da IA.";
    return false;
  }

  const mensagens: string[] = [];
  let todosComSucesso = true;
  for (const comando of comandos) {
    const { sucesso, mensagem } = executarComando(comando, cadEngineApi);
    mensagens.push(mensagem);
    if (!sucesso) todosComSucesso = false;
  }

  if (resultado) resultado.message = mensagens.join(" | ");
  return todosComSucesso;
}

/**
 * Atalho ergonômico para quem prefere receber sucesso + mensagem juntos
 * num único objeto, sem lidar com o parâmetro de saída por referência de
 * `executeAiCommand`. Comportamento idêntico por baixo dos panos.
 */
export function executeAiCommandWithResult(
  jsonResponse: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mesmo motivo de `executeAiCommand`.
  cadEngineApi: any
): { success: boolean; message: string } {
  const resultado: CadCommandExecutionResult = { message: "" };
  const success = executeAiCommand(jsonResponse, cadEngineApi, resultado);
  return { success, message: resultado.message };
}
