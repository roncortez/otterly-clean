import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusTimeline } from './StatusTimeline';
import { timelineWindow } from './timelineWindow';

/**
 * El seguimiento de un servicio: cinco estados a la vista.
 *
 * Lo que se prueba no es que se recorten a cinco —eso sería trivial y estaría
 * mal—, sino lo que tiene que seguir siendo cierto con la lista recortada: que
 * el estado actual esté siempre visible, que se vea de dónde viene, y que quede
 * dicho que hay más antes y después. Un servicio avanzado con la vista clavada
 * en los primeros cinco pasos no serviría para nada.
 */

/** Los ocho estados de una limpieza, como los manda el backend. */
const LABELS = [
  'Servicio solicitado',
  'Buscando profesional',
  'Profesional asignado',
  'Profesional confirmó',
  'En camino',
  'Llegó al domicilio',
  'Limpieza en progreso',
  'Limpieza finalizada',
];

/** Timeline con el servicio en el estado `at`. */
function timelineAt(at) {
  return LABELS.map((label, index) => ({
    status: `S${index}`,
    label,
    state: index < at ? 'DONE' : index === at ? 'CURRENT' : 'PENDING',
    at: index <= at ? '2026-08-12T10:00:00Z' : null,
    note: null,
  }));
}

describe('Ventana del timeline', () => {
  it('con cinco estados o menos se ven todos', () => {
    const steps = timelineAt(1).slice(0, 5);
    const { visible, before, after } = timelineWindow(steps);

    expect(visible).toHaveLength(5);
    expect(before).toBe(0);
    expect(after).toBe(0);
  });

  it('al empezar se ven los primeros y se avisa de los que faltan', () => {
    const { visible, before, after } = timelineWindow(timelineAt(0));

    expect(visible.map((step) => step.label)).toEqual(LABELS.slice(0, 5));
    expect(before).toBe(0);
    expect(after).toBe(3);
  });

  it('con el servicio avanzado la ventana se mueve con él', () => {
    const { visible, before, after } = timelineWindow(timelineAt(6));

    // El actual sigue dentro, con el paso anterior a la vista.
    expect(visible.map((step) => step.label)).toContain('Limpieza en progreso');
    expect(visible.map((step) => step.label)).toContain('Llegó al domicilio');
    expect(visible).toHaveLength(5);
    expect(before).toBe(3);
    expect(after).toBe(0);
  });

  it('un servicio terminado muestra el final, no el principio', () => {
    const steps = timelineAt(7).map((step) => ({ ...step, state: step.state === 'CURRENT' ? 'DONE' : step.state }));
    const { visible, after } = timelineWindow(steps);

    expect(visible.map((step) => step.label)).toContain('Limpieza finalizada');
    expect(after).toBe(0);
  });

  it('un estado excepcional es lo que hay que ver', () => {
    const steps = [
      ...timelineAt(4).map((step) => ({ ...step, state: step.state === 'CURRENT' ? 'DONE' : step.state })),
      { status: 'INCIDENT_REPORTED', label: 'Incidencia reportada', state: 'EXCEPTION', at: null },
    ];

    const { visible } = timelineWindow(steps);
    expect(visible.map((step) => step.label)).toContain('Incidencia reportada');
  });

  it('sin límite se ven todos: el detalle completo sigue disponible', () => {
    const { visible, before, after } = timelineWindow(timelineAt(6), null);

    expect(visible).toHaveLength(8);
    expect(before).toBe(0);
    expect(after).toBe(0);
  });
});

describe('Timeline en pantalla', () => {
  it('muestra cinco pasos y dice cuántos quedan fuera', () => {
    render(<StatusTimeline steps={timelineAt(6)} />);

    expect(screen.getByText('Limpieza en progreso')).toBeInTheDocument();
    // Tres estados anteriores quedan fuera, y se dice.
    expect(screen.getByText('3 estados antes')).toBeInTheDocument();
    expect(screen.queryByText('Servicio solicitado')).not.toBeInTheDocument();
  });

  it('al principio avisa de los que vienen después', () => {
    render(<StatusTimeline steps={timelineAt(0)} />);

    expect(screen.getByText('Servicio solicitado')).toBeInTheDocument();
    expect(screen.getByText('3 estados después')).toBeInTheDocument();
  });
});
