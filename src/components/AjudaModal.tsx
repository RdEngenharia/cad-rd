"use client";

import { useState } from "react";

interface Secao {
  id: string;
  titulo: string;
}

const SECOES: Secao[] = [
  { id: "primeiros-passos", titulo: "1. Primeiros passos: conta e projetos" },
  { id: "tela", titulo: "2. Conhecendo a tela" },
  { id: "desenho-prancha", titulo: "3. Desenho x Prancha (papel)" },
  { id: "comandos", titulo: "4. Ferramentas e a linha de comando" },
  { id: "atalhos", titulo: "5. Tabela de atalhos e comandos" },
  { id: "camadas", titulo: "6. Camadas (layers)" },
  { id: "blocos", titulo: "7. Biblioteca de blocos" },
  { id: "hachura", titulo: "8. Hachura" },
  { id: "geradores", titulo: "9. Geradores automáticos" },
  { id: "xref", titulo: "10. Referência externa (XREF)" },
  { id: "carimbo", titulo: "11. Carimbo e configurações" },
  { id: "exportar", titulo: "12. Exportando (PDF e DXF)" },
  { id: "tema", titulo: "13. Tema claro/escuro" },
  { id: "sugestoes", titulo: "14. Enviando sugestões e erros" },
];

interface AjudaModalProps {
  onFechar: () => void;
}

/**
 * AjudaModal
 * -----------------------------------------------------------------------
 * Iteração 45 -- o usuário já tinha pedido, junto com o resto da versão
 * Beta, um "manual passo a passo de como usar os comandos, botoes e
 * botoes automaticos". Isso foi entregue como um PDF separado
 * (`Manual-Cad-RD.pdf`), mas o usuário voltou pedindo especificamente um
 * "campo de ajuda" -- ou seja, o mesmo conteúdo tem que estar disponível
 * DENTRO do próprio programa, sem precisar sair do app pra abrir o PDF.
 *
 * Este modal reaproveita o mesmo texto do manual em PDF (mesmas 14
 * seções, mesma tabela de atalhos), como JSX navegável: um índice fixo à
 * esquerda com links de âncora, e o conteúdo rolável à direita. Acessível
 * pelo botão "❓ Ajuda" na `AuthPanel` -- disponível mesmo sem login, já
 * que é só documentação -- não precisa de conta pra consultar.
 * -----------------------------------------------------------------------
 */
export function AjudaModal({ onFechar }: AjudaModalProps) {
  const [secaoAtiva, setSecaoAtiva] = useState(SECOES[0].id);

  function irPara(id: string) {
    setSecaoAtiva(id);
    document.getElementById(`ajuda-conteudo`)?.querySelector(`#${id}`)?.scrollIntoView({ block: "start" });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-[1px]">
      <div className="flex h-[85vh] w-[820px] max-w-[95vw] flex-col rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">❓ Ajuda -- Manual do Cad RD</h2>
            <p className="text-[11px] text-slate-400">
              Passo a passo de como usar os comandos, botões e geradores automáticos.
            </p>
          </div>
          <button type="button" onClick={onFechar} className="text-slate-400 hover:text-slate-600" title="Fechar">
            ✕
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          <nav className="w-56 shrink-0 overflow-y-auto border-r border-slate-200 bg-slate-50 py-2">
            {SECOES.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => irPara(s.id)}
                className={`block w-full px-3 py-1.5 text-left text-[11px] leading-snug hover:bg-slate-100 ${
                  secaoAtiva === s.id ? "bg-blue-50 font-semibold text-blue-700" : "text-slate-600"
                }`}
              >
                {s.titulo}
              </button>
            ))}
          </nav>

          <div id="ajuda-conteudo" className="flex-1 overflow-y-auto px-5 py-4 text-[12.5px] leading-relaxed text-slate-700">
            <section id="primeiros-passos" className="mb-6 scroll-mt-2">
              <h3 className="mb-1.5 text-sm font-semibold text-slate-800">1. Primeiros passos: conta e projetos</h3>
              <p className="mb-2">
                Ao abrir o Cad RD, a tela de <b>&quot;📁 Projetos&quot;</b> aparece primeiro, parecido com a tela de
                boas-vindas do AutoCAD ou do Word.
              </p>
              <div className="mb-2 rounded border-l-4 border-red-500 bg-red-50 px-2.5 py-1.5 text-[11.5px]">
                <b>Login obrigatório.</b> É preciso entrar com uma conta (ou criar uma) para criar, abrir, editar ou
                salvar qualquer projeto.
              </div>
              <p className="mb-1">Depois de logado, a tela de Projetos oferece:</p>
              <ul className="mb-2 list-disc space-y-0.5 pl-5">
                <li>
                  <b>+ Novo Projeto</b> -- começa um desenho em branco.
                </li>
                <li>
                  <b>💾 Salvar projeto atual</b> -- salva o que está aberto agora na nuvem.
                </li>
                <li>
                  Lista de <b>projetos salvos</b> -- abrir, renomear (ícone ✎) ou excluir (ícone 🗑, com confirmação).
                </li>
                <li>
                  <b>Abrir um projeto por ID...</b> -- cola o identificador de um projeto salvo para abri-lo
                  diretamente.
                </li>
              </ul>
              <p>
                A qualquer momento, o botão <b>&quot;📁 Meus Projetos&quot;</b> reabre essa tela. O botão{" "}
                <b>&quot;Sair&quot;</b> encerra a sessão -- e trava o Desenho de novo até logar outra vez.
              </p>
            </section>

            <section id="tela" className="mb-6 scroll-mt-2">
              <h3 className="mb-1.5 text-sm font-semibold text-slate-800">2. Conhecendo a tela</h3>
              <p className="mb-1">A tela do Cad RD é dividida em 5 áreas:</p>
              <ul className="list-disc space-y-0.5 pl-5">
                <li>
                  <b>Barra superior (Toolbar):</b> nome do projeto, desfazer/refazer, exportar PDF/DXF e a conta (👤).
                </li>
                <li>
                  <b>Régua de ferramentas:</b> os botões de cada ferramenta de desenho (Linha, Círculo, etc.).
                </li>
                <li>
                  <b>Barra lateral esquerda:</b> Camadas, Hachura, Propriedades, Biblioteca de Blocos, Geradores
                  automáticos, Referência externa, Carimbo e Configurações.
                </li>
                <li>
                  <b>Área de desenho (canvas):</b> onde o projeto é desenhado.
                </li>
                <li>
                  <b>Barra de status e linha de comando:</b> no rodapé -- coordenadas, zoom, grid, unidade, SNAP,
                  ORTHO, tema, abas de página e a linha de comando estilo AutoCAD.
                </li>
              </ul>
            </section>

            <section id="desenho-prancha" className="mb-6 scroll-mt-2">
              <h3 className="mb-1.5 text-sm font-semibold text-slate-800">3. Desenho x Prancha (papel)</h3>
              <p className="mb-1">
                Assim como no AutoCAD (Model Space x Layout), o Cad RD trabalha com dois conceitos separados:
              </p>
              <ul className="mb-2 list-disc space-y-0.5 pl-5">
                <li>
                  <b>Desenho</b> -- o espaço de modelagem, sem limite de folha, sempre em escala real (1 unidade =
                  1&nbsp;mm).
                </li>
                <li>
                  <b>Prancha</b> -- uma folha de papel (A4, A3, A2, A1...) com um &quot;viewport&quot; que mostra
                  parte do Desenho, pronta pra exportar. Uma Prancha é <b>somente leitura</b> -- volte pra aba
                  &quot;Desenho&quot; pra editar geometria.
                </li>
              </ul>
              <p>
                As abas de página ficam no canto direito da barra de status: &quot;Desenho&quot; + uma aba por
                Prancha criada. Use &quot;+ Prancha&quot; pra criar uma nova.
              </p>
            </section>

            <section id="comandos" className="mb-6 scroll-mt-2">
              <h3 className="mb-1.5 text-sm font-semibold text-slate-800">4. Ferramentas e a linha de comando (estilo AutoCAD)</h3>
              <p className="mb-2">
                Cada ferramenta pode ser ativada de dois jeitos: clicando o botão na régua de ferramentas,{" "}
                <b>ou digitando o atalho diretamente, a qualquer momento</b> -- sem precisar clicar antes na linha de
                comando (igual ao AutoCAD de verdade). Basta começar a digitar em qualquer lugar da tela (desde que
                não esteja com o cursor dentro de outro campo) que o texto já cai na linha de comando, no rodapé.
              </p>
              <div className="mb-2 rounded border-l-4 border-green-600 bg-green-50 px-2.5 py-1.5 text-[11.5px]">
                <b>Dica:</b> mesmo no meio de um desenho (ex.: 1º ponto de uma Linha já clicado), digitar outro
                comando e apertar Enter troca de ferramenta na hora.
              </div>
              <p className="mb-1">Fluxo típico de uma ferramenta com 2 cliques (ex.: Linha, Retângulo, Círculo):</p>
              <ol className="mb-2 list-decimal space-y-0.5 pl-5">
                <li>Ative a ferramenta (botão ou atalho digitado).</li>
                <li>Clique o 1º ponto no Desenho.</li>
                <li>
                  Clique o 2º ponto <b>ou</b> digite a medida exata na linha de comando e aperte Enter (ex.:{" "}
                  <code className="rounded bg-slate-100 px-1 text-[11px]">10m</code> para uma linha de 10 metros; ou{" "}
                  <code className="rounded bg-slate-100 px-1 text-[11px]">100x50</code> para um retângulo de
                  100x50&nbsp;mm).
                </li>
              </ol>
              <p>
                <code className="rounded bg-slate-100 px-1 text-[11px]">Esc</code> cancela o comando em andamento a
                qualquer momento.
              </p>
            </section>

            <section id="atalhos" className="mb-6 scroll-mt-2">
              <h3 className="mb-1.5 text-sm font-semibold text-slate-800">5. Tabela de atalhos de teclado e comandos</h3>
              <p className="mb-1 font-semibold text-slate-700">Ferramentas (digite na linha de comando e aperte Enter)</p>
              <table className="mb-3 w-full border-collapse text-[11px]">
                <thead>
                  <tr className="bg-slate-800 text-white">
                    <th className="border border-slate-300 px-2 py-1 text-left">Atalho</th>
                    <th className="border border-slate-300 px-2 py-1 text-left">Ferramenta</th>
                    <th className="border border-slate-300 px-2 py-1 text-left">Observação</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["Esc", "Selecionar", "Clique nos elementos; Shift+clique adiciona à seleção. Arraste esquerda→direita = Window; direita→esquerda = Crossing."],
                    ["L", "Linha", "2º clique ou digite o comprimento (ex.: 10, 10m, 10cm)."],
                    ["C", "Círculo", "Clique o centro, depois o raio."],
                    ["REC", "Retângulo", "2º canto ou digite largura x altura (ex.: 100x50)."],
                    ["POL", "Polígono", "Clique cada vértice; Enter fecha (mín. 3 vértices)."],
                    ["PL", "Polilinha", "Igual ao Polígono, mas fica ABERTA (mín. 2 vértices)."],
                    ["TR", "Trim (aparar)", "Passe o mouse sobre um trecho e clique para remover; numa linha reta sem cruzamento, 2 cliques abrem um vão (ex.: porta numa parede)."],
                    ["O", "Offset", "Digite a distância, clique na linha, clique no lado desejado."],
                    ["F", "Fillet (concordância)", "Clique em duas linhas; raio 0 fecha reto, raio > 0 arredonda. Digite R para trocar o raio."],
                    ["E / DEL", "Apagar", "Com seleção prévia, apaga na hora; sem seleção, clique no elemento a apagar."],
                    ["M", "Mover", "Requer seleção prévia -- clique o ponto base, depois o destino."],
                    ["CO / CP", "Copiar", "Requer seleção prévia -- mesmo fluxo do Mover."],
                    ["H", "Hachurar", "Com seleção, aplica na hora; sem seleção, clique num retângulo/polígono fechado."],
                    ["T", "Texto", "Clique para posicionar, digite o conteúdo e Enter insere (Shift+Enter quebra linha)."],
                    ["DIM", "Cota", "Clique ponto inicial, ponto final, e a posição da linha de cota."],
                    ["PE", "Padrão de Entrada", "Clique a posição do poste, depois do medidor -- insere o conjunto completo."],
                    ["MV", "Viewport", "Só dentro de uma Prancha -- 2 cliques definem o retângulo de visualização."],
                    ["Z / W", "Zoom Window", "2 cliques definem a janela de zoom."],
                  ].map((linha, i) => (
                    <tr key={i} className={i % 2 === 1 ? "bg-slate-50" : ""}>
                      {linha.map((celula, j) => (
                        <td key={j} className="border border-slate-300 px-2 py-1 align-top">
                          {j === 0 ? <code className="rounded bg-slate-100 px-1">{celula}</code> : celula}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>

              <p className="mb-1 font-semibold text-slate-700">Atalhos gerais de teclado</p>
              <table className="w-full border-collapse text-[11px]">
                <thead>
                  <tr className="bg-slate-800 text-white">
                    <th className="border border-slate-300 px-2 py-1 text-left">Tecla</th>
                    <th className="border border-slate-300 px-2 py-1 text-left">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["Esc", "Cancela o comando/rascunho em andamento."],
                    ["Delete / Backspace", "Apaga o(s) elemento(s) selecionado(s)."],
                    ["Ctrl+Z", "Desfazer."],
                    ["Ctrl+Y ou Ctrl+Shift+Z", "Refazer."],
                    ["Ctrl+C / Ctrl+V", "Copiar / colar a seleção."],
                    ["Espaço", "Repete o último comando usado."],
                    ["F8", "Liga/desliga o ORTHO (trava a próxima linha na horizontal/vertical)."],
                    ["Enter (Polígono/Polilinha)", "Fecha/conclui a forma."],
                    ["Roda do mouse", "Zoom (centralizado no cursor)."],
                    ["Botão do meio ou direito (arrastar)", "Pan (mover a visualização)."],
                  ].map((linha, i) => (
                    <tr key={i} className={i % 2 === 1 ? "bg-slate-50" : ""}>
                      <td className="border border-slate-300 px-2 py-1 align-top">
                        <code className="rounded bg-slate-100 px-1">{linha[0]}</code>
                      </td>
                      <td className="border border-slate-300 px-2 py-1 align-top">{linha[1]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section id="camadas" className="mb-6 scroll-mt-2">
              <h3 className="mb-1.5 text-sm font-semibold text-slate-800">6. Camadas (layers)</h3>
              <p>
                O painel <b>Camadas</b>, no topo da barra lateral, funciona como no AutoCAD: crie camadas com nome e
                cor, ligue/desligue a visibilidade, e escolha qual é a <b>camada ativa</b>. A camada &quot;0&quot;
                vem por padrão.
              </p>
            </section>

            <section id="blocos" className="mb-6 scroll-mt-2">
              <h3 className="mb-1.5 text-sm font-semibold text-slate-800">7. Biblioteca de blocos (símbolos elétricos)</h3>
              <p>
                O painel <b>Biblioteca de Blocos</b> reúne os símbolos elétricos prontos (tomadas, interruptores,
                luminárias, quadro de distribuição, etc.). Clique num símbolo e depois clique no Desenho pra
                posicioná-lo, ou arraste o símbolo direto pro canvas.
              </p>
            </section>

            <section id="hachura" className="mb-6 scroll-mt-2">
              <h3 className="mb-1.5 text-sm font-semibold text-slate-800">8. Hachura</h3>
              <p>
                O painel <b>Hachura</b> define o padrão, cor e escala usados pela ferramenta{" "}
                <code className="rounded bg-slate-100 px-1 text-[11px]">H</code>, que preenche retângulos e
                polígonos fechados.
              </p>
            </section>

            <section id="geradores" className="mb-6 scroll-mt-2">
              <h3 className="mb-1.5 text-sm font-semibold text-slate-800">9. Geradores automáticos</h3>
              <p className="mb-1">
                A seção &quot;Gerador automático&quot; da barra lateral reúne assistentes que desenham
                automaticamente, a partir de poucas informações:
              </p>
              <ul className="list-disc space-y-0.5 pl-5">
                <li>
                  <b>⚡ Gerar diagrama fotovoltaico</b> -- monta o diagrama unifilar de um sistema solar.
                </li>
                <li>
                  <b>☀️ Dimensionar sistema no solo</b> -- calcula e desenha o leiaute de um sistema fotovoltaico no
                  solo.
                </li>
                <li>
                  <b>📏 Dimensionar cargas elétricas (NBR 5410)</b> -- calcula disjuntores e bitola por circuito e
                  desenha o diagrama do quadro de distribuição.
                </li>
                <li>
                  <b>🚪 Divisor de ambiente</b> -- abre um vão (porta ou janela) numa parede já desenhada, num único
                  clique.
                </li>
                <li>
                  <b>💡 Lançar tomadas/iluminação (NBR 5410)</b> -- selecione as paredes + nomes dos cômodos e o
                  gerador posiciona automaticamente tomadas e pontos de luz.
                </li>
              </ul>
            </section>

            <section id="xref" className="mb-6 scroll-mt-2">
              <h3 className="mb-1.5 text-sm font-semibold text-slate-800">10. Referência externa (XREF)</h3>
              <p>
                O botão <b>+ Importar imagem / PDF</b> insere uma planta de referência por trás do Desenho. A
                imagem fica só no seu navegador (nunca é enviada pra nuvem). Use a calibração por 2 pontos pra a
                planta ficar na escala certa.
              </p>
            </section>

            <section id="carimbo" className="mb-6 scroll-mt-2">
              <h3 className="mb-1.5 text-sm font-semibold text-slate-800">11. Carimbo/legenda e configurações</h3>
              <p>
                O painel <b>Carimbo</b> preenche os dados do selo ABNT (título, cliente, responsável técnico,
                escala, data e logo). O painel <b>Configurações</b> permite mover a régua de ferramentas para o topo
                ou para as laterais.
              </p>
            </section>

            <section id="exportar" className="mb-6 scroll-mt-2">
              <h3 className="mb-1.5 text-sm font-semibold text-slate-800">12. Exportando o projeto (PDF e DXF)</h3>
              <ul className="list-disc space-y-0.5 pl-5">
                <li>
                  <b>Exportar PDF</b> -- PDF vetorial no tamanho nativo da folha.
                </li>
                <li>
                  <b>Exportar DXF</b> -- formato nativo do AutoCAD.
                </li>
                <li>
                  <b>Ajustar para impressão em A4</b> -- reduz a Prancha pra caber numa folha A4.
                </li>
                <li>Com mais de uma Prancha, dá pra juntar tudo num único PDF multipágina.</li>
              </ul>
            </section>

            <section id="tema" className="mb-6 scroll-mt-2">
              <h3 className="mb-1.5 text-sm font-semibold text-slate-800">13. Tema claro/escuro</h3>
              <p>
                O botão na barra de status alterna o fundo do Desenho entre claro e escuro -- só muda a tela de
                trabalho; a Prancha e os PDFs exportados continuam sempre brancos.
              </p>
            </section>

            <section id="sugestoes" className="mb-2 scroll-mt-2">
              <h3 className="mb-1.5 text-sm font-semibold text-slate-800">14. Enviando sugestões e relatando erros (Beta)</h3>
              <p className="mb-1">
                Esta é a versão <b>Beta</b> do Cad RD. Encontrou algo que não funcionou como esperado, ou tem uma
                ideia de melhoria? Use o botão <b>&quot;💬 Sugestões&quot;</b>, ao lado da sua conta.
              </p>
              <ul className="list-disc space-y-0.5 pl-5">
                <li>Escreva a mensagem e envie -- ela chega direto para o desenvolvedor, junto com seu e-mail.</li>
                <li>A resposta aparece na mesma conversa -- uma bolinha vermelha avisa quando chega resposta nova.</li>
                <li>Cada usuário só vê a própria conversa.</li>
              </ul>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
