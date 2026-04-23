# CartBuddy Python Backend

## Start

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## API

- `GET /health`
- `GET /platforms`
- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/google`
- `GET /auth/me` (Bearer token)
- `POST /orders` (Bearer token)
- `GET /orders/nearby?latitude=44.42&longitude=26.10&radius_meters=1000&platform=Amazon` (Bearer token)
- `GET /orders/mine` (Bearer token)
- `POST /orders/{order_id}/join` (Bearer token, reserve first, confirm on second tap)
- `POST /orders/{order_id}/extend` (Bearer token, only once, only after expiry)
- `GET /orders/{order_id}/links` (Bearer token, only order members)
- `POST /orders/{order_id}/links` (Bearer token, only order members)
- `POST /orders/{order_id}/links/{link_id}/process` (Bearer token, only order creator)
- `GET /notifications?limit=20` (Bearer token)
- `POST /notifications/{notification_id}/read` (Bearer token)

Business rules:
- `min_people` este intre `2` si `10`
- `max_wait_days` este intre `1` si `10`
- o comanda expirata poate fi prelungita o singura data cu inca `10` zile
- `join` ocupa automat un loc; cand `current_people == min_people`, comanda este plina
- `join` este in 2 pasi:
  - primul apel rezerva locul pentru `10` minute
  - al doilea apel confirma alaturarea
- fiecare membru poate salva maximum `10` linkuri de produse pe comanda
- creatorul comenzii poate procesa linkurile altor membri (pentru fluxul de adaugare in cos)
- comenzile din `nearby` sunt ordonate prin scor de matching: distanta + urgenta + disponibilitate

## Example payloads

`POST /auth/register`

```json
{
  "email": "user@example.com",
  "display_name": "Mihai",
  "phone": "+40740111222",
  "address": "Bulevardul Unirii, Bucuresti, Romania",
  "latitude": 44.4268,
  "longitude": 26.1025,
  "password": "secret123"
}
```

`POST /auth/google`

```json
{
  "access_token": "<google_oauth_access_token>",
  "phone": "+40740111222",
  "address": "Bulevardul Unirii, Bucuresti, Romania",
  "latitude": 44.4268,
  "longitude": 26.1025
}
```

`POST /orders`

```json
{
  "platform": "Amazon",
  "min_people": 3,
  "max_wait_days": 10,
  "latitude": 44.4268,
  "longitude": 26.1025
}
```

## Notes for Android Expo

- Android emulator: use `http://10.0.2.2:8000`
- Physical device: set `EXPO_PUBLIC_API_BASE_URL` to your LAN IP, example:

```bash
set EXPO_PUBLIC_API_BASE_URL=http://192.168.1.25:8000
npx expo start --android
```
