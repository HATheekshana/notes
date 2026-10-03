export const MAX_PDF_BYTES = 4 * 1024 * 1024;
export type Resource = { key: string; name: string; size: number; createdAt: string };
export function validSubject(subject: string) { return ['FOA','OS','IWT','DBMS','OOP'].includes(subject); }
export function validResourceKey(key: string) { return /^[a-f0-9-]{36}--[A-Za-z0-9_. -]{1,140}\.pdf$/.test(key); }
export function safePdfName(name: string) {
  return name.replace(/\.pdf$/i, '').replace(/[^A-Za-z0-9_. -]/g, '_').slice(0, 130).trim() + '.pdf';
}
export function validatePdf(name: string, bytes: Uint8Array) {
  if (!/\.pdf$/i.test(name)) throw Error('Choose a PDF file.');
  if (bytes.length > MAX_PDF_BYTES) throw Error('PDFs must be 4 MB or smaller.');
  if (bytes.length < 5 || new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') throw Error('This file is not a valid PDF.');
}
