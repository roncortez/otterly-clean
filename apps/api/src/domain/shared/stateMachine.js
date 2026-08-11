'use strict';

const { DomainError } = require('../errors');

/**
 * Maquina de estados generica para ordenes.
 *
 * Se construye a partir de una tabla de transiciones explicita. No existe
 * ninguna transicion implicita: si un par (from -> to) no esta declarado, el
 * cambio se rechaza. Esto es lo que impide que el frontend, o un cliente HTTP
 * cualquiera, mueva una orden a un estado arbitrario.
 *
 * Cada transicion declara:
 *   - to:        estado destino
 *   - roles:     roles autorizados a ejecutarla
 *   - timestamps: campos de fecha que deben registrarse al aplicarla
 *   - label:     texto para el timeline del cliente
 */
class StateMachine {
  /**
   * @param {object} spec
   * @param {string} spec.name
   * @param {string} spec.initialState
   * @param {Record<string, {label: string, terminal?: boolean, customerVisible?: boolean}>} spec.states
   * @param {Array<{from: string, to: string, roles: string[], timestamps?: string[], label?: string}>} spec.transitions
   */
  constructor({ name, initialState, states, transitions }) {
    this.name = name;
    this.initialState = initialState;
    this.states = Object.freeze(states);
    this.transitions = Object.freeze(transitions);

    const unknown = [];
    for (const t of transitions) {
      if (!states[t.from]) unknown.push(t.from);
      if (!states[t.to]) unknown.push(t.to);
    }
    if (unknown.length > 0) {
      throw new Error(
        `${name}: transiciones referencian estados inexistentes: ${[...new Set(unknown)].join(', ')}`,
      );
    }
    if (!states[initialState]) {
      throw new Error(`${name}: estado inicial desconocido: ${initialState}`);
    }

    // Indice from -> to -> transicion, para resolver en O(1).
    this._index = new Map();
    for (const t of transitions) {
      if (!this._index.has(t.from)) this._index.set(t.from, new Map());
      this._index.get(t.from).set(t.to, t);
    }
  }

  hasState(state) {
    return Object.hasOwn(this.states, state);
  }

  isTerminal(state) {
    return Boolean(this.states[state]?.terminal);
  }

  /** Estados a los que se puede pasar desde `from`, filtrados por rol. */
  allowedTransitions(from, role) {
    const targets = this._index.get(from);
    if (!targets) return [];
    return [...targets.values()]
      .filter((t) => !role || t.roles.includes(role))
      .map((t) => ({ to: t.to, label: t.label ?? this.states[t.to].label }));
  }

  /**
   * Valida una transicion y devuelve su definicion.
   * Lanza DomainError si el destino no existe, la transicion no esta declarada
   * o el rol no esta autorizado.
   */
  assertTransition(from, to, role) {
    if (!this.hasState(to)) {
      throw new DomainError('INVALID_STATE', `Estado desconocido: ${to}`, {
        state: to,
      });
    }
    if (from === to) {
      throw new DomainError('INVALID_TRANSITION', `La orden ya esta en ${to}`, {
        from,
        to,
      });
    }
    if (this.isTerminal(from)) {
      throw new DomainError(
        'INVALID_TRANSITION',
        `La orden esta en un estado final (${from}) y no admite cambios`,
        { from, to },
      );
    }

    const transition = this._index.get(from)?.get(to);
    if (!transition) {
      throw new DomainError(
        'INVALID_TRANSITION',
        `Transicion no permitida: ${from} -> ${to}`,
        { from, to, allowed: this.allowedTransitions(from).map((t) => t.to) },
      );
    }
    if (role && !transition.roles.includes(role)) {
      throw new DomainError(
        'FORBIDDEN_TRANSITION',
        `El rol ${role} no puede ejecutar ${from} -> ${to}`,
        { from, to, role, allowedRoles: transition.roles },
      );
    }
    return transition;
  }

  /**
   * Secuencia "feliz" de la maquina, usada para dibujar el timeline del
   * cliente incluso antes de que los pasos ocurran.
   */
  happyPath() {
    const path = [this.initialState];
    let current = this.initialState;
    const guard = new Set([current]);

    while (true) {
      const next = this.transitions.find(
        (t) =>
          t.from === current &&
          !guard.has(t.to) &&
          this.states[t.to].customerVisible !== false &&
          !this.states[t.to].exceptional,
      );
      if (!next) break;
      current = next.to;
      guard.add(current);
      path.push(current);
    }
    return path;
  }
}

module.exports = { StateMachine };
