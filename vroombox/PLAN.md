# 🚜 VROOMBOX: planul complet și conversația

> **Proiect nou**, separat de SKILL ISSUE. Stă temporar în `skill-issue/vroombox/`, cu `package.json` și `node_modules` proprii.
> Data: **19 noiembrie 2026**. „VROOMBOX” e nume de lucru.

## Cuprins

1. [Pe scurt](#1-pe-scurt)
2. [Cercetarea (date reale)](#2-cercetarea-date-reale)
3. [Ideile evaluate și competitorii](#3-ideile-evaluate-și-competitorii)
4. [Deciziile luate](#4-deciziile-luate)
5. [Costuri](#5-costuri)
6. [Se poate face în browser?](#6-se-poate-face-în-browser)
7. [Planul MVP: Garajul (VROOMBOX)](#7-planul-mvp-garajul-vroombox)
8. [După MVP (roadmap)](#8-după-mvp-roadmap)
9. [Marketing pe TikTok](#9-marketing-pe-tiktok)
10. [Riscuri](#10-riscuri)
11. [Status](#11-status)
12. [Conversația completă](#12-conversația-completă)
13. [Anexe: date brute și surse](#13-anexe-date-brute-și-surse)

---

## 1. Pe scurt

- **Ce facem:** un joc în browser, instalabil pe Android ca PWA, cu ideea „**pune roți la orice**”. Fotografiezi orice obiect, îl decupezi cu degetul, îi pui roți și îl conduci pe dealuri cu fizică, ca în Hill Climb Racing. **Motorul sună cu vocea ta.**
- **Pentru cine:**
  - băieții, pentru mașini și tractoare;
  - adulții, care își pun în joc mașina reală;
  - familiile: tractorul bunicului, pisica, o pâine.
- **De ce e unic:** nu am găsit nicio aplicație care să transforme poza ta într-un vehicul pe care îl conduci (verificat pe 19.11.2026).
- **Al doilea modul, mai târziu:** 🐮 **Grajdul (ZOOKEBOX)**. Imiți animale, un AI de pe telefon îți judecă imitația, iar animalele ajung să cânte cu vocea ta. Împreună, cele două module formează „ferma zgomotoasă”.
- **Cost:** **0 €**, pentru că totul rulează pe telefon și găzduirea e gratuită. Opțional: domeniu ~10–15 €/an și Play Store 25 $ o singură dată.
- **Tehnologie:** Vite + TypeScript, Canvas 2D, planck.js (fizică Box2D), Web Audio, PWA.

---

## 2. Cercetarea (date reale)

> Datele de pe Roblox sunt **live**, luate din API-ul oficial pe 19.11.2026, ~10:20. Restul vine din căutări web (rezumate, cu surse în [anexe](#13-anexe-date-brute-și-surse)).

### 2.1 Roblox, cele mai jucate acum

| Joc | Jucători simultan | Observații |
|---|---:|---|
| Steal An Egg | ~590.000 | lansat în iulie 2026, 11,5 miliarde de vizite. Furi ouă, scoți pui rari, câștigi bani |
| Adopt Me! | ~280.000 | animale de companie, colecție, schimburi |
| Blox Fruits | ~214.000 | aventură anime |
| Throw Food For Animals | ~200.000 | lansat în sept. 2026. Arunci mâncare, aduni animale |
| Brookhaven RP | ~171.000 | roleplay |
| 99 Nights in the Forest | ~98.000 | supraviețuire cu prietenii, horror ușor |
| RIVALS | ~86.000 | shooter |
| Break and Steal an Egg | ~77.000 | clonă de „steal” |
| Fish It! | ~64.000 | pescuit, colecție |
| Murder Mystery 2 | ~52.000 | deducție socială |

**Trending și jocuri în creștere (oct.–nov. 2026):**
- **Fizică de crash și ragdoll:** BloxNG [CRASH PHYSICS], Hyper Realistic Ragdoll (43k), Realistic Ragdoll MMA, Ragdoll Soccer, Pleb's Plane Crash Sandbox.
- **Premise absurde cu un singur verb:** Stop The Tsunami!, Clean The Ballpit!, Flat the Mountain, Charge Your Phone With POTATOES.
- **„Survive Your Ideas”** (25k): scrii orice cuvânt și chestia aia apare în joc.
- **Fantezia de streamer:** Be The Biggest Streamer, Scare Your Favorite Streamer.
- **Vehicule:** Build a Car to Go Far, Engine Simulator, Can You Land A Plane?

**Tipare:** ouă și animale de colecționat, „furi de la alții”, premise absurde simple, haos fizic. Pe Roblox și Poki sunt deja pline de clone, deci **nu ne batem acolo**.

### 2.2 Copii și TikTok, 2026

- **Muzică făcută cu personaje:** Sprunki și Incredibox sunt încă foarte populare la copii.
- **Brainrot-ul italian** (Tralalero Tralala & co.) încă trăiește, dar apar semne de oboseală.
- **Francize la modă:** KPop Demon Hunters, Pokémon (30 de ani în 2026), Bluey.
- **Jucării:** cutii-surpriză, colecții pentru copii și adulți („kidult”), jucării squishy și senzoriale.
- **Pe TikTok se viralizează omul care joacă, nu jocul:** reacții, eșecuri, verdicte date de AI, jocuri cu filtre.
- **Jocuri cu vrăji strigate la microfon:** **Mage Arena** (Steam, iulie 2025) a explodat pe TikTok, iar **YAPYAP** (2026) a mers pe același drum.

### 2.3 Mașini și tractoare (pentru băieți)

- **Hill Climb Racing:** a trecut de **2 miliarde de descărcări** (ianuarie 2026) și are ~4 milioane de jucători pe zi. Fizica 2D simplă și amuzantă cu vehicule e un gen dovedit.
- **Roblox:** Driving Empire, Car Dealership Tycoon, Build a Car to Go Far, iar fizica de crash e în trend.
- **Simulatoare:** Farming Simulator e foarte popular la copiii pasionați de tractoare.
- **Browser (Poki):** Drive Mad, Eggy Car și Moto X3M, jocuri cu mașini și fizică jucate masiv pe telefon.

### 2.4 Canale de distribuție

- **PWA (site instalabil):** gratuit și instant. În Chrome apare „Instalează aplicația”.
- **Play Store prin TWA:** 25 $ o singură dată, plus 12 testeri care folosesc aplicația 14 zile la rând.
- **TikTok Mini Games:** **nu e o opțiune acum**. Cere Unity, Cocos sau LayaAir plus SDK-ul TikTok, iar România nu e pe lista de piețe.
- **Poki și CrazyGames:** portaluri pentru mai târziu.

---

## 3. Ideile evaluate și competitorii

| Idee | Ce e | Verdict | Competitori găsiți |
|---|---|---|---|
| 🚜 **VROOMBOX, „pune roți la orice”** | poza ta devine vehicul cu fizică, iar motorul are sunetul vocii tale | ✅ **unic, ALES** | Hill Climb Racing (vehicule gata făcute), Carbrix (Steam, construiești din piese), aplicații AR (modele 3D gata făcute), AI foto→vehicul (doar imagini statice) |
| 🐮 **ZOOKEBOX** | imitații de animale judecate de AI, iar animalele cântă cu vocea ta, ca în Sprunki | ✅ unic, **modulul 2** | Incredibox, Sprunki, My Singing Monsters (sunete gata făcute); Mimic Party, Choicer Voicer (doar notă, mici) |
| 🥚 **Oul Internetului** | un singur pet crescut de tot internetul | ✅ unic | Pokipet, Lovegotchi, Happy Dog (2 sau câțiva oameni); r/place, One Million Checkboxes (fără pet) |
| 🪄 **QUACKADABRA** | vrăji făcute din sunete de animale | ✅ unic | Mage Arena, YAPYAP (PC, cuvinte, pentru adulți) |
| Poză → monstru | | ❌ există | SnapMonster (în browser), CatchCat |
| Fals streamer cu chat AI | | ❌ există | HoloFame, Fake Fame |
| Poze care vorbesc | | ❌ există | ChatterPix |
| Vânătoare de obiecte cu camera | | ❌ există | SnapScout, Camera Hunt |
| Jocuri pentru pisici cu clasament mondial | | ❌ există | Cat Games (BlackNova), Friskies JitterBug |
| Condus mașina cu vocea („brrrm”) | | ❌ există | BRAAP, Cars of Voice, Voiracing, Vroom! (Devpost), Rant Race, CAAAHR (Steam) |
| Jocuri controlate cu fața | | ❌ există | filtrele-joc de pe TikTok |
| Clone de furat pet-uri și ragdoll | | ❌ piață plină | Roblox și clonele de pe Poki |

---

## 4. Deciziile luate

1. **Categorie nouă**, nu încă un test de îndemânare ca SKILL ISSUE.
2. **Strategia:** nu concurăm cu Roblox pe 3D și fizică. Folosim ce are doar telefonul: **camera, microfonul și lucrurile reale din casă**. Fiecare sesiune produce singură un clip de TikTok.
3. **O aplicație cu două zone**, „ferma zgomotoasă”: 🚜 **Garajul** (VROOMBOX), construit primul, și 🐮 **Grajdul** (ZOOKEBOX) ca prima actualizare. De ce Garajul întâi:
   - e joc cu progres, deci oamenii revin;
   - clipul se înțelege dintr-o privire;
   - genul e dovedit de Hill Climb Racing.
4. **Doar în browser (PWA)**, întâi pentru Android. Pe iPhone merge din Safari, cu mici limite.
5. **Totul rămâne pe telefon:** pozele și vocile nu se urcă nicăieri. De aici vin patru avantaje:
   - e sigur pentru copii;
   - nu e nevoie de moderare;
   - GDPR e mai simplu;
   - nu există cost de server.
6. **Gratuit pentru jucători.** Bani, eventual, mai târziu:
   - fără cutii-surpriză plătite;
   - reclame doar nepersonalizate;
   - un pachet cosmetic cumpărat o dată;
   - produse cu personajele (merch).
7. **Limba:** română și engleză, aleasă automat după limba telefonului.
8. **Nume de lucru:** VROOMBOX, ZOOKEBOX și QUACKADABRA nu apăreau pe web pe 19.11.2026. Domeniul și marca trebuie verificate înainte de lansare.

---

## 5. Costuri

| Ce | Cost |
|---|---|
| Găzduire pe Cloudflare Pages | **0 €**. Trafic static nelimitat, uz comercial permis, max. 25 MiB pe fișier, 500 de build-uri pe lună |
| Fizică, sunet, decupaj, AI (toate pe telefon) | **0 €**. Biblioteci open-source (planck.js MIT, MediaPipe/YAMNet Apache 2.0) |
| Server și bază de date | **0 €**. Nu e nevoie |
| Instalare pe Android (din Chrome) și pe iPhone (din Safari) | **0 €** |
| Domeniu | **0 €** cu `*.pages.dev`, sau ~10–15 €/an pentru `.com`/`.ro` |
| Grafică și sunete | **0 €**. Vehiculele sunt pozele jucătorilor, sunetele sunt vocile lor, efectele sunt generate din cod |
| Marketing pe TikTok | **0 €**, postări normale |
| Play Store (opțional) | **25 $ o singură dată**, plus 12 testeri × 14 zile (conturi personale create după 13.11.2023) |

**Concret:** 0 € la început, ~10–15 €/an dacă vrei domeniu. **Costul nu crește dacă jocul devine viral.**

**Note:**
- **Vercel Hobby** e doar pentru uz necomercial. **GitHub Pages** nu e gândit pentru afaceri. De aceea Cloudflare Pages.
- **Verificarea dezvoltatorilor Android** a pornit pe 30.09.2026 în Brazilia, Indonezia, Singapore și Thailanda și devine globală în 2027. Un PWA instalat din Chrome nu e un APK instalat manual, deci nu e vizat. Varianta TWA prin Play Store trece prin verificarea Play.
- **Mărimi măsurate** (pentru modulele cu AI de mai târziu):
  - motorul MediaPipe audio: 21,98 MB necomprimat, **6,4 MB** comprimat (brotli);
  - modelul YAMNet: 4,1 MB (3,2 MB comprimat);
  - decupajul automat (Interactive Segmenter): 6,2 MB.
- **Garajul fără AI** descarcă sub 2 MB.
- **Dacă vrei bani din reclame**, doar reclame nepersonalizate și o pagină de confidențialitate (gratuită). Pe Play, cu copii în public, se aplică politica pentru familii: doar furnizori de reclame certificați.

---

## 6. Se poate face în browser?

**Da, 100%.** Toate funcțiile de mai jos merg în Chrome pe Android:

| Funcție | Cu ce se face în browser |
|---|---|
| Poza obiectului | `<input type="file" capture>` sau camera |
| Decupaj cu degetul, roți puse unde vrei | Canvas 2D |
| Fizica vehiculului: suspensie, sărituri, crash | planck.js (Box2D) |
| Înregistrarea vocii | microfonul, prin `getUserMedia` |
| Motorul turat cu vocea ta | Web Audio |
| AI-ul care zice „87% VACĂ” (Grajdul) | MediaPipe + YAMNet, pe telefon |
| Clip vertical pentru TikTok și Share | MediaRecorder + Web Share, **deja făcute în SKILL ISSUE**: [clip.ts](../src/lib/clip.ts) |
| Instalare, icon, offline | PWA |
| Vibrație la crash | Vibration API |

**Jocuri care fac deja asta în browser:**
- Drive Mad, Eggy Car, Moto X3M: mașini cu fizică, pe Poki;
- Voiracing: condus cu vocea;
- Sprunki pe CrazyGames: mixat muzică;
- SnapMonster: din camera telefonului direct în joc.

**Limite:**
- **Permisiuni:** jucătorul aprobă microfonul și camera o singură dată, iar site-ul trebuie să fie pe HTTPS (gratuit pe Cloudflare).
- **Doar 2D**, care oricum ne ajunge.
- **iPhone:** fără vibrații, fără blocare pe orizontal, iar instalarea se face manual din „Adaugă pe ecranul principal”.

---

## 7. Planul MVP: Garajul (VROOMBOX)

### 7.1 Bucla de joc

```
📸 Poză (sau un vehicul exemplu)
  → ✂️ Decupezi obiectul cu degetul (margine albă de sticker)
  → 🛞 Pui roțile (2–4), muți, mărești
  → 🎙️ Motorul: ții apăsat și zici „BRRRM” (sau motor clasic)
  → 🏁 Conduci pe dealuri: accelerație / frână, flip-uri în aer
  → 💥 Te răstorni → „Ai făcut-o praf la 123 m!”
  → 📺 Reluarea ultimelor secunde cu slow-motion → clip vertical
  → 📤 Trimiți clipul pe TikTok
  → 🏠 Garajul: vehiculele salvate + recordurile
```

### 7.2 Ecrane

| Ecran | Ce face |
|---|---|
| **Garaj** (start) | Vehiculele salvate (poză, nume, record), „Vehicul nou” și exemple gata făcute: Tractoraș, Pâine, Cutie |
| **Poză** | „Fă poză” (camera din spate) sau „Din galerie” |
| **Decupaj** | Tragi conturul cu degetul și vezi decupajul cu margine de sticker. Butoane: Refă / Continuă |
| **Roți** | Tap = roată nouă (max. 4), tragi = muți, slider = mărime, 🗑️ = ștergi. Stil: clasice sau din poză |
| **Motor** | Ții apăsat 1–2 s și zici „BRRRM”, apoi asculți rezultatul. Butoane: Din nou / Motor clasic / Gata. Aici alegi și numele vehiculului |
| **Drum** | Ecran complet, pedale frână (stânga) și accelerație (dreapta), distanță, record, flip-uri. Pe calculator: săgeți sau A/D |
| **Rezultat** | „Ai făcut-o praf la X m!”, reluarea cu slow-motion. Butoane: Trimite clipul / Încă o dată / Garaj |

### 7.3 Modelul de date

```ts
type Wheel = { x: number; y: number; r: number }          // px, în imaginea decupată
type VehicleSpec = {
  id: string; name: string; createdAt: number
  sprite: Blob                       // PNG decupat, cu margine de sticker
  width: number; height: number      // px
  outline: [number, number][]        // conturul (px) → înveliș convex pentru fizică
  wheels: Wheel[]                    // 2–4 roți
  wheelStyle: 'classic' | 'photo'
  wheelSprites?: Blob[]              // cercuri decupate din poza originală
  engine: { kind: 'synth' } | { kind: 'voice'; sampleRate: number; pcm: Float32Array }
  best: number                       // recordul, în metri
}
```

### 7.4 Fizica (planck.js = Box2D în JavaScript)

- **Scară:** obiectul are mereu ~3 m lungime, fie el jucărie sau mașină reală.
- **Caroseria:** e învelișul convex al conturului, simplificat la max. 8 colțuri. Masa e fixă, indiferent de formă, ca orice obiect să meargă.
- **Roțile:** cercuri cu raza între 0,25 și 0,9 m, legate cu `WheelJoint`:
  - suspensie la ~4 Hz, cu amortizare ~0,7;
  - **tracțiune integrală** cu motor;
  - nu se ciocnesc cu propria caroserie (grup de coliziune negativ).
- **Control în aer:** accelerația ridică botul, frâna îl coboară, ca în Hill Climb, de unde vin flip-urile.
- **Simulare deterministă:** gravitație −10 m/s² și **pas fix de 1/60 s**. Aceleași apăsări dau exact aceeași cursă, iar pe asta se bazează reluarea.
- **Sfârșitul cursei:** vehicul răsturnat mai mult de ~1,2 s, sau blocat mai mult de ~4 s.
- **Flip:** o rotație completă în aer dă „🔄 FLIP!”.
- Toate constantele stau într-un singur fișier de configurare, ca să poată fi reglate ușor.

### 7.5 Terenul

- **Același traseu pentru toți:** dealuri infinite, generate dintr-un **seed fix**. Așa, recordurile se pot compara pe TikTok („bate-mi cei 512 m”).
- **Dificultate:** primii ~30 m sunt plați, apoi dealurile cresc cu distanța.
- **Generare pe bucăți:** bucăți de ~40 m create în fața mașinii și șterse în spate. La îmbinări folosim vârfuri „fantomă”, ca roțile să nu se agațe.
- **Decor:** un zid în spate la start, indicatoare la fiecare 50 m și un steag la recordul tău.

### 7.6 Desenul (randare)

- **Canvas 2D:** cer, dealuri în paralaxă, iarbă și pământ.
- **Camera:** urmărește vehiculul, privește puțin înainte în direcția de mers și face zoom out la viteză mare.
- **Vehiculul:** e chiar poza ta, ca sticker cu margine albă. Roțile sunt clasice (cauciuc, jantă, spițe) sau decupate din poză, și se rotesc.
- **Performanță:** rezoluția e limitată la 2× DPR, ca să meargă și pe telefoane slabe.

### 7.7 Sunetul

- **Motor clasic:** sintetizat din oscilatoare și filtru, ca să meargă și fără microfon.
- **Motorul cu vocea ta:**
  - înregistrare fără reducere de zgomot;
  - păstrăm cele mai puternice ~0,5 s, normalizate;
  - le facem buclă cu crossfade;
  - **tonul urmează turația roților**, iar volumul urmează accelerația.
- **Efecte:** sunete la aterizare și la crash, plus vibrație pe Android.

### 7.8 Reluarea și clipul pentru TikTok

- **În timpul jocului** se salvează doar apăsările, câte 1 octet pe pas. Nu se înregistrează video, deci nu apare lag.
- **La crash,** simularea se re-rulează identic pentru ultimele ~12 s, cu **slow-motion** la final. Reluarea se vede pe ecran și se înregistrează în paralel ca **clip vertical 720×1280**: titlu, joc, distanță, numele vehiculului.
- **Formatul:** MediaRecorder încearcă MP4 și, dacă nu merge, WebM, la fel ca în SKILL ISSUE.
- **Trimiterea:** Web Share cu fișierul (direct în TikTok); dacă nu e disponibil, descărcare.

### 7.9 Garajul (salvare)

- Totul se salvează în **IndexedDB**, deci rămâne pe telefon: vehiculele (decupaj, roți, sunetul motorului) și recordurile.

### 7.10 PWA

- **Manifest:** ecran complet (`fullscreen`), orientare liberă, iconuri 192, 512 și maskable.
- **Service worker:** salvează tot jocul, ca să meargă offline după prima deschidere.

### 7.11 Structura proiectului (estimată, se actualizează la final)

```
vroombox/
  PLAN.md            ← documentul ăsta
  README.md          ← cum pornești proiectul
  index.html
  package.json · tsconfig.json · vite.config.ts · .oxlintrc.json
  public/            ← iconuri
  src/
    main.ts          ← pornire + navigare între ecrane
    i18n.ts          ← texte RO / EN
    styles.css
    screens/         ← garaj, poză, decupaj, roți, motor, drum, rezultat
    game/            ← simulare (planck), teren, vehicul, cameră, randare
    geometry/        ← înveliș convex, simplificare, contur
    audio/           ← motor sintetizat, motor din voce, înregistrare, efecte
    clip/            ← reluare → clip vertical → share
    storage/         ← IndexedDB (garajul)
    samples.ts       ← vehicule exemplu desenate din cod
```

### 7.12 Teste și verificare

- **Vitest** pentru:
  - geometrie (înveliș, simplificare, arie, centru);
  - bucla audio;
  - teren (continuitate, determinism);
  - **simulare** (aceleași apăsări dau același rezultat).
- **oxlint** și **build** (`tsc` + `vite build`).
- **Test în browser:** vehicul exemplu → drum → crash → reluare. Separat: o poză încărcată → decupaj → roți.

### 7.13 Testarea pe telefon

Microfonul cere **HTTPS**. Ai trei variante:
- `npm run dev:phone`: HTTPS local cu certificat self-signed; pe telefon deschizi `https://IP-ul-PC-ului:5180` și accepți avertismentul;
- port-forwarding din Chrome (`chrome://inspect`);
- deploy pe Cloudflare Pages.

### 7.14 Izolarea de SKILL ISSUE

- **Proiect separat:** `package.json` și `node_modules` proprii. **Nu modifică nimic din SKILL ISSUE.**
- **Notă:** `npm test` din rădăcina SKILL ISSUE găsește și testele din `vroombox/`. Sunt logică pură și trec și acolo. Când mutăm proiectul, nu e nimic de schimbat.

---

## 8. După MVP (roadmap)

| Versiune | Ce aduce |
|---|---|
| **v0.1, MVP** | Bucla completă de mai sus |
| **v0.2, Progres** | Monede pe traseu; upgrade-uri (motor, roți, suspensie, aderență); modul **Tractor Pull** (tragi lucruri absurde: pianul bunicii, o balenă, blocul); trasee noi (zăpadă, lună, câmp arat) |
| **v0.3, 🐮 Grajdul (ZOOKEBOX)** | YAMNet de pe telefon judecă imitațiile de animale; animalele cântă cu vocea ta pe o scenă ca în Sprunki; export de clip. Animalele se plimbă și în remorca tractorului |
| **v0.4, Lansare** | Domeniu, Cloudflare Pages, statistici gratuite (Cloudflare Web Analytics), Play Store prin TWA |
| **Mai târziu** | Decupaj automat (tap pe obiect, MediaPipe Interactive Segmenter); traseul zilei; provocări între prieteni prin link (urcă doar recordul și o miniatură stilizată); QUACKADABRA ca mod de luptă |

---

## 9. Marketing pe TikTok

- **Hook-ul din prima secundă:** obiectul real → apare cu roți → pleacă. Transformarea e reclama.
- **Formate:**
  - „Am băgat Dacia lui tata în joc și a făcut backflip”
  - „Pisica mea ca monster truck”
  - „U650-ul bunicului vs. dealul morții”
  - „Am pus roți la o pâine”
  - „**Comentează ce să pun pe roți**”: răspunzi cu clipuri la comentarii, iar comunitatea îți dă idei de conținut la nesfârșit.
- **Traseu comun:** toți au același traseu, deci merge provocarea „bate-mi recordul de 512 m”.
- **Cadență:** 1–3 clipuri pe zi la început, făcute chiar cu clipurile exportate din joc.
- **Cont:** un cont separat pentru joc, cu link în bio către site (PWA).

---

## 10. Riscuri

| Risc | Ce facem |
|---|---|
| Decupajul cu degetul e greu pe un ecran mic | Contur netezit și buton „Refă”; mai târziu, decupaj automat cu AI |
| Forme ciudate dau fizică ciudată | Înveliș convex, roți cu mărimi limitate, constante reglabile |
| Microfonul cere HTTPS și permisiune | Motorul clasic merge fără microfon |
| Telefoane slabe | Doar 2D, rezoluție limitată, fără video înregistrat în timpul jocului (clipul vine din reluare) |
| Copii și confidențialitate | Nimic nu pleacă de pe telefon; fără conturi, fără chat |
| Mărci în poze (Hot Wheels, logo-uri) | Conținutul jucătorului rămâne local; în clipurile noastre evităm logo-urile |
| Numele „VROOMBOX” | De verificat domeniul și marca înainte de lansare |

---

## 11. Status

- [x] Cercetare și alegerea ideii
- [x] Costuri și fezabilitate
- [x] Planul (documentul ăsta)
- [ ] Proiectul creat (Vite + TypeScript)
- [ ] Geometrie, fizică, teren
- [ ] Ecranul de drum (desen, pedale, HUD)
- [ ] Poză → decupaj → roți
- [ ] Motorul cu vocea
- [ ] Garajul (salvare)
- [ ] Reluare + clip + share
- [ ] PWA (instalare, offline)
- [ ] Verificare: teste, lint, build, test în browser

---

## 12. Conversația completă

> Mesajele utilizatorului sunt redate exact cum au fost scrise. Răspunsurile asistentului sunt redate integral (doar titlurile au fost coborâte un nivel, ca să nu strice cuprinsul).

### 👤 Mesajul 1

> daca ar fi sa ganesti un joc in browser care sa se poata cumva instala pe android direct si sa fie caprivant, inovator, prostesc, atat pentru copii cat si adulci ce ar fi?
>
> verifica top roblox, ce cuata copii pe net, tiktok,, usor de facut marketing. si da mi cateva idei... verifica si competitorii...ar trebui sa fie cat mai unic si asa

*(Asistentul a început cercetarea: s-a uitat la proiectul existent pentru context și a pornit căutările despre Roblox, TikTok și jocurile din browser.)*

### 👤 Mesajul 2

> nu vreau ca proiectul de aici...poat efi ceva nou..alt domeniu, categorie

*(Asistentul a luat datele live de pe Roblox, a verificat trendurile pentru copii, jocurile virale din 2026 și TikTok Mini Games, apoi a căutat competitori pentru fiecare idee: poză → monstru, imitații judecate de AI, Sprunki/Incredibox, vocea transformată în personaje, pet comun, fals streamer, jocuri pentru pisici, vânătoare de obiecte, vrăji vocale. A verificat și lista de sunete pe care le recunoaște YAMNet.)*

### 🤖 Răspunsul 2

Am găsit trei idei care, din ce am verificat, nu există încă pe piață. Toate sunt în altă categorie decât SKILL ISSUE, iar pe proiectul de aici nu l-am atins.

#### Ce am găsit

- **Roblox, azi:** cele mai jucate sunt Steal An Egg (~590k jucători simultan), Adopt Me (280k), Blox Fruits (214k), Throw Food For Animals (200k) și 99 Nights in the Forest. În topul „Trending”, 4 din primele 12 jocuri sunt cu fizică ragdoll sau crash.
  - **Ce înseamnă:** se joacă ouă și animale de colecționat, premise absurde și haos fizic. Toate astea sunt deja pline, iar Poki are clone după ele.
- **Copii, 2026:** Sprunki și Incredibox (muzică făcută cu personaje) sunt încă foarte populare. Brainrot-ul italian trăiește, dar apar semne că lumea s-a plictisit de el. Mai sunt KPop Demon Hunters, 30 de ani de Pokémon și jucăriile de colecție în cutii-surpriză.
- **TikTok:** se viralizează omul care joacă, nu jocul: reacții, eșecuri, verdicte date de AI. Mage Arena, unde strigi vrăjile la microfon, a explodat pe TikTok.

**Concluzie:** nu te bate cu Roblox pe 3D și fizică. Folosește ce are doar telefonul: microfonul, camera, casa reală și ideea de „toată lumea deodată”. Așa, fiecare sesiune de joc produce singură un clip de TikTok.

#### Ideile

**1. 🥇 ZOOKEBOX – vocea ta devine o trupă**
- **Cum merge:** imiți o vacă, iar AI-ul de pe telefon (offline) zice „87% VACĂ, 13% unchi supărat”. Atunci apare o vacă ce cântă cu vocea ta. Pui animalele pe scenă ca în Sprunki și iese o melodie din vocile familiei.
- **Personaje secrete:** râgâiala și pârțul. Am verificat că modelul de recunoaștere a sunetelor (YAMNet) le recunoaște, alături de muu, oac, ham, mac și altele.
- **Clipul de TikTok:** „AI-ul zice că bunica e 94% găină”, cu melodia la final. Melodiile pot deveni și sunete populare pe TikTok.
- **Competitori:** Incredibox, Sprunki și My Singing Monsters folosesc doar sunete gata făcute. Mimic Party și Choicer Voicer doar dau note imitațiilor și sunt mici. Nimeni nu transformă vocea ta în creaturi care cântă.
- **Riscul principal:** melodia trebuie să sune bine, nu doar amuzant. Se rezolvă cu un ritm de fundal și auto-tune.

**2. 🥈 OUL INTERNETULUI – un singur pet pentru toată planeta**
- **Cum merge:** la lansare, toți țin cald un ou uriaș cu tap-uri, până clocește live. Apoi toată lumea îl hrănește, îi strânge caca și votează cum evoluează. Dacă e neglijat, „fuge pe Lună” și apare un ou nou. Țările se întrec între ele.
- **Clipul de TikTok:** episoade zilnice, ca la știri: „Ziua 9: România i-a dat 2 milioane de murături, s-a făcut verde”.
- **Competitori:** Pokipet, Lovegotchi și Happy Dog au un pet comun doar pentru 2 sau câțiva oameni. One Million Checkboxes și r/place sunt jocuri de web colaborative, dar fără pet.
- **Efort:** e cel mai ieftin de construit, cu Supabase Realtime, pe care îl știi deja.
- **Riscuri:** la început, cu puțini jucători, e trist, așa că are nevoie de evenimente constante.
- **Bani:** plușuri pentru fiecare generație de pet, pe trendul de colecționare pentru copii și adulți.

**3. 🥉 QUACKADABRA – vrăji făcute din sunete**
- **Cum merge:** un tower defense în care muu aduce o herghelie de vaci, mac-mac face un scut de rațe, răgetul aruncă foc, iar râgâiala e o undă de șoc.
- **De ce merge:** Mage Arena și YAPYAP au demonstrat că vrăjile vocale prind. Dar sunt pe PC, pentru adulți, cu cuvinte. Pe mobil, pentru familie, cu sunete de animale, n-am găsit nimic.
- **Limită tehnică:** recunoașterea sunetului durează ~0,5–1 secunde, deci jocul trebuie să fie pe ture, nu de reflexe. Poate fi și un mod de luptă în Zookebox, pentru că folosește aceeași tehnologie.

#### Idei pe care le-am verificat și le-am eliminat (există deja)

- Poză → monstru: SnapMonster
- Fals streamer cu chat AI: HoloFame, Fake Fame
- Poze care vorbesc: ChatterPix
- Vânătoare de obiecte cu camera: SnapScout, Camera Hunt
- Jocuri pentru pisici cu clasament mondial: Cat Games, Friskies
- Clone de furat pet-uri sau ragdoll: piața e plină

#### Instalarea pe Android

- **Ca PWA (aplicație web):** în Chrome apare „Instalează aplicația”, iar jocul primește icon pe ecran și merge offline. Nu e un APK instalat manual, deci noile reguli Google de verificare a dezvoltatorilor nu ar trebui să se aplice.
- **Pe Play Store, mai târziu:** prin TWA (Bubblewrap sau PWABuilder). Dacă publicul include copii, trebuie respectată politica Google pentru familii, adică reclame doar de la furnizori certificați.
- **Pentru părinți:** vocea se procesează doar pe telefon și nu se urcă nicăieri. Postarea pe TikTok o face utilizatorul.

**Recomandarea mea:** Zookebox. E cea mai unică, prinde trendul Sprunki și fiecare sesiune iese cu un clip gata de postat. Un prim prototip ar avea 8 animale plus 2 secrete, o scenă cu 5 locuri și export de video vertical de 15 secunde. Oul Internetului merge ca al doilea proiect, ieftin, și ca idee de lansare care atrage atenția.

Numele sunt doar de lucru. „Zookebox” și „Quackadabra” nu apar pe web, dar domeniul și marca trebuie verificate. Spune-mi pe care o alegi și fac un prototip jucabil într-un folder nou, separat de SKILL ISSUE.

### 👤 Mesajul 3

> **ZOOKEBOX **
>
> aici ce costuri as avea? pot face totu free?
>
> as vrea totusi si ceva pe masini/ tractoare sa prinda la baieti, cred ca s ejoaca mai mult

*(Asistentul a verificat: limitele Cloudflare Pages, taxa și regulile Play Console, jocurile care se conduc cu vocea, jocurile cu mașini și tractoare populare la copii, sunetele de vehicule pe care le recunoaște YAMNet, mărimea reală a modelelor AI, Hill Climb Racing, dacă există „poză → vehicul” și disponibilitatea numelui Vroombox.)*

### 🤖 Răspunsul 3

#### 1. Costuri ZOOKEBOX: da, poate fi totul gratuit

Recunoașterea sunetelor și procesarea vocii se fac pe telefonul jucătorului, deci n-ai server de plătit. Chiar dacă jocul devine viral, costul tău rămâne același.

| Ce | Cost |
|---|---|
| Găzduire pe Cloudflare Pages | **0 €**, trafic nelimitat, permis și dacă faci bani din joc |
| AI-ul care recunoaște muu/oac/râgâit (YAMNet, licență liberă) | **0 €**, rulează pe telefon |
| Server sau bază de date | **0 €**, nu e nevoie, vocile rămân pe telefon |
| Instalare pe Android (din Chrome) și pe iPhone (din Safari) | **0 €** |
| Domeniu | **0 €** cu adresa gratuită `.pages.dev`, sau ~10–15 €/an pentru `.com`/`.ro` |
| Grafică și ritmuri | **0 €**: personaje simple desenate de tine, ritmuri generate din cod, iar vocile sunt ale jucătorilor |
| Marketing pe TikTok | **0 €**, postări normale, fără reclame plătite |
| Play Store (opțional, mai târziu) | **25 $ o singură dată**, plus o regulă pentru conturile noi: 12 testeri care folosesc aplicația 14 zile la rând |

**Concret:** poți începe cu 0 €. Recomandat ar fi doar domeniul, ~10–15 €/an.

**De reținut:**
- **Prima deschidere** descarcă ~10 MB (modelul AI plus motorul care îl rulează). După aceea jocul merge și offline.
- **Pentru jucători** poate fi 100% gratuit. Dacă vrei bani mai târziu: fără cutii-surpriză plătite, iar reclamele doar nepersonalizate, pentru că joacă și copii. Mai bune sunt un pachet de personaje cumpărat o singură dată sau produse cu personajele (merch).
- **Ar costa ceva** doar dacă urci vocile copiilor pe un server, de exemplu ca să trimiți melodii prin link. Asta aduce stocare de plătit, moderare și obligații GDPR. Soluția: melodia se exportă ca video direct în TikTok, fără server.

#### 2. Mașini și tractoare: 🚜 VROOMBOX, „pune roți la orice”

Am verificat întâi ideea de condus cu vocea („brrrm”), dar **există deja**: BRAAP, Cars of Voice, Voiracing și CAAAHR pe Steam. Așa că propun altceva:

- **Cum merge:** fotografiezi **orice**: tractorașul Bruder, Dacia lui tata, U650-ul bunicului, pisica, o pâine. Decupezi conturul cu degetul, pui roțile unde vrei și obiectul devine vehicul cu fizică, ca în Hill Climb Racing.
- **Sunetul motorului e vocea ta:** înregistrezi un „brrrm” o dată, iar jocul îl turează. Aici se leagă direct de Zookebox.
- **Moduri de joc:**
  - **Concurs de tractat:** tragi lucruri absurde, ca pianul bunicii, o balenă sau un bloc.
  - **Sărituri și accidente:** fizica de crash e acum în trend pe Roblox.
  - **Livrări la fermă:** duci animalele din Zookebox în remorcă.
- **Clipuri de TikTok:** „Am băgat Dacia lui tata în joc și a făcut backflip”, „Pisica mea e monster truck”.
- **Pentru cine:** copiii au cutii întregi de mașinuțe, iar adulții își pun în joc mașina reală.
- **Competitori:**
  - **Hill Climb Racing:** a trecut de 2 miliarde de descărcări, deci genul e dovedit, dar vehiculele sunt gata făcute.
  - **Carbrix (Steam):** construiești vehiculul din piese.
  - **Aplicațiile AR de condus:** folosesc modele 3D gata făcute.
  - **Aplicațiile AI foto→vehicul:** fac doar imagini statice.
  - **Nimeni nu transformă poza ta într-un vehicul pe care îl conduci.**
- **Cost tot 0 €:** decupajul cu degetul și fizica 2D se fac cu biblioteci gratuite, fără AI. Poza nu iese de pe telefon, deci nu e nevoie de moderare.

#### Cum le-aș combina

Aș face **o singură aplicație cu două zone**: 🐮 **Grajdul** (Zookebox) și 🚜 **Garajul** (Vroombox). Rezultatul e o fermă zgomotoasă în care totul e făcut din vocea și lucrurile tale. Ai o singură instalare și un singur cont de TikTok. Băieții vin pentru tractoare, restul lumii pentru animale, iar o bună parte din cod e comun (instalarea, înregistrarea vocii, exportul video).

Prima versiune ar avea totuși o singură zonă. Eu aș începe cu **Garajul**, din trei motive:
- e joc cu progres, deci oamenii revin zilnic;
- clipul se înțelege dintr-o privire;
- piața e dovedită de Hill Climb Racing.

Grajdul ar veni ca prima actualizare. Merge și invers, dacă rămâi la Zookebox. Spune-mi cu care începem și fac prototipul jucabil într-un folder nou.

### 👤 Mesajul 4

> si se poate face in browser ?

*(Asistentul a verificat cum exportă SKILL ISSUE clipurile video: `src/lib/clip.ts` folosește deja MediaRecorder, MP4 cu WebM ca rezervă, și Web Share cu fișiere.)*

### 🤖 Răspunsul 4

Da, se poate face **100% în browser**, atât Zookebox, cât și Garajul. Nu e nevoie de aplicație nativă. Pe Android, „instalarea” e chiar site-ul tău, salvat ca aplicație (PWA). Toate componentele de mai jos merg în Chrome pe Android.

| Funcție | Cu ce se face în browser |
|---|---|
| Poza obiectului | camera telefonului sau o poză din galerie |
| Decupaj cu degetul, roți puse unde vrei | Canvas (desen în pagină) |
| Fizica vehiculului: suspensie, sărituri, accidente | planck.js, bibliotecă gratuită de fizică 2D (Box2D) |
| Înregistrarea vocii („brrrm”, „muuu”) | microfonul, prin API-ul browserului |
| Motorul care se turează cu vocea ta, animalele care cântă | Web Audio (sunet în browser) |
| AI-ul care zice „87% VACĂ” | MediaPipe cu modelul YAMNet, rulat direct pe telefon |
| Clip vertical pentru TikTok și butonul Share | înregistrare video din pagină plus share nativ, pe care **le ai deja în SKILL ISSUE**, în [clip.ts](../src/lib/clip.ts) |
| Instalare cu icon pe ecran și mers offline | PWA |
| Vibrație la accident | Vibration API |

**Jocuri care fac deja asta în browser:**
- Drive Mad, Eggy Car și Moto X3M: mașini cu fizică, pe Poki, jucate masiv pe telefon.
- Voiracing: condus cu vocea.
- Sprunki pe CrazyGames: mixat muzică cu personaje.
- SnapMonster: din camera telefonului direct în joc.

**Limitele reale:**
- **Permisiuni:** jucătorul aprobă o singură dată microfonul și camera. Site-ul trebuie să fie pe HTTPS, pe care Cloudflare îl dă gratuit.
- **Mărimea la prima deschidere:** Zookebox descarcă ~10 MB din cauza AI-ului. Garajul n-are nevoie de AI, deci are sub 2 MB.
- **Doar 2D:** 3D realist merge greu pe telefoanele slabe, dar oricum nu ne trebuie.
- **iPhone:** jocul merge din Safari, dar fără vibrații și fără blocare pe orizontal. Instalarea se face manual, din „Adaugă pe ecranul principal”.

Ca tehnologie aș folosi tot Vite + TypeScript, ca la SKILL ISSUE, plus planck.js pentru fizică și PixiJS pentru desen. Pentru instalare și offline aș adăuga vite-plugin-pwa. Toate sunt gratuite și open-source.

Pot face un demo mic pentru Garaj, ca să-l încerci direct pe telefon: poză, decupaj, roți, apoi condus pe dealuri cu motorul pe vocea ta.

### 👤 Mesajul 5

> bun. hai sa facem
>
> fa un folder nou ca proiect nou tot aici in acest proiect pentru moment

*(Asistentul a verificat configurația proiectului SKILL ISSUE: Vite 8, Vitest 4, TypeScript 7, oxlint; `tsconfig` include doar `src/`, iar `.gitignore` ignoră `node_modules` și `dist` în orice folder. Concluzia: un proiect separat în `vroombox/` nu afectează build-ul SKILL ISSUE. A creat folderul `vroombox/`.)*

### 👤 Mesajul 6

> scrie si itregul plan si converrsatie intr-un fisier MD

### 🤖 Răspunsul 6

Documentul ăsta, `vroombox/PLAN.md`. Construcția prototipului continuă după el, iar statusul se actualizează în [secțiunea 11](#11-status).

---

## 13. Anexe: date brute și surse

### A. Roblox, captură din 19.11.2026 (~10:20), API-ul oficial

**Top Playing Now:**

| Joc | Jucători | Creat | Vizite |
|---|---:|---|---:|
| Steal An Egg | 590.327 | 2026-07-25 | 11.512.405.597 |
| [🥤] Adopt Me! | 280.357 | 2017-07-14 | 45.451.341.893 |
| [🎃] Blox Fruits | 214.306 | 2019-01-16 | 65.559.576.777 |
| Throw Food For Animals | 200.848 | 2026-09-18 | 328.538.865 |
| Brookhaven 🏡RP | 170.913 | 2020-04-21 | 89.621.862.870 |
| 99 Nights in the Forest 🔦 | 98.467 | 2025-03-04 | 30.580.541.938 |
| [🎯] RIVALS | 85.544 | 2024-05-26 | 19.375.811.784 |
| Break and Steal an Egg | 77.205 | 2026-09-05 | 458.793.476 |
| [🏝️UPD] Fish It! 🐟 | 64.063 | 2024-10-21 | 4.832.299.543 |
| [☀️UPD 21🏖️] Anime Adventures | 63.092 | 2021-12-21 | 2.645.367.461 |
| Murder Mystery 2 | 51.614 | 2014-01-18 | 32.323.486.006 |
| Pet Simulator 99! | 41.105 | 2022-02-05 | 2.715.035.729 |

**Trending și Up-and-Coming (selecție):**

| Joc | Jucători | Creat | Ce e |
|---|---:|---|---|
| Hyper Realistic Ragdoll | 43.552 | 2026-10-29 | sandbox cu fizică ragdoll |
| Survive Your Ideas | 25.496 | 2026-10-06 | „scrii orice cuvânt și apare în joc” (130M vizite) |
| Ant Evolution | 24.547 | 2026-10-28 | furnică ce evoluează |
| BloxNG [CRASH PHYSICS] 💥 | 21.398 | 2026-10-13 | caroserii care se deformează realist |
| Ragdoll Soccer | 16.685 | 2026-10-13 | fotbal cu fizică ragdoll |
| Realistic Ragdoll MMA 🥊 | 16.146 | 2026-11-05 | lupte cu fizică |
| Voxel Wars | 15.270 | 2026-10-28 | totul se poate distruge |
| 100 Miles Down the River | 14.361 | 2026-10-12 | plută cu prietenii, horror |
| Clean The Ballpit! | 12.345 | 2026-10-31 | strângi bile colorate |
| Stop The Tsunami! | 11.214 | 2026-10-12 | ziduri de nisip contra tsunami |
| Scare Your Favorite Streamer | 8.087 | 2026-11-01 | sperii streameri, furi pachete |
| Be The Biggest Streamer | 7.515 | 2026-10-21 | crești de la 0 la cel mai mare streamer |
| Flat the Mountain | 6.854 | 2026-11-03 | sapi un munte pentru bani |
| Build a Car to Go Far | 5.709 | 2026-09-08 | construiești o mașină din piese și vezi cât de departe ajunge |
| Can You Land A Plane? | 5.374 | 2026-11-06 | aterizezi avionul |
| Charge Your Phone With POTATOES 🥔 | 2.923 | 2026-11-05 | premisă absurdă |
| Engine Simulator | 1.495 | 2026-10-30 | construiești motoare |
| Pleb's Plane Crash Sandbox | 1.332 | 2026-11-02 | prăbușiri de avioane realiste |

### B. Sunete recunoscute de YAMNet (verificat în lista oficială de 521 de clase)

- **Animale și corp:** Moo, Oink, Bark, Meow, Neigh, Goat, Bleat, Sheep, Chicken/rooster, Crowing (cock-a-doodle-doo), Quack, Roar, Roaring cats (lions, tigers), Fart, Burping, Hiccup, Snoring, Sneeze, Laughter, Screaming, Yodeling, Whistling, Beatboxing.
- **Vehicule:** Car, Vehicle horn (honking), Skidding, Tire squeal, Race car, Truck, Air brake, Air horn, Reversing beeps, Bus, Motorcycle, Engine, Light/Medium/Heavy engine, Engine starting, Idling, „Accelerating, revving, vroom”, Lawn mower, Chainsaw.
- **Nu există** o clasă „Tractor”. Un „brrrm” gros ar ieși „Heavy engine”.

### C. Surse

- Roblox (API): `apis.roblox.com/explore-api/v1/get-sorts`, `games.roblox.com/v1/games` · https://www.roblox.com/charts
- Lista de clase YAMNet: https://github.com/tensorflow/models/blob/master/research/audioset/yamnet/yamnet_class_map.csv
- Trenduri de jucării 2026: https://thetoyinsider.com/2026-hot-toy-preview/ · https://www.toyassociation.org/ta/toys/research-and-data/reports/trend-spotting.aspx
- Brainrot în 2026: https://www.nssmag.com/en/lifestyle/43781/end-of-brainrot-trends-2026-intellectual-revival
- Sprunki în 2026: https://doodoo.love/news/2026-06-04-sprunki-complete-guide
- TikTok Mini Games: https://developers.tiktok.com/docs/en/mini-games-overview
- SnapMonster: https://snapmonster.io/photo-to-monster/ · CatchCat: https://games.gg/news/catchcat-collect-real-cats-mobile-game/
- Mimic Party: https://choicervoicer.games/mimic-party/ · Choicer Voicer: https://choicervoicer.org/
- HoloFame: https://holofame.app/en-gb/ · Fake Fame: https://sqeezstudio.eu/fakefame.html
- Pokipet: https://apps.apple.com/us/app/pokipet-raise-virtual-pets/id6443760470 · Lovegotchi: https://lovegotchi.com/
- Cat Games: https://play.google.com/store/apps/details?id=fr.prodivesyst.catgames
- SnapScout: https://apps.apple.com/us/app/snapscout-kids-scavenger-hunt/id6774196512 · Camera Hunt: https://play.google.com/store/apps/details?id=com.camerahunt.camerahunt
- Mage Arena: https://www.polygon.com/what-is-mage-arena-steam-pc-game-tiktok-sales-players/ · YAPYAP: https://yapyapgame.com/
- Condus cu vocea: https://devpost.com/software/vroom-voice-controlled-racing · https://marmelab.com/blog/2023/03/23/handless-racing-game-with-ai.html · https://braap.club/ · https://store.steampowered.com/app/4627980/CAAAHR/
- Hill Climb Racing, 2 miliarde: https://fingersoft.com/news/2026/01/15/hill-climb-racing-breaks-a-new-record-2-billion-downloads/
- Carbrix: https://store.steampowered.com/app/3712430/Carbrix/
- Limitele Cloudflare Pages: https://developers.cloudflare.com/pages/platform/limits/
- Testarea obligatorie pe Play: https://support.google.com/googleplay/android-developer/answer/14151465
- Verificarea dezvoltatorilor Android: https://developer.android.com/developer-verification/guides
