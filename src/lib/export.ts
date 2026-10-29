import type { Day, TripParams } from '../types';
import { fmtTime } from './geo';

export const DISCLAIMER =
  'Opening hours, ticket availability and seasonal closures can change. Venues, prices and timings in this plan are estimates: please confirm them independently, and book separately. Nothing here is a confirmed booking.';

function download(filename: string, mime: string, content: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'trip';

export function exportJSON(trip: TripParams, days: Day[]) {
  const data = {
    app: 'Wanderly',
    exportedAt: new Date().toISOString(),
    disclaimer: DISCLAIMER,
    trip: { ...trip },
    itinerary: days.map((d) => ({ ...d, blocks: d.blocks.map(({ changed, ...b }) => b) })),
  };
  download(`${slug(trip.destination)}-itinerary.json`, 'application/json', JSON.stringify(data, null, 2));
}

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const pad = (n: number) => String(n).padStart(2, '0');

export function buildICS(trip: TripParams, days: Day[]): string {
  const [y, m, d] = trip.startDate.split('-').map(Number);
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Wanderly//Trip Planner//EN', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${esc(trip.destination)} trip`];
  days.forEach((day) => {
    const base = new Date(y, m - 1, d + day.day - 1);
    const ymd = `${base.getFullYear()}${pad(base.getMonth() + 1)}${pad(base.getDate())}`;
    day.blocks.forEach((b) => {
      const s = b.start.replace(':', '') + '00';
      const e = b.end.replace(':', '') + '00';
      lines.push(
        'BEGIN:VEVENT',
        `UID:${ymd}-${b.id}-${stamp}@wanderly.demo`,
        `DTSTAMP:${stamp}`,
        `DTSTART:${ymd}T${s}`,
        `DTEND:${ymd}T${e}`,
        `SUMMARY:${esc(b.title)}`,
        `DESCRIPTION:${esc(`${b.note ?? ''}${b.alternative ? `\nRain plan: ${b.alternative.title}` : ''}\n\n${DISCLAIMER}`)}`,
        `LOCATION:${esc(`${b.title.replace(/^(Lunch|Dinner|Breakfast): /, '')}, ${trip.destination}`)}`,
        'END:VEVENT',
      );
    });
  });
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export function exportICS(trip: TripParams, days: Day[]) {
  download(`${slug(trip.destination)}-itinerary.ics`, 'text/calendar', buildICS(trip, days));
}

export function planAsText(trip: TripParams, days: Day[]): string {
  const out = [`${trip.destination} trip, ${trip.days} day(s), starting ${trip.startDate}`, ''];
  days.forEach((d) => {
    out.push(`Day ${d.day}: ${d.theme}`);
    d.blocks.forEach((b) => out.push(`  ${fmtTime(b.start)} - ${fmtTime(b.end)}  ${b.title}${b.alternative ? ` (rain plan: ${b.alternative.title})` : ''}`));
    out.push('');
  });
  out.push(DISCLAIMER);
  return out.join('\n');
}

export function printItinerary() {
  window.print();
}
