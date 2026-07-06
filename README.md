# CartBuddy

Aplicatie Expo/React Native cu backend FastAPI pentru comenzi comune locale. Utilizatorii pot crea comenzi pe platforme precum Amazon, eMAG, Temu, AliExpress, SHEIN si Fashion Days, pot cauta comenzi din apropiere, se pot alatura in doi pasi, pot adauga linkuri de produse si pot discuta in chatul comenzii.

## Functionalitati

- Autentificare email/parola si Google.
- Persistenta sesiunii cu `expo-secure-store`.
- Detectare locatie cu `expo-location`.
- Matching local dupa raza, distanta, urgenta si locuri disponibile.
- Join in doi pasi: rezervare temporara, apoi confirmare.
- Linkuri produse per membru, cu limita de 10 linkuri.
- Chat per comanda pentru membrii confirmati.
- Notificari in-app si push notifications prin Expo.
- Statusuri comanda: `open`, `ready_to_order`, `ordered`, `delivered`, `cancelled`.
- Teste backend cu `pytest`.

## Structura

- `App.tsx` - containerul principal al aplicatiei mobile.
- `src/` - tipuri, constante, API client, cache local si componente UI.
- `backend/app/` - API FastAPI, SQLite, autentificare si logica de business.
- `backend/tests/` - teste API/backend.
- `android/` - proiectul Android generat pentru build nativ.

## Environment

Copiaza `.env.example` in `.env` si ajusteaza valorile:

```env
EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:8000
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=
EXPO_PUBLIC_GOOGLE_EXPO_CLIENT_ID=
```

Pentru emulator Android, `http://10.0.2.2:8000` pointeaza catre backendul de pe masina host.

Pentru telefon fizic, foloseste IP-ul LAN al calculatorului, de exemplu:

```env
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.25:8000
```

## Instalare

```bash
npm install
python -m pip install -r backend/requirements-dev.txt
```

## Rulare backend

```bash
npm run backend
```

Backendul porneste pe:

```text
http://0.0.0.0:8000
```

Endpoint util:

```text
GET /health
```

## Rulare aplicatie

```bash
npm start
```

Android:

```bash
npm run android
```

Web:

```bash
npm run web
```

## Teste si verificari

TypeScript:

```bash
npm run typecheck
```

Teste backend:

```bash
npm run test:backend
```

Tot:

```bash
npm run check
```

Verificare dependinte Expo:

```bash
npx expo install --check
```

## Build Android

Debug APK:

```bash
cd android
.\gradlew.bat app:assembleDebug --console=plain
```

APK-ul rezultat:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

## Note Android

`newArchEnabled` este setat pe `false` in `app.json` si `android/gradle.properties`.

Motiv: cu NDK `27.1.12297006`, buildul CMake al React Native New Architecture poate esua pe Windows cu:

```text
clang++: error: invalid linker name in argument '-fuse-ld=gold'
```

Dezactivarea New Architecture evita acel build CMake/IPO si permite generarea APK-ului debug.

## Reguli importante

- `min_people`: 2-10.
- `max_wait_days`: 1-10.
- Comenzile expirate pot fi prelungite o singura data cu 10 zile.
- Join-ul are rezervare de 10 minute si confirmare la al doilea apel.
- Fiecare membru poate adauga maximum 10 linkuri per comanda.
- Linkurile trebuie sa corespunda platformei comenzii.
- Dupa `ordered`, linkurile devin read-only.
- Dupa `delivered` sau `cancelled`, chatul devine read-only.
