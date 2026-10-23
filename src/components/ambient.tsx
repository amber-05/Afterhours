/** A single faint spotlight and film grain. Deliberately quiet. */
const GRAIN =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.5 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")";

export function Ambient() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
      <div className="absolute inset-x-0 top-0 h-[60vh] bg-[radial-gradient(ellipse_60%_100%_at_50%_0%,rgb(167_139_250/0.10),transparent_70%)]" />
      <div className="absolute inset-0 opacity-[0.045] mix-blend-overlay" style={{ backgroundImage: GRAIN }} />
    </div>
  );
}
