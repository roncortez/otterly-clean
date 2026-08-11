import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // El codigo de la API es CommonJS; con globals los tests pueden seguir
    // siendo CommonJS y hacer require() de los modulos bajo prueba.
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.js'],
    // Las pruebas de integracion comparten la base de datos: en paralelo se
    // pisarian entre si.
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
