import { describe, expect, it } from "vitest";
import { inlineHtml, richTextHtml, richTextPlain } from "./rich-text";

describe("richTextHtml — bloques", () => {
  it("vacío o solo espacios → cadena vacía", () => {
    expect(richTextHtml(null)).toBe("");
    expect(richTextHtml("  \n \n")).toBe("");
  });

  it("párrafos por línea en blanco y <br> en los saltos simples (con espacios de sobra)", () => {
    expect(richTextHtml("Uno.\n Dos. \n\n\nTres.")).toBe("<p>Uno.<br>Dos.</p><p>Tres.</p>");
    expect(richTextHtml("Windows\r\nfin")).toBe("<p>Windows<br>fin</p>");
  });

  it("listas con `- `, `* `, `• ` y pegadas como en las fichas de proveedor (`*Texto`)", () => {
    const text = "Intro.\n\n*Confección en RPET\n*Anilla en D \n- Otro\n• Más\n•Pegado";
    expect(richTextHtml(text)).toBe(
      "<p>Intro.</p><ul><li>Confección en RPET</li><li>Anilla en D</li><li>Otro</li><li>Más</li><li>Pegado</li></ul>",
    );
  });

  it("la lista termina en la línea que no es elemento (sin línea en blanco)", () => {
    expect(richTextHtml("Texto\n* a\n* b\nDespués")).toBe(
      "<p>Texto</p><ul><li>a</li><li>b</li></ul><p>Después</p>",
    );
  });

  it("`*cursiva*` o `-20 %` al empezar la línea no son listas", () => {
    expect(richTextHtml("*suave* al tacto")).toBe("<p><em>suave</em> al tacto</p>");
    expect(richTextHtml("-20 % hoy")).toBe("<p>-20 % hoy</p>");
    expect(richTextHtml("**Nuevo** modelo")).toBe("<p><strong>Nuevo</strong> modelo</p>");
  });

  it("listas numeradas (con su inicio si no es 1) y cambio de tipo", () => {
    expect(richTextHtml("1. Medir\n2) Elegir\n- extra")).toBe(
      "<ol><li>Medir</li><li>Elegir</li></ol><ul><li>extra</li></ul>",
    );
    expect(richTextHtml("3. Tercero")).toBe('<ol start="3"><li>Tercero</li></ol>');
  });

  it("subtítulos al nivel indicado (`###` uno más) y separador", () => {
    expect(richTextHtml("## Materiales\nRPET\n---\n### Lavado")).toBe(
      "<h3>Materiales</h3><p>RPET</p><hr><h4>Lavado</h4>",
    );
    expect(richTextHtml("# Uno", { headingLevel: 2 })).toBe("<h2>Uno</h2>");
    expect(richTextHtml("###### Hondo", { headingLevel: 4 })).toBe("<h6>Hondo</h6>");
    expect(richTextHtml("#sinespacio")).toBe("<p>#sinespacio</p>");
  });
});

describe("inlineHtml", () => {
  it("negrita, cursiva (`*` y `_`) y tachado", () => {
    expect(inlineHtml("**muy** *bien* _hecho_ ~~antes~~")).toBe(
      "<strong>muy</strong> <em>bien</em> <em>hecho</em> <s>antes</s>",
    );
  });

  it("no da formato a marcas sueltas ni a guiones bajos dentro de palabras", () => {
    expect(inlineHtml("2 * 3 = 6 y 5 * 2")).toBe("2 * 3 = 6 y 5 * 2");
    expect(inlineHtml("mi_archivo_nuevo")).toBe("mi_archivo_nuevo");
    expect(inlineHtml("** nada **")).toBe("** nada **");
  });

  it("escapa el HTML: nunca pasa una etiqueta del Admin o del CSV", () => {
    expect(inlineHtml(`<script>alert("x")</script> & 'y'`)).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;",
    );
    expect(richTextHtml('<img src=x onerror="a()">')).toBe(
      "<p>&lt;img src=x onerror=&quot;a()&quot;&gt;</p>",
    );
  });

  it("enlaces: rutas, http(s), mailto y tel; con formato en el texto", () => {
    expect(inlineHtml("[guía](/guia-tallas/) y [**web**](https://ejemplo.com/a_b_c?x=1&y=2)")).toBe(
      '<a href="/guia-tallas/">guía</a> y <a href="https://ejemplo.com/a_b_c?x=1&amp;y=2"><strong>web</strong></a>',
    );
    expect(inlineHtml("[escríbenos](mailto:hola@ejemplo.com) [llama](tel:+34600000000)")).toBe(
      '<a href="mailto:hola@ejemplo.com">escríbenos</a> <a href="tel:+34600000000">llama</a>',
    );
  });

  it("enlaces no admitidos → solo el texto", () => {
    expect(inlineHtml("[x](javascript:alert(1))")).toBe("x)");
    expect(inlineHtml("[x](//otro.com)")).toBe("x");
    expect(inlineHtml('[x](https://a.com/"onmouseover=)')).toBe(
      '<a href="https://a.com/&quot;onmouseover=">x</a>',
    );
  });

  it("quita caracteres de control", () => {
    expect(inlineHtml("a\u0001b\u0000c")).toBe("abc");
  });
});

describe("richTextPlain", () => {
  it("sin marcas: un bloque por línea", () => {
    const text =
      "## Detalles\nEl **arnés** _Alpha_.\n\n*RPET\n- [guía](/g/)\n---\n1. ~~viejo~~ nuevo";
    expect(richTextPlain(text)).toBe("Detalles\nEl arnés Alpha.\nRPET\nguía\nviejo nuevo");
  });

  it("texto sin formato → igual (espacios de los extremos fuera)", () => {
    expect(richTextPlain("  Hola mundo  ")).toBe("Hola mundo");
    expect(richTextPlain(undefined)).toBe("");
  });
});
