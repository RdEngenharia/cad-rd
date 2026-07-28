"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useCadStore } from "@/lib/store";

/**
 * CalibrationModal
 * -----------------------------------------------------------------------
 * Segundo passo da calibração de XREF por referência (Scale by
 * Reference, equivalente ao SCALE/Reference do AutoCAD): assim que os
 * dois pontos são clicados no canvas (ver CanvasStage + GeometryLayer),
 * este modal aparece pedindo a distância REAL (em metros) entre eles.
 * Ao confirmar, `confirmarCalibracao` recalcula e trava a escala do
 * XREF-alvo para que a imagem passe a corresponder ao tamanho real --
 * pronta para servir de base a um croqui/planta de localização em
 * escala 1:1 com o resto do desenho (mm).
 *
 * A visibilidade do modal é 100% derivada do estado global (não tem
 * estado local de "aberto/fechado"): ele aparece quando os dois pontos
 * de calibração existem, e some sozinho se `Esc` limpar esse estado.
 * -----------------------------------------------------------------------
 */
export function CalibrationModal() {
  const calibXrefId = useCadStore((s) => s.calibXrefId);
  const calibPoint1 = useCadStore((s) => s.calibPoint1);
  const calibPoint2 = useCadStore((s) => s.calibPoint2);
  const xrefs = useCadStore((s) => s.projeto.xrefs);
  const confirmarCalibracao = useCadStore((s) => s.confirmarCalibracao);
  const cancelarCalibracao = useCadStore((s) => s.cancelarCalibracao);

  const [valor, setValor] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const aberto = Boolean(calibXrefId && calibPoint1 && calibPoint2);
  const xref = xrefs.find((x) => x.id === calibXrefId);
  const distanciaMedida =
    calibPoint1 && calibPoint2 ? Math.hypot(calibPoint2.x - calibPoint1.x, calibPoint2.y - calibPoint1.y) : 0;

  // Reseta o formulário e dá foco ao input toda vez que o modal abre.
  // O reset roda dentro do callback do rAF (não direto no corpo do
  // efeito) para não disparar setState síncrono dentro de um efeito
  // (regra react-hooks/set-state-in-effect) -- o próprio rAF já é
  // necessário aqui para garantir que o <input> já foi montado antes
  // de focar.
  useEffect(() => {
    if (!aberto) return;
    const id = requestAnimationFrame(() => {
      setValor("");
      setErro(null);
      inputRef.current?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [aberto]);

  if (!aberto) return null;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const numero = Number(valor.replace(",", "."));
    if (!valor.trim() || !Number.isFinite(numero)) {
      setErro("Digite um número válido.");
      return;
    }
    const resultado = confirmarCalibracao(numero);
    if (!resultado.ok) {
      setErro(resultado.erro ?? "Não foi possível calibrar.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-[1px]">
      <form onSubmit={handleSubmit} className="w-80 rounded-lg bg-white p-4 shadow-xl">
        <h2 className="text-sm font-semibold text-slate-800">📐 Calibrar imagem por referência</h2>
        <p className="mt-1 text-xs leading-snug text-slate-500">
          {xref ? (
            <>
              XREF: <b>{xref.nome_arquivo}</b>
            </>
          ) : (
            "XREF"
          )}{" "}
          · distância medida no desenho entre os 2 pontos clicados: <b>{distanciaMedida.toFixed(1)} mm</b>
        </p>

        <label className="mt-3 block text-xs font-medium text-slate-600">
          Qual a distância real (em metros) entre estes dois pontos?
          <input
            ref={inputRef}
            type="number"
            inputMode="decimal"
            step="any"
            min="0"
            value={valor}
            onChange={(e) => {
              setValor(e.target.value);
              setErro(null);
            }}
            placeholder="ex.: 50"
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-300"
          />
        </label>
        <p className="mt-1 text-[10px] text-slate-400">
          Convertido automaticamente para mm, a unidade interna do projeto.
        </p>

        {erro && <p className="mt-1.5 text-xs text-red-600">{erro}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={cancelarCalibracao}
            className="rounded border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="rounded bg-amber-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-600"
          >
            Calibrar
          </button>
        </div>
      </form>
    </div>
  );
}
