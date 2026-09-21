-- Funkcja stworzona POZA tym katalogiem: deklaracji nie ma, wiec typu nie znamy.
--
-- TYP NIEZNANY ZNACZY ZGLASZAMY. Wyciszenie czegos, czego nie sprawdzilismy,
-- wygladaloby tak samo jak "sprawdzone, czysto", a to sa dwie rozne rzeczy.
-- Ta pozycja MA sie pojawic w odstepstwach.

revoke all on function public.widget_elsewhere() from public, anon;
