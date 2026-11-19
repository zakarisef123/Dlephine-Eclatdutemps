// Créneaux réservés depuis le site, partagés entre tous les visiteurs.
//
//   GET    /api/slots                       -> {"booked": {"AAAA-MM-JJ": ["HH:MM", ...]}}
//   POST   /api/slots  {date, time}         -> 201 {"token": "..."}  |  409 si déjà pris
//   DELETE /api/slots  {date, time, token}  -> libère le créneau si l'envoi de l'email a échoué
//
// Chaque créneau est une entrée distincte du store Netlify Blobs "booked-slots"
// (clé "AAAA-MM-JJ/HH-MM"), écrite avec onlyIfNew : si deux clients valident le même
// horaire en même temps, un seul obtient le créneau.
// Aucune donnée personnelle n'est stockée ici : nom, email et téléphone partent
// uniquement dans l'email envoyé à l'institut.
//
// Pour libérer un créneau (annulation) : Netlify > Data & Storage > Blobs >
// booked-slots, supprimer la clé correspondante.
import { getStore } from "@netlify/blobs";

const TZ = "Europe/Zurich";
// Doit correspondre à BUSINESS_HOURS dans script.js (0 = dimanche, 6 = samedi).
const BUSINESS_HOURS = { 0: [9, 18], 6: [9, 18] };
// Jours de fermeture exceptionnelle : à garder identique à CLOSED_DAYS dans script.js.
const CLOSED_DAYS = []; // ex. ["2026-12-26", "2026-12-27"]
const MAX_DAYS_AHEAD = 70;
const RELEASE_WINDOW_MS = 15 * 60 * 1000;

const store = () => getStore({ name: "booked-slots", consistency: "strong" });

const json = (body, status = 200) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

// Date du jour et heure courante à Genève.
function nowInGeneva() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date()).map((p) => [p.type, p.value])
  );
  return { today: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

function validSlot(date, time) {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  if (typeof time !== "string" || !/^\d{2}:00$/.test(time)) return false;
  const day = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== date) return false;
  const hours = BUSINESS_HOURS[day.getUTCDay()];
  const h = Number(time.slice(0, 2));
  if (!hours || h < hours[0] || h >= hours[1]) return false;
  if (CLOSED_DAYS.includes(date)) return false;
  const { today, hour } = nowInGeneva();
  if (date < today || (date === today && h <= hour)) return false;
  const daysAhead = (day - new Date(`${today}T00:00:00Z`)) / 86400000;
  return daysAhead <= MAX_DAYS_AHEAD;
}

const keyFor = (date, time) => `${date}/${time.replace(":", "-")}`;

async function readBody(req) {
  try { return await req.json(); } catch { return {}; }
}

export default async (req) => {
  const slots = store();

  if (req.method === "GET") {
    const { today } = nowInGeneva();
    const { blobs } = await slots.list();
    const booked = {};
    for (const { key } of blobs) {
      const [date, hhmm] = key.split("/");
      if (!hhmm || date < today) continue;
      (booked[date] ||= []).push(hhmm.replace("-", ":"));
    }
    for (const d in booked) booked[d].sort();
    return json({ booked });
  }

  const { date, time, token } = await readBody(req);
  if (!validSlot(date, time)) return json({ error: "invalid_slot" }, 400);
  const key = keyFor(date, time);

  if (req.method === "POST") {
    const newToken = crypto.randomUUID();
    const { modified } = await slots.setJSON(
      key, { token: newToken, at: Date.now() }, { onlyIfNew: true }
    );
    if (!modified) return json({ error: "already_booked" }, 409);
    return json({ token: newToken }, 201);
  }

  if (req.method === "DELETE") {
    const entry = await slots.get(key, { type: "json" });
    if (entry && typeof token === "string" && entry.token === token &&
        Date.now() - entry.at < RELEASE_WINDOW_MS) {
      await slots.delete(key);
      return json({ released: true });
    }
    return json({ error: "forbidden" }, 403);
  }

  return json({ error: "method_not_allowed" }, 405);
};

export const config = { path: "/api/slots", method: ["GET", "POST", "DELETE"] };
