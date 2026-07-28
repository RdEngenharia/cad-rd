/**
 * app/api/ai-command/route.ts
 * -----------------------------------------------------------------------
 * Route Handler (server-side, Next.js App Router) que expõe
 * `sendCadCommand` (ver `lib/anthropicService.ts`) para o cliente via
 * HTTP -- é a ÚNICA ponte permitida entre o navegador e a API da
 * Anthropic. `anthropicService.ts` lê `ANTHROPIC_API_KEY` de
 * `process.env`, uma variável SEM o prefixo `NEXT_PUBLIC_`, então ela
 * nunca entra no bundle do cliente; chamar `sendCadCommand` só é seguro
 * aqui, dentro de um Route Handler, que roda exclusivamente no servidor.
 *
 * `components/AiCommandLine.tsx` chama esta rota via `fetch("/api/ai-command")`
 * -- nunca importa `lib/anthropicService.ts` diretamente (isso rodaria
 * no navegador e quebraria/exporia a chave).
 * -----------------------------------------------------------------------
 */
import { NextResponse } from "next/server";
import { sendCadCommand, AnthropicServiceError } from "@/lib/anthropicService";

interface AiCommandRequestBody {
  userPrompt?: unknown;
  cadContextJson?: unknown;
}

export async function POST(request: Request) {
  let body: AiCommandRequestBody;
  try {
    body = (await request.json()) as AiCommandRequestBody;
  } catch {
    return NextResponse.json({ error: "Corpo da requisição não é um JSON válido." }, { status: 400 });
  }

  const { userPrompt, cadContextJson } = body;
  if (typeof userPrompt !== "string" || !userPrompt.trim()) {
    return NextResponse.json({ error: "Campo \"userPrompt\" é obrigatório e deve ser uma string não vazia." }, { status: 400 });
  }

  try {
    // `sendCadCommand` já devolve a resposta BRUTA do modelo (uma string
    // JSON) -- repassada como está para `cadCommandParser.ts` no
    // cliente interpretar; esta rota não faz `JSON.parse` nem executa
    // nenhum comando (isso é responsabilidade do cliente, que é quem tem
    // acesso ao estado real do CAD).
    const raw = await sendCadCommand(userPrompt, typeof cadContextJson === "string" ? cadContextJson : "{}");
    return NextResponse.json({ raw });
  } catch (err) {
    if (err instanceof AnthropicServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status ?? 502 });
    }
    const detalhe = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Erro inesperado ao chamar a IA: ${detalhe}` }, { status: 500 });
  }
}
