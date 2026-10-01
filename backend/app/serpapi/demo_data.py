"""DEMO SNAPSHOT backend.

Deterministic, SerpApi-*shaped* responses for the Delhi -> Jaipur demo journey so the 3-minute demo never depends on
live search luck. It plugs in underneath `SerpClient.call`, so the *same* parsing, scoring, temporal validation,
optimisation, stress-test and recovery code runs on it as on live data.

IMPORTANT (honesty): this is sample data. It mixes real landmarks (approximate coordinates / typical hours) with
clearly-labelled illustrative venues "(sample)", and fictional news / event entries. The UI labels every demo
response "DEMO SNAPSHOT" and never claims it is live.
"""
from __future__ import annotations

import math
from datetime import date, datetime
from typing import Any

DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]


def _hours(text: str, **overrides: str) -> dict[str, str]:
    d = {day: text for day in DAYS}
    d.update(overrides)
    return d


def _hav(a: tuple[float, float], b: tuple[float, float]) -> float:
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    d = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * 6371.0088 * math.asin(min(1.0, math.sqrt(d)))


# --------------------------------------------------------------------------------------------- geography
CITIES = {
    "delhi": {"title": "Delhi", "lat": 28.6315, "lon": 77.2167, "address": "Delhi, India", "place_id": "ChIJdemo_delhi", "data_id": "0xdemo:delhi"},
    "new delhi": {"title": "New Delhi", "lat": 28.6315, "lon": 77.2167, "address": "New Delhi, Delhi, India", "place_id": "ChIJdemo_delhi", "data_id": "0xdemo:delhi"},
    "jaipur": {"title": "Jaipur", "lat": 26.9124, "lon": 75.7873, "address": "Jaipur, Rajasthan, India", "place_id": "ChIJdemo_jaipur", "data_id": "0xdemo:jaipur"},
    "gurugram": {"title": "Gurugram", "lat": 28.4595, "lon": 77.0266, "address": "Gurugram, Haryana, India", "place_id": "ChIJdemo_gurugram", "data_id": "0xdemo:gurugram"},
    "gurgaon": {"title": "Gurugram", "lat": 28.4595, "lon": 77.0266, "address": "Gurugram, Haryana, India", "place_id": "ChIJdemo_gurugram", "data_id": "0xdemo:gurugram"},
    "manesar": {"title": "Manesar", "lat": 28.3535, "lon": 76.9420, "address": "Manesar, Haryana, India", "place_id": "ChIJdemo_manesar", "data_id": "0xdemo:manesar"},
    "dharuhera": {"title": "Dharuhera", "lat": 28.2050, "lon": 76.8030, "address": "Dharuhera, Haryana, India", "place_id": "ChIJdemo_dharuhera", "data_id": "0xdemo:dharuhera"},
    "bawal": {"title": "Bawal", "lat": 28.0850, "lon": 76.5800, "address": "Bawal, Haryana, India", "place_id": "ChIJdemo_bawal", "data_id": "0xdemo:bawal"},
    "neemrana": {"title": "Neemrana", "lat": 27.9880, "lon": 76.3830, "address": "Neemrana, Rajasthan, India", "place_id": "ChIJdemo_neemrana_town", "data_id": "0xdemo:neemrana_town"},
    "behror": {"title": "Behror", "lat": 27.8890, "lon": 76.2850, "address": "Behror, Rajasthan, India", "place_id": "ChIJdemo_behror_town", "data_id": "0xdemo:behror_town"},
    "kotputli": {"title": "Kotputli", "lat": 27.7010, "lon": 76.1990, "address": "Kotputli, Rajasthan, India", "place_id": "ChIJdemo_kotputli_town", "data_id": "0xdemo:kotputli_town"},
    "shahpura": {"title": "Shahpura", "lat": 27.3880, "lon": 75.9560, "address": "Shahpura, Rajasthan, India", "place_id": "ChIJdemo_shahpura_town", "data_id": "0xdemo:shahpura_town"},
    "chandwaji": {"title": "Chandwaji", "lat": 27.1700, "lon": 75.9260, "address": "Chandwaji, Rajasthan, India", "place_id": "ChIJdemo_chandwaji_town", "data_id": "0xdemo:chandwaji_town"},
}

# NH48 corridor, hand-placed through the towns it serves (highway kept ~2.5 km east of Neemrana)
ROUTE_POINTS: list[tuple[float, float]] = [
    (28.6315, 77.2167), (28.6150, 77.1900), (28.5920, 77.1630), (28.5460, 77.1250), (28.5100, 77.0900), (28.4720, 77.0720),
    (28.4300, 77.0350), (28.3950, 76.9830), (28.3535, 76.9420), (28.2800, 76.8700), (28.2050, 76.8030), (28.1450, 76.7000),
    (28.0850, 76.5800), (28.0500, 76.4950), (28.0050, 76.4300), (27.9840, 76.4080), (27.9400, 76.3450), (27.8890, 76.2850),
    (27.8000, 76.2400), (27.7010, 76.1990), (27.6200, 76.1300), (27.5400, 76.0700), (27.4600, 76.0100), (27.3880, 75.9560),
    (27.3000, 75.9400), (27.1700, 75.9260), (27.0900, 75.9000), (27.0250, 75.8780), (26.9850, 75.8500), (26.9500, 75.8200),
    (26.9124, 75.7873),
]

DIRECTIONS_DURATION_S = 16800  # 4h 40m
DIRECTIONS_DISTANCE_M = 281000


# --------------------------------------------------------------------------------------------- places
def _P(pid: str, title: str, lat: float, lon: float, rating: float, n: int, types: list[str], address: str, hours: dict[str, str] | None,
       time_spent: str | None, desc: str, tags: list[str], price: str | None = None, reviews: list[tuple[float, str]] | None = None) -> dict[str, Any]:
    return {
        "id": pid, "title": title, "lat": lat, "lon": lon, "rating": rating, "reviews_count": n, "types": types, "address": address,
        "hours": hours, "time_spent": time_spent, "description": desc, "tags": tags, "price": price, "reviews": reviews or [],
        "place_id": f"ChIJdemo_{pid}", "data_id": f"0xdemo:{pid}",
    }


PLACES: list[dict[str, Any]] = [
    _P("kingdom-of-dreams", "Kingdom of Dreams", 28.4677, 77.0682, 4.4, 52000, ["Amusement park", "Theatre"], "Auto Market, Sector 29, Gurugram",
       _hours("12 pm–11:30 pm"), "People typically spend 2 to 3 hr here", "Live theatre and culture-themed entertainment complex.",
       ["culture", "show", "activity", "theatre", "family", "entertainment"], "₹₹₹",
       [(4.5, "The Culture Gully is a lovely stroll in the evening, and the stage shows are spectacular."), (4.2, "Plan the evening here; it only gets lively after sunset. Tickets sell out on weekends.")]),
    _P("sultanpur-national-park", "Sultanpur National Park", 28.4600, 76.8870, 4.2, 9100, ["Bird sanctuary", "National park"], "Sultanpur, Gurugram",
       _hours("6 am–5 pm"), "People typically spend 1 to 2 hr here", "Wetland bird sanctuary just off the expressway.",
       ["nature", "birds", "wildlife", "park", "photography"], None,
       [(4.3, "Great for bird photography early morning, lots of migratory birds in winter."), (4.0, "Quiet and clean, but go early; it gets hot by noon.")]),
    _P("dilli-haat", "Dilli Haat, INA", 28.5726, 77.2080, 4.3, 98000, ["Handicraft market", "Food court"], "Aurobindo Marg, INA, New Delhi",
       _hours("10:30 am–10 pm"), "People typically spend 1 to 2 hr here", "Open-air craft bazaar with regional food stalls.",
       ["market", "handicraft", "street food", "culture", "shopping"], "₹₹",
       [(4.4, "Handicrafts from every state and great regional food stalls."), (4.1, "Opens late morning, so don't come too early.")]),
    _P("manesar-chai-tapri", "Manesar Chai Tapri & Snacks (sample)", 28.3560, 76.9440, 4.2, 310, ["Tea house", "Snack bar"], "NH48 service road, Manesar",
       _hours("6 am–11 pm"), "People typically spend 20 to 30 min here", "Roadside chai and hot snacks on the highway.",
       ["chai", "tea", "street food", "snack", "cafe"], "₹",
       [(4.3, "Proper kulhad chai and fresh pakoras, a perfect first break out of Delhi."), (4.0, "Quick service, clean enough for a highway stop.")]),
    _P("neemrana-fort-palace", "Neemrana Fort-Palace", 27.9878, 76.3856, 4.5, 14200, ["Fort", "Heritage hotel", "Tourist attraction"], "Neemrana, Rajasthan",
       _hours("9 am–6 pm"), "People typically spend 1 hr here", "15th-century hill fort-palace restored as a heritage hotel, with stepped terraces and zip-line.",
       ["heritage", "fort", "palace", "architecture", "photography", "culture", "history"], "₹₹₹",
       [(4.7, "Stunning architecture and terraces; the views over the Aravalli foothills are fantastic for photos."), (4.4, "Day visitors are welcome but call ahead on weekends. Worth the short detour from the highway."), (4.6, "Beautifully restored; the courtyards and jharokhas are a photographer's dream.")]),
    _P("neemrana-baori", "Neemrana Baori (Stepwell)", 27.9890, 76.3834, 4.3, 2100, ["Stepwell", "Historical landmark"], "Neemrana Town, Rajasthan",
       _hours("9 am–5 pm"), "People typically spend 30 min here", "Atmospheric 18th-century stepwell.",
       ["heritage", "stepwell", "baori", "architecture", "photography", "hidden"], None,
       [(4.4, "Quiet stepwell with fantastic symmetry for photography, almost no crowds."), (4.1, "Small but atmospheric; ten minutes from the fort.")]),
    _P("behror-highway-dhaba", "Behror Highway Dhaba (sample)", 27.8885, 76.2870, 4.1, 1800, ["Dhaba", "Restaurant"], "NH48, Behror, Rajasthan",
       _hours("Open 24 hours"), "People typically spend 45 min here", "Punjabi-style dhaba on the highway, open all day.",
       ["dhaba", "restaurant", "punjabi", "thali", "food", "lunch"], "₹₹",
       [(4.2, "Dal makhani and butter chicken are excellent; reliable lunch stop."), (3.9, "Crowded at peak lunch but quick service.")]),
    _P("kotputli-kachori", "Kotputli Kachori Corner (sample)", 27.7020, 76.2000, 4.4, 640, ["Sweet shop", "Snack bar"], "Kotputli bypass, Rajasthan",
       _hours("6 am–9 pm"), "People typically spend 20 min here", "Famous for hot kachori and jalebi, best in the morning.",
       ["kachori", "street food", "sweets", "snack", "mithai", "breakfast"], "₹",
       [(4.5, "Fresh kachori with spicy chutney, a must-stop for street food lovers."), (4.3, "Go before noon; the best batches sell out.")]),
    _P("shahpura-thali-house", "Shahpura Rajasthani Thali House (sample)", 27.3900, 75.9600, 4.3, 920, ["Rajasthani restaurant", "Restaurant"], "Shahpura, Rajasthan",
       _hours("11 am–10 pm"), "People typically spend 1 hr here", "Unlimited Rajasthani thali with dal baati churma.",
       ["rajasthani", "thali", "restaurant", "food", "lunch", "dal baati"], "₹₹",
       [(4.4, "Authentic dal baati churma, served with plenty of ghee. Perfect lunch before Jaipur."), (4.2, "Generous unlimited thali, friendly staff.")]),
    _P("chandwaji-cafe", "Chandwaji Highway Cafe (sample)", 27.1720, 75.9280, 4.0, 540, ["Cafe", "Coffee shop"], "NH48, Chandwaji, Rajasthan",
       _hours("7 am–10 pm"), "People typically spend 30 min here", "Clean highway cafe with coffee and sandwiches.",
       ["cafe", "coffee", "snack", "sandwich"], "₹₹",
       [(4.1, "Decent coffee and a clean washroom, a fine caffeine stop before Jaipur."), (3.9, "Average food, but convenient.")]),
    _P("amer-fort", "Amer Fort", 26.9855, 75.8513, 4.6, 82000, ["Fort", "Tourist attraction"], "Devisinghpura, Amer, Jaipur",
       _hours("8 am–5:30 pm"), "People typically spend 2 hr here", "UNESCO hill fort with Sheesh Mahal and Ganesh Pol.",
       ["heritage", "fort", "palace", "architecture", "photography", "culture", "history", "unesco"], "₹₹",
       [(4.8, "Spectacular architecture; the Sheesh Mahal mirror work is unmissable and incredibly photogenic."), (4.5, "Gets very crowded by late morning; go before noon or after 3 pm for the best light."), (4.6, "Worth every minute; tickets can queue on weekends but it moves quickly.")]),
    _P("panna-meena-kund", "Panna Meena ka Kund", 26.9887, 75.8565, 4.5, 6200, ["Stepwell", "Historical landmark"], "Amer, Jaipur",
       _hours("6 am–6 pm"), "People typically spend 20 min here", "Geometric stepwell beside Amer Fort.",
       ["heritage", "stepwell", "baori", "photography", "architecture", "hidden"], None,
       [(4.6, "Mesmerising geometry; late afternoon light is perfect for photos."), (4.4, "Free to see and rarely crowded compared to the fort.")]),
    _P("jaigarh-fort", "Jaigarh Fort", 26.9852, 75.8467, 4.5, 31000, ["Fort", "Tourist attraction"], "Amer, Jaipur",
       _hours("9 am–4:30 pm"), "People typically spend 1 hr 30 min here", "Fort with the world's largest wheeled cannon, Jaivana.",
       ["heritage", "fort", "history", "architecture", "views", "photography"], "₹₹",
       [(4.6, "Massive ramparts and sweeping views; the cannon foundry museum is fascinating."), (4.3, "Closes early, so reach by 3 pm.")]),
    _P("jal-mahal", "Jal Mahal", 26.9535, 75.8466, 4.4, 56000, ["Palace", "Tourist attraction"], "Amer Road, Jaipur",
       _hours("Open 24 hours"), "People typically spend 20 min here", "Lake palace viewed from the promenade on Man Sagar Lake.",
       ["heritage", "palace", "lake", "photography", "views", "sunset", "scenic"], None,
       [(4.5, "Beautiful in the late afternoon and even better at sunset when the lake turns golden."), (4.2, "You can only view it from the promenade; a quick photo stop.")]),
    _P("nahargarh-fort", "Nahargarh Fort", 26.9374, 75.8155, 4.5, 64000, ["Fort", "Tourist attraction"], "Krishna Nagar, Brahmapuri, Jaipur",
       _hours("10 am–10 pm"), "People typically spend 45 min here", "Hilltop fort overlooking the Pink City, famous for sunset views.",
       ["fort", "heritage", "sunset", "views", "photography", "scenic", "viewpoint"], "₹₹",
       [(4.8, "The sunset view over the whole city is the best in Jaipur; arrive an hour early to find a spot."), (4.6, "Go at golden hour; the skyline turns pink and it is magical for photographers."), (4.4, "Open until late, with a rooftop cafe at the top.")]),
    _P("galta-ji-sunset", "Galta Ji Sun Temple Viewpoint", 26.9163, 75.8714, 4.3, 12400, ["Hindu temple", "Viewpoint"], "Galta Gate, Jaipur",
       _hours("5 am–9 pm"), "People typically spend 40 min here", "Hilltop Surya temple above the Monkey Temple complex with a sunset outlook.",
       ["temple", "religious", "viewpoint", "sunset", "views", "photography", "hidden"], None,
       [(4.5, "Walk up for a quiet sunset over the city, far less crowded than Nahargarh."), (4.2, "The monkeys are cheeky, but the view at sunset is worth it.")]),
    _P("hawa-mahal", "Hawa Mahal", 26.9239, 75.8267, 4.4, 195000, ["Palace", "Tourist attraction"], "Hawa Mahal Rd, Badi Choupad, Jaipur",
       _hours("9 am–5 pm"), "People typically spend 45 min here", "The iconic five-storey Palace of Winds.",
       ["heritage", "palace", "architecture", "photography", "culture", "icon"], "₹",
       [(4.5, "Best photographed from the cafes across the street in morning light."), (4.2, "Crowded, and the inside is smaller than expected; the facade is the star.")]),
    _P("city-palace", "City Palace, Jaipur", 26.9255, 75.8236, 4.5, 74000, ["Palace", "Museum"], "Tripolia Bazaar, Jaipur",
       _hours("9:30 am–5 pm"), "People typically spend 1 hr 30 min here", "Royal residence with courtyards and textile galleries.",
       ["heritage", "palace", "museum", "culture", "architecture", "history"], "₹₹₹",
       [(4.6, "Wonderful courtyards and museum collections; allow a couple of hours."), (4.3, "Tickets are pricey but the Peacock Gate is stunning.")]),
    _P("jantar-mantar", "Jantar Mantar", 26.9247, 75.8246, 4.5, 41000, ["Observatory", "UNESCO World Heritage Site"], "Gangori Bazaar, Jaipur",
       _hours("9 am–4:30 pm"), "People typically spend 1 hr here", "18th-century astronomical observatory with giant sundials.",
       ["heritage", "observatory", "history", "culture", "unesco", "science"], "₹",
       [(4.6, "Fascinating instruments; hire a guide for the best experience."), (4.4, "Very hot at midday; go earlier or later.")]),
    _P("albert-hall", "Albert Hall Museum", 26.9115, 75.8195, 4.4, 38000, ["Museum"], "Ram Niwas Garden, Jaipur",
       _hours("9 am–5 pm"), "People typically spend 1 hr 30 min here", "Indo-Saracenic museum, spectacular when lit at night.",
       ["museum", "culture", "heritage", "architecture", "history", "photography"], "₹",
       [(4.5, "The building is gorgeous; illuminated at night it looks like a palace."), (4.2, "Museum closes at 5, but the night lighting is free to admire from outside.")]),
    _P("johari-bazaar", "Johari Bazaar", 26.9190, 75.8270, 4.2, 28000, ["Market", "Jewellery"], "Johari Bazaar, Jaipur",
       _hours("10 am–8 pm"), "People typically spend 1 hr here", "Traditional jewellery and textile bazaar in the Pink City.",
       ["market", "shopping", "bazaar", "culture", "handicraft", "photography"], "₹₹",
       [(4.3, "Colourful lanes and great for photography around 5 pm."), (4.0, "Busy but full of character; bargain hard.")]),
    _P("lmb", "Laxmi Misthan Bhandar (LMB)", 26.9190, 75.8283, 4.2, 29000, ["Restaurant", "Sweet shop", "Vegetarian restaurant"], "Johari Bazaar, Jaipur",
       _hours("8 am–11 pm"), "People typically spend 1 hr here", "Heritage vegetarian restaurant and sweet shop, serving Rajasthani thalis since 1727.",
       ["restaurant", "rajasthani", "thali", "sweets", "food", "street food", "dinner", "vegetarian"], "₹₹",
       [(4.3, "Classic Rajasthani thali and the ghewar is superb; a Jaipur institution."), (4.1, "Busy at dinner but lines move fast.")]),
    _P("rawat-mishthan", "Rawat Mishthan Bhandar", 26.9195, 75.7890, 4.3, 41000, ["Sweet shop", "Snack bar"], "Station Rd, Jaipur",
       _hours("6 am–10:30 pm"), "People typically spend 30 min here", "Legendary pyaaz kachori and mawa kachori.",
       ["kachori", "street food", "snack", "sweets", "mithai", "breakfast", "chaat"], "₹",
       [(4.5, "The pyaaz kachori is legendary; go in the morning when it's hot."), (4.2, "Always a queue, but the street food experience is worth it.")]),
    _P("tapri-central", "Tapri Central", 26.9060, 75.8030, 4.3, 14000, ["Cafe", "Tea house"], "Tilak Marg, C Scheme, Jaipur",
       _hours("8 am–11 pm"), "People typically spend 45 min here", "Rooftop chai cafe with a relaxed terrace.",
       ["cafe", "chai", "tea", "coffee", "snack", "rooftop", "hangout"], "₹₹",
       [(4.4, "Lovely terrace and excellent masala chai, a perfect late-afternoon break."), (4.1, "Gets lively in the evening; try the bun omelette.")]),
    _P("lassiwala", "Lassiwala (MI Road)", 26.9165, 75.8070, 4.4, 17000, ["Juice shop", "Snack bar"], "MI Road, Jaipur",
       _hours("8 am–5 pm"), "People typically spend 15 min here", "Iconic clay-cup lassi stand.",
       ["lassi", "street food", "snack", "drink", "iconic"], "₹",
       [(4.5, "Thick, creamy lassi in a kulhad, an essential Jaipur street food stop."), (4.3, "Sells out by afternoon, so go early.")]),
    _P("peacock-rooftop", "Peacock Rooftop Restaurant", 26.9244, 75.8261, 4.2, 9800, ["Restaurant", "Rooftop restaurant"], "Opp. Hawa Mahal, Jaipur",
       _hours("9 am–11 pm"), "People typically spend 1 hr here", "Rooftop restaurant with direct views of Hawa Mahal.",
       ["restaurant", "rooftop", "views", "food", "dinner", "lunch", "hawa mahal"], "₹₹₹",
       [(4.3, "Dinner with Hawa Mahal lit up in front of you is a treat."), (4.0, "Pricey for the food, but you pay for the view.")]),
    _P("1135-ad", "1135 AD", 26.9882, 75.8530, 4.4, 5200, ["Fine dining restaurant", "Restaurant"], "Amer Fort Rd, Jaipur",
       _hours("12 pm–3 pm, 7 pm–11 pm"), "People typically spend 1 hr 30 min here", "Fine-dining Rajasthani restaurant in a fort setting.",
       ["restaurant", "fine dining", "rajasthani", "food", "dinner", "lunch", "heritage"], "₹₹₹₹",
       [(4.5, "Royal ambience and excellent laal maas, book ahead for dinner."), (4.3, "Kitchen closes between lunch and dinner, so mind the timings.")]),
    _P("bar-palladio", "Bar Palladio", 26.9038, 75.8133, 4.5, 4600, ["Bar", "Lounge"], "Narain Niwas Palace, Kanota Bagh, Jaipur",
       _hours("12 pm–12 am"), "People typically spend 1 hr 30 min here", "Italian-styled lounge bar in a palace garden.",
       ["bar", "lounge", "nightlife", "cocktail", "evening"], "₹₹₹₹",
       [(4.6, "Stunning blue interiors, beautiful for an evening drink."), (4.4, "Great ambience after 7 pm, reserve for the weekend.")]),
    _P("jawahar-kala-kendra", "Jawahar Kala Kendra", 26.9043, 75.8120, 4.4, 8800, ["Cultural center", "Art gallery"], "JLN Marg, Jhalana Doongri, Jaipur",
       _hours("11 am–7 pm"), "People typically spend 1 hr here", "Arts and crafts centre built on the Jaipur plan, hosting evening performances.",
       ["culture", "museum", "art", "performance", "music", "kala kendra"], "₹",
       [(4.5, "Brilliant architecture and regular music and theatre evenings."), (4.3, "The gallery is quiet and the courtyard is lovely.")]),
    _P("patrika-gate", "Patrika Gate", 26.8419, 75.8097, 4.5, 21000, ["Monument", "Tourist attraction"], "Jawahar Circle, Jaipur",
       _hours("Open 24 hours"), "People typically spend 30 min here", "Ornate gateways lining Jawahar Circle garden.",
       ["photography", "gate", "monument", "architecture", "heritage", "hidden", "scenic"], None,
       [(4.6, "A colourful photo spot; the carvings are splendid in the morning light."), (4.4, "Very peaceful early morning and lit up at night.")]),
    _P("chokhi-dhani", "Chokhi Dhani Village Resort", 26.7787, 75.8157, 4.3, 78000, ["Village resort", "Restaurant"], "Tonk Rd, Jaipur",
       _hours("6 pm–11 pm"), "People typically spend 2 to 3 hr here", "Ethnic Rajasthani village experience with folk performances and dinner.",
       ["restaurant", "rajasthani", "folk", "dinner", "culture", "village", "activity"], "₹₹₹",
       [(4.4, "Folk dances, puppet shows and an unlimited dinner, a classic Jaipur evening."), (4.0, "Touristy and far from the centre, but fun for first-timers.")]),
]
PLACES_BY_ID = {p["id"]: p for p in PLACES}
PLACE_INDEX = {p["place_id"]: p for p in PLACES} | {p["data_id"]: p for p in PLACES}


def _price_text(p: dict[str, Any]) -> str | None:
    return p["price"]


def _open_state(p: dict[str, Any]) -> str:
    h = p["hours"]
    if not h:
        return ""
    return f"Hours: {h['saturday']}"


def _local_result(p: dict[str, Any], pos: int) -> dict[str, Any]:
    return {
        "position": pos,
        "title": p["title"],
        "place_id": p["place_id"],
        "data_id": p["data_id"],
        "gps_coordinates": {"latitude": p["lat"], "longitude": p["lon"]},
        "rating": p["rating"],
        "reviews": p["reviews_count"],
        "price": p["price"],
        "type": p["types"][0],
        "types": p["types"],
        "address": p["address"],
        "hours": _open_state(p),
        "description": p["description"],
    }


def _place_results(p: dict[str, Any]) -> dict[str, Any]:
    out = _local_result(p, 1)
    out["operating_hours"] = p["hours"]
    if p["time_spent"]:
        out["popular_times"] = {"time_spent": p["time_spent"]}
        out["time_spent"] = p["time_spent"]
    return out


def _tokens(q: str) -> list[str]:
    stop = {"in", "near", "the", "of", "and", "a", "best", "top", "places", "to", "visit", "for", "around", "good"}
    return [t for t in "".join(c if c.isalnum() else " " for c in q.lower()).split() if t not in stop and len(t) > 2]


def _parse_ll(ll: str | None) -> tuple[float, float, int] | None:
    if not ll:
        return None
    try:
        parts = ll.lstrip("@").split(",")
        zoom = int(parts[2].rstrip("z")) if len(parts) > 2 else 13
        return float(parts[0]), float(parts[1]), zoom
    except Exception:
        return None


def _radius_km(zoom: int) -> float:
    return {10: 60, 11: 35, 12: 22, 13: 14, 14: 8, 15: 4}.get(zoom, 25 if zoom < 10 else 5)


def _maps_search(params: dict[str, Any]) -> dict[str, Any]:
    q = str(params.get("q", ""))
    qn = q.lower().strip()
    for suffix in (" in delhi", " in jaipur", ", india"):
        if qn.endswith(suffix) and qn.replace(suffix, "") in CITIES:
            qn = qn.replace(suffix, "")
    if qn in CITIES:
        c = CITIES[qn]
        return {"search_metadata": {"status": "Success"}, "place_results": {
            "title": c["title"], "place_id": c["place_id"], "data_id": c["data_id"], "address": c["address"],
            "gps_coordinates": {"latitude": c["lat"], "longitude": c["lon"]}, "type": "City"}}
    # exact venue lookup (events geocoding): "Jawahar Kala Kendra Jaipur"
    for p in PLACES:
        if p["title"].lower() in qn and len(qn) < len(p["title"]) + 14:
            return {"search_metadata": {"status": "Success"}, "local_results": [_local_result(p, 1)]}
    ll = _parse_ll(params.get("ll"))
    toks = _tokens(q)
    scored: list[tuple[int, float, dict[str, Any]]] = []
    for p in PLACES:
        dist = _hav(ll[:2], (p["lat"], p["lon"])) if ll else 0.0
        if ll and dist > _radius_km(ll[2]):
            continue
        hay = " ".join([p["title"], *p["types"], *p["tags"]]).lower()
        hits = sum(1 for t in toks if t in hay)
        if toks and hits == 0:
            continue
        scored.append((-hits, dist, p))
    scored.sort(key=lambda x: (x[0], x[1], -x[2]["rating"]))
    results = [_local_result(p, i + 1) for i, (_, _, p) in enumerate(scored[:10])]
    if not results:
        return {"search_metadata": {"status": "Success"}, "error": "Google Maps hasn't returned any results for this query.", "_empty": True}
    return {"search_metadata": {"status": "Success"}, "local_results": results}


def _maps_place(params: dict[str, Any]) -> dict[str, Any]:
    key = params.get("place_id")
    p = PLACE_INDEX.get(key) if key else None
    if p is None and params.get("data"):
        raw = str(params["data"])
        for k, v in PLACE_INDEX.items():
            if k in raw:
                p = v
                break
    if p is None:
        return {"error": "Google Maps hasn't returned any results for this query.", "_empty": True}
    return {"search_metadata": {"status": "Success"}, "place_results": _place_results(p)}


def _reviews(params: dict[str, Any]) -> dict[str, Any]:
    p = PLACE_INDEX.get(str(params.get("data_id")))
    if p is None:
        return {"reviews": []}
    revs = [
        {"snippet": text, "rating": r, "date": "2 months ago", "iso_date": "2026-07-28T10:00:00Z", "user": {"name": "Demo traveller"}}
        for r, text in p["reviews"]
    ]
    return {"place_info": {"title": p["title"], "rating": p["rating"], "reviews": p["reviews_count"]}, "reviews": revs}


def _coords(s: Any) -> tuple[float, float] | None:
    try:
        a, b = str(s).split(",")
        return float(a), float(b)
    except Exception:
        return None


def _resolve_endpoint(addr: Any, coords: Any) -> tuple[float, float] | None:
    c = _coords(coords) if coords else None
    if c:
        return c
    if addr:
        k = str(addr).lower().split(",")[0].strip()
        if k in CITIES:
            return CITIES[k]["lat"], CITIES[k]["lon"]
    return None


def _directions(params: dict[str, Any]) -> dict[str, Any]:
    a = _resolve_endpoint(params.get("start_addr"), params.get("start_coords"))
    b = _resolve_endpoint(params.get("end_addr"), params.get("end_coords"))
    if a is None or b is None:
        return {"error": "Google Maps hasn't returned any results for this query.", "_empty": True}
    delhi, jaipur = (CITIES["delhi"]["lat"], CITIES["delhi"]["lon"]), (CITIES["jaipur"]["lat"], CITIES["jaipur"]["lon"])
    is_main = (_hav(a, delhi) < 12 and _hav(b, jaipur) < 12)
    if is_main:
        details = [{"title": f"Continue on NH 48", "gps_coordinates": {"latitude": la, "longitude": lo}} for la, lo in ROUTE_POINTS]
        return {
            "search_metadata": {"status": "Success"},
            "places_info": [
                {"address": "Delhi, India", "gps_coordinates": {"latitude": delhi[0], "longitude": delhi[1]}},
                {"address": "Jaipur, Rajasthan, India", "gps_coordinates": {"latitude": jaipur[0], "longitude": jaipur[1]}},
            ],
            "directions": [{
                "travel_mode": "Best", "via": "NH 48", "distance": DIRECTIONS_DISTANCE_M, "duration": DIRECTIONS_DURATION_S,
                "formatted_distance": "281 km", "formatted_duration": "4 hr 40 min",
                "trips": [{"title": "Delhi to Jaipur via NH 48", "travel_mode": "Driving", "details": details}],
            }],
        }
    km = _hav(a, b)
    from ..engine.geo import cumulative_km, project_on_polyline

    cum = cumulative_km(ROUTE_POINTS)
    scale = DIRECTIONS_DISTANCE_M / 1000 / cum[-1]
    pa, la = project_on_polyline(ROUTE_POINTS, cum, a)
    pb, lb = project_on_polyline(ROUTE_POINTS, cum, b)
    in_city = any(_hav(a, c) < 15 and _hav(b, c) < 15 for c in (delhi, jaipur))
    if not in_city and la < 8 and lb < 8:  # both ends near the NH48 corridor: drive along the highway (1 km per minute) plus access roads
        road_km = abs(pb - pa) * scale + (la + lb) * 1.35
        minutes = abs(pb - pa) * scale * (DIRECTIONS_DURATION_S / 60) / (DIRECTIONS_DISTANCE_M / 1000) + (la + lb) * 2.6 + 1
    else:  # local roads
        road_km, minutes = km * 1.35, km * 2.6 + (2 if km > 0.3 else 0)
    return {
        "search_metadata": {"status": "Success"},
        "directions": [{"travel_mode": "Best", "via": "local roads", "distance": int(road_km * 1000), "duration": int(minutes * 60),
                        "formatted_distance": f"{road_km:.0f} km", "formatted_duration": f"{int(minutes)} min"}],
    }


# --------------------------------------------------------------------------------------------- events / news / web
def _md(d: date) -> str:
    return f"{d.strftime('%b')} {d.day}"


def _events(params: dict[str, Any], journey_date: str | None) -> dict[str, Any]:
    q = str(params.get("q", "")).lower()
    if "jaipur" not in q:
        return {"events_results": []}
    d = date.fromisoformat(journey_date) if journey_date else date.today()
    wd = d.strftime("%a")
    sd = _md(d)
    return {"search_metadata": {"status": "Success"}, "events_results": [
        {"title": "Rajasthani Folk Music & Ghoomar Evening", "date": {"start_date": sd, "when": f"{wd}, {sd}, 7:30 – 9:30 PM IST"},
         "address": ["Jawahar Kala Kendra", "JLN Marg, Jaipur"], "link": "https://example.org/demo-snapshot/events/folk-evening",
         "venue": {"name": "Jawahar Kala Kendra", "rating": 4.4}, "description": "Live folk musicians and Ghoomar dance in the open courtyard. (demo snapshot)"},
        {"title": "Pink City Sunrise Heritage Walk", "date": {"start_date": sd, "when": f"{wd}, {sd}, 6:30 – 8:30 AM IST"},
         "address": ["Albert Hall Museum", "Ram Niwas Garden, Jaipur"], "link": "https://example.org/demo-snapshot/events/sunrise-walk",
         "venue": {"name": "Albert Hall Museum", "rating": 4.4}, "description": "Guided early-morning walk through the old city. (demo snapshot)"},
        {"title": "Weekend Handicraft Bazaar", "date": {"start_date": sd, "when": f"{wd}, {sd}, 11 AM – 7 PM IST"},
         "address": ["Johari Bazaar", "Jaipur"], "link": "https://example.org/demo-snapshot/events/handicraft-bazaar",
         "venue": {"name": "Johari Bazaar", "rating": 4.2}, "description": "Artisan stalls and live block-printing demos. (demo snapshot)"},
        {"title": "Garden Concert (next week)", "date": {"start_date": _md(date.fromordinal(d.toordinal() + 6)), "when": "Next Fri, 8 – 10 PM IST"},
         "address": ["Narain Niwas Palace", "Jaipur"], "link": "https://example.org/demo-snapshot/events/garden-concert",
         "venue": {"name": "Bar Palladio", "rating": 4.5}, "description": "Outside the journey date (should be filtered out). (demo snapshot)"},
    ]}


def _news(params: dict[str, Any]) -> dict[str, Any]:
    q = str(params.get("q", "")).lower()
    items: list[dict[str, Any]] = []
    if "jaipur" in q or "amer" in q:
        items += [
            {"title": "Weekend traffic diversion on Amer Road during heritage festival", "link": "https://example.org/demo-snapshot/news/amer-diversion",
             "source": {"name": "Sample City Desk (demo)"}, "date": "1 day ago",
             "snippet": "Police advise leaving early for Amer Fort on Saturday; Amer Road sees one-way traffic until 2 PM. (fictional demo headline)"},
            {"title": "Nahargarh Fort sunset point expected to be crowded this weekend", "link": "https://example.org/demo-snapshot/news/nahargarh-crowds",
             "source": {"name": "Sample Travel Bulletin (demo)"}, "date": "2 days ago",
             "snippet": "Tourism officials expect higher footfall at Nahargarh Fort on Saturday evening. (fictional demo headline)"},
        ]
    if "nh48" in q or "highway" in q or "delhi" in q:
        items += [
            {"title": "NH48 resurfacing near Behror: slow lanes expected in the afternoon", "link": "https://example.org/demo-snapshot/news/nh48-resurfacing",
             "source": {"name": "Sample Highway Bulletin (demo)"}, "date": "3 days ago",
             "snippet": "Lane closures near Behror between 2 and 6 PM may add delay for Jaipur-bound traffic. (fictional demo headline)"},
        ]
    return {"search_metadata": {"status": "Success"}, "news_results": items}


def _web(params: dict[str, Any]) -> dict[str, Any]:
    q = str(params.get("q", "")).lower()
    for p in PLACES:
        if p["title"].lower().split(",")[0].split("(")[0].strip() in q:
            return {"search_metadata": {"status": "Success"}, "organic_results": [
                {"position": 1, "title": f"{p['title']} — visiting hours & tickets", "link": f"https://example.org/demo-snapshot/place/{p['id']}",
                 "displayed_link": "example.org › demo-snapshot", "snippet": f"{p['description']} (demo snapshot — not a live web result)", "date": "Demo snapshot"},
                {"position": 2, "title": f"Plan a visit to {p['title']}", "link": f"https://example.org/demo-snapshot/guide/{p['id']}",
                 "snippet": "Typical visit takes " + (p["time_spent"] or "about an hour").replace("People typically spend ", "") + ". (demo snapshot)"},
            ]}
    return {"search_metadata": {"status": "Success"}, "organic_results": []}


def _hotels(params: dict[str, Any]) -> dict[str, Any]:
    return {"search_metadata": {"status": "Success"}, "properties": [
        {"name": "Samode Haveli (sample)", "gps_coordinates": {"latitude": 26.9269, "longitude": 75.8264}, "overall_rating": 4.5,
         "rate_per_night": {"lowest": "₹9,800", "extracted_lowest": 9800}, "hotel_class": "5-star hotel", "link": "https://example.org/demo-snapshot/hotels/samode"},
        {"name": "Zostel Jaipur (sample)", "gps_coordinates": {"latitude": 26.9187, "longitude": 75.7878}, "overall_rating": 4.3,
         "rate_per_night": {"lowest": "₹1,150", "extracted_lowest": 1150}, "hotel_class": "Hostel", "link": "https://example.org/demo-snapshot/hotels/zostel"},
        {"name": "Hotel Pearl Palace (sample)", "gps_coordinates": {"latitude": 26.9159, "longitude": 75.8012}, "overall_rating": 4.4,
         "rate_per_night": {"lowest": "₹3,200", "extracted_lowest": 3200}, "hotel_class": "3-star hotel", "link": "https://example.org/demo-snapshot/hotels/pearl"},
    ]}


def _flights(params: dict[str, Any]) -> dict[str, Any]:
    return {"search_metadata": {"status": "Success"}, "best_flights": [
        {"flights": [{"departure_airport": {"id": params.get("departure_id"), "time": "2026-10-03 09:05"},
                      "arrival_airport": {"id": params.get("arrival_id"), "time": "2026-10-03 10:10"}, "duration": 65, "airline": "IndiGo (sample)"}],
         "total_duration": 65, "price": 4150}
    ], "other_flights": []}


# --------------------------------------------------------------------------------------------- dispatcher
def demo_respond(engine: str, params: dict[str, Any], journey_date: str | None = None) -> dict[str, Any]:
    if engine == "google_maps":
        return _maps_place(params) if params.get("type") == "place" else _maps_search(params)
    if engine == "google_maps_reviews":
        return _reviews(params)
    if engine == "google_maps_directions":
        return _directions(params)
    if engine == "google_events":
        return _events(params, journey_date)
    if engine == "google_news":
        return _news(params)
    if engine == "google":
        return _web(params)
    if engine == "google_hotels":
        return _hotels(params)
    if engine == "google_flights":
        return _flights(params)
    return {}
