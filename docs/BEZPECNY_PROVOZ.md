# Bezpečný provoz a závěrečná zkouška

## Ukládání do Google Sheetu

Ostrá verze musí mít `GOOGLE_SHEETS_PRIMARY=true`. V tomto režimu se před změnou načtou aktuální data, související záznamy se zapíší v jedné atomické dávce a teprve potom se aktualizuje místní kopie. Potvrzení uložení neznamená jen zápis na dočasný disk serveru.

- Zápisy a obnovování místní kopie mají společnou frontu v jednom serverovém procesu.
- Nové řádky přiděluje Google, aplikace je nepočítá z dříve načteného počtu řádků.
- Mazání vyprázdní konkrétní řádek, neposouvá následující záznamy.
- Text se nevkládá jako vzorec. Neplatný JSON, nesouhlasící či duplicitní ID načítání zastaví.
- Po ztrátě odpovědi se ověří skutečně uložený stav; dávka se slepě neopakuje.
- Nové auditní záznamy se ukládají do listu „Historie změn“ (nejvýše 5000 záznamů podle dosavadní politiky aplikace).

**Jeden ostrý zapisující server.** Google Sheets nemá transakční zámek mezi několika instancemi aplikace. Kontrola souběžné změny omezuje konflikty, ale není náhradou databázového compare-and-swap. Pro současný provoz používejte Render; místní vývoj má mít jiný testovací Sheet. Během nasazování neprovádějte změny dat a pro ostrý provoz nepouštějte druhého zapisujícího klienta. Nepřerovnávejte ani ručně neupravujte databázové řádky při běžícím zápisu.

Google Drive a Google Sheets nemají společnou transakci. Při chybě po nahrání souboru může na Disku zůstat soubor bez záznamu. Před opakováním nejasného uložení zkontrolujte přehled a Disk; aplikace nedeklaruje úspěch neověřeného zápisu.

Režim bez `GOOGLE_SHEETS_PRIMARY=true` zůstává lokálním vývojovým režimem se synchronizací. Na bezplatný server bez trvalého disku jej nenasazujte.

## Neuložené formuláře a vzhled

Změny porad, řešení úkolů, vzdělávání, hodnocení, pracovníků, PINu, poznámky k vrácení a importu výkazů jsou hlídány při odchodu. Prohlížeč používá vlastní text varování při obnovení či zavření okna. Skrytí rozpracované sekce formulář nezahodí. Pracovní výkazy nadále používají své automatické místní ukládání.

Ochrana není záloha: pád prohlížeče, vypnutí zařízení nebo vynucené ukončení nemusí vyvolat varování. Neuložené formuláře se neposílají do cloudu.

Styly Tailwind 3 se sestavují přes PostCSS a Vite do místního CSS. Aplikace již nepotřebuje `cdn.tailwindcss.com`. To samo o sobě neumožňuje práci s databází bez připojení.

## Oznámení při zavřeném okně — ruční přejímací test

1. Testujte stejnou adresu, odkud budete aplikaci používat. Lokální adresa a Render mají odlišná oprávnění a přihlášení k oznámením.
2. Přihlaste se svým účtem v podporovaném prohlížeči nebo nainstalované PWA. V nabídce zvonku zvolte „Povolit a vyzkoušet“ a povolte oznámení prohlížeče i systému.
3. Ověřte, že zkouška ihned skutečně přišla. Potom zvolte „Zkouška za 20 sekund“.
4. Zavřete všechna okna této aplikace. Počítač a prohlížeč na pozadí ponechte spuštěné; při místním testu musí běžet i místní server.
5. Počkejte na oznámení a kliknutím ověřte návrat do portálu. Zapište zařízení, prohlížeč, adresu, čas a výsledek.

Zkouška posílá upozornění jen přihlášenému pracovníkovi, může ale oslovit více jeho přihlášených zařízení. Stav „odesláno“ znamená přijetí push službou, nikoli potvrzení zobrazení ve Windows. Naplánovaný dvacetisekundový test nepřežije restart serveru; nejde o připomínkovač termínů. Automatické testy simulují obsluhu service workeru bez otevřeného okna, nikoliv skutečné doručení na zařízení.

## Návrh záloh — dosud není zapnutý

Bezplatná varianta v rámci dostupné kapacity:

- samostatná neveřejná složka „Mosty – zálohy“ na Google Disku, oddělená od běžného archivu;
- datované exporty databáze v JSON pro obnovu včetně vazeb mezi záznamy;
- kopie podepsaných PDF, osvědčení a zápisů (samotné odkazy v JSON nejsou zálohou souborů);
- navíc pravidelná kopie mimo tentýž Google účet, například do chráněné složky na PC a na odpojovaný externí disk.

Návrh uchovávání: 7 denních a 4 týdenní kopie; před nasazením vždy jedna samostatná kopie. Konkrétní četnost a retenční pravidla je třeba zvolit podle provozu a dostupné kapacity. Zálohy omezit na oprávněné správce, protože obsahují personální údaje a technické přihlašovací údaje. Tajné klíče a nastavení `.env` uchovávat odděleně v zabezpečeném úložišti, nikdy na veřejném GitHubu.

Nezávislou obnovu je nutné nejprve vyzkoušet do jiného testovacího Sheetu a složky, bez přepsání ostrých dat. Místní `.backup.json` na Renderu ani historie verzí jednoho Sheetu nejsou samostatná nezávislá záloha.

## Ověření změn

- `npm test`: původní testy + souběžné ukládání, výpadek cloudu, atomická dávka, opakování, konflikty a push worker.
- `npm run build`: místní CSS a produkční sestavení.
- `node tools/verify_release_safety.cjs`: izolovaná prohlížečová zkouška formulářů, záměrné chyby a zrušení odchodu. Vyžaduje Playwright, lokální web a Chrome; veškeré API zápisy jsou simulované.
- `node tools/verify_portal_layout.cjs`: čtyři role, desktop a mobil; API zápisy blokované.

Dokumentace technického podkladu: [atomické dávky Google Sheets](https://developers.google.com/workspace/sheets/api/guides/batch), [místní sestavení Tailwind 3](https://v3.tailwindcss.com/docs/installation/using-postcss), [omezení bezplatného Renderu](https://render.com/docs/free).
