// Test stub — lightweight-charts needs a real canvas, which jsdom lacks.
const series = () => ({
  setData() {},
  update() {},
  createPriceLine: (o) => o,
  removePriceLine() {},
  priceScale: () => ({ applyOptions() {} }),
  applyOptions() {},
});

export const CandlestickSeries = { type: "Candlestick" };
export const HistogramSeries = { type: "Histogram" };
export const LineSeries = { type: "Line" };
export const AreaSeries = { type: "Area" };

export function createChart() {
  return {
    addSeries: series,
    priceScale: () => ({ applyOptions() {} }),
    timeScale: () => ({ fitContent() {}, applyOptions() {} }),
    applyOptions() {},
    subscribeCrosshairMove() {},
    remove() {},
  };
}
