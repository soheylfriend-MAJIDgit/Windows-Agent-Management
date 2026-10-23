"use client";

import { useMemo, useState } from "react";
import { highlightPython } from "@/lib/highlight";
import { faBytes, faLines } from "@/lib/format";
import { toPersianDigits } from "@/lib/jalali";
import { CopyButton } from "./ui";
import { Icon } from "./icons";

export function CodeViewer({
  content,
  fileName,
  downloadHref,
  compact = false,
}: {
  content: string;
  fileName: string;
  downloadHref?: string;
  compact?: boolean;
}) {
  const [wrapped, setWrapped] = useState(false);
  const lines = useMemo(() => highlightPython(content), [content]);
  const size = useMemo(() => new TextEncoder().encode(content).length, [content]);

  return (
    <div className={`code-shell ${wrapped ? "is-wrapped" : ""}`}>
      <div className="console-label">
        <span className="mono" dir="ltr">
          {fileName}
        </span>
        <span className="row" style={{ gap: 4 }}>
          <CopyButton text={content} />
          <button type="button" className="btn btn-small btn-ghost" onClick={() => setWrapped((v) => !v)}>
            <Icon name={wrapped ? "terminal" : "code"} size={13} />
            {wrapped ? "بدون شکستن" : "شکستن خطوط"}
          </button>
          {downloadHref ? (
            <a className="btn btn-small btn-ghost" href={downloadHref}>
              <Icon name="download" size={13} />
              دانلود
            </a>
          ) : null}
        </span>
      </div>
      <div className="code-scroll" style={compact ? { maxHeight: 300 } : undefined}>
        <pre className="code-pre" aria-label={`کد ${fileName}`}>
          {lines.map((line, index) => (
            <span className="code-line" key={index}>
              <span className="code-ln" aria-hidden="true">
                {toPersianDigits(index + 1)}
              </span>
              <span className="code-src">
                {line.map((token, tokenIndex) => (
                  <span key={tokenIndex} className={token.cls}>
                    {token.text}
                  </span>
                ))}
              </span>
            </span>
          ))}
        </pre>
      </div>
      <div className="code-foot">
        <span>
          {faLines(lines.length)} · {faBytes(size)}
        </span>
        <span className="mono" dir="ltr" style={{ opacity: 0.7 }}>
          python 3.9+
        </span>
      </div>
    </div>
  );
}
