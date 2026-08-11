'use strict';

const crypto = require('node:crypto');
const env = require('../config/env');

/**
 * Cifrado de datos sensibles de acceso al domicilio.
 *
 * El cliente entrega codigos de puerta, claves de alarma o la ubicacion de una
 * llave escondida. Eso no puede quedar en texto plano en la base de datos: si
 * alguien obtiene un volcado, obtiene acceso fisico a las casas de los
 * clientes. Se cifra con AES-256-GCM, que ademas autentica el texto cifrado.
 *
 * Formato almacenado:  v1:<iv-hex>:<authTag-hex>:<ciphertext-hex>
 * El prefijo de version permite rotar el algoritmo o la clave despues.
 */

const ALGORITHM = 'aes-256-gcm';
const VERSION = 'v1';
const IV_BYTES = 12; // recomendado para GCM

function getKey() {
  const key = Buffer.from(env.crypto.encryptionKey, 'hex');
  if (key.length !== 32) {
    throw new Error('ENCRYPTION_KEY debe ser 32 bytes en hexadecimal (64 caracteres)');
  }
  return key;
}

/**
 * @param {string|null|undefined} plaintext
 * @returns {string|null} texto cifrado, o null si no habia nada que cifrar
 */
function encrypt(plaintext) {
  if (plaintext === null || plaintext === undefined || plaintext === '') return null;

  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [VERSION, iv.toString('hex'), authTag.toString('hex'), ciphertext.toString('hex')].join(':');
}

/**
 * @param {string|null|undefined} payload
 * @returns {string|null}
 * @throws si el texto fue manipulado (GCM falla la verificacion)
 */
function decrypt(payload) {
  if (!payload) return null;

  const [version, ivHex, authTagHex, ciphertextHex] = String(payload).split(':');
  if (version !== VERSION || !ivHex || !authTagHex || !ciphertextHex) {
    throw new Error('Formato de texto cifrado invalido');
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextHex, 'hex')),
    decipher.final(),
  ]).toString('utf8');
}

/** Hash irreversible para refresh tokens: la base nunca guarda el token real. */
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function randomToken(bytes = 48) {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Genera un codigo corto legible para bolsas de lavanderia.
 * Sin caracteres ambiguos (0/O, 1/I) porque se leen y escriben a mano.
 */
function shortCode(length = 4) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += alphabet[crypto.randomInt(0, alphabet.length)];
  }
  return out;
}

module.exports = { encrypt, decrypt, hashToken, randomToken, shortCode };
