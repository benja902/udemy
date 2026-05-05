"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type RequestState = {
  loading: boolean;
  message: string | null;
  error: string | null;
};

const initialState: RequestState = {
  loading: false,
  message: null,
  error: null,
};

async function postJson(url: string, payload?: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: payload ? JSON.stringify(payload) : undefined,
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "No se pudo completar la acción.");
  }

  return data;
}

export function DashboardActions() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [state, setState] = useState<RequestState>(initialState);

  async function runCheck() {
    setState({ loading: true, message: "Revisión en curso...", error: null });

    try {
      const summary = await postJson("/api/check");
      setState({
        loading: false,
        message: `Revisión lista: ${summary.checkedCourses} cursos, ${summary.alertsCreated} alertas.`,
        error: null,
      });
      startTransition(() => router.refresh());
    } catch (error) {
      setState({
        loading: false,
        message: null,
        error: error instanceof Error ? error.message : "Error desconocido",
      });
    }
  }

  async function addCourse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);

    try {
      await postJson("/api/courses", {
        title: form.get("title"),
        udemy_url: form.get("udemy_url"),
        instructor_name: form.get("instructor_name"),
      });
      formElement.reset();
      startTransition(() => router.refresh());
    } catch (error) {
      setState({
        loading: false,
        message: null,
        error: error instanceof Error ? error.message : "Error desconocido",
      });
    }
  }

  async function addSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);

    try {
      await postJson("/api/sources", {
        name: form.get("name"),
        source_url: form.get("source_url"),
        coupon_selector: form.get("coupon_selector"),
        coupon_regex: form.get("coupon_regex"),
      });
      formElement.reset();
      startTransition(() => router.refresh());
    } catch (error) {
      setState({
        loading: false,
        message: null,
        error: error instanceof Error ? error.message : "Error desconocido",
      });
    }
  }

  return (
    <section className="grid gap-4 lg:grid-cols-[1fr_1fr_220px]">
      <form
        onSubmit={addCourse}
        className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm"
      >
        <h2 className="text-sm font-semibold text-zinc-950">Agregar curso</h2>
        <div className="mt-3 grid gap-3">
          <input
            name="title"
            required
            placeholder="Título del curso"
            className="h-10 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
          />
          <input
            name="udemy_url"
            required
            type="url"
            placeholder="https://www.udemy.com/course/..."
            className="h-10 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
          />
          <input
            name="instructor_name"
            placeholder="Profesor"
            className="h-10 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
          />
          <button className="h-10 rounded-md bg-zinc-950 px-4 text-sm font-medium text-white">
            Guardar curso
          </button>
        </div>
      </form>

      <form
        onSubmit={addSource}
        className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm"
      >
        <h2 className="text-sm font-semibold text-zinc-950">Agregar fuente</h2>
        <div className="mt-3 grid gap-3">
          <input
            name="name"
            required
            placeholder="Nombre de la página del profesor"
            className="h-10 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
          />
          <input
            name="source_url"
            required
            type="url"
            placeholder="https://..."
            className="h-10 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
          />
          <input
            name="coupon_selector"
            placeholder="Selector CSS opcional"
            className="h-10 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
          />
          <input
            name="coupon_regex"
            placeholder="Regex opcional"
            className="h-10 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
          />
          <button className="h-10 rounded-md bg-zinc-950 px-4 text-sm font-medium text-white">
            Guardar fuente
          </button>
        </div>
      </form>

      <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-950">Revisión</h2>
        <button
          type="button"
          onClick={runCheck}
          disabled={state.loading || isPending}
          className="mt-3 h-10 w-full rounded-md bg-emerald-600 px-4 text-sm font-medium text-white disabled:cursor-wait disabled:bg-emerald-300"
        >
          Revisar ahora
        </button>
        {state.message ? <p className="mt-3 text-sm text-emerald-700">{state.message}</p> : null}
        {state.error ? <p className="mt-3 text-sm text-red-700">{state.error}</p> : null}
      </div>
    </section>
  );
}
