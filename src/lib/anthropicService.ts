/**
 * anthropicService.ts
 * -----------------------------------------------------------------------
 * Camada de serviço isolada para integração com a API da Anthropic
 * (Claude). Responsabilidade única: enviar um comando de usuário em
 * linguagem natural + o contexto atual do projeto CAD para o modelo, e
 * devolver a resposta bruta em JSON estruturado (comandos de desenho).
 *
 * Sem dependência de UI/gráfica -- só `fetch` nativo e tipos TypeScript
 * puros. Este arquivo NÃO manipula canvas nem desenha nada: só conversa
 * com a API e devolve texto. Fazer `JSON.parse()` do resultado e
 * executar os comandos é responsabilidade de outra camada, fora do
 * escopo deste serviço.
 *
 * IMPORTANTE (segurança): a chave é lida de `process.env.ANTHROPIC_API_KEY`,
 * ou seja, este serviço espera rodar num contexto server-side (rota de
 * API, server action ou server component). NUNCA chame esta função
 * diretamente do lado do cliente (browser) com a chave embutida no
 * bundle -- isso a exporia publicamente a qualquer visitante do site.
 * -----------------------------------------------------------------------
 */

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_API_VERSION = "2023-06-01";

/**
 * Modelo padrão usado nas chamadas. O identificador pedido originalmente
 * (`claude-3-5-sonnet-20000229`) não existe -- além do ano inválido
 * ("2000"), o formato de data correto de um model ID da Anthropic é
 * `AAAAMMDD`. Usamos aqui o modelo "Sonnet" (melhor equilíbrio entre
 * velocidade e inteligência) conforme a documentação oficial vigente
 * (https://platform.claude.com/docs/en/about-claude/models/overview).
 * Sobrescrevível via variável de ambiente, sem precisar editar código,
 * para acompanhar futuras atualizações de modelo sem quebrar o build.
 */
const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-5";
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL ?? DEFAULT_ANTHROPIC_MODEL;

/** Tokens máximos da resposta -- generoso o bastante para uma lista de comandos JSON, sem ficar caro. */
const MAX_TOKENS = 4096;

/** Timeout de rede -- evita a chamada travar indefinidamente em caso de instabilidade de conexão. */
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * System Prompt: define o papel do modelo (especialista em CAD 2D) e o
 * contrato de saída -- SEMPRE um único objeto JSON, sem nada fora dele.
 * `resposta_texto` é a única explicação em linguagem natural permitida,
 * e fica DENTRO do JSON (nunca solta, antes/depois do objeto).
 *
 * IMPORTANTE (vocabulário de ações): as ações e os nomes de parâmetros
 * abaixo (`DRAW_LINE`/`DRAW_CIRCLE`/`ERASE`/`SET_COLOR`/`UNKNOWN`, em
 * inglês/UPPER_SNAKE) são exatamente os que `lib/cadCommandParser.ts`
 * sabe interpretar -- ver `CadCommandAction` naquele arquivo. Este
 * prompt e aquele parser precisam ficar em sincronia: se um dia um novo
 * comando for adicionado ao parser, ele também precisa ser adicionado
 * aqui (e vice-versa), senão a IA vai gerar comandos que o parser não
 * reconhece (caem em "UNKNOWN") ou o parser vai receber ações que nunca
 * chegam a ser geradas.
 */
const SYSTEM_PROMPT = `Você é um assistente especialista em CAD 2D, focado em diagramas técnicos (ex.: diagramas unifilares elétricos). Você recebe um pedido do usuário em linguagem natural e o estado atual do projeto (em JSON, incluindo a lista de elementos existentes em "geometria", cada um com seu "id") e deve traduzir a intenção do usuário em uma lista de comandos de desenho estruturados.

REGRAS DE SAÍDA (obrigatórias):
1. Responda SEMPRE com um único objeto JSON válido, e NADA mais -- sem texto antes ou depois, sem blocos de código markdown (sem \`\`\`), sem comentários.
2. O JSON deve seguir exatamente este formato:
{
  "commands": [
    {
      "action": "DRAW_LINE" | "DRAW_CIRCLE" | "ERASE" | "SET_COLOR" | "UNKNOWN",
      "params": { "...": "parâmetros específicos da ação, descritos abaixo" }
    }
  ],
  "resposta_texto": "explicação curta, em português, do que foi feito ou por que não foi possível"
}
3. Use exatamente estas ações e estes parâmetros (nomes e tipos exatos -- números em unidades de mundo, mm, exceto onde indicado):
   - "DRAW_LINE": params = { "x1": number, "y1": number, "x2": number, "y2": number } -- desenha uma linha reta do ponto (x1,y1) ao ponto (x2,y2).
   - "DRAW_CIRCLE": params = { "x": number, "y": number, "radius": number } -- desenha um círculo de centro (x,y) e raio "radius".
   - "ERASE": params = { "id": string } -- apaga o elemento existente cujo "id" (retirado do "geometria" do contexto do projeto) corresponde ao alvo pedido pelo usuário.
   - "SET_COLOR": params = { "id": string, "color": string } -- muda a cor do elemento existente de "id" para "color" (uma cor CSS válida, ex.: "#ff0000" ou "red").
   - "UNKNOWN": params = {} -- use esta ação quando o pedido não puder ser traduzido em nenhuma das ações acima (ex.: pedido ambíguo, elemento não encontrado no contexto, uma operação não suportada como retângulo/mover/calcular área, ou um pedido de diagrama fotovoltaico completo -- essa geração automática agora tem um botão + modal dedicado no app, não passa mais por aqui). Sempre explique o motivo em "resposta_texto" neste caso.
4. Para "ERASE" e "SET_COLOR", só use um "id" que exista de fato em "geometria" no contexto do projeto -- nunca invente um id. Se não conseguir identificar o elemento-alvo com confiança, use "UNKNOWN" e peça esclarecimento em "resposta_texto".
5. Se o pedido for ambíguo, impossível, ou não puder ser traduzido em comandos, devolva "commands": [] (ou um único comando "UNKNOWN") e explique o motivo em "resposta_texto" -- nunca invente parâmetros.
6. Nunca inclua nenhuma chave além de "commands" e "resposta_texto" no objeto raiz.`;

/** Um bloco de conteúdo de texto da resposta da Messages API. */
interface AnthropicTextBlock {
  type: "text";
  text: string;
}

/** Formato (mínimo, só os campos usados aqui) da resposta da Messages API. */
interface AnthropicMessagesResponse {
  id: string;
  type: string;
  role: string;
  content: AnthropicTextBlock[];
  stop_reason: string | null;
  usage?: { input_tokens: number; output_tokens: number };
}

/** Formato do corpo de erro devolvido pela API em respostas não-2xx. */
interface AnthropicErrorResponse {
  type: "error";
  error: { type: string; message: string };
}

/**
 * Erro dedicado deste serviço -- permite ao chamador distinguir falhas
 * de rede/API (e reagir de forma específica, ex.: avisar "chave
 * inválida" na UI) de qualquer outro erro genérico da aplicação.
 */
export class AnthropicServiceError extends Error {
  /** Status HTTP da resposta, quando aplicável (ausente em falha de rede/timeout). */
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "AnthropicServiceError";
    this.status = status;
  }
}

/**
 * Envia um comando de usuário (linguagem natural) + o contexto atual do
 * projeto CAD (JSON serializado) para o Claude, e devolve a resposta
 * BRUTA do modelo -- uma string que é um objeto JSON estruturado de
 * comandos de desenho, conforme o contrato do System Prompt acima.
 * Fazer `JSON.parse()` do resultado e executar os comandos retornados é
 * responsabilidade de quem chama esta função; este serviço cuida
 * estritamente da comunicação com a API.
 *
 * @param userPrompt     Pedido do usuário em linguagem natural (ex.: "trace uma linha de A até B na camada BARRAMENTO").
 * @param cadContextJson Estado atual do projeto CAD, já serializado em JSON (geometria, camadas, seleção, etc.).
 * @returns String contendo um objeto JSON válido (comandos + resposta_texto).
 * @throws {AnthropicServiceError} em caso de chave de API ausente/inválida, erro de rede, timeout, ou resposta inesperada da API.
 */
export async function sendCadCommand(userPrompt: string, cadContextJson: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new AnthropicServiceError(
      "ANTHROPIC_API_KEY não configurada. Defina a variável de ambiente antes de chamar sendCadCommand()."
    );
  }

  const userMessage = [
    "Contexto atual do projeto CAD (JSON):",
    cadContextJson,
    "",
    "Pedido do usuário:",
    userPrompt,
  ].join("\n");

  // "Prefill" do turno do assistente com "{" -- técnica documentada da
  // Anthropic para forçar a resposta a começar direto em JSON, reduzindo
  // a chance do modelo abrir com texto solto ou um bloco de markdown. O
  // caractere é reanexado manualmente ao reconstruir a string final (ver
  // final da função), já que o modelo não repete o que já foi prefilled.
  const requestBody = {
    model: ANTHROPIC_MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [
      { role: "user", content: userMessage },
      { role: "assistant", content: "{" },
    ],
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_API_VERSION,
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new AnthropicServiceError(
        `Tempo limite (${REQUEST_TIMEOUT_MS}ms) excedido ao chamar a API da Anthropic.`
      );
    }
    const detalhe = err instanceof Error ? err.message : String(err);
    throw new AnthropicServiceError(`Falha de rede ao chamar a API da Anthropic: ${detalhe}`);
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    if (response.status === 401) {
      throw new AnthropicServiceError("Chave de API da Anthropic inválida ou não autorizada.", 401);
    }
    let mensagemErro = `Erro HTTP ${response.status} (${response.statusText}) na API da Anthropic.`;
    try {
      const corpoErro = (await response.json()) as AnthropicErrorResponse;
      if (corpoErro?.error?.message) {
        mensagemErro = `Erro da API da Anthropic (${response.status}): ${corpoErro.error.message}`;
      }
    } catch {
      // Corpo de erro não veio em JSON -- mantém a mensagem genérica acima.
    }
    throw new AnthropicServiceError(mensagemErro, response.status);
  }

  let data: AnthropicMessagesResponse;
  try {
    data = (await response.json()) as AnthropicMessagesResponse;
  } catch (err) {
    const detalhe = err instanceof Error ? err.message : String(err);
    throw new AnthropicServiceError(`Resposta da API da Anthropic não é um JSON válido: ${detalhe}`);
  }

  const textoResposta = data.content
    ?.filter((bloco): bloco is AnthropicTextBlock => bloco.type === "text")
    .map((bloco) => bloco.text)
    .join("");

  if (!textoResposta) {
    throw new AnthropicServiceError("Resposta da API da Anthropic não contém nenhum bloco de texto.");
  }

  // Reanexa o "{" do prefill (ver comentário acima) -- o modelo continua
  // a partir dali, então a resposta bruta devolvida pela API não o inclui.
  return `{${textoResposta}`;
}
