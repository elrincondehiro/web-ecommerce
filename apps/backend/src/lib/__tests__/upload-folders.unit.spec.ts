import { folderFromReferer, knownFolder, withFolder } from "../upload-folders";

describe("carpetas del bucket (Fase H)", () => {
  it("carpeta por la página del Admin", () => {
    expect(folderFromReferer("https://admin.x.es/app/products/prod_1/media")).toBe("productos");
    expect(folderFromReferer("http://localhost:9000/app/products/create")).toBe("productos");
    expect(folderFromReferer("http://localhost:9000/app/categories/pcat_1")).toBe("categorias");
    expect(folderFromReferer("http://localhost:9000/app/collections/pcol_1")).toBe("colecciones");
    expect(folderFromReferer("http://localhost:9000/app/settings/store")).toBe("contenido");
    expect(folderFromReferer(undefined)).toBe("contenido");
    expect(folderFromReferer("no es una url")).toBe("contenido");
    // no confunde «productsX»
    expect(folderFromReferer("http://x/app/productsx")).toBe("contenido");
  });

  it("knownFolder: solo las carpetas conocidas", () => {
    expect(knownFolder("colecciones")).toBe("colecciones");
    expect(knownFolder("../etc")).toBeNull();
    expect(knownFolder(undefined)).toBeNull();
  });

  it("withFolder: antepone la carpeta; respeta una conocida; quita rutas", () => {
    expect(withFolder("productos", "foto.jpg")).toBe("productos/foto.jpg");
    expect(withFolder("productos", "categorias/foto.webp")).toBe("categorias/foto.webp");
    expect(withFolder("productos", "../../etc/passwd")).toBe("productos/passwd");
    expect(withFolder("contenido", "C:\\fotos\\a.png")).toBe("contenido/a.png");
    expect(withFolder("productos", "otra/carpeta/a.jpg")).toBe("productos/a.jpg");
  });
});
