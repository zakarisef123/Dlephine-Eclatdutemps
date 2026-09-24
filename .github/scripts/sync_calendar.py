"""Récupère le calendrier Outlook publié (.ics) et écrit busy.json :
les plages occupées, en heure de Genève, sans aucun titre ni détail de rendez-vous.

Format : {"updated": "...", "busy": {"AAAA-MM-JJ": [["HH:MM", "HH:MM"], ...]}}
Une journée entière occupée vaut ["00:00", "24:00"].
"""
import json
import os
import sys
import urllib.request
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

import icalendar
import recurring_ical_events

ICS_URL = os.environ["OUTLOOK_ICS_URL"]
TZ = ZoneInfo("Europe/Zurich")
DAYS_AHEAD = 90

req = urllib.request.Request(ICS_URL, headers={"User-Agent": "Mozilla/5.0"})
with urllib.request.urlopen(req, timeout=60) as res:
    cal = icalendar.Calendar.from_ical(res.read())

today = datetime.now(TZ).date()
end = today + timedelta(days=DAYS_AHEAD)
busy = {}


def add(day, start, stop):
    busy.setdefault(day.isoformat(), []).append([start, stop])


for ev in recurring_ical_events.of(cal).between(today, end):
    # Événements marqués "Disponible" dans Outlook : ne bloquent pas de créneau.
    if str(ev.get("TRANSP", "")).upper() == "TRANSPARENT":
        continue
    if str(ev.get("X-MICROSOFT-CDO-BUSYSTATUS", "")).upper() == "FREE":
        continue
    start = ev.decoded("DTSTART")
    stop = ev.decoded("DTEND") if ev.get("DTEND") else None

    if not isinstance(start, datetime):  # journée(s) entière(s)
        stop = stop or start + timedelta(days=1)
        d = start
        while d < stop:
            add(d, "00:00", "24:00")
            d += timedelta(days=1)
        continue

    if start.tzinfo is None:
        start = start.replace(tzinfo=TZ)
    stop = stop or start + timedelta(hours=1)
    if stop.tzinfo is None:
        stop = stop.replace(tzinfo=TZ)
    start, stop = start.astimezone(TZ), stop.astimezone(TZ)

    d = start.date()
    while d <= stop.date():
        s = start if d == start.date() else datetime.combine(d, time(0), TZ)
        e = stop if d == stop.date() else datetime.combine(d + timedelta(days=1), time(0), TZ)
        if e > s:
            add(d, s.strftime("%H:%M"), "24:00" if e.date() > d else e.strftime("%H:%M"))
        d += timedelta(days=1)

for k in busy:
    busy[k] = sorted(set(map(tuple, busy[k])))

new = {"busy": dict(sorted(busy.items()))}
try:
    with open("busy.json", encoding="utf-8") as f:
        if json.load(f).get("busy") == json.loads(json.dumps(new["busy"])):
            print("Aucun changement.")
            sys.exit(0)
except (FileNotFoundError, ValueError):
    pass

new["updated"] = datetime.now(TZ).isoformat(timespec="minutes")
with open("busy.json", "w", encoding="utf-8") as f:
    json.dump(new, f, ensure_ascii=False, indent=1)
print(f"{sum(len(v) for v in busy.values())} plages occupées écrites dans busy.json")
