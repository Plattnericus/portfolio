import type { LucideIcon } from "lucide-react";
import RollText from "./RollText";

/**
 * The inside of every .pill: the black icon cell and the label. On hover the
 * label letters roll over and the icon is pushed out while a copy of it slides
 * in — up and to the right for an outward arrow, sideways for a back arrow,
 * straight up for everything else.
 */
export default function PillInner({
  icon: Icon,
  label,
  roll = "up",
}: {
  icon: LucideIcon;
  label: string;
  roll?: "up" | "diag" | "left";
}) {
  return (
    <>
      <span className={`pill-icon pill-icon--${roll}`}>
        <span className="pill-icon-track">
          <Icon aria-hidden="true" />
          <Icon aria-hidden="true" />
        </span>
      </span>
      <span className="pill-label">
        <RollText text={label} />
      </span>
    </>
  );
}
