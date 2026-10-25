"use client";

import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useEffect, useRef, useState, useTransition } from "react";

type FilterOption = {
  value: string;
  label: string;
};

type FilterField =
  | {
      type: "search";
      name: string;
      label: string;
      value: string;
      placeholder: string;
      className?: string;
      defaultValue?: string;
    }
  | {
      type: "select";
      name: string;
      label: string;
      value: string;
      options: FilterOption[];
      className?: string;
      defaultValue?: string;
    };

type FilterValues = Record<string, string>;

export function AutoFilterForm({
  fields,
  className,
  clearClassName,
  clearLabel = "Limpar filtros",
  debounceMs = 400,
}: {
  fields: FilterField[];
  className?: string;
  clearClassName?: string;
  clearLabel?: string;
  debounceMs?: number;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [values, setValues] = useState<FilterValues>(() =>
    Object.fromEntries(fields.map((field) => [field.name, field.value])),
  );
  const [isPending, startTransition] = useTransition();

  useEffect(() => () => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
  }, []);

  const queryFor = (nextValues: FilterValues) => {
    const query = new URLSearchParams();
    for (const field of fields) {
      const value = (nextValues[field.name] ?? "").trim();
      const defaultValue = field.defaultValue ?? (field.type === "select" ? "all" : "");
      if (!value || value === defaultValue) continue;
      query.set(field.name, value);
    }
    return query.toString();
  };

  const navigate = (nextValues: FilterValues) => {
    const nextQuery = queryFor(nextValues);
    if (nextQuery === searchParams.toString()) return;
    const href = nextQuery ? `${pathname}?${nextQuery}` : pathname;
    startTransition(() => router.replace(href, { scroll: false }));
  };

  const changeSelect = (name: string, value: string) => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    const nextValues = { ...values, [name]: value };
    setValues(nextValues);
    navigate(nextValues);
  };

  const changeSearch = (name: string, value: string) => {
    const nextValues = { ...values, [name]: value };
    setValues(nextValues);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => navigate(nextValues), debounceMs);
  };

  const clearFilters = () => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    const nextValues = Object.fromEntries(
      fields.map((field) => [
        field.name,
        field.defaultValue ?? (field.type === "select" ? "all" : ""),
      ]),
    );
    setValues(nextValues);
    navigate(nextValues);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    navigate(values);
  };

  const hasActiveFilters = fields.some((field) => {
    const value = (values[field.name] ?? "").trim();
    const defaultValue = field.defaultValue ?? (field.type === "select" ? "all" : "");
    return Boolean(value && value !== defaultValue);
  });

  return (
    <form className={className} method="get" aria-busy={isPending} onSubmit={handleSubmit}>
      {fields.map((field) => (
        <label className={field.className} key={field.name}>
          <span>{field.label}</span>
          {field.type === "search" ? (
            <div>
              <Search size={16} />
              <input
                name={field.name}
                type="search"
                value={values[field.name] ?? ""}
                placeholder={field.placeholder}
                onChange={(event) => changeSearch(field.name, event.target.value)}
              />
            </div>
          ) : (
            <select
              name={field.name}
              value={values[field.name] ?? field.defaultValue ?? "all"}
              onChange={(event) => changeSelect(field.name, event.target.value)}
            >
              {field.options.map((option) => (
                <option value={option.value} key={option.value}>{option.label}</option>
              ))}
            </select>
          )}
        </label>
      ))}

      {hasActiveFilters && (
        <button
          className={`button button-secondary${clearClassName ? ` ${clearClassName}` : ""}`}
          type="button"
          onClick={clearFilters}
        >
          <X size={15} />{clearLabel}
        </button>
      )}
    </form>
  );
}
