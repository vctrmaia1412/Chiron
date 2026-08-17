const DATE = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const DATE_SHORT = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' });
const TIME = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
const DATE_TIME = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const WEEKDAY = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
const MONEY = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** Data sem hora: `new Date('2025-03-10')` seria meia-noite UTC e o Intl mostraria o dia anterior no Brasil. */
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const dateOnly = typeof value === 'string' ? DATE_ONLY.exec(value) : null;
  if (dateOnly) {
    const year = Number(dateOnly[1]);
    const month = Number(dateOnly[2]);
    const day = Number(dateOnly[3]);
    const local = new Date(year, month - 1, day);
    // Rejeita 31/02: o construtor local transborda para o mês seguinte em vez de falhar.
    const valid =
      local.getFullYear() === year && local.getMonth() === month - 1 && local.getDate() === day;
    return valid ? local : null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value: string | Date | null | undefined): string {
  const date = toDate(value);
  return date ? DATE.format(date) : '';
}

export function formatDateShort(value: string | Date | null | undefined): string {
  const date = toDate(value);
  return date ? DATE_SHORT.format(date).replace('.', '') : '';
}

export function formatTime(value: string | Date | null | undefined): string {
  const date = toDate(value);
  return date ? TIME.format(date) : '';
}

export function formatDateTime(value: string | Date | null | undefined): string {
  const date = toDate(value);
  return date ? DATE_TIME.format(date) : '';
}

export function formatWeekday(value: string | Date | null | undefined): string {
  const date = toDate(value);
  return date ? WEEKDAY.format(date) : '';
}

export function formatMoney(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? MONEY.format(numeric) : '';
}

export function formatNumber(value: number | string | null | undefined, digits = 2): string {
  if (value === null || value === undefined || value === '') return '';
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return '';
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: digits }).format(numeric);
}

/** Peso na unidade que faz sentido: grama para calopsita, quilo para bovino. */
export function formatWeight(valueKg: number | string | null | undefined): string {
  if (valueKg === null || valueKg === undefined || valueKg === '') return '';
  const numeric = typeof valueKg === 'number' ? valueKg : Number(valueKg);
  if (!Number.isFinite(numeric) || numeric <= 0) return '';
  if (numeric < 1) return `${formatNumber(numeric * 1000, 0)} g`;
  if (numeric >= 100) return `${formatNumber(numeric, 0)} kg`;
  return `${formatNumber(numeric, numeric < 10 ? 2 : 1)} kg`;
}

export function relativeTime(value: string | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) return '';
  const diffMs = date.getTime() - Date.now();
  const diffMin = Math.round(diffMs / 60_000);
  const abs = Math.abs(diffMin);

  if (abs < 1) return 'agora';
  if (abs < 60) return diffMin < 0 ? `há ${abs} min` : `em ${abs} min`;

  const diffH = Math.round(diffMin / 60);
  if (Math.abs(diffH) < 24) return diffH < 0 ? `há ${Math.abs(diffH)} h` : `em ${diffH} h`;

  const diffD = Math.round(diffH / 24);
  if (Math.abs(diffD) < 30) return diffD < 0 ? `há ${Math.abs(diffD)} d` : `em ${diffD} d`;

  return formatDate(date);
}

export function isToday(value: string | Date | null | undefined): boolean {
  const date = toDate(value);
  if (!date) return false;
  const now = new Date();
  return (
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear()
  );
}

export function toIsoDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function startOfDay(value: Date): Date {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function endOfDay(value: Date): Date {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
}

export function addDays(value: Date, days: number): Date {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
}

export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
}

export function formatPhone(value: string | null | undefined): string {
  if (!value) return '';
  const digits = value.replace(/\D/g, '');
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return value;
}

export function whatsappLink(phone: string | null | undefined, message?: string): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10) return null;
  const withCountry = digits.startsWith('55') ? digits : `55${digits}`;
  const text = message ? `?text=${encodeURIComponent(message)}` : '';
  return `https://wa.me/${withCountry}${text}`;
}

export function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
