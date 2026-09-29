import { SHOULDERS, SPEAKER, SUN, SWORD } from "./paths.js";
import { Svg } from "./svg.js";

export function HumanSilhouette() {
  return (
    <Svg>
      <circle cx={12} cy={8.4} r={4.9} />
      <path d={SHOULDERS} />
    </Svg>
  );
}

export function BotSilhouette() {
  return (
    <Svg>
      <path
        d="M9 4h6a2.6 2.6 0 0 1 2.6 2.6v4.6a2.6 2.6 0 0 1-2.6 2.6H9a2.6 2.6 0 0 1-2.6-2.6V6.6A2.6 2.6 0 0 1 9 4Zm-.4 3.6v2.4h6.8V7.6Z"
        fillRule="evenodd"
      />
      <path d="M11.3 1.6h1.4V4h-1.4Z" />
      <circle cx={12} cy={1.4} r={1.2} />
      <path d={SHOULDERS} />
    </Svg>
  );
}

export function HeartIcon() {
  return (
    <Svg>
      <path d="M12 21.4 10.6 20.1C5.4 15.4 2 12.3 2 8.5 2 5.4 4.4 3 7.5 3c1.7 0 3.4.8 4.5 2.1C13.1 3.8 14.8 3 16.5 3 19.6 3 22 5.4 22 8.5c0 3.8-3.4 6.9-8.6 11.6Z" />
    </Svg>
  );
}

export function CheckIcon() {
  return (
    <Svg>
      <path d="M9.2 17.6 3.8 12.2l2.1-2.1 3.3 3.3 8.9-8.9 2.1 2.1Z" />
    </Svg>
  );
}

export function SkipIcon() {
  return (
    <Svg>
      <path d="M3 4.5 12 12 3 19.5ZM11.5 4.5 20.5 12l-9 7.5ZM19.5 4.5h2.5v15h-2.5Z" />
    </Svg>
  );
}

export function GearIcon() {
  return (
    <Svg>
      <path
        d="M10.3 1.5h3.4l.6 2.9c.8.3 1.5.7 2.2 1.2l2.8-.9 1.7 2.9-2.2 2c.1.8.1 1.6 0 2.4l2.2 2-1.7 2.9-2.8-.9c-.7.5-1.4.9-2.2 1.2l-.6 2.9h-3.4l-.6-2.9c-.8-.3-1.5-.7-2.2-1.2l-2.8.9-1.7-2.9 2.2-2a9 9 0 0 1 0-2.4l-2.2-2 1.7-2.9 2.8.9c.7-.5 1.4-.9 2.2-1.2ZM12 8.3a3.7 3.7 0 1 0 0 7.4 3.7 3.7 0 0 0 0-7.4Z"
        fillRule="evenodd"
      />
    </Svg>
  );
}

export function SpeakerIcon({ muted }: { muted: boolean }) {
  return (
    <Svg>
      <path d={SPEAKER} />
      {muted ? (
        <path d="m15.2 8.6 1.4-1.4 2.4 2.4 2.4-2.4 1.4 1.4-2.4 2.4 2.4 2.4-1.4 1.4-2.4-2.4-2.4 2.4-1.4-1.4 2.4-2.4Z" />
      ) : (
        <path d="M15 8.2a5 5 0 0 1 0 7.6l-1.3-1.5a3 3 0 0 0 0-4.6ZM17.6 5.2a9 9 0 0 1 0 13.6l-1.3-1.5a7 7 0 0 0 0-10.6Z" />
      )}
    </Svg>
  );
}

export function MusicIcon() {
  return (
    <Svg>
      <path d="M9 4.5 20 2v13.6a3.4 3.4 0 1 1-2-3.1V6.6l-7 1.6v9.4a3.4 3.4 0 1 1-2-3.1Z" />
    </Svg>
  );
}

export function EffectsIcon() {
  return (
    <Svg>
      <path d={SWORD} />
    </Svg>
  );
}

export function DisplayIcon() {
  return (
    <Svg>
      <path
        d="M3.5 4h17A1.5 1.5 0 0 1 22 5.5v10a1.5 1.5 0 0 1-1.5 1.5H3.5A1.5 1.5 0 0 1 2 15.5v-10A1.5 1.5 0 0 1 3.5 4Zm.5 2v9h16V6Z"
        fillRule="evenodd"
      />
      <path d="M9.5 18h5l.8 2H18v1.5H6V20h2.7Z" />
    </Svg>
  );
}

export function ShadowIcon() {
  return (
    <Svg>
      <circle cx={12} cy={8.5} r={5.5} />
      <path d="M3.5 19.5c0-1.5 3.8-2.7 8.5-2.7s8.5 1.2 8.5 2.7-3.8 2.7-8.5 2.7-8.5-1.2-8.5-2.7Z" />
    </Svg>
  );
}

export function GlowIcon() {
  return (
    <Svg>
      <path d={SUN} />
    </Svg>
  );
}

export function CameraIcon() {
  return (
    <Svg>
      <path
        d="M4 7h3.2l1.6-2.2h6.4L16.8 7H20a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 20 19H4a1.5 1.5 0 0 1-1.5-1.5v-9A1.5 1.5 0 0 1 4 7Zm8 2.4a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 1 0 0-7.2Z"
        fillRule="evenodd"
      />
      <circle cx={12} cy={13} r={1.8} />
    </Svg>
  );
}

export function GaugeIcon() {
  return (
    <Svg>
      <path d="M12 4.5A10 10 0 0 0 3.3 19.4l1.7-1A8 8 0 0 1 4 14.5a8 8 0 0 1 16 0 8 8 0 0 1-1 3.9l1.7 1A10 10 0 0 0 12 4.5Z" />
      <path d="M16.9 9.2 13.5 14a1.9 1.9 0 1 1-1.4-1.4Z" />
    </Svg>
  );
}

export function CloseIcon() {
  return (
    <Svg>
      <path d="M5.6 3.5 12 9.9l6.4-6.4 2.1 2.1-6.4 6.4 6.4 6.4-2.1 2.1-6.4-6.4-6.4 6.4-2.1-2.1 6.4-6.4-6.4-6.4Z" />
    </Svg>
  );
}
