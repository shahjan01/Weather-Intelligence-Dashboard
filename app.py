"""
Weather Intelligence Dashboard - Flask backend.

Purpose of this backend (the ONLY reason it exists):
    Keep your WeatherAPI key on the server so it never ships to the browser.
    Everything else is rendered client-side.

Run:
    1. pip install -r requirements.txt
    2. Copy .env.example -> .env and paste your free key from https://www.weatherapi.com/
    3. python app.py
    4. Open http://127.0.0.1:5000
"""

import math
import os

import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request

load_dotenv()

app = Flask(__name__)

WEATHER_API_KEY = os.getenv("WEATHER_API_KEY", "your_api_key_past_here").strip()
WEATHER_BASE = "https://api.weatherapi.com/v1"
REQUEST_TIMEOUT = 12  # seconds


def _dewpoint_c(temp_c, humidity):
    """Magnus-formula dew point fallback when the provider omits it."""
    try:
        a, b = 17.625, 243.04
        rh = max(min(float(humidity), 100.0), 1.0)
        t = float(temp_c)
        gamma = math.log(rh / 100.0) + (a * t) / (b + t)
        return round((b * gamma) / (a - gamma), 1)
    except (ValueError, ZeroDivisionError):
        return None


# Plain-language label for WeatherAPI's US EPA index (1..6)
AQI_LABELS = {
    1: ("Good", "#2ecc71"),
    2: ("Moderate", "#f1c40f"),
    3: ("Unhealthy for sensitive groups", "#e67e22"),
    4: ("Unhealthy", "#e74c3c"),
    5: ("Very unhealthy", "#9b59b6"),
    6: ("Hazardous", "#7e0023"),
}


def _shape_payload(raw):
    """Trim the provider response to exactly what the dashboard renders."""
    loc = raw.get("location", {})
    cur = raw.get("current", {})
    fc_days = raw.get("forecast", {}).get("forecastday", [])

    aqi_raw = cur.get("air_quality", {}) or {}
    epa = int(aqi_raw.get("us-epa-index", 0) or 0)
    aqi_label, aqi_color = AQI_LABELS.get(epa, ("Unknown", "#95a5a6"))

    dew = cur.get("dewpoint_c")
    if dew is None:
        dew = _dewpoint_c(cur.get("temp_c"), cur.get("humidity"))

    today = fc_days[0]["day"] if fc_days else {}

    return {
        "location": {
            "name": loc.get("name"),
            "region": loc.get("region"),
            "country": loc.get("country"),
            "localtime": loc.get("localtime"),
            "lat": loc.get("lat"),
            "lon": loc.get("lon"),
        },
        "current": {
            "temp_c": cur.get("temp_c"),
            "feelslike_c": cur.get("feelslike_c"),
            "condition_text": cur.get("condition", {}).get("text"),
            "condition_code": cur.get("condition", {}).get("code"),
            "is_day": cur.get("is_day"),
            "humidity": cur.get("humidity"),
            "wind_kph": cur.get("wind_kph"),
            "wind_dir": cur.get("wind_dir"),
            "wind_degree": cur.get("wind_degree"),
            "pressure_mb": cur.get("pressure_mb"),
            "vis_km": cur.get("vis_km"),
            "uv": cur.get("uv"),
            "cloud": cur.get("cloud"),
            "dewpoint_c": dew,
            "last_updated": cur.get("last_updated"),
            "maxtemp_c": today.get("maxtemp_c"),
            "mintemp_c": today.get("mintemp_c"),
            "chance_of_rain": today.get("daily_chance_of_rain"),
            "aqi": {
                "epa_index": epa,
                "label": aqi_label,
                "color": aqi_color,
                "pm2_5": round(aqi_raw.get("pm2_5", 0) or 0, 1),
                "pm10": round(aqi_raw.get("pm10", 0) or 0, 1),
            },
        },
        "forecast": [
            {
                "date": d.get("date"),
                "maxtemp_c": d["day"].get("maxtemp_c"),
                "mintemp_c": d["day"].get("mintemp_c"),
                "chance_of_rain": d["day"].get("daily_chance_of_rain"),
                "condition_text": d["day"].get("condition", {}).get("text"),
                "condition_code": d["day"].get("condition", {}).get("code"),
                "avghumidity": d["day"].get("avghumidity"),
                "hours": [
                    {
                        "time": h.get("time"),
                        "temp_c": h.get("temp_c"),
                        "chance_of_rain": h.get("chance_of_rain"),
                        "condition_code": h.get("condition", {}).get("code"),
                        "is_day": h.get("is_day"),
                        "humidity": h.get("humidity"),
                    }
                    for h in d.get("hour", [])
                ],
            }
            for d in fc_days
        ],
        "alerts": [
            {
                "headline": a.get("headline"),
                "event": a.get("event"),
                "desc": a.get("desc"),
            }
            for a in raw.get("alerts", {}).get("alert", [])
        ],
    }


def _key_error():
    return (
        jsonify(
            {
                "error": "no_api_key",
                "message": (
                    "No WeatherAPI key found. Copy .env.example to .env and add "
                    "WEATHER_API_KEY=<your free key from weatherapi.com>."
                ),
            }
        ),
        503,
    )


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/weather")
def api_weather():
    """Proxy: current + 7-day + hourly + AQI + alerts for a location."""
    if not WEATHER_API_KEY:
        return _key_error()

    query = request.args.get("q", "").strip()
    if not query:
        return jsonify({"error": "bad_request", "message": "Missing 'q' parameter."}), 400

    try:
        resp = requests.get(
            f"{WEATHER_BASE}/forecast.json",
            params={
                "key": WEATHER_API_KEY,
                "q": query,
                "days": 7,
                "aqi": "yes",
                "alerts": "yes",
            },
            timeout=REQUEST_TIMEOUT,
        )
    except requests.RequestException as exc:
        return jsonify({"error": "upstream_unreachable", "message": str(exc)}), 502

    if resp.status_code == 401 or resp.status_code == 403:
        return jsonify({"error": "auth", "message": "WeatherAPI rejected the key."}), 502
    if resp.status_code == 400:
        return jsonify({"error": "not_found", "message": f"No match for '{query}'."}), 404
    if not resp.ok:
        return jsonify({"error": "upstream", "message": resp.text[:200]}), 502

    return jsonify(_shape_payload(resp.json()))


@app.route("/api/search")
def api_search():
    """Proxy: city autocomplete suggestions."""
    if not WEATHER_API_KEY:
        return _key_error()

    query = request.args.get("q", "").strip()
    if len(query) < 2:
        return jsonify([])

    try:
        resp = requests.get(
            f"{WEATHER_BASE}/search.json",
            params={"key": WEATHER_API_KEY, "q": query},
            timeout=REQUEST_TIMEOUT,
        )
        resp.raise_for_status()
    except requests.RequestException as exc:
        return jsonify({"error": "upstream", "message": str(exc)}), 502

    results = [
        {
            "id": item.get("id"),
            "name": item.get("name"),
            "region": item.get("region"),
            "country": item.get("country"),
            "lat": item.get("lat"),
            "lon": item.get("lon"),
        }
        for item in resp.json()
    ]
    return jsonify(results)


if __name__ == "__main__":
    if not WEATHER_API_KEY:
        print("\n  WARNING: no WEATHER_API_KEY set. The UI loads but data calls 503.")
        print("  Fix: copy .env.example to .env and paste your key.\n")
    app.run(debug=True, port=5000)
