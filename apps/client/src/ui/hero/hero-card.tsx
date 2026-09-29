import {
  TICK_RATE,
  type HeroDefinition,
  type PassiveDefinition,
  type SignatureDefinition,
} from "@jev-game/game";
import type { ReactNode } from "react";
import { heroDefinition } from "../../game/catalogues.js";
import { UNIT_STATUS_INFO, type UnitStatusKind } from "../../game/unit-status.js";
import { HeroIcon, StatusIcon, WantIcon } from "../icons/domain-icons.js";
import { RichText, TipCard, TipHint, TipSection, TipText } from "../tooltip/tip-card.js";
import { useTip } from "../tooltip/use-tip.js";
import { fraction, formatCount, heroSub, wantLabel } from "./hero-facts.js";
import type { UnitReadout } from "./unit-readout.js";

export function WantChips({ signature }: { signature: SignatureDefinition }) {
  return signature.wants.map((want) => (
    <span key={want} className="want-chip" data-want={want}>
      <WantIcon want={want} />
      {wantLabel(signature, want)}
    </span>
  ));
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="unit-card-stat">
      <b className="unit-card-stat-value">{value}</b>
      <span className="unit-card-stat-label">{label}</span>
    </div>
  );
}

function Ability({
  kind,
  name,
  description,
  tag,
  children,
}: {
  kind: string;
  name: string;
  description: string;
  tag?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="unit-card-ability">
      <div className="unit-card-ability-head">
        <span className="unit-card-skill-kind">{kind}</span>
        <span className="unit-card-ability-name">{name}</span>
        {tag}
      </div>
      <p className="tip-text">
        <RichText text={description} />
      </p>
      {children}
    </div>
  );
}

function SignatureBlock({
  hero,
  signature,
}: {
  hero: HeroDefinition;
  signature: SignatureDefinition;
}) {
  return (
    <Ability
      kind="Signature"
      name={signature.name}
      description={signature.description}
      tag={<span className="unit-card-mana">{hero.maxMana} mana</span>}
    >
      <div className="unit-card-wants">
        <span className="unit-card-wants-label">Wants</span>
        <WantChips signature={signature} />
      </div>
    </Ability>
  );
}

function PassiveBlock({ passive }: { passive: PassiveDefinition }) {
  return <Ability kind="Passive" name={passive.name} description={passive.description} />;
}

function StatusTip({ status }: { status: UnitStatusKind }) {
  const info = UNIT_STATUS_INFO[status];

  return (
    <TipCard
      icon={<StatusIcon status={status} />}
      title={info.label}
      tag={info.buff ? "Buff" : "Debuff"}
    >
      <TipSection>
        <TipText text={info.description} />
      </TipSection>
    </TipCard>
  );
}

function StatusChip({ status, seconds }: { status: UnitStatusKind; seconds: string }) {
  const info = UNIT_STATUS_INFO[status];
  const tip = useTip({ side: "left", content: <StatusTip status={status} /> });

  return (
    <span
      className={`unit-status ${info.buff ? "is-buff" : "is-debuff"}`}
      data-status={status}
      {...tip}
    >
      <StatusIcon status={status} />
      <span className="unit-status-label">{info.label}</span>
      <span className="unit-status-timer">{seconds}</span>
    </span>
  );
}

export function HeroCard({
  heroId,
  leads = [],
  live,
  hint,
}: {
  heroId: string;
  leads?: readonly string[];
  live?: UnitReadout;
  hint?: string;
}) {
  const hero = heroDefinition(heroId);
  const attack = hero.attack;
  const attacksPerSecond = TICK_RATE / attack.intervalTicks;
  const hp = live === undefined ? hero.maxHp : live.hp;
  const maxHp = live === undefined ? hero.maxHp : live.maxHp;
  const mana = live?.mana ?? null;
  const classes = ["tip-card", "unit-card"];

  if (live !== undefined) {
    classes.push("is-live");
  }

  if (live !== undefined && !live.alive) {
    classes.push("is-dead");
  }

  return (
    <div className={classes.join(" ")} data-role={hero.id} data-team={live?.team}>
      <div className="unit-card-head">
        <div className="unit-card-name">{hero.name}</div>
        <div className="unit-card-sub">{[...leads, hero.title, heroSub(hero)].join(" · ")}</div>
      </div>
      <div className="unit-card-art">
        <span className="unit-card-glyph">
          <HeroIcon heroId={hero.id} />
        </span>
        <span className="unit-card-fallen">Fallen</span>
      </div>
      <div className="unit-card-hp">
        <span className="unit-card-hp-fill" style={{ "--fill": fraction(hp, maxHp) }} />
        <span className="unit-card-hp-value">
          {live === undefined
            ? formatCount(hero.maxHp)
            : `${formatCount(hp)} / ${formatCount(maxHp)}`}
        </span>
      </div>
      <div className="unit-card-manabar" hidden={mana === null}>
        <span
          className="unit-card-mana-fill"
          style={{
            "--fill": mana === null || live === undefined ? 0 : fraction(mana, live.maxMana),
          }}
        />
        <span className="unit-card-mana-value">
          {mana === null || live === undefined ? "" : `${mana} / ${live.maxMana}`}
        </span>
      </div>
      <div className="unit-card-statuses" hidden={live === undefined || live.statuses.length === 0}>
        {live?.statuses.map((entry) => (
          <StatusChip key={entry.status} status={entry.status} seconds={entry.seconds} />
        ))}
      </div>
      <div className="unit-card-stats">
        <StatRow label="Damage" value={String(attack.damage)} />
        <StatRow label="Attack rate" value={`${attacksPerSecond.toFixed(2)}/s`} />
        <StatRow label="DPS" value={String(Math.round(attack.damage * attacksPerSecond))} />
        {attack.kind === "projectile" && attack.allyHeal > 0 ? (
          <StatRow label="Ally heal" value={String(attack.allyHeal)} />
        ) : null}
        {live === undefined ? null : (
          <StatRow label="Damage dealt" value={formatCount(live.damageDealt)} />
        )}
      </div>
      {hero.signature === null ? null : <SignatureBlock hero={hero} signature={hero.signature} />}
      {hero.passive === null ? null : <PassiveBlock passive={hero.passive} />}
      {hint === undefined ? null : <TipHint text={hint} />}
    </div>
  );
}
