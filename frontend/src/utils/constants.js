export const ROWS = ['Superior', 'Media', 'Inferior']
export const COLUMNS = ['Izquierda', 'Centro', 'Derecha']

export const modes = [
  ['traffic', 'Tráfico'],
  ['dwell', 'Permanencia'],
  ['interaction', 'Interacción'],
  ['pickup', 'Pick-up'],
]

export const emptyProducts = () => Array.from({ length: ROWS.length }, () => COLUMNS.map(() => ''))