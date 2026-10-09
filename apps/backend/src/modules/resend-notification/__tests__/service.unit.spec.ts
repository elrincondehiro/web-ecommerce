import { previewProps } from "emails";
import ResendNotificationProviderService from "../service";
import type { OutgoingEmail } from "../transport";

const logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
} as unknown as ConstructorParameters<typeof ResendNotificationProviderService>[0]["logger"];

function makeService() {
  const service = new ResendNotificationProviderService(
    { logger },
    { transport: "smtp", from: "El Rincón de Hiro <pedidos@example.com>" },
  );
  const sent: OutgoingEmail[] = [];
  // Transporte simulado: no abre conexiones SMTP.
  (
    service as unknown as { transport_: { send(e: OutgoingEmail): Promise<{ id: string }> } }
  ).transport_ = {
    send: async (e) => {
      sent.push(e);
      return { id: "msg_1" };
    },
  };
  return { service, sent };
}

describe("resend-notification", () => {
  it("valida las opciones", () => {
    expect(() => ResendNotificationProviderService.validateOptions({ transport: "smtp" })).toThrow(
      /from/,
    );
    expect(() =>
      ResendNotificationProviderService.validateOptions({ transport: "x", from: "a@b.c" }),
    ).toThrow(/transport/);
    expect(() =>
      ResendNotificationProviderService.validateOptions({ transport: "resend", from: "a@b.c" }),
    ).not.toThrow();
  });

  it("renderiza la plantilla y envía HTML + texto con la clave de idempotencia", async () => {
    const { service, sent } = makeService();
    const res = await service.send({
      to: "cliente@example.com",
      channel: "email",
      template: "order-placed",
      data: previewProps("order-placed") as unknown as Record<string, unknown>,
      idempotency_key: "order-placed/order_1",
    } as Parameters<typeof service.send>[0]);

    expect(res).toEqual({ id: "msg_1" });
    expect(sent).toHaveLength(1);
    const email = sent[0]!;
    expect(email.from).toBe("El Rincón de Hiro <pedidos@example.com>");
    expect(email.subject).toBe("Hemos recibido tu pedido n.º 1042");
    expect(email.html).toContain("<!DOCTYPE html");
    expect(email.text).toContain("IVA 21 %");
    expect(email.idempotencyKey).toBe("order-placed/order_1");
    expect(email.replyTo).toBeUndefined();
    // El log no lleva el destinatario
    expect(JSON.stringify((logger.info as jest.Mock).mock.calls)).not.toContain(
      "cliente@example.com",
    );
  });

  it("rechaza plantillas desconocidas", async () => {
    const { service } = makeService();
    await expect(
      service.send({ to: "a@b.c", channel: "email", template: "nope", data: {} }),
    ).rejects.toThrow(/desconocida/);
  });

  it("smtp prohibido en producción", () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      expect(
        () =>
          new ResendNotificationProviderService({ logger }, { transport: "smtp", from: "a@b.c" }),
      ).toThrow(/solo para desarrollo/);
    } finally {
      process.env.NODE_ENV = prev;
    }
  });
});
