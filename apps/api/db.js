// apps/api/db.js
const { Client } = require('pg');
const pgp = require('pg-promise')();
require('dotenv').config(); // Asegúrate de tener esta línea al principio para cargar las variables de entorno

const db = pgp({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  // Desactiva SSL si no es necesario
  ssl: false
});


db.connect()
  .then(() => console.log('Connected to PostgreSQL database on Render'))
  .catch(err => console.error('Error connecting to PostgreSQL database', err));

module.exports = db;



