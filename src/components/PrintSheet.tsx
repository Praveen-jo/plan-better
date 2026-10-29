import { useStore } from '../store';
import { fmtTime } from '../lib/geo';
import { DISCLAIMER } from '../lib/export';

/** Only visible when printing or saving as PDF. */
export function PrintSheet() {
  const trip = useStore((s) => s.trip);
  const itinerary = useStore((s) => s.itinerary);
  if (!itinerary.length) return null;
  return (
    <div className="print-sheet">
      <h1>
        {trip.destination} trip, {trip.days} day{trip.days > 1 ? 's' : ''}
      </h1>
      <p>
        Starting {trip.startDate} · {trip.travelers} traveler{trip.travelers > 1 ? 's' : ''} · {trip.pace} pace · budget ₹{trip.budgetINR.toLocaleString('en-IN')}
      </p>
      {itinerary.map((d) => (
        <section key={d.day}>
          <h2>
            Day {d.day}: {d.theme}
          </h2>
          <table>
            <tbody>
              {d.blocks.map((b) => (
                <tr key={b.id}>
                  <td className="t">
                    {fmtTime(b.start)} to {fmtTime(b.end)}
                  </td>
                  <td>
                    <b>{b.title}</b>
                    {b.note && <div>{b.note}</div>}
                    {b.alternative && <div>Rain plan: {b.alternative.reason}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
      <p className="print-disclaimer">{DISCLAIMER}</p>
    </div>
  );
}
