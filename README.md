# Weather Intelligence Dashboard ( Skylign)

Single-page weather dashboard. Flask backend (key-hiding proxy only) + vanilla
HTML/CSS/JS frontend. Live data from [WeatherAPI.com](https://www.weatherapi.com/).

## Why it looks the way it does
The background is a **live sky**: its colour and drifting layers are set by the
current condition and whether it's day or night at the searched location. The
visuals are driven by the data, not pasted on top of it.

## Setup (about)

1. **Get a free key.** Sign up at https://www.weatherapi.com/signup.aspx and copy
   your API key. The free tier covers current weather, 7-day + hourly forecast,
   AQI, and alerts — everything this app uses.

2. **Install and configure:**
   ```bash
   pip install -r requirements.txt
   cp .env.example .env          # Windows: copy .env.example .env
   # open .env and paste your key after WEATHER_API_KEY=
   ```

3. **Run:**
   ```bash
   python app.py
   ```
   Open http://127.0.0.1:5000

The browser will ask for location permission. Allow it, or just search any city.
If you deny location, it falls back to Karachi.

## Structure
```
|-app.py
|-templates/index.html
|-static |- css/style.css
         |-js/app.js         
```

## Features
Hero card · 10-metric stats grid · 24h hourly (scroll) · 7-day forecast ·
4 Chart.js trends · notification centre with unread badge · threshold alerts ·
rules-based assistant · city search with autocomplete · favourites (saved in your
browser) · dark/light themes · responsive to mobile.

## Known limits
- Favourites and theme live in `localStorage` (this browser only — no accounts).
- Free WeatherAPI tier rate-limits to ~1M calls/month; fine for a project, not production traffic.
- Hourly chart shows the next 24h from the current hour.
```
