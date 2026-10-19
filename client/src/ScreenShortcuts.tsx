import { ADMIN_TEXT as A, PUBLIC_TEXT as P } from "./texts.fr";
/** Cibles nommées : réutiliser l’onglet ouvert depuis CH8 au lieu de le multiplier.
 * Liens exclusivement internes ; ne pas ajouter noreferrer/noopener, qui annule
 * la réutilisation d’une cible nommée dans les navigateurs modernes. */
export function ScreenShortcuts() {
  return (
    <nav className="screen-shortcuts" aria-label={A.shortcuts.title}>
      <h3>{A.shortcuts.title}</h3>
      {A.shortcuts.screens.map((label, index) => (
        <a key={label} href={`/ecrans/${index + 1}`} target={`ch8-public-screen-${index + 1}`}>
          {label} ↗
        </a>
      ))}
      <a href="/ecrans" target="ch8-public-mosaic">{P.mosaic} ↗</a>
      <a href="/pilotage" target="ch8-pilot">{A.shortcuts.pilot} ↗</a>
      <p>{A.shortcuts.hint}</p>
    </nav>
  );
}
