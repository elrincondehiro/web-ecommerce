import { errorReportingOptions, scrubDeep, scrubEvent, scrubText } from "../error-reporting";

describe("errores a Bugsink (fase 12-B)", () => {
  it("sin SENTRY_DSN no se inicia", () => {
    expect(errorReportingOptions({}, "backend-server")).toBeNull();
    expect(errorReportingOptions({ SENTRY_DSN: "  " }, "backend-server")).toBeNull();
  });

  it("con DSN: solo errores y sin datos personales", () => {
    const o = errorReportingOptions(
      { SENTRY_DSN: "http://k@10.77.0.3:8000/1", SENTRY_RELEASE: "0.3.4" },
      "backend-worker",
    )!;
    expect(o).toMatchObject({
      dsn: "http://k@10.77.0.3:8000/1",
      environment: "production",
      release: "0.3.4",
      tracesSampleRate: 0,
      initialScope: { tags: { service: "backend-worker" } },
      dataCollection: {
        userInfo: false,
        cookies: false,
        httpBodies: [],
        databaseQueryData: false,
        stackFrameVariables: false,
      },
    });
  });

  it("enmascara emails, tokens y claves", () => {
    expect(scrubText("No se pudo enviar a ana@example.com")).toBe("No se pudo enviar a [email]");
    expect(scrubText("/cuenta/email/?token=abc123&x=1")).toBe(
      "/cuenta/email/?token=[filtrado]&x=1",
    );
    expect(scrubText("Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc-def_ghi")).toBe(
      "Bearer [token]",
    );
    expect(scrubText("clave sk_test_51AbCdEfGh123456")).toBe("clave [clave]");
    expect(scrubText("pedido order_01M7NQ9HWX32MVBVYY53GF996P")).toBe(
      "pedido order_01M7NQ9HWX32MVBVYY53GF996P",
    );
  });

  it("evento: sin usuario, cookies ni cuerpo; cabeceras sensibles fuera", () => {
    const e = scrubEvent({
      message: "Fallo para luis@example.com",
      user: { email: "luis@example.com" },
      request: {
        url: "https://t.es/baja/?t=secreto",
        cookies: { customer_token: "x" },
        data: { password: "x" },
        headers: { authorization: "Bearer x", "user-agent": "ua" },
      },
      exception: { values: [{ value: "Email ana@example.com ya existe" }] },
      breadcrumbs: [{ message: "POST /auth con pepe@example.com", data: { token: "x" } }],
    });
    expect(e.user).toBeUndefined();
    expect(e.request).toEqual({
      url: "https://t.es/baja/?t=[filtrado]",
      headers: { authorization: "[filtrado]", "user-agent": "ua" },
    });
    expect(e.message).toBe("Fallo para [email]");
    expect(e.exception!.values![0]!.value).toBe("Email [email] ya existe");
    expect(e.breadcrumbs![0]).toEqual({
      message: "POST /auth con [email]",
      data: { token: "[filtrado]" },
    });
    expect(scrubDeep({ a: [{ cookie: "x" }] })).toEqual({ a: [{ cookie: "[filtrado]" }] });
  });
});
