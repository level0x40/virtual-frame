import { Fira_Code, Playfair_Display } from "next/font/google";

const firaCode = Fira_Code({
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
  variable: "--font-fira-code",
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
  variable: "--font-playfair",
});

export function NextFont() {
  return (
    <div className="card" id="font-card">
      <h2>next/font</h2>
      <p>
        Google Fonts loaded via <code>next/font</code> — zero layout shift,
        self-hosted, and optimized.
      </p>
      <div className="font-samples">
        <div className={`font-sample ${playfair.className}`}>
          <span className="font-label">Playfair Display</span>
          <span className="font-preview">
            The quick brown fox jumps over the lazy dog
          </span>
        </div>
        <div className={`font-sample ${firaCode.className}`}>
          <span className="font-label">Fira Code</span>
          <span className="font-preview">
            {"const vf = await fetch(url);"}
          </span>
        </div>
      </div>
    </div>
  );
}
