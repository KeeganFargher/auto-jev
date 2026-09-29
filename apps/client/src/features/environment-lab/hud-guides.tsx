const HUD_GUIDES = ["is-seats", "is-team", "is-header", "is-plate", "is-action"];

export function HudGuides() {
  return (
    <div className="env-guides">
      {HUD_GUIDES.map((guide) => (
        <div key={guide} className={`env-guide ${guide}`} />
      ))}
    </div>
  );
}
