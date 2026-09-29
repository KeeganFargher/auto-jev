import { classNames } from "../../../ui/class-names.js";
import type { BannerSpec } from "../model/play-screen.js";

export function Banner({ spec }: { spec: BannerSpec }) {
  return (
    <div
      className={classNames(
        "brush-banner",
        spec.tone === "gold" && "is-gold",
        spec.tone === "crimson" && "is-crimson",
        spec.tone === "slate" && "is-slate",
      )}
    >
      <div className="banner-title">{spec.title}</div>
      {spec.sub === null ? null : <div className="banner-sub">{spec.sub}</div>}
    </div>
  );
}
