/** Reserves a MetricSparkline's footprint (caption row + chart, bleeding to
 *  the card edges) without mounting a chart — while its data loads. */
export function SparklinePlaceholder() {
  return (
    <div aria-hidden className="mt-auto pt-3">
      <div className="h-4" />
      <div className="-mb-4 mt-1 h-16 md:-mb-6" />
    </div>
  );
}
