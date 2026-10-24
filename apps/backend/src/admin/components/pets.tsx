import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  PET_ORIGINS,
  PET_SEX,
  PET_SPECIES,
  PET_YES_NO,
  petAgeLabel,
  SPECIES_LABEL,
  type PetSpecies,
} from "../../lib/pets";

/**
 * Mascotas de un cliente en el Admin (Fase M): lista y, con `editable`, alta, edición, foto y
 * borrado (para los clientes que no sepan hacerlo). Rutas /admin/customers/:id/pets* con la sesión
 * del Admin (`credentials: "include"`). Sin @medusajs/ui (no es dependencia directa): HTML +
 * clases del dashboard, como el widget de puntos.
 * Foto: se reduce aquí (canvas → WebP 800 px); al redibujarla se pierden los metadatos (GPS).
 */
export type Pet = {
  id: string;
  name: string;
  species: PetSpecies;
  species_other: string | null;
  breed: string | null;
  birth_year: number | null;
  birth_month: number | null;
  birth_day: number | null;
  death_year: number | null;
  death_month: number | null;
  death_day: number | null;
  sex: string | null;
  neutered: string | null;
  weight_kg: number | null;
  diet: string | null;
  origin: string | null;
  health: string | null;
  health_consent_at: string | null;
  photo_url: string | null;
  photo_consent_at: string | null;
};

const SEX: Record<string, string> = { macho: "Macho", hembra: "Hembra", desconocido: "No se sabe" };
const YES_NO: Record<string, string> = { si: "Sí", no: "No", desconocido: "No se sabe" };
const ORIGIN: Record<string, string> = {
  adoptado: "Adoptado (protectora)",
  rescatado: "Rescatado / encontrado",
  criador: "Criador",
  tienda: "Tienda",
  familia: "Familia / regalo",
  otro: "Otro",
};
const MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

const dateLabel = (y: number | null, m: number | null, d: number | null) =>
  y == null ? null : [d, m ? MONTHS[m - 1] : null, y].filter((x) => x != null).join(" de ");

const input = "rounded-md border border-ui-border-base bg-ui-bg-field px-2 py-1 text-sm";
const button =
  "bg-ui-button-inverted text-ui-fg-on-inverted rounded-md px-3 py-1.5 text-sm disabled:opacity-50";
const secondary = "rounded-md border border-ui-border-base px-3 py-1.5 text-sm disabled:opacity-50";

async function api(url: string, init?: RequestInit) {
  const r = await fetch(url, {
    credentials: "include",
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((json as { message?: string }).message ?? `Error ${r.status}`);
  return json;
}

/** Imagen → WebP de 800 px como máximo, en base64 (sin metadatos: el canvas no los copia). */
async function toWebpBase64(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, 800 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/webp", 0.82));
  if (!blob || blob.type !== "image/webp") throw new Error("El navegador no genera WebP");
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

const num = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "")
    .trim()
    .replace(",", ".");
  return s ? Number(s) : null;
};
const str = (v: FormDataEntryValue | null) => String(v ?? "").trim() || null;

function bodyFrom(form: FormData) {
  return {
    name: String(form.get("name") ?? "").trim(),
    species: form.get("species"),
    species_other: str(form.get("species_other")),
    breed: str(form.get("breed")),
    birth_year: num(form.get("birth_year")),
    birth_month: num(form.get("birth_month")),
    birth_day: num(form.get("birth_day")),
    death_year: num(form.get("death_year")),
    death_month: num(form.get("death_month")),
    death_day: num(form.get("death_day")),
    sex: str(form.get("sex")),
    neutered: str(form.get("neutered")),
    weight_kg: num(form.get("weight_kg")),
    diet: str(form.get("diet")),
    origin: str(form.get("origin")),
    health: str(form.get("health")),
    health_consent: form.get("health_consent") === "on",
  };
}

function DateFields({
  prefix,
  label,
  pet,
}: {
  prefix: "birth" | "death";
  label: string;
  pet: Pet | null;
}) {
  const v = (k: "year" | "month" | "day") => pet?.[`${prefix}_${k}`] ?? "";
  return (
    <fieldset className="flex flex-wrap items-end gap-2">
      <legend className="mb-1 text-sm">{label}</legend>
      <label className="flex flex-col gap-1 text-xs">
        Día (opcional)
        <input
          name={`${prefix}_day`}
          inputMode="numeric"
          pattern="[0-9]{1,2}"
          defaultValue={v("day")}
          className={`${input} w-16`}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        Mes
        <select name={`${prefix}_month`} defaultValue={v("month")} className={input}>
          <option value="">—</option>
          {MONTHS.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs">
        Año
        <input
          name={`${prefix}_year`}
          inputMode="numeric"
          pattern="[0-9]{4}"
          defaultValue={v("year")}
          className={`${input} w-20`}
        />
      </label>
    </fieldset>
  );
}

function Select({
  name,
  label,
  options,
  value,
}: {
  name: string;
  label: string;
  options: Record<string, string>;
  value: string | null | undefined;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      {label}
      <select name={name} defaultValue={value ?? ""} className={input}>
        <option value="">—</option>
        {Object.entries(options).map(([k, l]) => (
          <option key={k} value={k}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

function PetForm({
  url,
  pet,
  onDone,
}: {
  url: string;
  pet: Pet | null;
  onDone: (msg?: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const body = bodyFrom(form);
      const saved = (await api(pet ? `${url}/${pet.id}` : url, {
        method: "POST",
        body: JSON.stringify(body),
      })) as { pet: Pet };
      const file = form.get("photo");
      if (file instanceof File && file.size > 0) {
        if (form.get("photo_consent") !== "on") {
          throw new Error(
            "Datos guardados. La foto no: marca que el cliente acepta que sea pública.",
          );
        }
        await api(`${url}/${saved.pet.id}/photo`, {
          method: "POST",
          body: JSON.stringify({ content: await toWebpBase64(file), consent: true }),
        });
      } else if (pet?.photo_url && form.get("photo_remove") === "on") {
        await api(`${url}/${pet.id}/photo`, { method: "DELETE" });
      }
      onDone("Guardado.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const species = Object.fromEntries(PET_SPECIES.map((s) => [s, SPECIES_LABEL[s]]));
  return (
    <form onSubmit={submit} className="flex flex-col gap-3 px-6 py-4">
      {error && <p className="text-ui-fg-error text-sm">{error}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          Nombre *
          <input
            name="name"
            required
            maxLength={60}
            defaultValue={pet?.name ?? ""}
            className={input}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Tipo de animal *
          <select name="species" required defaultValue={pet?.species ?? "perro"} className={input}>
            {Object.entries(species).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Si es «Otro», ¿cuál?
          <input
            name="species_other"
            maxLength={40}
            defaultValue={pet?.species_other ?? ""}
            className={input}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Raza o mezcla
          <input name="breed" maxLength={120} defaultValue={pet?.breed ?? ""} className={input} />
        </label>
        <Select name="sex" label="Sexo" options={pick(SEX, PET_SEX)} value={pet?.sex} />
        <Select
          name="neutered"
          label="Esterilizado"
          options={pick(YES_NO, PET_YES_NO)}
          value={pet?.neutered}
        />
        <label className="flex flex-col gap-1 text-sm">
          Peso aproximado (kg)
          <input
            name="weight_kg"
            inputMode="decimal"
            pattern="[0-9]{1,3}([.,][0-9])?"
            defaultValue={pet?.weight_kg ?? ""}
            className={input}
          />
        </label>
        <Select
          name="origin"
          label="Procedencia"
          options={pick(ORIGIN, PET_ORIGINS)}
          value={pet?.origin}
        />
      </div>
      <DateFields prefix="birth" label="Nacimiento (aproximado)" pet={pet} />
      <DateFields prefix="death" label="Fallecimiento" pet={pet} />
      <label className="flex flex-col gap-1 text-sm">
        Alimentación actual
        <input name="diet" maxLength={200} defaultValue={pet?.diet ?? ""} className={input} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Salud (enfermedades, alergias, intolerancias)
        <textarea
          name="health"
          maxLength={500}
          rows={2}
          defaultValue={pet?.health ?? ""}
          className={input}
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="health_consent"
          defaultChecked={Boolean(pet?.health_consent_at)}
        />
        El cliente ha autorizado guardar la información de salud
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Foto (se reduce a 800 px y se le quitan los metadatos)
        <input type="file" name="photo" accept="image/*" className="text-sm" />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="photo_consent" />
        El cliente acepta que la foto sea pública
      </label>
      {pet?.photo_url && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="photo_remove" />
          Quitar la foto actual
        </label>
      )}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className={button}>
          {pet ? "Guardar" : "Añadir"}
        </button>
        <button type="button" disabled={busy} className={secondary} onClick={() => onDone()}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

function pick(labels: Record<string, string>, keys: readonly string[]) {
  return Object.fromEntries(keys.map((k) => [k, labels[k] ?? k]));
}

function PetCard({ pet }: { pet: Pet }) {
  const birth = { year: pet.birth_year, month: pet.birth_month, day: pet.birth_day };
  const death = { year: pet.death_year, month: pet.death_month, day: pet.death_day };
  const gone = pet.death_year != null;
  const age = gone ? null : petAgeLabel(birth);
  const species =
    pet.species === "otro" && pet.species_other ? pet.species_other : SPECIES_LABEL[pet.species];
  const facts = [
    species,
    pet.breed,
    age ? `${age} (aprox.)` : null,
    pet.sex ? SEX[pet.sex] : null,
    pet.neutered && pet.neutered !== "desconocido"
      ? pet.neutered === "si"
        ? "esterilizado"
        : "sin esterilizar"
      : null,
    pet.weight_kg != null ? `${String(pet.weight_kg).replace(".", ",")} kg` : null,
    pet.origin ? ORIGIN[pet.origin] : null,
  ].filter(Boolean);
  return (
    <div className={`flex gap-3 ${gone ? "opacity-60 grayscale" : ""}`}>
      {pet.photo_url ? (
        <img
          src={pet.photo_url}
          alt=""
          className="border-ui-border-base h-14 w-14 shrink-0 rounded-md border object-cover"
        />
      ) : (
        <div className="bg-ui-bg-subtle h-14 w-14 shrink-0 rounded-md" />
      )}
      <div className="flex flex-col text-sm">
        <span className="font-medium">
          {pet.name}
          {gone && (
            <span className="text-ui-fg-subtle font-normal">
              {" "}
              · fallecido/a ({dateLabel(death.year, death.month, death.day)})
            </span>
          )}
        </span>
        <span className="text-ui-fg-subtle">{facts.join(" · ")}</span>
        {pet.diet && <span className="text-ui-fg-subtle">Come: {pet.diet}</span>}
        {pet.health && <span className="text-ui-fg-error">Salud: {pet.health}</span>}
      </div>
    </div>
  );
}

export function CustomerPets({
  customerId,
  editable,
  title = "Mascotas",
}: {
  customerId: string;
  editable: boolean;
  title?: string;
}) {
  const url = `/admin/customers/${customerId}/pets`;
  const [pets, setPets] = useState<Pet[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<Pet | "new" | null>(null);

  const load = useCallback(() => {
    api(url)
      .then((r) => setPets((r as { pets: Pet[] }).pets))
      .catch(() => setError("No se han podido cargar las mascotas."));
  }, [url]);
  useEffect(load, [load]);

  const remove = async (pet: Pet) => {
    if (!window.confirm(`¿Borrar la ficha de ${pet.name}? No se puede deshacer.`)) return;
    try {
      await api(`${url}/${pet.id}`, { method: "DELETE" });
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const shown = editable ? pets : (pets ?? []).filter((p) => p.death_year == null);
  return (
    <div className="shadow-elevation-card-rest bg-ui-bg-base divide-y rounded-lg">
      <div className="flex items-center justify-between px-6 py-4">
        <h2 className="font-sans text-base font-medium">{title}</h2>
        {editable && editing === null && (
          <button type="button" className={secondary} onClick={() => setEditing("new")}>
            + Añadir
          </button>
        )}
      </div>
      {error && <p className="text-ui-fg-error px-6 py-3 text-sm">{error}</p>}
      {notice && <p className="text-ui-fg-interactive px-6 py-3 text-sm">{notice}</p>}
      {editing === "new" && (
        <PetForm
          url={url}
          pet={null}
          onDone={(msg) => {
            setEditing(null);
            setNotice(msg ?? null);
            load();
          }}
        />
      )}
      <ul className="divide-y">
        {(shown ?? []).map((pet) =>
          editing !== "new" && editing?.id === pet.id ? (
            <li key={pet.id}>
              <PetForm
                url={url}
                pet={pet}
                onDone={(msg) => {
                  setEditing(null);
                  setNotice(msg ?? null);
                  load();
                }}
              />
            </li>
          ) : (
            <li key={pet.id} className="flex items-start justify-between gap-4 px-6 py-3">
              <PetCard pet={pet} />
              {editable && editing === null && (
                <span className="flex shrink-0 gap-2">
                  <button type="button" className={secondary} onClick={() => setEditing(pet)}>
                    Editar
                  </button>
                  <button type="button" className={secondary} onClick={() => remove(pet)}>
                    Borrar
                  </button>
                </span>
              )}
            </li>
          ),
        )}
        {shown && shown.length === 0 && (
          <li className="text-ui-fg-subtle px-6 py-3 text-sm">Sin mascotas.</li>
        )}
      </ul>
    </div>
  );
}
