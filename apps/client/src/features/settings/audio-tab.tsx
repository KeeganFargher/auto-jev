import { useAudio, useAudioSettings } from "../../hooks/use-audio.js";
import { VOLUME_CHANNELS, type VolumeChannel } from "../../audio/settings.js";
import { EffectsIcon, MusicIcon, SpeakerIcon } from "../../ui/icons/icons.js";

const CHANNEL_LABELS: Readonly<Record<VolumeChannel, string>> = {
  master: "Master",
  music: "Music",
  sfx: "Effects",
};

function ChannelIcon({ channel }: { channel: Exclude<VolumeChannel, "master"> }) {
  switch (channel) {
    case "music":
      return <MusicIcon />;

    case "sfx":
      return <EffectsIcon />;
  }
}

function VolumeRow({ channel }: { channel: VolumeChannel }) {
  const settings = useAudioSettings();
  const store = useAudio().settings;
  const percent = Math.round(settings.volumes[channel] * 100);

  return (
    <div className="settings-row">
      {channel === "master" ? (
        <button
          type="button"
          className="settings-mute"
          aria-label={settings.muted ? "Unmute" : "Mute"}
          aria-pressed={settings.muted}
          onClick={() => store.setMuted(!settings.muted)}
        >
          <SpeakerIcon muted={settings.muted} />
        </button>
      ) : (
        <span className="settings-channel-icon">
          <ChannelIcon channel={channel} />
        </span>
      )}
      <span className="settings-channel-name">{CHANNEL_LABELS[channel]}</span>
      <input
        type="range"
        className="settings-slider"
        min={0}
        max={100}
        step={1}
        value={percent}
        aria-label={`${CHANNEL_LABELS[channel]} volume`}
        style={{ "--fill": `${percent}%` }}
        onChange={(event) => store.setVolume(channel, Number(event.target.value) / 100)}
      />
      <span className="settings-readout">{percent}</span>
    </div>
  );
}

export function AudioTab() {
  const settings = useAudioSettings();

  return (
    <div className={settings.muted ? "settings-audio is-muted" : "settings-audio"}>
      {VOLUME_CHANNELS.map((channel) => (
        <VolumeRow key={channel} channel={channel} />
      ))}
    </div>
  );
}
