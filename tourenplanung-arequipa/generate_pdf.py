#!/usr/bin/env python3
"""Generate Arequipa tour planning PDF for Ralf (2 pax, 10–18 Oct 2026)."""

from pathlib import Path
from fpdf import FPDF

FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
FONT_B = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
OUT = Path("/opt/cursor/artifacts/Arequipa_Tourenplan_10-18_Okt_2026.pdf")
OUT_COPY = Path("/workspace/tourenplanung-arequipa/Arequipa_Tourenplan_10-18_Okt_2026.pdf")
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT_COPY.parent.mkdir(parents=True, exist_ok=True)


class PlanPDF(FPDF):
    def header(self):
        if self.page_no() == 1:
            return
        self.set_font("DejaVu", "", 8)
        self.set_text_color(100, 100, 100)
        self.cell(0, 6, "Arequipa Adventure · 10.–18. Oktober 2026 · 2 Personen", align="L")
        self.ln(8)

    def footer(self):
        self.set_y(-12)
        self.set_font("DejaVu", "", 8)
        self.set_text_color(120, 120, 120)
        self.cell(
            0,
            8,
            f"Seite {self.page_no()}/{{nb}}  ·  Stand Recherche: Sept. 2026  ·  Preise unverbindlich",
            align="C",
        )

    def h1(self, text):
        self.set_font("DejaVu", "B", 16)
        self.set_text_color(30, 58, 95)
        self.multi_cell(0, 8, text)
        self.ln(2)

    def h2(self, text):
        self.ln(2)
        self.set_font("DejaVu", "B", 12)
        self.set_text_color(196, 92, 38)
        self.multi_cell(0, 6.5, text)
        self.ln(1)

    def h3(self, text):
        self.ln(1.5)
        self.set_font("DejaVu", "B", 10.5)
        self.set_text_color(30, 58, 95)
        self.multi_cell(0, 5.5, text)
        self.ln(0.5)

    def body(self, text):
        self.set_font("DejaVu", "", 9.5)
        self.set_text_color(35, 35, 35)
        self.multi_cell(0, 5, text)
        self.ln(1.5)

    def bullet(self, text):
        self.set_x(self.l_margin)
        self.set_font("DejaVu", "", 9.5)
        self.set_text_color(35, 35, 35)
        avail = self.w - self.r_margin - self.l_margin - 5
        self.cell(5, 5, "-")
        self.multi_cell(avail, 5, text)
        self.ln(0.3)

    def kv(self, key, value):
        self.set_x(self.l_margin)
        key_w = 42
        val_w = self.w - self.r_margin - self.l_margin - key_w
        y0 = self.get_y()
        self.set_font("DejaVu", "B", 9.5)
        self.set_text_color(30, 58, 95)
        self.multi_cell(key_w, 5, key)
        y1 = self.get_y()
        self.set_xy(self.l_margin + key_w, y0)
        self.set_font("DejaVu", "", 9.5)
        self.set_text_color(35, 35, 35)
        self.multi_cell(val_w, 5, value)
        self.set_y(max(y1, self.get_y()))

    def table(self, headers, rows, col_widths):
        usable = self.w - self.l_margin - self.r_margin
        if abs(sum(col_widths) - usable) > 1:
            scale = usable / sum(col_widths)
            col_widths = [w * scale for w in col_widths]

        def draw_header():
            self.set_font("DejaVu", "B", 8)
            self.set_fill_color(30, 58, 95)
            self.set_text_color(255, 255, 255)
            for h, w in zip(headers, col_widths):
                self.cell(w, 6.5, h, border=1, fill=True, align="C")
            self.ln()

        draw_header()
        fill = False
        for row in rows:
            self.set_font("DejaVu", "", 7.5)
            self.set_text_color(35, 35, 35)
            line_h = 4.0
            max_lines = 1
            for txt, w in zip(row, col_widths):
                lines = self.multi_cell(w - 1, line_h, str(txt), dry_run=True, output="LINES")
                max_lines = max(max_lines, len(lines))
            row_h = max(max_lines * line_h + 1.2, 6.5)
            if self.get_y() + row_h > self.h - 18:
                self.add_page()
                draw_header()
                self.set_font("DejaVu", "", 7.5)
                self.set_text_color(35, 35, 35)
            y0 = self.get_y()
            x = self.l_margin
            if fill:
                self.set_fill_color(245, 240, 235)
            else:
                self.set_fill_color(255, 255, 255)
            for w in col_widths:
                self.rect(x, y0, w, row_h, style="DF")
                x += w
            x0 = self.l_margin
            for txt, w in zip(row, col_widths):
                self.set_xy(x0 + 0.6, y0 + 0.8)
                self.multi_cell(w - 1.2, line_h, str(txt))
                x0 += w
            self.set_y(y0 + row_h)
            fill = not fill
        self.ln(2)


def build():
    pdf = PlanPDF(orientation="P", unit="mm", format="A4")
    pdf.set_auto_page_break(auto=True, margin=16)
    pdf.add_font("DejaVu", "", FONT)
    pdf.add_font("DejaVu", "B", FONT_B)
    pdf.alias_nb_pages()

    # Cover
    pdf.add_page()
    pdf.set_y(40)
    pdf.set_x(pdf.l_margin)
    pdf.set_font("DejaVu", "B", 26)
    pdf.set_text_color(30, 58, 95)
    pdf.cell(0, 12, "Arequipa Adventure", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("DejaVu", "", 13)
    pdf.set_text_color(196, 92, 38)
    pdf.cell(0, 8, "Komplette Tourenplanung - 2 Personen", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(3)
    pdf.set_font("DejaVu", "B", 12)
    pdf.set_text_color(35, 35, 35)
    pdf.cell(0, 7, "10. - 18. Oktober 2026  |  9 Naechte", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(6)
    pdf.set_draw_color(196, 92, 38)
    pdf.set_line_width(0.6)
    y = pdf.get_y()
    pdf.line(55, y, 155, y)
    pdf.ln(10)
    pdf.set_font("DejaVu", "", 10.5)
    pdf.set_text_color(35, 35, 35)
    for line in [
        "Route: Los Angeles (LAX) -> Lima -> Arequipa",
        "Fokus: Akklimatisation, Chachani Downhill, Colca-Trek,",
        "Laguna de Salinas, lokale Adventure-Tage",
        "",
        "Optimiert auf Kosten, Hoehe, Erholung.",
        "Kein Dauer-Mietwagen - kein Cotahuasi-Tagesausflug.",
    ]:
        pdf.cell(0, 6, line, align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(18)
    pdf.set_font("DejaVu", "", 9)
    pdf.set_text_color(100, 100, 100)
    pdf.cell(0, 5, "Erstellt fuer Ralf | Recherche Stand September 2026", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 5, "Preise/Verfuegbarkeit vor Buchung per WhatsApp oder Web bestaetigen.", align="C", new_x="LMARGIN", new_y="NEXT")

    # Overview
    pdf.add_page()
    pdf.h1("1. Kurzüberblick")
    pdf.body(
        "Neun Nächte in und um Arequipa. Ein festes Basis-Hotel im Centro Histórico "
        "für fast alle Nächte; eine Nacht im Colca Canyon (Sangalle) im Trek-Paket. "
        "Kein Mietwagen für die ganze Reise – geführte Touren bringen bereits 4x4 mit. "
        "Cotahuasi entfällt zugunsten lokaler Adventure-Tage."
    )
    pdf.h3("Budget Touren (pro Person, Orientierung)")
    pdf.kv("Touren gesamt", "ca. 230 – 340 USD")
    pdf.kv("Hotels (DZ geteilt)", "ca. 180 – 360 USD p.P. (je Kategorie)")
    pdf.kv("Essen + lokale Transfers", "ca. 100 – 160 USD p.P.")
    pdf.kv("Vor Ort gesamt", "ca. 510 – 860 USD p.P. (ohne internationale Flüge)")

    pdf.h2("2. Optimierte Tagesroute")
    pdf.table(
        ["Tag", "Datum", "Programm", "Übernachtung"],
        [
            ["1", "Fr 10.10.", "Flug LAX → LIM → AQP, Transfer, Check-in, ruhig starten", "Arequipa Centro"],
            ["2", "Sa 11.10.", "Akklimatisation: Plaza, Santa Catalina, Yanahuara", "Arequipa Centro"],
            ["3", "So 12.10.", "Chachani Volcano Downhill (4x4 hoch, ~35 km Bike)", "Arequipa Centro"],
            ["4", "Mo 13.10.", "Erholung niedrig: Chili-Rafting ODER Ruta del Sillar + Yura", "Arequipa Centro"],
            ["5", "Di 14.10.", "Colca Canyon Trek Tag 1 → Oasis Sangalle", "Sangalle (inkl.)"],
            ["6", "Mi 15.10.", "Colca Tag 2, Cruz del Condor, Rueckfahrt AQP", "Arequipa Centro"],
            ["7", "Do 16.10.", "Laguna de Salinas / Aguada Blanca (Gruppe oder privat 4x4)", "Arequipa Centro"],
            ["8", "Fr 17.10.", "Lokaler Adventure-Tag: ATV Chilina / Option vor Ort", "Arequipa Centro"],
            ["9", "Sa 18.10.", "Puffer / Stadt / Rueckflug (je nach Flugzeit)", "Arequipa oder Abflug"],
        ],
        [12, 22, 105, 41],
    )

    pdf.h2("Warum diese Reihenfolge?")
    pdf.bullet("Tag 1–2: Ankommen und akklimatisieren (Arequipa ~2.300 m) vor jedem Höhentag.")
    pdf.bullet("Tag 3: Erster Adrenalin-/Höhen-Peak mit Chachani Downhill.")
    pdf.bullet("Tag 4: Bewusst niedrig – Erholung vor dem Colca-Trek.")
    pdf.bullet("Tag 5–6: Colca; Sangalle liegt tiefer → gute Regeneration.")
    pdf.bullet("Tag 7: Salinas (andere Seite der Reserve als Colca-Korridor).")
    pdf.bullet("Tag 8: Kurzes lokales Adventure, kein 8-Stunden-Transfer (Cotahuasi gestrichen).")

    # Tours
    pdf.add_page()
    pdf.h1("3. Empfohlene Touren und Anbieter")

    pdf.h2("Tag 3 – Chachani Downhill (Top-Empfehlung)")
    pdf.kv("Anbieter", "Turismo Liberty")
    pdf.kv("Preis", "ab 99 USD p.P.")
    pdf.kv("Dauer", "ca. 6 Std. (2,5 Std. 4x4 hoch + ~3 Std. Abfahrt)")
    pdf.kv("Route", "~35 km von ~4.700 m (Las Antenas) nach Arequipa")
    pdf.kv("Inklusive", "4x4, Guide, MTB, Helm, Protektoren, Snacks/Wasser")
    pdf.kv("Kontakt", "WhatsApp +51 959 175 901 / +51 944 134 797")
    pdf.kv("E-Mail", "reservas@turismoliberty.pe")
    pdf.kv("Web", "turismoliberty.pe – Chachani Volcano Downhill 2026")
    pdf.body(
        "Budget-Alternative: lokale Agenturen / Pelago ab ca. 77 USD – oft kürzerer Start "
        "oder andere Variante. Bei Liberty stimmen Höhe, Distanz und Ausrüstung am klarsten "
        "mit eurem Wunsch überein."
    )

    pdf.h2("Tag 4 – Erholungstag (eine Option wählen)")
    pdf.h3("Option A – Chili River Rafting (guenstiger, Adrenalin)")
    pdf.kv("Preis", "ca. 20–34 USD p.P. (Anderra Travel ab ~24 USD)")
    pdf.kv("Dauer", "ca. 3 Stunden")
    pdf.kv("Kontakt", "+51 958 138 789 · anderratravel.com")
    pdf.h3("Option B – Ruta del Sillar + Yura")
    pdf.kv("Preis", "ab ca. 64 USD p.P. (Anderra, Min. 2 Personen)")
    pdf.kv("Dauer", "ca. 6 Stunden")
    pdf.kv("Extra", "Eintritte Sillar ~S/5, Termas Yura ~S/5–10")

    pdf.h2("Tag 5–6 – Colca Canyon Trek 2D/1N")
    pdf.kv("1. Wahl", "Rumbo Explora – 75 USD p.P.")
    pdf.kv("Alternative", "Peru Baby Lama – 70 USD · Wander Free / Mistianos – ~79 USD")
    pdf.kv("Inklusive", "Transport AQP–Colca–AQP, Guide, Sangalle-Nacht, Mahlzeiten lt. Paket")
    pdf.kv("Extra", "Boleto Turistico Colca ca. S/70 (~19 USD) – oft NICHT inkl.")
    pdf.kv("Web Rumbo", "colcacanyon.travel – Colca Canyon Trek 02 Days Group Tour")
    pdf.kv("Web Baby Lama", "perubabylama.com")
    pdf.body(
        "Start typisch ~03:00–03:30 Uhr Hotel-Pickup. Tag 1 Abstieg nach Sangalle, "
        "Tag 2 Aufstieg, Cruz del Condor, Rueckkehr Arequipa ~17:00. Auf der Rueckfahrt "
        "geht es durch Aguada Blanca (Vicunas) – deshalb Salinas-Lagune separat als "
        "eigenen Tag planen (anderer Sektor)."
    )

    pdf.h2("Tag 7 – Laguna de Salinas")
    pdf.h3("Kostenoptimiert (empfohlen fuer 2 Personen)")
    pdf.kv("Anbieter", "Turismo Liberty – Gruppentour")
    pdf.kv("Preis", "ab 27 USD p.P. + Eintritte (~S/8 Lagune, optional Lojen S/10)")
    pdf.kv("Start", "ca. 06:00–06:30 Hotel-Pickup")
    pdf.kv("Oktober", "Juli–Dez. eher weisser Salar; Flamingos staerker Jan–Juni")
    pdf.h3("Premium / mehr Flexibilitaet")
    pdf.kv("Free Tour Peru", "Privat 4x4 ca. 145 USD / Gruppe (bis 4) → ~73 USD p.P. zu zweit")
    pdf.kv("Rumbo privat", "165 / 114 / 99 USD p.P. bei 2 / 3 / 4 Personen")

    pdf.h2("Tag 8 – Lokaler Adventure-Tag")
    pdf.kv("ATV Chilina Valley", "Turismo Liberty ab ca. 28 USD – Halbtag, nah an der Stadt")
    pdf.kv("Alternativen", "Zweites Rafting, Stadt + Kloster, oder Misti-Aussicht vor Ort")
    pdf.body("Cotahuasi bewusst streichen: zu viel Fahrerei fuer einen Tag.")

    # Hotels & car
    pdf.add_page()
    pdf.h1("4. Uebernachtungen")
    pdf.body(
        "Ein Hotel im Centro Historico fuer Naechte 10.–13. und 15.–17./18.10. durchbuchen. "
        "Waehrend Colca Gepaeck im Hotel lassen (Daypack mitnehmen). Nicht aus- und wieder "
        "einchecken – spart Geld und Nerven."
    )
    pdf.h3("Hotel-Empfehlungen (Midrange)")
    pdf.bullet("Tierra Viva Arequipa Plaza – zuverlaessig, ruhig, zentral")
    pdf.bullet("Casa Andina Standard oder Select Plaza – solide Kette, gute Lage")
    pdf.bullet("El Cabildo Hotel Boutique / La Maison d'Elise – Charakter, Sillar-Ambiente")
    pdf.bullet("Budget: Los Tambos · gehoben: Casa Andina Premium")
    pdf.body("Richtwert Doppelzimmer Mitte Oktober: oft ca. 70–140 USD/Nacht je nach Haus.")

    pdf.h3("Uebernachtungsmatrix")
    pdf.table(
        ["Nacht", "Datum", "Ort", "Notiz"],
        [
            ["1–4", "10.–13.10.", "Arequipa Centro", "Basis-Hotel"],
            ["5", "14.10.", "Sangalle", "Im Colca-Paket"],
            ["6–8", "15.–17.10.", "Arequipa Centro", "Gleiches Hotel"],
            ["9", "18.10.", "Arequipa oder Flug", "Nur wenn Abflug 19.10. morgens"],
        ],
        [18, 28, 45, 89],
    )

    pdf.h1("5. Mietwagen – klare Empfehlung")
    pdf.body(
        "Fuer 2 Personen: KEIN Mietwagen fuer die ganze Reise. Chachani, Colca und Salinas "
        "laufen ueber Tour-Transport. Ein stehendes Auto kostet nur Geld."
    )
    pdf.kv("Empfehlung", "0 Mietwagen-Tage")
    pdf.kv("Falls doch", "Nur 1 Tag (Tag 7 ODER 8), morgens abholen, abends zurueck")
    pdf.kv("Anbieter", "Caminos Rent a Car (+51 959 975 711) · Kala Rent a Car (054) 624021")
    pdf.kv("Orientierung", "ca. S/250+/Tag (~70 USD) + Benzin + Versicherung")
    pdf.body(
        "Selbstfahrer-Salinas lohnt sich fuer 2 Personen selten: Liberty-Gruppe ~27 USD p.P. "
        "oder Privat-4x4 ~145 USD/Gruppe schlagen Mietwagen + Risiko in der Hoehe."
    )

    pdf.h1("6. Kostenuebersicht (2 Personen)")
    pdf.table(
        ["Posten", "p.P. ca.", "fuer 2 ca.", "Hinweis"],
        [
            ["Chachani Downhill", "99 USD", "198 USD", "Turismo Liberty"],
            ["Tag 4 Rafting ODER Sillar", "25–64 USD", "50–128 USD", "eine Option"],
            ["Colca Trek 2D", "70–75 USD", "140–150 USD", "+ Boleto ~19 USD p.P."],
            ["Salinas Gruppe", "27+5 USD", "64 USD", "Liberty; privat teurer"],
            ["Tag 8 ATV o.ae.", "28–40 USD", "56–80 USD", "lokal"],
            ["Touren Summe", "230–320 USD", "460–640 USD", "ohne Hotels"],
            ["Hotel 8 Naechte DZ", "180–360", "360–720", "geteilt / Midrange"],
            ["Essen & Taxi", "100–160", "200–320", "Menu + Transfers"],
        ],
        [48, 28, 32, 72],
    )
    pdf.body(
        "Kosten-Hebel: Salinas als Gruppe statt privat, Tag 4 Rafting statt Sillar, "
        "ein Basis-Hotel durchbuchen, kein Mietwagen, Cotahuasi streichen."
    )

    # Checklist
    pdf.add_page()
    pdf.h1("7. Buchungs-Checkliste")
    pdf.bullet("1) Fluege LAX–LIM–AQP und Rueckflug fixieren (Ankunft/Abflugzeiten pruefen).")
    pdf.bullet("2) Hotel Centro 10.–13. + 15.–17./18.10. mit Flex-Storno wenn moeglich.")
    pdf.bullet("3) Colca Trek (Rumbo oder Baby Lama) fuer 14.–15.10. – Oktober frueh buchen.")
    pdf.bullet("4) Chachani Downhill Liberty WhatsApp: Datum 12.10., 2 Personen.")
    pdf.bullet("5) Salinas Liberty (Gruppe) oder Free Tour Peru (privat) fuer 16.10.")
    pdf.bullet("6) Tag 4 + Tag 8: 2–3 Tage vorher oder vor Ort buchen.")
    pdf.bullet("7) Reiseversicherung inkl. Abenteuer/Hoehe; Passkopien digital.")
    pdf.bullet("8) Bargeld Soles fuer Eintritte (Colca-Boleto, Salinas, Trinkgeld).")

    pdf.h2("Mitbringen fuer Chachani / Hoehe")
    pdf.bullet("Warme Jacke, lange Hose, Sonnencreme, Sonnenbrille, Buff, kleiner Rucksack")
    pdf.bullet("Gute Fitness; mind. 1 Akklimatisations-Tag in Arequipa vor dem Downhill")
    pdf.bullet("Kein Alkohol am Vorabend der Hoehentage; viel Wasser")

    pdf.h1("8. Kontakte auf einen Blick")
    pdf.table(
        ["Thema", "Anbieter", "Kontakt"],
        [
            ["Chachani + Salinas + ATV", "Turismo Liberty", "WA +51 959 175 901 · reservas@turismoliberty.pe"],
            ["Colca Trek 75 USD", "Rumbo Explora", "colcacanyon.travel"],
            ["Colca Trek 70 USD", "Peru Baby Lama", "perubabylama.com"],
            ["Sillar / Rafting", "Anderra Travel", "+51 958 138 789 · anderratravel.com"],
            ["Salinas privat 4x4", "Free Tour Peru", "freetourperu.com"],
            ["Mietwagen (optional)", "Caminos / Kala", "+51 959 975 711 / (054) 624021"],
        ],
        [42, 42, 96],
    )

    pdf.h2("9. Offene Punkte fuer euch")
    pdf.bullet("Abflug am 18.10. abends oder 19.10. morgens? → letzte Hotelnacht ja/nein")
    pdf.bullet("Tag 4: Rafting (guenstig/kurz) oder Sillar+Yura (Kultur/entspannt)?")
    pdf.bullet("Tag 7: Salinas Gruppe 27 USD oder privat 4x4 ~73 USD p.P.?")
    pdf.bullet("Hotel-Budget: ~80 USD/Nacht Mid oder ~120+ Boutique?")

    pdf.ln(6)
    pdf.set_font("DejaVu", "B", 11)
    pdf.set_text_color(30, 58, 95)
    pdf.multi_cell(0, 6, "Gute Reise nach Arequipa – und viel Spass auf dem Chachani-Downhill!")
    pdf.set_font("DejaVu", "", 8.5)
    pdf.set_text_color(100, 100, 100)
    pdf.ln(2)
    pdf.multi_cell(
        0,
        4.5,
        "Hinweis: Alle Preise sind Orientierungsangaben aus oeffentlichen Anbieterseiten "
        "(Stand Recherche Sept. 2026) und koennen sich aendern. Vor Zahlung Verfuegbarkeit "
        "und Leistungsumfang schriftlich bestaetigen lassen.",
    )

    pdf.output(str(OUT))
    pdf.output(str(OUT_COPY))
    print(f"Wrote {OUT} ({OUT.stat().st_size} bytes)")
    print(f"Wrote {OUT_COPY}")


if __name__ == "__main__":
    build()
