import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Política de Privacidade -- Cad RD",
  description: "Como o Cad RD trata os dados da sua conta, dos seus projetos e das suas mensagens de suporte.",
};

/**
 * /privacidade
 * -----------------------------------------------------------------------
 * Iteração 45 -- melhoria sugerida e aceita pelo usuário: com o login
 * virando obrigatório para tudo (Iteração 45) e a versão Beta coletando
 * e-mail de conta + mensagens de suporte, faz sentido ter uma página
 * explicando isso em linguagem simples, em vez de deixar implícito.
 *
 * IMPORTANTE (mesma ressalva dada ao usuário no chat): este texto é um
 * RASCUNHO em linguagem simples, escrito a partir do que o próprio app
 * realmente faz -- não é aconselhamento jurídico. Antes de divulgar a URL
 * beta publicamente pra terceiros, vale a pena passar por um advogado
 * (ou pelo menos por alguém com mais familiaridade com a LGPD) pra
 * confirmar que cobre tudo que a lei exige pro seu caso específico.
 *
 * Rota estática separada (não um modal) de propósito -- política de
 * privacidade costuma precisar de uma URL própria, linkável (inclusive de
 * fora do app), e não faz sentido ficar atrás do gate de login obrigatório.
 * -----------------------------------------------------------------------
 */
export default function PaginaPrivacidade() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-10 text-sm leading-relaxed text-slate-700">
      <Link href="/" className="text-xs text-blue-600 hover:underline">
        ← Voltar para o Cad RD
      </Link>

      <h1 className="mt-4 text-xl font-semibold text-slate-900">Política de Privacidade -- Cad RD</h1>
      <p className="mt-1 text-xs text-slate-400">
        Versão Beta. Este é um rascunho em linguagem simples -- não substitui aconselhamento jurídico.
      </p>

      <div className="mt-3 rounded border-l-4 border-amber-500 bg-amber-50 px-3 py-2 text-xs leading-snug text-amber-800">
        🧪 O Cad RD está em fase Beta de testes. Esta página descreve como os dados são tratados HOJE, durante o
        Beta -- pode mudar conforme a ferramenta evolui (a data da última atualização fica no rodapé desta página).
      </div>

      <h2 className="mt-6 text-base font-semibold text-slate-800">1. Que dados são coletados</h2>
      <ul className="mt-2 list-disc space-y-1.5 pl-5">
        <li>
          <b>E-mail da conta</b> -- usado para criar/entrar na sua conta (login obrigatório para usar o editor) e
          para identificar quem é dono de cada projeto salvo.
        </li>
        <li>
          <b>Senha</b> -- gerenciada pelo Firebase Authentication (serviço de autenticação usado por trás do Cad
          RD); a senha em si não fica guardada em nenhum banco de dados do Cad RD em texto puro -- quem cuida da
          verificação é o próprio serviço de autenticação.
        </li>
        <li>
          <b>Dados do projeto/desenho</b> -- tudo que você desenha, cotas, camadas, textos do carimbo (nome do
          cliente, endereço, responsável técnico etc.) e imagens de referência (XREF) que você importar, quando
          salvos na nuvem.
        </li>
        <li>
          <b>Mensagens de sugestão/suporte</b> -- se você usar o botão &quot;💬 Sugestões&quot;, o texto que você
          escrever fica associado ao e-mail da sua conta, visível só para você e para quem administra o Cad RD.
        </li>
      </ul>

      <h2 className="mt-6 text-base font-semibold text-slate-800">2. Para que esses dados são usados</h2>
      <ul className="mt-2 list-disc space-y-1.5 pl-5">
        <li>Autenticar sua conta e manter sua sessão logada.</li>
        <li>Salvar e recuperar seus projetos entre dispositivos/sessões.</li>
        <li>Responder às suas mensagens de sugestão/suporte.</li>
        <li>
          Avisos importantes sobre o funcionamento da ferramenta (ex.: mudanças na versão Beta, encerramento do
          período gratuito).
        </li>
      </ul>
      <p className="mt-2">
        O Cad RD <b>não</b> vende, aluga ou compartilha seus dados com terceiros para fins de marketing ou
        publicidade.
      </p>

      <h2 className="mt-6 text-base font-semibold text-slate-800">3. Onde os dados ficam guardados</h2>
      <p className="mt-2">
        Conta, projetos e mensagens de suporte ficam guardados em serviços de nuvem de infraestrutura (o mesmo tipo
        de serviço usado por bancos, apps e sistemas de governo em geral) -- o Cad RD não guarda nada em servidor
        próprio. Se você estiver testando numa sessão sem conexão configurada com esses serviços, os dados ficam só
        no seu próprio navegador (localStorage), neste dispositivo.
      </p>
      <p className="mt-2">
        Imagens de referência (XREF, ex.: uma planta baixa em foto/PDF que você importa para calibrar o desenho por
        cima) ficam só no seu navegador -- nunca são enviadas para a nuvem, só metadados (nome, posição, escala).
      </p>

      <h2 className="mt-6 text-base font-semibold text-slate-800">4. Seus direitos</h2>
      <p className="mt-2">Você pode, a qualquer momento:</p>
      <ul className="mt-2 list-disc space-y-1.5 pl-5">
        <li>Excluir qualquer projeto salvo diretamente pelo &quot;📁 Meus Projetos&quot; (ícone 🗑, com confirmação).</li>
        <li>
          Pedir a exclusão completa da sua conta e de todos os seus dados (projetos, mensagens de suporte, e-mail)
          escrevendo para <b>rodrigues.solar@hotmail.com</b>.
        </li>
        <li>Pedir uma cópia dos seus dados salvos, pelo mesmo e-mail acima.</li>
      </ul>

      <h2 className="mt-6 text-base font-semibold text-slate-800">5. Cookies e armazenamento local</h2>
      <p className="mt-2">
        O Cad RD usa armazenamento local do navegador (localStorage) para manter sua sessão logada e, quando não há
        conexão com a nuvem configurada, para guardar seus projetos só neste dispositivo. Não usamos cookies de
        rastreamento de terceiros nem publicidade.
      </p>

      <h2 className="mt-6 text-base font-semibold text-slate-800">6. Sobre a cobrança futura</h2>
      <p className="mt-2">
        Durante a versão Beta, o Cad RD é gratuito. Depois do período de testes, o uso passa a ser cobrado -- os
        detalhes (valor e forma de cobrança) são avisados dentro do próprio app antes de qualquer cobrança
        começar, e o uso continua opcional.
      </p>

      <h2 className="mt-6 text-base font-semibold text-slate-800">7. Menores de idade</h2>
      <p className="mt-2">
        O Cad RD é uma ferramenta profissional voltada a projetistas e eletricistas, não é direcionado a crianças
        ou adolescentes.
      </p>

      <h2 className="mt-6 text-base font-semibold text-slate-800">8. Contato</h2>
      <p className="mt-2">
        Dúvidas sobre esta política, ou pedidos relacionados aos seus dados: <b>rodrigues.solar@hotmail.com</b>.
      </p>

      <p className="mt-8 text-xs text-slate-400">Última atualização: versão Beta -- Iteração 45.</p>
    </div>
  );
}
