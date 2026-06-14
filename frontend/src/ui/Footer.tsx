export interface FooterProps {
  /** Snapshot `generatedAt` (ISO-8601 UTC). */
  generatedAt: string;
}

/** Source + "last updated" + links (docs/DESIGN.md §2.3). */
export default function Footer({ generatedAt }: FooterProps) {
  const updated = new Date(generatedAt);
  const updatedLabel = Number.isNaN(updated.getTime())
    ? "—"
    : updated.toLocaleString();

  return (
    <footer className="footer">
      <p>
        Data from{" "}
        <a href="https://intervals.icu" target="_blank" rel="noreferrer">
          intervals.icu
        </a>
      </p>
      <p className="footer__meta">Last updated {updatedLabel}</p>
    </footer>
  );
}
