// server.js
const express = require('express');
const cors = require('cors')
const client = require('./db'); 
const authRouter = require ('./routes/authRoutes');
const menuRouter = require('./routes/menuRoutes');
const uploadRouter = require('./routes/upload');
const tiposRouter =  require('./routes/tipos');
const categoriaRoutes = require('./routes/categoriaRoutes');
const pedidosRouter = require('./routes/pedidoRoutes');
const ingredientRouter = require('./routes/ingredientRoutes');
const direccionesRouter = require('./routes/direccionesRoutes');
const tiposPlatoRouter = require('./routes/tiposPlatoRoutes');
const estadisticasRouter = require('./routes/estadisticasRoutes');
const settingsRouter = require('./routes/settingsRoutes');
const adminOrderRouter = require('./routes/adminOrderRoutes');
const cuponRouter = require('./routes/cuponRoutes');
const serviceRouter = require('./routes/serviceRoutes');
const newOrderRouter = require('./routes/orderRoutes');
const propertyRouter = require('./routes/propertyRoutes');
const multer = require('multer');


const app = express();
const port = process.env.PORT || 10000;

// Middleware para permitir solicitudes CORS (permite el acceso desde la web app en otro dominio)
// Configurar CORS
// Configuración de CORS
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);


app.use(cors({
  origin: (origin, callback) => {
      if (!origin || allowedOrigins.indexOf(origin) !== -1) {
          callback(null, true);
      } else {
          callback(new Error('Not allowed by CORS'));
      }
  },
  methods: 'GET,POST,PUT,PATCH,DELETE',
  allowedHeaders: 'Content-Type,Authorization'
}));

// Middleware para manejar JSON en las solicitudes
app.use(express.json());

// Rutas principales
app.use(express.urlencoded({ extended: true }));

//Ruta de bienvenida para el root URL (/)
app.get('/', (req, res) => {
  res.json({
    service: 'Otterly Clean API',
    status: 'ok'
  });
});

//Rutas para el registro
app.use('/api', authRouter);
// Rutas para el catalogo de servicios
app.use('/api', menuRouter);
app.use('/api', tiposRouter);
app.use('/api', pedidosRouter);
app.use('/api', direccionesRouter);
app.use('/api', tiposPlatoRouter);
app.use('/api', estadisticasRouter);
app.use('/api', settingsRouter);
app.use('/api', adminOrderRouter);
app.use('/api', cuponRouter);

// Cleaning services routes
app.use('/api', serviceRouter);
app.use('/api', newOrderRouter);
app.use('/api', propertyRouter);

app.use(categoriaRoutes);
// Ruta para subir imágenes
app.use('/api/upload', uploadRouter);
//app.use('/api/upload', upload.single('image'), require('./routes/upload'));
app.use('/api', ingredientRouter);
// Ruta de prueba para verificar la conexión a la base de datos
app.get('/test-db', async (req, res) => {
  try {
    const result = await client.query('SELECT NOW()');
    res.send(result.rows[0]);
  } catch (err) {
    console.error('Error executing query', err.stack);
    res.status(500).send('Error connecting to database');
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

module.exports = app;
