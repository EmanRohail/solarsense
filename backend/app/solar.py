"""Expected-output model: how much a system *should* have produced, from real weather.

expected kWh/day = capacity_kW x peak sun hours x performance ratio (0.78, a typical value).
Peak sun hours come from Open-Meteo (free, no key): daily shortwave radiation in MJ/m2 divided by 3.6.
Works for any location in the world. If the weather service can't be reached, a typical global value is used and labelled.
"""
from __future__ import annotations

import json
import urllib.parse
import urllib.request
from datetime import date, timedelta

PR = 0.78
FALLBACK_PSH = 4.5  # rough global typical value, used only if live weather can't be reached


def geocode(query: str, count: int = 5) -> list[dict]:
    """Search any town or city in the world (Open-Meteo geocoding, free, no key)."""
    url = "https://geocoding-api.open-meteo.com/v1/search?" + urllib.parse.urlencode({"name": query, "count": count, "format": "json"})
    try:
        with urllib.request.urlopen(url, timeout=6) as r:
            rows = json.load(r).get("results") or []
    except Exception:  # noqa: BLE001
        return []
    return [{"name": ", ".join(x for x in (r.get("name"), r.get("admin1"), r.get("country")) if x),
             "lat": r["latitude"], "lon": r["longitude"]} for r in rows]


def peak_sun_hours(lat: float, lon: float, days: int = 7, today: date | None = None) -> dict:
    today = today or date.today()
    url = (f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}"
           f"&daily=shortwave_radiation_sum&past_days={days}&forecast_days=1&timezone=auto")
    try:
        with urllib.request.urlopen(url, timeout=6) as r:
            d = json.load(r)["daily"]
        rows = {t: (v or 0) / 3.6 for t, v in zip(d["time"], d["shortwave_radiation_sum"]) if v is not None}
        rows.pop(today.isoformat(), None)  # today is incomplete
        if rows:
            return {"source": "Open-Meteo (live weather)", "by_date": rows, "average": round(sum(rows.values()) / len(rows), 2)}
    except Exception:  # noqa: BLE001
        pass
    by_date = {(today - timedelta(days=i)).isoformat(): FALLBACK_PSH for i in range(1, days + 1)}
    return {"source": "global typical value (live weather unavailable)", "by_date": by_date, "average": FALLBACK_PSH}


def evaluate(reading: dict, capacity_kw: float, tariff: float, currency: str, place: str, lat: float, lon: float,
             today: date | None = None) -> dict:
    today = today or date.today()
    sun = peak_sun_hours(lat, lon, today=today)
    avg_psh = sun["average"]
    expected_day = capacity_kw * avg_psh * PR

    basis, actual_day, days = None, None, 0
    daily = [d for d in reading.get("daily") or [] if d.get("kwh") is not None]
    if len(daily) >= 3:
        days = len(daily)
        actual_day = sum(d["kwh"] for d in daily) / days
        dated = [sun["by_date"].get(d["date"]) for d in daily]
        if all(dated):
            expected_day = capacity_kw * (sum(dated) / days) * PR
        basis = f"average of {days} days shown"
    elif reading.get("month_kwh") and (reading.get("days_into_month") or today.day > 1):
        days = reading.get("days_into_month") or (today.day - 1)
        actual_day = reading["month_kwh"] / max(1, days)
        basis = f"this month so far ({days} days)"
    elif reading.get("today_kwh") is not None:
        days = 1
        actual_day = reading["today_kwh"]
        basis = "today only (less reliable: the day may not be over)"

    if actual_day is None:
        return {"ok": False, "reason": "No energy numbers could be read from the screenshot."}

    ratio = actual_day / expected_day if expected_day else None
    loss_day = max(0.0, expected_day - actual_day)
    status = "healthy" if ratio >= 0.85 else "check" if ratio >= 0.65 else "problem"
    return {
        "ok": True,
        "place": place,
        "capacity_kw": capacity_kw,
        "tariff_per_kwh": tariff,
        "currency": currency,
        "basis": basis,
        "weather_source": sun["source"],
        "peak_sun_hours": round(avg_psh, 2),
        "actual_kwh_per_day": round(actual_day, 1),
        "expected_kwh_per_day": round(expected_day, 1),
        "performance_ratio": round(ratio, 2),
        "status": status,
        "lost_kwh_per_month": round(loss_day * 30),
        "lost_money_per_month": round(loss_day * 30 * tariff),
        "fault_codes": reading.get("fault_codes") or [],
        "assumption": f"Expected = capacity x peak sun hours x {PR} (typical performance ratio)",
    }
