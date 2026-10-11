/**
 * Small inline-SVG charts for the mall dashboard (v0.5; no chart library). Every chart carries a visually hidden data
 * table so screen readers get the numbers (ui-ux-pro-max: "data-table" alternative).
 */

/** Vertical bars: `values[i]` with `labels[i]`; `tone(i)` picks a bar's class ('hi' or ''). */
export function Bars({ values, labels, title, tableLabel, tone = () => '', height = 150, fmt = (v) => String(v) }) {
  const max = Math.max(1, ...values)
  const n = values.length
  const w = 100 / n
  return (
    <figure className="chart">
      <svg className="bars" viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" role="img" aria-label={title}>
        {values.map((v, i) => {
          const h = Math.max(1, (v / max) * (height - 4))
          return (
            <rect key={i} className={`bar ${tone(i)}`} x={i * w + w * 0.14} y={height - h} width={w * 0.72} height={h} rx={Math.min(1.2, w * 0.2)}>
              <title>{`${labels[i]}: ${fmt(v)}`}</title>
            </rect>
          )
        })}
      </svg>
      <div className="bars-axis" aria-hidden="true">
        <span>{labels[0]}</span>
        <span>{labels[Math.floor(n / 2)]}</span>
        <span>{labels[n - 1]}</span>
      </div>
      <table className="sr-only">
        <caption>{tableLabel}</caption>
        <tbody>
          {values.map((v, i) => (
            <tr key={i}>
              <th scope="row">{labels[i]}</th>
              <td>{fmt(v)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}

/** Horizontal bar list: rows of { label, value }. */
export function BarList({ rows, fmt = (v) => String(v) }) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  return (
    <ol className="barlist">
      {rows.map((r, i) => (
        <li key={i} className="barlist-row">
          <span className="barlist-label">{r.label}</span>
          <span className="barlist-track" aria-hidden="true">
            <span className="barlist-fill" style={{ width: `${(r.value / max) * 100}%` }} />
          </span>
          <span className="barlist-value">{fmt(r.value)}</span>
        </li>
      ))}
    </ol>
  )
}
