# Cabrio Cruise

Ein 3D-Fahrspiel im Browser. BMW-Cabrio mit offenem Verdeck, zwei Leute mit
Hüten auf den Sitzen, ein 5,5 km langer Rundkurs durch Felder, Wald, einen
Speditionshof und ein Stück Autobahn. Standardkamera ist die Fahrersicht:
Lenkrad, Tachos und Radio im Bild, Blick über die Motorhaube. Mit `C` kommt
man auf die Kamera aus den Handyvideos, die hinter den Kopfstützen über die
Windschutzscheibe schaut.

Kein Modellformat, keine Texturdatei, kein Netzwerkzugriff: Auto, Landschaft,
Schilder, Räder und Himmel entstehen beim Laden aus Code und Canvas.

## Starten

```bash
python3 -m http.server        # dann http://localhost:8000/demos/cabrio-cruise/
```

Ein einfaches `file://`-Öffnen funktioniert genauso — es gibt nichts, was
`fetch` bräuchte.

## Steuerung

| Taste | Wirkung |
|---|---|
| `W` / `S` | Gas, bremsen, im Stand rückwärts |
| `A` / `D` | lenken (Pfeiltasten ebenso) |
| `Leertaste` | Handbremse, das Heck bricht aus |
| `C` | Kamera: Fahrersicht → Cockpit → Verfolger → Kino |
| `H` / `R` / `M` | Hupe, Radio, Ton aus |
| `P` | Filmlook an/aus |
| `T` | zurück auf die Straße, wenn man im Feld steht |

Auf Touchgeräten erscheinen vier Pads statt der Tastenzeile.

## Das Spiel

Goldene Ringe markieren die nächste Lieferung. Jeder Treffer bringt 250 € plus
Tempobonus und stellt die Uhr neu; läuft die Zeit ab, kommt eine neue Lieferung.

Bei allem, was passiert — Checkpoint getroffen, Unfall, Streifenwagen im
Rückspiegel — reißt die Beifahrerin die Arme hoch und wedelt, dreht sich dabei
zur Seite. Ab 80 km/h macht sie das ohnehin, aber langsamer und kleiner; die
Reaktion ist doppelt so schnell und dreimal so weit ausholend. In der
Fahrersicht sitzt sie 90° rechts und wäre nie im Bild, deshalb zieht die
Kamera für anderthalb Sekunden auf die Cockpit-Position zurück und zeigt
beide. Ein Kopfdrehen weit genug, um sie zu finden, würde die Straße
verlieren.

Wer Gegenverkehr rammt, bekommt einen Fahndungsstern. Ab dem ersten Stern
hängen sich Streifenwagen an, die auf der Ideallinie schneller sind als der
Verkehr. Bleiben sie 2,6 Sekunden am Stoßfänger, ist die Fahrt vorbei —
Bußgeld, Respawn, Sterne weg. Wer sie 12 Sekunden lang um mehr als ~90 m
abhängt, verliert einen Stern.

## Die Strecke

16 Kontrollpunkte, geschlossene Catmull-Rom-Kurve, ca. 5,5 km. Jeder Abschnitt
hat einen Typ, der Breite, Markierung und Randbebauung bestimmt:

| Abschnitt | Halbbreite | Was dort steht |
|---|---|---|
| `autobahn` | 8,6 m | Leitplanke beidseitig, Masten, zwei Spuren je Richtung |
| `exit` | 6,2 m | Ausfahrtsbogen, breiter als Land, schmaler als Autobahn |
| `country` | 3,9 m | Einzelbäume, Weidezäune, gelbe Wegweiser |
| `forest` | 3,9 m | dichte Fichten bis an den Randstreifen |
| `industrial` | 4,8 m | Speditionshallen, Auflieger, Zugmaschinen, Laternen |

Die Fahrbahn ist ein Band aus 1100 Querschnitten. Zwischen zwei Abschnitten
wird die Breite weich überblendet, das Band selbst aber getrennt — jeder Typ
bekommt seine eigene Markierungstextur. Eine Kachel deckt genau 18 m ab, also
einen deutschen Strichzyklus (6 m Strich, 12 m Lücke).

## Wie das Gelände zur Straße passt

Die Höhe ist zweigeteilt: eine glatte großräumige Welle (`baseHeight`), der die
Straße exakt folgt, und eine feinere Welligkeit (`detailHeight`), die überall
draufkommt — außer neben dem Asphalt. Dort wird sie über 42 m ausgeblendet, am
Speditionshof über 135 m, sonst schweben Hallen und Auflieger über den Buckeln.

Für die Abfrage „wie weit ist dieser Punkt von der Straße weg" liegen die 1100
Querschnitte in einem 64-m-Raster. Das benutzen der Geländeaufbau, die
Abfrage der Fahrbahnhöhe pro Frame und die Erkennung, ob das Auto noch auf der
Straße ist.

## Fahrphysik

Einspurmodell, bewusst arcadig:

- Gierrate `v / Radstand × tan(Lenkwinkel)`, Radstand 2,57 m wie beim E30.
- Der Lenkeinschlag wird mit dem Tempo bis auf 28 % zurückgenommen, sonst legt
  sich das Auto bei 200 km/h auf Tastendruck quer.
- Quergeschwindigkeit wird getrennt geführt und pro Sekunde weggedämpft. Der
  Dämpfungsfaktor ist der Grip: 7,2 auf Asphalt, 4,0 auf Gras, 1,7 an der
  Handbremse — daher der Drift.
- Leistung und Luftwiderstand sind auf einen 325i eingestellt: gut 230 km/h
  Endgeschwindigkeit, 0–100 in etwa 7 Sekunden.
- Nicken und Wanken kommen aus vier Geländeabfragen um das Auto herum, plus
  Anteilen aus Längs- und Querbeschleunigung.

Kollisionen laufen über drei Wege: Punkthindernisse (Bäume, Schilder, Masten)
in einem 24-m-Raster, Kastenhindernisse (Hallen, geparkte Auflieger) als
gedrehte Rechtecke, und die Autobahnleitplanke als harte Begrenzung auf den
Fahrbahnrand — billiger als eine Geometrieabfrage und garantiert dicht.

## Kamera-Look

Die Szene geht nicht direkt auf den Bildschirm, sondern erst in ein
HDR-Rendertarget. Darauf laufen vier Vollbild-Durchgänge: Helligkeitsschwelle,
zweimal getrennter Gauß für einen engen und einen weiten Bloom, und ein
Composite, das ACES-Tonemapping, die sRGB-Kurve, Vignette, Filmkorn, leichte
chromatische Aberration und eine radiale Bewegungsunschärfe zusammenbaut. Die
Unschärfe hängt am Tempo und lässt die Bildmitte scharf.

Die Reihenfolge ist der ganze Trick: Bloom und Unschärfe passieren in linearem
Licht, Tonemapping und Gamma ganz am Ende. Andersherum bekommt man grauen
Schleier statt Glanz.

Der r147-UMD-Build bringt keinen EffectComposer mit, also ist die Kette in
`src/post.js` von Hand geschrieben — für vier Durchgänge lohnt der Import der
Beispieldateien nicht.

Damit der Bloom überhaupt etwas findet, braucht es Werte über 1.0. Die liefert
eine Sonnenscheibe, deren Sprite-Farbe direkt in linearem Raum auf 7.5 gesetzt
wird. Sie hängt an der Kamera, damit sie am Himmel bleibt.

Materialien sind durchgehend PBR (`MeshStandardMaterial`, Lack als
`MeshPhysicalMaterial` mit Klarlackschicht). Die Reflexionen kommen aus einer
winzigen Ersatzwelt — Himmelsgradient oben, Wiesenfarbe unten — die einmal
durch `PMREMGenerator` gebacken wird. Das ist der Unterschied zwischen lackiert
und Plastik.

## Ton

Alles aus dem WebAudio-Oszillator, keine Samples: Motor als zwei Sägezähne
durch ein Tiefpassfilter, das mit der Drehzahl aufmacht, Fahrtwind und
Reifenquietschen aus einem gemeinsamen Rauschpuffer, Zweiklanghupe, Martinshorn
und ein Radio, das taktweise vier Akkorde nachlegt. Standardmäßig ist das Radio
aus, `R` schaltet es an.

## Grenzen

- Der Verkehr fährt stur auf seiner Spur weiter. Er weicht nicht aus, bremst
  nicht und nimmt keinen Schaden — nur der Spieler tut das.
- Die Polizei fährt ebenfalls auf der Kurve, nicht frei. Wer quer übers Feld
  flüchtet, hängt sie deshalb leichter ab, als er sollte.
- Die Instanz-Meshes (Bäume, Zäune, Masten) werden als je ein Objekt gecullt.
  Ihre Bounding-Sphere umfasst die ganze Karte, sie werden also immer
  gezeichnet. Deshalb werfen sie auch keine Schatten — sonst landet alles ein
  zweites Mal in der Shadow-Map. Schatten werfen nur Auto und Gebäude, und die
  Shadow-Kamera folgt dem Auto mit 64 m Kantenlänge.
- Der Schaden zählt hoch und färbt den Balken, hat aber keine Wirkung auf die
  Fahrleistung.
- Die Karosserie besteht aus Quadern. Die Proportionen stimmen — Schweller
  0,28 m, Gürtellinie 1,06 m, Scheibenrahmen 1,44 m, Bodenblech 0,38 m, alles
  vom echten E30 — aber es gibt keine Rundungen. Fotorealistisch wird das
  nicht, dafür bräuchte es Modelldateien und Fototexturen statt Canvas.

## Dateien

| Datei | Inhalt |
|---|---|
| `index.html` | Seite, HUD, Startkarte |
| `src/world.js` | Strecke, Gelände, Fahrbahn, Randbebauung, Himmel |
| `src/car.js` | Cabrio, Insassen, Verkehr, Polizei |
| `src/post.js` | HDR-Ziel, Bloom, Tonemapping, Korn, Bewegungsunschärfe |
| `src/game.js` | Schleife, Physik, Kameras, Missionen, Ton |
| `vendor/` | three.js r147 UMD, MIT |
| `make_preview.js` | rendert `preview.png` für Link-Vorschauen |

Für die Link-Vorschau (LinkedIn, Slack) braucht es ein fertiges Bild, weil
keiner dieser Dienste WebGL ausführt:

```bash
node make_preview.js          # -> preview.png, 1200x627
```
