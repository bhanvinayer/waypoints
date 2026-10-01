"""Reusable SerpApi tools. Every external fact in WAYPOINTS enters through one of these functions.

    search_web()    -> engine=google
    search_maps()   -> engine=google_maps
    get_place()     -> engine=google_maps (type=place)
    get_reviews()   -> engine=google_maps_reviews
    get_directions()-> engine=google_maps_directions
    search_events() -> engine=google_events
    search_news()   -> engine=google_news
    search_flights()-> engine=google_flights
    search_hotels() -> engine=google_hotels
"""
from __future__ import annotations

from typing import Any

from ..config import get_settings
from .client import get_serp_client

_EVENT_CHIPS = {
    "today": "date:today",
    "tomorrow": "date:tomorrow",
    "week": "date:week",
    "weekend": "date:weekend",
    "next_week": "date:next_week",
    "month": "date:month",
}


async def search_web(query: str, location: str | None = None, num: int = 8, *, phase: str = "web") -> dict[str, Any]:
    return await get_serp_client().call(
        "google", {"q": query, "location": location, "num": num}, phase=phase, query=query
    )


async def search_maps(
    query: str,
    location: str | None = None,
    latitude: float | None = None,
    longitude: float | None = None,
    zoom: int = 13,
    *,
    phase: str = "maps",
) -> dict[str, Any]:
    params: dict[str, Any] = {"q": query, "type": "search"}
    if latitude is not None and longitude is not None:
        params["ll"] = f"@{latitude:.5f},{longitude:.5f},{zoom}z"
    elif location:
        params["q"] = f"{query} in {location}" if location.lower() not in query.lower() else query
    return await get_serp_client().call("google_maps", params, phase=phase, query=params["q"])


async def get_place(
    place_id: str | None = None,
    data_id: str | None = None,
    latitude: float | None = None,
    longitude: float | None = None,
    *,
    phase: str = "places",
    label_query: str | None = None,
) -> dict[str, Any]:
    params: dict[str, Any] = {"type": "place"}
    if place_id:
        params["place_id"] = place_id
    elif data_id:
        lat = latitude if latitude is not None else 0
        lon = longitude if longitude is not None else 0
        params["data"] = f"!4m5!3m4!1s{data_id}!8m2!3d{lat}!4d{lon}"
    else:
        raise ValueError("get_place needs place_id or data_id")
    return await get_serp_client().call(
        "google_maps", params, phase=phase, query=label_query or place_id or data_id, label="Google Maps Place"
    )


async def get_reviews(data_id: str, num: int = 8, sort_by: str = "qualityScore", *, phase: str = "reviews") -> dict[str, Any]:
    return await get_serp_client().call(
        "google_maps_reviews",
        {"data_id": data_id, "sort_by": sort_by, "num": num},
        phase=phase,
        query=data_id,
    )


async def get_directions(
    start: str | tuple[float, float],
    end: str | tuple[float, float],
    travel_mode: int = 0,
    *,
    phase: str = "directions",
) -> dict[str, Any]:
    params: dict[str, Any] = {"travel_mode": travel_mode, "distance_unit": 0}
    if isinstance(start, tuple):
        params["start_coords"] = f"{start[0]:.6f},{start[1]:.6f}"
    else:
        params["start_addr"] = start
    if isinstance(end, tuple):
        params["end_coords"] = f"{end[0]:.6f},{end[1]:.6f}"
    else:
        params["end_addr"] = end
    label_query = f"{start if isinstance(start, str) else 'pin'} -> {end if isinstance(end, str) else 'pin'}"
    return await get_serp_client().call("google_maps_directions", params, phase=phase, query=label_query)


async def search_events(query: str, location: str | None = None, date_filter: str | None = None, *, phase: str = "events") -> dict[str, Any]:
    params: dict[str, Any] = {"q": query, "location": location}
    chip = _EVENT_CHIPS.get(date_filter or "")
    if chip:
        params["htichips"] = chip
    return await get_serp_client().call("google_events", params, phase=phase, query=query)


async def search_news(query: str, *, phase: str = "news") -> dict[str, Any]:
    return await get_serp_client().call("google_news", {"q": query}, phase=phase, query=query)


async def search_flights(departure_id: str, arrival_id: str, outbound_date: str, *, phase: str = "flights") -> dict[str, Any]:
    s = get_settings()
    return await get_serp_client().call(
        "google_flights",
        {
            "departure_id": departure_id,
            "arrival_id": arrival_id,
            "outbound_date": outbound_date,
            "type": 2,
            "currency": s.currency,
        },
        phase=phase,
        query=f"{departure_id} -> {arrival_id} on {outbound_date}",
    )


async def search_hotels(query: str, check_in_date: str, check_out_date: str, adults: int = 2, *, phase: str = "stay") -> dict[str, Any]:
    s = get_settings()
    return await get_serp_client().call(
        "google_hotels",
        {
            "q": query,
            "check_in_date": check_in_date,
            "check_out_date": check_out_date,
            "adults": adults,
            "currency": s.currency,
        },
        phase=phase,
        query=query,
    )
