import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Termos de Uso -- Cad RD",
  description: "Regras de uso do Cad RD durante e depois da versão Beta.",
};

/**
 * /termos
 * -----------------------------------------------------------------------
 * Iteração 45 (continuação) -- melhoria sugerida e aceita pelo usuário
 * junto com mais 4 outras, pedindo "avisos fáceis e limpos" e foco em não
 * confundir o usuário. Complementa a `/privacidade` (que fala de DADOS);
 * esta página fala de REGRAS DE USO -- em especial, deixar claro desde já
 * que a cobrança de R$49,90/mês começa depois do Beta, e que a ferramenta
 * não substitui a responsabilidade técnica de quem assina o projeto.
 *
 * MESMA ressalva dada para a `/privacidade`: rascunho em linguagem
 * simples, escrito a partir do que o app realmente faz -- não é
 * aconselhamento jurídico. Vale revisar com um advogado antes de divulgar
 * a URL beta amplamente, principalmente a parte de cobrança/cancelamento.
 * -----------------------------------------------------------------------
 */
export default function PaginaTermos() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-10 text-sm leading-relaxed text-slate-700">
      <Link href="/" className="text-xs text-blue-600 hover:underline">
        ← Voltar para o Cad RD
      </Link>

      <h1 className="mt-4 text-xl font-semibold text-slate-900">Termos de Uso -- Cad RD</h1>
      <p className="mt-1 text-xs text-slate-400">
        Versão Beta. Este é um rascunho em linguagem simples -- não substitui aconselhamento jurídico.
      </p>

      <div className="mt-3 rounded border-l-4 border-amber-500 bg-amber-50 px-3 py-2 text-xs leading-snug text-amber-800">
        🧪 Durante o Beta, o Cad RD é gratuito e pode mudar bastante conforme os testes avançam. Veja também a{" "}
        <Link href="/privacidade" className="underline">
          Política de Privacidade
        </Link>{" "}
        (fala de dados; esta página fala de regras de uso).
      </div>

      <h2 className="mt-6 text-base font-semibold text-slate-800">1. O que é o Cad RD</h2>
      <p className="mt-2">
        O Cad RD é uma ferramenta de apoio ao desenho de diagramas e projetos elétricos. Ela ajuda a desenhar,
        calcular e organizar informações -- mas <b>não substitui</b> a responsabilidade técnica de quem assina o
        projeto. Cabe sempre ao profissional (projetista/eletricista responsável) conferir se o resultado atende às
        normas técnicas aplicáveis (ex.: NBR 5410) e à legislação do seu município/concessionária antes de usar o
        projeto na prática.
      </p>

      <h2 className="mt-6 text-base font-semibold text-slate-800">2. Versão Beta e cobrança futura</h2>
      <ul className="mt-2 list-disc space-y-1.5 pl-5">
        <li>Durante o Beta, o uso é gratuito.</li>
        <li>
          Depois do Beta, o uso passa a ser cobrado -- valor atual: <b>R$49,90 por mês</b>. Qualquer mudança nesse
          valor, ou o início da cobrança em si, é avisado dentro do próprio app com antecedência, nunca cobrado de
          surpresa.
        </li>
        <li>Você pode cancelar o uso a qualquer momento -- os detalhes de como cancelar são avisados junto com o início da cobrança.</li>
      </ul>

      <h2 className="mt-6 text-base font-semibold text-slate-800">3. Seus projetos continuam seus</h2>
      <p className="mt-2">
        Os projetos que você cria e salva pertencem a você. O Cad RD guarda esses dados só para permitir que você
        acesse e edite depois (ver <Link href="/privacidade" className="text-blue-600 hover:underline">Política de Privacidade</Link>) --
        não usa o conteúdo dos seus projetos para nenhum outro fim.
      </p>

      <h2 className="mt-6 text-base font-semibold text-slate-800">4. Uso adequado</h2>
      <p className="mt-2">Ao usar o Cad RD, pedimos que você:</p>
      <ul className="mt-2 list-disc space-y-1.5 pl-5">
        <li>Não tente burlar, sobrecarregar ou automatizar o uso da ferramenta de forma abusiva.</li>
        <li>Não envie, pelo chat de sugestões/suporte, conteúdo ofensivo, ilegal ou spam.</li>
        <li>Use uma conta por pessoa/empresa.</li>
      </ul>

      <h2 className="mt-6 text-base font-semibold text-slate-800">5. Disponibilidade durante o Beta</h2>
      <p className="mt-2">
        Por ser uma versão de testes, o Cad RD é oferecido &quot;como está&quot;, podendo apresentar instabilidades
        -- por isso o autosave e o botão de baixar uma cópia do projeto (.json) existem, como uma camada extra de
        segurança para o seu trabalho. Reportar problemas pelo &quot;💬 Sugestões&quot; ajuda a melhorar a
        ferramenta pra todo mundo.
      </p>

      <h2 className="mt-6 text-base font-semibold text-slate-800">6. Mudanças nestes Termos</h2>
      <p className="mt-2">
        Estes termos podem mudar conforme a ferramenta evolui (a data da última atualização fica no rodapé desta
        página). Mudanças relevantes -- principalmente sobre cobrança -- são avisadas dentro do próprio app.
      </p>

      <h2 className="mt-6 text-base font-semibold text-slate-800">7. Contato</h2>
      <p className="mt-2">
        Dúvidas sobre estes Termos: <b>rodrigues.solar@hotmail.com</b>.
      </p>

      <p className="mt-8 text-xs text-slate-400">Última atualização: versão Beta -- Iteração 45.</p>
    </div>
  );
}
