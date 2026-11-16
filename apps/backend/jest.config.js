const { loadEnv } = require("@medusajs/framework/utils");
loadEnv("test", process.cwd());

module.exports = {
  transform: {
    "^.+\\.[jt]s$": [
      "@swc/jest",
      {
        jsc: {
          parser: { syntax: "typescript", decorators: true },
        },
      },
    ],
  },
  testEnvironment: "node",
  moduleFileExtensions: ["js", "ts", "json"],
  modulePathIgnorePatterns: ["dist/", "<rootDir>/.medusa/"],
  setupFiles: ["./integration-tests/setup.js"],
};

if (process.env.TEST_TYPE === "integration:http") {
  module.exports.testMatch = ["**/integration-tests/http/*.spec.[jt]s"];
  // Cada fichero arranca un Medusa entero y Jest no libera toda su memoria: en un solo proceso
  // (`--runInBand`) el heap llegaba a ~3 GB y el kernel lo mataba en el runner del homelab (4 GB,
  // «Killed», código 137). Con un worker (`--maxWorkers=1`, en package.json) que se recicla al
  // pasar de 1 GB tras un fichero, la memoria no se acumula. Fuente: context7 /jestjs/jest
  // (Configuration.md, workerIdleMemoryLimit).
  module.exports.workerIdleMemoryLimit = "1GB";
} else if (process.env.TEST_TYPE === "integration:modules") {
  module.exports.testMatch = ["**/src/modules/*/__tests__/**/*.[jt]s"];
} else if (process.env.TEST_TYPE === "unit") {
  module.exports.testMatch = ["**/src/**/__tests__/**/*.unit.spec.[jt]s"];
}
