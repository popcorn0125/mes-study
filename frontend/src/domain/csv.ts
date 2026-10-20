/**
 * 표를 CSV 문자열로 만든다. 엑셀에서 한글이 깨지지 않게 UTF-8 BOM을 붙이고 줄바꿈은 CRLF로 한다.
 * 쉼표 · 따옴표 · 줄바꿈이 든 칸은 따옴표로 감싸고 안의 따옴표는 두 번 쓴다.
 */

export type CsvCell = string | number | null

function escapeCell(cell: CsvCell): string {
  if (cell === null) return ''
  const text = String(cell)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function toCsv(header: string[], rows: CsvCell[][]): string {
  return '﻿' + [header, ...rows].map((row) => row.map(escapeCell).join(',')).join('\r\n') + '\r\n'
}
