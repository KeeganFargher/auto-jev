import type { ReactNode } from "react";
import { parseRichText } from "./rich-text.js";

export function RichText({ text }: { text: string }) {
  return parseRichText(text).map((part, index) => {
    switch (part.kind) {
      case "text":
        return part.text;

      case "number":
        return (
          <b key={index} className="tip-num">
            {part.text}
          </b>
        );

      case "status":
        return (
          <span key={index} className="tip-key" data-status={part.status}>
            {part.text}
          </span>
        );
    }
  });
}

export function TipCard({
  icon,
  accent,
  title,
  subtitle,
  tag,
  dataRole,
  dataMetric,
  children,
}: {
  icon?: ReactNode;
  accent?: string;
  title: string;
  subtitle?: ReactNode;
  tag?: string;
  dataRole?: string;
  dataMetric?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className="tip-card"
      style={accent === undefined ? undefined : { "--tip-accent": accent }}
      data-role={dataRole}
      data-metric={dataMetric}
    >
      <div className="tip-head">
        {icon === undefined ? null : <span className="tip-icon">{icon}</span>}
        <div className="tip-heading">
          <div className="tip-title">{title}</div>
          {subtitle === undefined ? null : <div className="tip-subtitle">{subtitle}</div>}
        </div>
        {tag === undefined ? null : <span className="tip-tag">{tag}</span>}
      </div>
      {children}
    </div>
  );
}

export function TipSection({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div className="tip-section">
      {label === undefined ? null : <div className="tip-label">{label}</div>}
      {children}
    </div>
  );
}

export function TipText({ text }: { text: string }) {
  return (
    <p className="tip-text">
      <RichText text={text} />
    </p>
  );
}

export function TipHint({ text }: { text: string }) {
  return <p className="tip-hint">{text}</p>;
}
