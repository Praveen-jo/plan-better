import { useEffect, useMemo, useRef, useState } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useStore } from '../store';
import type { Block, Day } from '../types';
import { PLACE_BY_ID } from '../data/places';
import { fmtTime, hopBetween } from '../lib/geo';
import { itineraryCost } from '../lib/validate';
import { sendUserMessage } from '../ai/orchestrator';
import { DISCLAIMER } from '../lib/export';
import { useWikiImage } from '../lib/images';
import { HeroScene } from './Brand';
import { Alert, Back, Check, Grip, Map as MapIcon, More, Plus, Redo, Route, Shield, Umbrella, Undo, Close } from './Icons';

export const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

export type TripView = 'overview' | 'map' | 'edit';

/* ---------- shared bits ---------- */

export function categoryOf(b: Block): { label: string; cls: string } {
  const place = b.placeId ? PLACE_BY_ID[b.placeId] : undefined;
  if (b.kind === 'meal' || place?.kind === 'dining') return { label: 'Food', cls: 'food' };
  const t = place?.tags ?? [];
  if (t.includes('shopping')) return { label: 'Shopping', cls: 'shop' };
  if (t.includes('relax')) return { label: 'Wellness', cls: 'well' };
  if (t.includes('adventure') || t.includes('nature')) return { label: 'Experience', cls: 'exp' };
  if (t.includes('culture') || t.includes('spiritual')) return { label: 'Culture', cls: 'cult' };
  return { label: 'Sightseeing', cls: 'sight' };
}

export function blockQueries(b: Block, destination: string): string[] {
  const place = b.placeId ? PLACE_BY_ID[b.placeId] : undefined;
  const bare = b.title.replace(/^(Lunch|Dinner|Breakfast):?\s*/i, '');
  if (place?.kind === 'dining') return [`${place.cuisine ?? ''} cuisine`, 'Indian cuisine'];
  return [`${place?.name ?? bare} ${destination}`, place?.name ?? bare, destination];
}

export function Thumb({ queries, size = 240 }: { queries: string[]; size?: number }) {
  const src = useWikiImage(queries, size);
  return <span className="thumb">{src && <img src={src} alt="" loading="lazy" />}</span>;
}

function DayHeroImg({ queries }: { queries: string[] }) {
  const src = useWikiImage(queries, 1000);
  return src ? <img className="hero-img" src={src} alt="" /> : <HeroScene />;
}

function dayLead(day: Day): string {
  const names = day.blocks
    .filter((b) => b.kind === 'activity')
    .map((b) => (b.placeId ? PLACE_BY_ID[b.placeId]?.name : b.title))
    .filter(Boolean) as string[];
  return names.slice(0, 3).join(', ');
}

export function DayTabs({ days, active, onPick, all = false, children }: { days: Day[]; active: number; onPick: (n: number) => void; all?: boolean; children?: React.ReactNode }) {
  return (
    <Tabs.Root className="tabs-row" value={String(active)} onValueChange={(v) => onPick(Number(v))}>
      <Tabs.List className="tabs" aria-label="Days">
        {all && (
          <Tabs.Trigger value="0" className={`tab ${active === 0 ? 'active' : ''}`}>
            All Days
          </Tabs.Trigger>
        )}
        {days.map((d) => (
          <Tabs.Trigger key={d.day} value={String(d.day)} className={`tab ${d.day === active ? 'active' : ''}`}>
            Day {d.day}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
      {children}
    </Tabs.Root>
  );
}

function DayHero({ day, destination }: { day: Day; destination: string }) {
  const first = day.blocks.find((x) => x.placeId && PLACE_BY_ID[x.placeId]?.kind === 'activity');
  return (
    <div className="day-hero">
      <DayHeroImg queries={[`${first?.placeId ? PLACE_BY_ID[first.placeId].name : ''} ${destination}`, destination]} />
      <div className="day-hero-text">
        <small>Day {day.day}</small>
        <b>{day.theme}</b>
        <span>{dayLead(day)}</span>
      </div>
    </div>
  );
}

/* ---------- overview ---------- */

function TimelineRow({ b, prev, dayNo }: { b: Block; prev?: Block; dayNo: number }) {
  const place = b.placeId ? PLACE_BY_ID[b.placeId] : undefined;
  const trip = useStore((s) => s.trip);
  const setDraft = useStore((s) => s.setDraft);
  const setTab = useStore((s) => s.setTab);
  const cat = categoryOf(b);
  const hop = prev ? hopBetween(prev, b) : null;
  return (
    <li className="step">
      {hop && (
        <div className={`hop ${hop.status}`}>
          <Route width={14} height={14} />
          <span>
            about {hop.minutes} min, {hop.km} km
          </span>
          {hop.status === 'tight' && <b>tight</b>}
          {hop.status === 'long' && <b>long hop</b>}
        </div>
      )}
      <article className={`row ${b.kind} ${b.changed ? 'changed' : ''}`} data-period={b.period}>
        <div className="row-time">
          <strong>{fmtTime(b.start)}</strong>
          <span>– {fmtTime(b.end)}</span>
        </div>
        <Thumb queries={blockQueries(b, trip.destination)} />
        <div className="row-main">
          <h4>
            {b.title}
            {b.changed && <span className="tag accent">updated</span>}
          </h4>
          <p>{b.note ?? place?.blurb ?? ''}</p>
          <div className="tags">
            {place && <span className="tag">{place.indoor ? 'indoor' : 'outdoor'}</span>}
            {b.kind === 'meal' && place?.veg && <span className="tag">vegetarian friendly</span>}
            {b.unverified && <span className="tag warn">unverified suggestion</span>}
            {b.costINR !== undefined && b.costINR > 0 && <span className="tag">about {inr(b.costINR)} for {trip.travelers}</span>}
            {b.costINR === 0 && <span className="tag">free entry</span>}
            {place && <span className="tag hours">{place.hours}</span>}
          </div>
          {b.alternative && (
            <p className="rain">
              <Umbrella width={16} height={16} /> {b.alternative.reason}
            </p>
          )}
        </div>
        <div className="row-side">
          <span className={`cat ${cat.cls}`}>{cat.label}</span>
          <button
            className="icon-btn ghost"
            aria-label={`Ask for a change to ${b.title}`}
            title="Ask for a change"
            onClick={() => {
              setDraft(`On day ${dayNo}, swap "${b.title.replace(/^(Lunch|Dinner|Breakfast): /, '')}" for `);
              setTab('chat');
              setTimeout(() => document.getElementById('msg')?.focus(), 50);
            }}
          >
            <More width={18} height={18} />
          </button>
        </div>
      </article>
    </li>
  );
}

export function Overview({ day, setView }: { day: Day; setView: (v: TripView) => void }) {
  const itinerary = useStore((s) => s.itinerary);
  const setActiveDay = useStore((s) => s.setActiveDay);
  const past = useStore((s) => s.past);
  const future = useStore((s) => s.future);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const violations = useStore((s) => s.violations);
  const settings = useStore((s) => s.settings);
  const trip = useStore((s) => s.trip);
  const busy = useStore((s) => s.busy);
  const total = useMemo(() => itineraryCost(itinerary), [itinerary]);
  const errors = violations.filter((v) => v.severity === 'error').length;
  const warns = violations.filter((v) => v.severity === 'warn').length;
  const quick = [`Make day ${day.day} more relaxed`, `Swap dinner on day ${day.day} for vegetarian fine dining`, `Add an indoor alternative for rain on day ${day.day}`];

  return (
    <div className="itin">
      <DayTabs days={itinerary} active={day.day} onPick={setActiveDay}>
        <span className="undo-redo">
          <button className="icon-btn" onClick={undo} disabled={!past.length} aria-label="Undo last change" title="Undo"><Undo width={18} height={18} /></button>
          <button className="icon-btn" onClick={redo} disabled={!future.length} aria-label="Redo" title="Redo"><Redo width={18} height={18} /></button>
        </span>
        <button className="btn sm map-btn" onClick={() => setView('map')}>
          <MapIcon width={16} height={16} /> View Map
        </button>
      </DayTabs>
      <DayHero day={day} destination={trip.destination} />

      <div className="itin-top">
        <div className="badges">
          <span className={`badge ${errors ? 'bad' : 'good'}`}>
            {errors ? <Alert width={15} height={15} /> : <Check width={15} height={15} />}
            {errors ? `${errors} route issue${errors > 1 ? 's' : ''}` : 'Routes and timings checked'}
          </span>
          {warns > 0 && (
            <span className="badge warn" title={violations.filter((v) => v.severity === 'warn').map((v) => v.message).join('\n')}>
              {warns} note{warns > 1 ? 's' : ''}
            </span>
          )}
          {settings.safetyAware && (
            <span className="badge safe">
              <Shield width={15} height={15} /> Safety-aware
            </span>
          )}
        </div>
        <div className="total">
          Estimated meals and activities <strong>{inr(total)}</strong> <span>of {inr(trip.budgetINR)} budget</span>
        </div>
      </div>

      <ol className="timeline" role="tabpanel">
        {day.blocks.map((b, i) => (
          <TimelineRow key={b.id + b.start} b={b} prev={day.blocks[i - 1]} dayNo={day.day} />
        ))}
      </ol>

      <div className="quick">
        <span>Try</span>
        {quick.map((q) => (
          <button key={q} className="chip" disabled={busy} onClick={() => void sendUserMessage(q)}>
            {q}
          </button>
        ))}
        <button className="chip" onClick={() => setView('edit')}>
          Edit this day
        </button>
      </div>
      <p className="disclaimer">{DISCLAIMER}</p>
    </div>
  );
}

/* ---------- map (Leaflet + free CARTO/OSM tiles, prototype use) ---------- */

function pinIcon(n: number, meal: boolean) {
  return L.divIcon({
    className: 'pin-wrap',
    html: `<span class="pin ${meal ? 'meal' : ''}"><b>${n}</b></span>`,
    iconSize: [34, 42],
    iconAnchor: [17, 40],
  });
}

function Fit({ pts }: { pts: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    // the container can still be settling (grid layout, tab switch), so measure first, then fit
    const t = setTimeout(() => {
      map.invalidateSize();
      if (pts.length > 1) map.fitBounds(pts, { padding: [50, 50], maxZoom: 15 });
      else if (pts.length === 1) map.setView(pts[0], 14);
    }, 120);
    return () => clearTimeout(t);
  }, [map, pts]);
  return null;
}

export function MapView({ onBack }: { onBack: () => void }) {
  const itinerary = useStore((s) => s.itinerary);
  const trip = useStore((s) => s.trip);
  const activeDay = useStore((s) => s.activeDay);
  const [which, setWhich] = useState(activeDay);
  const days = which === 0 ? itinerary : itinerary.filter((d) => d.day === which);
  const stops = days.flatMap((d) => d.blocks.filter((b) => b.placeId && PLACE_BY_ID[b.placeId]).map((b) => ({ b, day: d.day, p: PLACE_BY_ID[b.placeId!] })));
  const pts = useMemo(() => stops.map((s) => [s.p.lat, s.p.lng] as [number, number]), [stops.map((s) => s.b.id).join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="itin mapview">
      <div className="subhead">
        <button className="icon-btn" onClick={onBack} aria-label="Back to itinerary">
          <Back />
        </button>
        <h3>Map view</h3>
      </div>
      <DayTabs days={itinerary} active={which} onPick={setWhich} all />
      <div className="map-split">
        <div className="map-card">
          {pts.length > 0 ? (
            <MapContainer center={pts[0]} zoom={12} scrollWheelZoom={false} className="leaflet-box">
              <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />
              <Polyline positions={pts} pathOptions={{ color: '#e0527a', weight: 4, dashArray: '2 9', lineCap: 'round' }} />
              {stops.map((s, i) => (
                <Marker key={s.b.id + i} position={pts[i]} icon={pinIcon(i + 1, s.b.kind === 'meal')}>
                  <Tooltip direction={i % 2 ? 'left' : 'right'} offset={i % 2 ? [-14, -22] : [14, -22]} permanent className="pin-tip">
                    {s.b.kind === 'meal' ? s.b.title.replace(/^(Lunch|Dinner|Breakfast):?\s*/i, '') : s.p.name}
                  </Tooltip>
                </Marker>
              ))}
              <Fit pts={pts} />
            </MapContainer>
          ) : (
            <p className="muted pad">No mapped stops for this selection.</p>
          )}
          <span className="map-title">{which === 0 ? 'All days' : `Day ${which}`} route</span>
        </div>
        <ul className="map-list">
          {stops.map((s, i) => {
            const hop = i > 0 ? hopBetween(stops[i - 1].b, s.b) : null;
            return (
              <li key={s.b.id + i}>
                <Thumb queries={blockQueries(s.b, trip.destination)} />
                <div>
                  <b>{s.b.kind === 'meal' ? s.b.title : s.p.name}</b>
                  <small>{hop ? `${hop.km} km · ${hop.minutes} min` : `Start · ${fmtTime(s.b.start)}`}</small>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
      <p className="disclaimer">Pin positions come from approximate sample coordinates. Use a maps app for navigation.</p>
    </div>
  );
}

/* ---------- edit day (drag to reorder) ---------- */

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const fromMin = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const periodFor = (m: number): Block['period'] => (m < 12 * 60 ? 'morning' : m < 17 * 60 ? 'afternoon' : 'evening');

/** New order, same day shape: keep each stop's length and the gaps between slots, start at the first slot. */
function retime(blocks: Block[], from: number, to: number): Block[] {
  const next = arrayMove(blocks, from, to);
  const gaps = blocks.map((b, i) => (i === 0 ? 0 : Math.max(0, toMin(b.start) - toMin(blocks[i - 1].end))));
  let cursor = toMin(blocks[0].start);
  return next.map((b, i) => {
    const dur = toMin(b.end) - toMin(b.start);
    if (i > 0) cursor += gaps[i];
    const start = cursor;
    cursor += dur;
    return { ...b, start: fromMin(start), end: fromMin(cursor), period: periodFor(start) };
  });
}

function EditRow({ b, onRemove, destination }: { b: Block; onRemove: () => void; destination: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: b.id });
  const cat = categoryOf(b);
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={isDragging ? 'dragging' : ''}>
      <button className="grip" aria-label={`Drag ${b.title} to reorder`} {...attributes} {...listeners}>
        <Grip width={18} height={18} />
      </button>
      <Thumb queries={blockQueries(b, destination)} />
      <div className="edit-main">
        <b>{b.title}</b>
        <small>
          {fmtTime(b.start)} – {fmtTime(b.end)}
        </small>
      </div>
      <span className={`cat ${cat.cls}`}>{cat.label}</span>
      <button className="icon-btn ghost" onClick={onRemove} aria-label={`Remove ${b.title}`} title="Remove">
        <Close width={16} height={16} />
      </button>
    </li>
  );
}

export function EditDay({ day, onBack }: { day: Day; onBack: () => void }) {
  const itinerary = useStore((s) => s.itinerary);
  const setItinerary = useStore((s) => s.setItinerary);
  const setDraft = useStore((s) => s.setDraft);
  const setTab = useStore((s) => s.setTab);
  const trip = useStore((s) => s.trip);
  const busy = useStore((s) => s.busy);
  const original = useRef(itinerary);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const suggestions = ['Make it more relaxed', 'Add a spa', 'Indoor options', 'Family friendly', 'Vegetarian food', 'Make it cheaper'];

  const update = (blocks: Block[]) => setItinerary(itinerary.map((d) => (d.day === day.day ? { ...d, blocks } : d)), { highlight: false });

  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const from = day.blocks.findIndex((b) => b.id === e.active.id);
    const to = day.blocks.findIndex((b) => b.id === e.over!.id);
    if (from >= 0 && to >= 0) update(retime(day.blocks, from, to));
  }

  return (
    <div className="itin editday">
      <div className="subhead">
        <button className="icon-btn" onClick={onBack} aria-label="Back to itinerary">
          <Back />
        </button>
        <h3>Edit Day {day.day}</h3>
        <button className="btn sm reset" onClick={() => setItinerary(original.current, { highlight: false })}>
          Reset
        </button>
      </div>
      <p className="muted">Drag the handle to reorder. Times shift to fit. Routes are re-checked automatically.</p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={day.blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
          <ul className="edit-list">
            {day.blocks.map((b) => (
              <EditRow key={b.id} b={b} destination={trip.destination} onRemove={() => update(day.blocks.filter((x) => x.id !== b.id))} />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      <button
        className="add-activity"
        onClick={() => {
          setDraft(`On day ${day.day}, add `);
          setTab('chat');
          setTimeout(() => document.getElementById('msg')?.focus(), 50);
        }}
      >
        <Plus width={18} height={18} /> Add Activity
      </button>
      <h4 className="qs-title">Quick Suggestions</h4>
      <div className="chips">
        {suggestions.map((q) => (
          <button key={q} className="chip" disabled={busy} onClick={() => void sendUserMessage(`${q} on day ${day.day}`)}>
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}
