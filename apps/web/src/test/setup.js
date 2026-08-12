import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Cada prueba parte de un DOM limpio: si no, los componentes de una prueba
// siguen montados en la siguiente y las consultas encuentran dos coincidencias.
afterEach(cleanup);
