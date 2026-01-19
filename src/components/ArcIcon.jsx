import React from "react";

export default function ArcIcon({ icon: Icon, size = 24, className = "", title }) {
  if (!Icon) return null;
  return (
    <span className={className} aria-hidden={title ? undefined : true} title={title}>
      <Icon width={size} height={size} aria-hidden={title ? undefined : true} />
      {title ? <span className="sr-only">{title}</span> : null}
    </span>
  );
}
