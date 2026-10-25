"use client";

import { useEffect, useMemo, useState } from "react";
import { CommandMonitorModal } from "@/components/CommandMonitorModal";
import { Icon } from "@/components/icons";
import { Banner, ErrorBanner, LoadingState, PageHeader } from "@/components/ui";
import { useToast } from "@/components/ToastProvider";
import { ApiRequestError, postJson, useApi } from "@/hooks/useApi";

interface ServiceField {
  name: string;
  label: string;
  type: "url" | "number" | "textarea" | "checkbox";
  required?: boolean;
  min?: number;
  max?: number;
  defaultValue?: string | number | boolean;
  helper?: string;
}

interface ServiceDefinition {
  slug: string;
  title: string;
  summary: string;
  category: string;
  caution: string;
  fields: ServiceField[];
}

type InputState = Record<string, string | number | boolean>;
type PromptInputMode = "cells" | "text";

function defaults(service: ServiceDefinition): InputState {
  return Object.fromEntries(service.fields.map((field) => [field.name, field.defaultValue ?? (field.type === "checkbox" ? false : "")]));
}

function parsePromptBlocks(value: InputState[string]): string[] {
  return String(value ?? "")
    .split(/\r?\n[\t ]*---[\t ]*(?=\r?\n|$)/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function promptBlockCount(value: InputState[string]): number {
  return parsePromptBlocks(value).length;
}

function serializePromptBlocks(blocks: string[]): string {
  return blocks.join("\n---\n");
}

export default function ServicesPage() {
  const servicesApi = useApi<{ services: ServiceDefinition[] }>("/api/services");
  const notify = useToast();
  const [selected, setSelected] = useState<ServiceDefinition | null>(null);
  const [input, setInput] = useState<InputState>({});
  const [promptInputMode, setPromptInputMode] = useState<PromptInputMode>("cells");
  const [promptCells, setPromptCells] = useState<string[]>([""]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<ApiRequestError | null>(null);
  const [activeCommandId, setActiveCommandId] = useState<string | null>(null);

  const services = useMemo(() => servicesApi.data?.services ?? [], [servicesApi.data]);
  const promptCount = useMemo(() => promptBlockCount(input.prompts), [input.prompts]);

  useEffect(() => {
    if (!selected) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitting) setSelected(null);
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [selected, submitting]);

  function openService(service: ServiceDefinition) {
    setSelected(service);
    setInput(defaults(service));
    setPromptInputMode("cells");
    setPromptCells([""]);
    setSubmitError(null);
  }

  function changePromptMode(mode: PromptInputMode) {
    if (mode === "cells") {
      const parsed = parsePromptBlocks(input.prompts);
      setPromptCells(parsed.length ? parsed : [""]);
    }
    setPromptInputMode(mode);
  }

  function updatePromptCell(index: number, value: string) {
    const next = [...promptCells];
    next[index] = value;
    setPromptCells(next);
    setInput((fields) => ({ ...fields, prompts: serializePromptBlocks(next) }));
  }

  function addPromptCell() {
    if (promptCells.length >= 20) return;
    const next = [...promptCells, ""];
    setPromptCells(next);
    setInput((fields) => ({ ...fields, prompts: serializePromptBlocks(next) }));
  }

  function removePromptCell(index: number) {
    const next = promptCells.length === 1 ? [""] : promptCells.filter((_, itemIndex) => itemIndex !== index);
    setPromptCells(next);
    setInput((fields) => ({ ...fields, prompts: serializePromptBlocks(next) }));
  }

  async function runService(event: React.FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await postJson<{ commandId: string; version: number }>(
        `/api/services/${encodeURIComponent(selected.slug)}/run`,
        { input },
      );
      setSelected(null);
      setActiveCommandId(result.commandId);
      notify.ok(`نسخه ${result.version} سرویس در D1 ثبت شد و اجرای ویندوز آغاز شد.`);
    } catch (error) {
      const parsed = error instanceof ApiRequestError ? error : new ApiRequestError("اجرای سرویس ممکن نشد.");
      setSubmitError(parsed);
      notify.error(parsed.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="اجرای تعاملی"
        title="سرویس‌ها"
        subtitle="هر سرویس یک فرم محدود و مشخص دارد؛ پس از ثبت ورودی‌ها، نسخه immutable در D1 ساخته و با پایش زنده روی Windows Agent اجرا می‌شود."
      />

      <Banner tone="info" title="تفاوت سرویس با کد اتوماسیون">
        کدهای اتوماسیون منبع مستقیم Python را نشان می‌دهند؛ سرویس‌ها ورودی می‌گیرند، کد امن همان اجرا را تولید می‌کنند و مرکز فرمان ویندوز را باز می‌کنند.
      </Banner>

      {servicesApi.loading && !servicesApi.data ? <LoadingState label="در حال دریافت سرویس‌ها…" /> : null}
      {servicesApi.error ? <ErrorBanner error={servicesApi.error} onRetry={() => void servicesApi.reload()} /> : null}

      <div className="service-grid">
        {services.map((service, index) => (
          <article className="service-card" key={service.slug}>
            <div className="service-card-top">
              <span className="service-number">{index + 1}</span>
              <span className="status-chip is-ok"><span className="dot" />{service.category}</span>
            </div>
            <div>
              <h2>{service.title}</h2>
              <p>{service.summary}</p>
            </div>
            <div className="service-input-count">
              <Icon name="settings" size={14} />
              {service.fields.length} ورودی تعاملی
            </div>
            <button type="button" className="btn btn-primary" onClick={() => openService(service)}>
              <Icon name="play" size={14} />
              تنظیم و اجرا
            </button>
          </article>
        ))}
      </div>

      {selected ? (
        <div className="command-modal-backdrop" role="presentation">
          <section className="command-modal service-config-modal" role="dialog" aria-modal="true" aria-labelledby="service-config-title">
            <header className="command-modal-head">
              <div>
                <span className="eyebrow">تنظیم سرویس</span>
                <h2 id="service-config-title">{selected.title}</h2>
                <p>{selected.summary}</p>
              </div>
              <button className="command-close" type="button" onClick={() => !submitting && setSelected(null)} aria-label="بستن">×</button>
            </header>

            <form onSubmit={runService}>
              <div className="service-modal-body">
                <Banner tone="warn" title="پیش از اجرا">{selected.caution}</Banner>
                <ErrorBanner error={submitError} />

                {selected.fields
                  .filter((field) => field.name !== "unrecoverableAcceptance" || Boolean(input.networkAcceptance))
                  .map((field) => (
                  <div className="field" key={field.name}>
                    {field.type === "checkbox" ? (
                      <div>
                        <label className="service-checkbox">
                          <input
                            type="checkbox"
                            checked={Boolean(input[field.name])}
                            required={field.required}
                            onChange={(event) => {
                              const checked = event.target.checked;
                              setInput((current) => ({
                                ...current,
                                [field.name]: checked,
                                ...(field.name === "networkAcceptance" && !checked ? { unrecoverableAcceptance: false } : {}),
                              }));
                            }}
                          />
                          <span>{field.label}</span>
                        </label>
                        {field.helper ? <span className="field-helper">{field.helper}</span> : null}
                      </div>
                    ) : (
                      <>
                        <div className="service-field-heading">
                          <label className="field-label" htmlFor={`service-${field.name}`}>{field.label}</label>
                          {field.name === "prompts" ? (
                            <div className="prompt-mode-toggle" role="group" aria-label="نحوه نمایش فهرست پرامپت‌ها">
                              <button
                                type="button"
                                className={promptInputMode === "cells" ? "active" : ""}
                                aria-pressed={promptInputMode === "cells"}
                                onClick={() => changePromptMode("cells")}
                              >
                                سلولی
                              </button>
                              <button
                                type="button"
                                className={promptInputMode === "text" ? "active" : ""}
                                aria-pressed={promptInputMode === "text"}
                                onClick={() => changePromptMode("text")}
                              >
                                متنی
                              </button>
                            </div>
                          ) : null}
                        </div>
                        {field.type === "textarea" && field.name === "prompts" && promptInputMode === "cells" ? (
                          <div className="prompt-cell-list" id={`service-${field.name}`}>
                            {promptCells.map((prompt, index) => (
                              <article className="prompt-cell" key={index}>
                                <div className="prompt-cell-head">
                                  <strong>پرامپت {index + 1}</strong>
                                  <button
                                    type="button"
                                    className="prompt-cell-remove"
                                    onClick={() => removePromptCell(index)}
                                    aria-label={`حذف پرامپت ${index + 1}`}
                                    disabled={promptCells.length === 1 && !prompt}
                                  >
                                    حذف
                                  </button>
                                </div>
                                <textarea
                                  className="textarea service-prompt-cell-input"
                                  value={prompt}
                                  required={field.required}
                                  placeholder={`متن پرامپت ${index + 1}`}
                                  onChange={(event) => updatePromptCell(index, event.target.value)}
                                />
                              </article>
                            ))}
                            <button
                              type="button"
                              className="button secondary prompt-cell-add"
                              onClick={addPromptCell}
                              disabled={promptCells.length >= 20}
                            >
                              + افزودن پرامپت
                            </button>
                          </div>
                        ) : field.type === "textarea" ? (
                          <textarea
                            id={`service-${field.name}`}
                            className="textarea service-prompts"
                            value={String(input[field.name] ?? "")}
                            required={field.required}
                            placeholder={field.name === "prompts" ? "پرامپت اول (می‌تواند چندخطی باشد)\n---\nپرامپت دوم" : undefined}
                            onChange={(event) => setInput((current) => ({ ...current, [field.name]: event.target.value }))}
                          />
                        ) : (
                          <input
                            id={`service-${field.name}`}
                            className="input"
                            type={field.type}
                            value={String(input[field.name] ?? "")}
                            required={field.required}
                            min={field.min}
                            max={field.max}
                            step={field.type === "number" ? 1 : undefined}
                            dir={field.type === "url" ? "ltr" : undefined}
                            onChange={(event) => setInput((current) => ({
                              ...current,
                              [field.name]: field.type === "number" ? Number(event.target.value) : event.target.value,
                            }))}
                          />
                        )}
                        {field.helper ? <span className="field-helper">{field.helper}</span> : null}
                        {field.name === "prompts" ? (
                          <span className="field-helper" aria-live="polite">
                            {promptCount.toLocaleString("fa-IR")} پرامپت × {Number(input.rounds || 0).toLocaleString("fa-IR")} دور = {(promptCount * Number(input.rounds || 0)).toLocaleString("fa-IR")} اجرا
                          </span>
                        ) : null}
                      </>
                    )}
                  </div>
                ))}
              </div>

              <footer className="command-modal-actions">
                <button type="button" className="button" disabled={submitting} onClick={() => setSelected(null)}>انصراف</button>
                <button type="submit" className="button primary" disabled={submitting}>
                  {submitting ? <span className="spinner" /> : <Icon name="play" size={14} />}
                  ثبت نسخه و اجرا
                </button>
              </footer>
            </form>
          </section>
        </div>
      ) : null}

      {activeCommandId ? <CommandMonitorModal commandId={activeCommandId} onClose={() => setActiveCommandId(null)} /> : null}
    </>
  );
}
