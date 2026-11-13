import {
  EMPTY_STATE,
  onChange,
  onFinish,
  onQueued,
  onStart,
  quietMinutes,
  shouldPublish,
  validSecret,
} from "./storefront-publish";

const at = (min: number) => new Date(Date.UTC(2026, 10, 13, 10, min));

describe("publicar el catálogo (fase 13)", () => {
  it("espera N minutos sin cambios; cada cambio alarga la espera", () => {
    let s = onChange(EMPTY_STATE, at(0));
    expect(shouldPublish(s, at(5), 10).publish).toBe(false);
    s = onChange(s, at(8));
    expect(s.pending_since).toEqual(at(0));
    expect(shouldPublish(s, at(15), 10).publish).toBe(false);
    expect(shouldPublish(s, at(18), 10)).toEqual({ publish: true, reason: "cambios de catálogo" });
  });

  it("sin cambios no publica; «Publicar ahora» no espera", () => {
    expect(shouldPublish(EMPTY_STATE, at(0), 10).publish).toBe(false);
    expect(shouldPublish({ ...EMPTY_STATE, requested_at: at(0) }, at(0), 10).publish).toBe(true);
  });

  it("en curso no lanza otro (salvo colgado más de 60 min); lo nuevo queda para el siguiente", () => {
    let s = onStart(onChange(EMPTY_STATE, at(0)), at(20), "https://git/run/1");
    expect(s).toMatchObject({
      status: "running",
      pending_since: null,
      run_url: "https://git/run/1",
    });
    s = onChange(s, at(22));
    expect(shouldPublish(s, at(40), 10)).toEqual({ publish: false, reason: "en curso" });
    expect(shouldPublish(s, new Date(at(20).getTime() + 61 * 60_000), 10).publish).toBe(true);
    s = onFinish(s, at(30), true, null);
    expect(s).toMatchObject({ status: "ok", pending_since: at(22), error: null });
    expect(shouldPublish(s, at(40), 10).publish).toBe(true);
  });

  it("en cola: no se vuelve a lanzar mientras espera runner", () => {
    const s = onQueued({ ...onChange(EMPTY_STATE, at(0)), requested_at: at(1) }, at(12));
    expect(s).toMatchObject({ status: "queued", pending_since: null, requested_at: null });
    expect(shouldPublish(s, at(20), 10)).toEqual({ publish: false, reason: "en cola" });
    expect(onStart(s, at(25), "u").status).toBe("running");
  });

  it("si falla, lo que iba queda pendiente y se guarda el motivo", () => {
    const s = onFinish(
      onStart(onChange(EMPTY_STATE, at(0)), at(20), null),
      at(30),
      false,
      "x".repeat(400),
    );
    expect(s.status).toBe("failed");
    expect(s.error).toHaveLength(300);
    expect(s.pending_since).toEqual(at(20));
    expect(shouldPublish(s, at(45), 10).publish).toBe(true);
  });

  it("espera configurable y secreto", () => {
    expect(quietMinutes(undefined)).toBe(10);
    expect(quietMinutes("3")).toBe(3);
    expect(quietMinutes("0")).toBe(10);
    expect(quietMinutes("abc")).toBe(10);
    const secret = "s".repeat(32);
    expect(validSecret(secret, secret)).toBe(true);
    expect(validSecret("otro", secret)).toBe(false);
    expect(validSecret(undefined, secret)).toBe(false);
    expect(validSecret("corto", "corto")).toBe(false);
  });
});
