export type CriterioVista = {
  id: string;
  descripcion: string;
  peso: number;
  puntajeMax: number;
  niveles: Array<{
    id: string;
    etiqueta: string;
    descriptor: string;
    puntaje: number;
  }>;
};

export function VistaInstrumento({ criterios }: { criterios: CriterioVista[] }) {
  const maximo = criterios.reduce((suma, criterio) => suma + criterio.puntajeMax * criterio.peso, 0);
  return (
    <section className="space-y-3" aria-labelledby="matriz-publicada">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="matriz-publicada" className="font-display text-lg font-semibold text-tinta">Matriz publicada</h2>
          <p className="mt-0.5 text-sm text-tinta-suave">Esta versión es de solo lectura y conserva el significado de sus aplicaciones.</p>
        </div>
        <span className="rounded-lg bg-superficie-2 px-3 py-1.5 text-xs font-semibold text-tinta-suave">
          Máximo ponderado: {maximo.toFixed(2).replace(/\.00$/, "")} puntos
        </span>
      </div>
      {criterios.map((criterio, indice) => (
        <article key={criterio.id} className="superficie rounded-xl p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-marca-50 text-xs font-bold text-marca-700">
                {indice + 1}
              </span>
              <h3 className="font-semibold text-tinta">{criterio.descripcion}</h3>
            </div>
            <span className="shrink-0 text-xs font-medium text-tinta-tenue">Peso {criterio.peso}</span>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {criterio.niveles.map((nivel) => (
              <div key={nivel.id} className="rounded-lg border border-borde bg-superficie-2 p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-tinta">{nivel.etiqueta}</p>
                  <span className="rounded-md bg-superficie px-2 py-0.5 text-xs font-bold tabular-nums text-marca-700">
                    {nivel.puntaje} pt
                  </span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-tinta-suave">{nivel.descriptor}</p>
              </div>
            ))}
          </div>
        </article>
      ))}
    </section>
  );
}
