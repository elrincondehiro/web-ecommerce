import { describe, expect, it } from "vitest";
import { cardImage, metadataDescription, metadataImage } from "./entity-image";

describe("foto propia de categorías y colecciones (Fase H)", () => {
  it("metadataImage: solo URLs http(s); alt opcional", () => {
    expect(metadataImage(null)).toBeNull();
    expect(metadataImage({ imagen_url: "" })).toBeNull();
    expect(metadataImage({ imagen_url: "javascript:alert(1)" })).toBeNull();
    expect(metadataImage({ imagen_url: "https://img.example.com/a.webp" })).toEqual({
      src: "https://img.example.com/a.webp",
      alt: "",
    });
    expect(
      metadataImage({ imagen_url: "http://localhost:8333/medusa/a.webp", imagen_alt: " Perro " }),
    ).toEqual({ src: "http://localhost:8333/medusa/a.webp", alt: "Perro" });
  });

  it("cardImage: la propia; si no, la del primer producto con foto", () => {
    const products = [{ thumbnail: null, images: [] }, { thumbnail: "https://x/p2.jpg" }];
    expect(cardImage({ imagen_url: "https://x/own.webp" }, products)?.src).toBe(
      "https://x/own.webp",
    );
    expect(cardImage(null, products)).toEqual({ src: "https://x/p2.jpg", alt: "" });
    expect(cardImage(null, [{ images: [{ url: "https://x/i.jpg" }] }])?.src).toBe(
      "https://x/i.jpg",
    );
    expect(cardImage(null, [])).toBeNull();
  });

  it("metadataDescription", () => {
    expect(metadataDescription({ descripcion: "  Lo que más nos gusta. " })).toBe(
      "Lo que más nos gusta.",
    );
    expect(metadataDescription({ descripcion: 3 })).toBe("");
    expect(metadataDescription(undefined)).toBe("");
  });
});
