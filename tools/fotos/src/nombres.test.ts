import assert from "node:assert/strict";
import { test } from "node:test";
import { collisions, notSquare, plan } from "./nombres.ts";

test("fotos generales y de un valor: salida JPG en minúsculas", () => {
  assert.deepEqual(plan("Collar-Nylon_01.JPEG"), {
    input: "Collar-Nylon_01.JPEG",
    output: "collar-nylon_01.jpg",
    kind: "foto",
  });
  assert.equal(plan("arnes--sea-foam_02.png").output, "arnes--sea-foam_02.jpg");
  assert.equal(plan("arnes_01.heic").output, "arnes_01.jpg");
});

test("muestras: siempre PNG", () => {
  assert.deepEqual(plan("arnes--huckleberry_muestra.webp"), {
    input: "arnes--huckleberry_muestra.webp",
    output: "arnes--huckleberry_muestra.png",
    kind: "muestra",
  });
  // La muestra necesita valor
  assert.equal(plan("arnes_muestra.png").output, null);
});

test("lo que no sigue la convención no se procesa", () => {
  for (const f of ["foto.jpg", "arnes_1.jpg", "arnes_00.jpg", "arnes_01.gif", "Arnés_01.jpg"]) {
    assert.equal(plan(f).output, null, f);
  }
});

test("colisiones y proporción", () => {
  assert.deepEqual(collisions([plan("a_01.jpg"), plan("a_01.png"), plan("a_02.jpg")]), [
    "a_01.jpg y a_01.png → a_01.jpg",
  ]);
  assert.equal(notSquare(2000, 2000), false);
  assert.equal(notSquare(2000, 1980), false);
  assert.equal(notSquare(2000, 1500), true);
});
