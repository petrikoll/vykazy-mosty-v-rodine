# Mosty v rodině – personální a projektový portál

Webová aplikace pro projekt **Mosty v rodině** (`CZ.03.02.02/00/25_104/0006461`). Obsahuje čtyři pracovní části:

- měsíční výkazy práce a jejich předání Odbornému garantovi;
- hodnocení zaměstnanců, navazující vzdělávací plány, absolvované vzdělávání a roční vyhodnocení;
- evidence supervizí;
- zápisy z porad, tvorba PDF a volitelná pomoc Gemini.

Odborný garant spravuje tým, hodnotí ostatní pracovníky, vytváří jejich vzdělávací plány a kontroluje jejich výkazy. Odborného garanta hodnotí Vedoucí služby/programu; uzavřené hodnocení je podkladem pro vzdělávací plán. Projektové názvy rolí se v aplikaci nemění. Svůj vlastní výkaz Odborný garant předává Vedoucí služby/programu. Vedoucí služby/programu má projektovou pozici 0,2 úv., vytváří vlastní výkaz a kontroluje, tiskne a archivuje výkaz Odborného garanta. Každý uživatel může svůj aktuální výkaz kdykoli stáhnout pro tisk. Schválený export nese v zápatí text „Zkontrolováno a schváleno k podpisu“ se jménem a datem schválení.

Podepsané výkazy všech pracovníků nahrává pouze Vedoucí služby/programu. Aplikace přijme společný PDF nebo ZIP, rozdělí jej na stránky/soubory, navrhne přiřazení a před archivací vždy zobrazí ruční kontrolu.

## Místní spuštění

Požadován je Node.js 20 nebo novější.

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

Frontend poběží na `http://localhost:5174`, API na `http://localhost:3001`. Pro produkční sestavení:

```powershell
npm test
npm run build
npm start
```

Při prvním otevření se založí účet Odborného garanta. Nastavte `APP_SETUP_TOKEN`, zejména pokud je aplikace dostupná z internetu. V Renderu se tento kód generuje automaticky; jeho hodnotu najdete v nastavení služby a zadáte ji na úvodní obrazovce.

## Google Sheets a Google Drive

Google Sheet používá servisní účet Google Cloud. Osobní Google Drive se připojuje přes OAuth účet jeho vlastníka.

1. V Google Cloud projektu zapněte **Google Drive API** a **Google Sheets API**.
2. Vytvořte servisní účet a stáhněte jeho JSON klíč.
3. Centrální tabulku `Mosty v rodine_vykazy_vzdelavani_porady` nasdílejte e-mailu servisního účtu s rolí Editor.
4. Do `.env` nebo do proměnných služby vložte ID tabulky a Base64 podobu JSON klíče.
5. Pro osobní Gmail vytvořte OAuth klienta typu **Web application** a jako redirect URI uveďte `http://localhost:3001/api/google-drive/callback`.
6. Doplňte Client ID a Client Secret do `.env`. Vedoucí potom v aplikaci otevře `Nastavení` a použije tlačítko `Připojit Google Drive`. Kořenovou složku vytvoří aplikace automaticky.

V PowerShellu lze klíč bezpečně převést přímo do schránky:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\cesta\service-account.json")) | Set-Clipboard
```

Používané proměnné:

```text
GOOGLE_SERVICE_ACCOUNT_BASE64=...
GOOGLE_SHEETS_ID=1D1NP6KaxdEgFFUm_RTt66YjXHv5lGiAW1OuwiZrKV18
GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3001/api/google-drive/callback
GOOGLE_DRIVE_ALLOWED_EMAIL=emceckovm@gmail.com
```

Listy `Pracovníci`, `Výkazy`, `Hodnocení zaměstnanců`, `Vzdělávací plány`, `Vzdělávání`, `Supervize` a `Porady` jsou připravené jako centrální registr. Přihlašovací PINy se ukládají pouze jako nevratné osolené hashe; čitelná hodnota PINu se do tabulky neposílá. Podepsané výkazy aplikace ukládá do struktury:

Nové osobní účty mají dočasný PIN `0000`. Přihlášení probíhá podle jména pracovníka (nikoli podle pozice), jednomu účtu lze přiřadit více projektových pozic a každý přihlášený pracovník si může svůj PIN změnit.

Správa osobních účtů a přiřazování projektových pozic je v sekci `Nastavení`, kterou v rozhraní i na API může používat pouze Vedoucí služby/programu.

```text
rok / Pracovni vykazy / měsíc / pracovník / podepsaný výkaz.pdf
```

Bez Google konfigurace aplikace dál funguje a ukládá záznamy do místní databáze. PDF se v tom případě archivují na serveru. Pro běžný provoz je ale Google integrace doporučená.

### Bezplatný provoz na Renderu

Bezplatná služba Render nemá trvalý disk. Produkční konfigurace proto používá `GOOGLE_SHEETS_PRIMARY=true`: úplný záznam každého řádku se ukládá do skrytého posledního sloupce příslušného Google listu a po každém studeném startu se z něj obnoví do dočasné místní databáze. PDF a osvědčení musí být v tomto režimu uložené na Google Disku; aplikace nedovolí předstírat úspěšné uložení pouze do dočasného souboru.

Pro bezplatný Render vyplňte také tyto tajné proměnné:

```text
GOOGLE_SERVICE_ACCOUNT_BASE64=...
GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...
GOOGLE_DRIVE_REFRESH_TOKEN=...
GOOGLE_DRIVE_ROOT_FOLDER_ID=...
GEMINI_API_KEY=...
```

`GOOGLE_DRIVE_REFRESH_TOKEN` a ID kořenové složky se převezmou z místního souboru `data/google-drive-oauth.json`, ale jejich hodnoty se nikdy neukládají do Gitu. Render automaticky poskytne vlastní veřejnou adresu; aplikace z ní odvodí návratovou OAuth adresu.

## Gemini

Gemini je volitelné. Používá se pro návrh rozdělení hodin, návrh zápisu z porady a rozpoznání naskenovaných výkazů. Bez API klíče zůstávají dostupné všechny ruční postupy včetně ručního přiřazení stran.

```text
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-2.5-flash
GEMINI_DOCUMENT_MODEL=gemini-2.5-flash
```

Výstup AI je vždy návrh ke kontrole. Do poznámek pro Gemini nevkládejte zbytečné identifikační údaje klientů.

## Data a zálohy

Hlavní místní úložiště aplikace určuje `APP_DB_PATH` (výchozí `data/app-db.json`). Při každé změně vzniká vedle databáze záložní kopie. Na bezplatném Renderu je tato databáze pouze pracovní kopie v `/tmp`; trvalým zdrojem záznamů je Google Sheet a trvalým úložištěm dokumentů Google Disk.

PINy se neukládají čitelně, ale jako `scrypt` hash. Přihlášení je po opakovaných chybných pokusech dočasně omezeno. Protože portál zpracovává pracovní a potenciálně citlivé údaje, nasazujte jej pouze přes HTTPS a přístupy k Google účtu pravidelně kontrolujte.

## Ověření

```powershell
npm test
npm run build
```

Testy ověřují seznam projektových pozic, výpočty fondu a nepřítomností a export do oficiální šablony výkazu.
