// authController.js
const client = require('../db');
const { registerUser, getUserByEmail, getUserById, getUsers, updateUser } = require('../models/userModel');

const DEFAULT_USERS_PAGE = 1;
const DEFAULT_USERS_LIMIT = 20;
const MAX_USERS_LIMIT = 100;
const VALID_USER_ROLES = new Set(['admin', 'user']);

const normalizePositiveInt = (value, fallback) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const normalizeUsersQuery = (query) => {
    const page = normalizePositiveInt(query.page, DEFAULT_USERS_PAGE);
    const requestedLimit = normalizePositiveInt(query.limit, DEFAULT_USERS_LIMIT);
    const limit = Math.min(requestedLimit, MAX_USERS_LIMIT);
    const search = typeof query.search === 'string' ? query.search.trim() : '';
    const role = typeof query.role === 'string' ? query.role.trim() : 'all';

    return { page, limit, search, role };
};

const authController = {
    registerUser: async (req, res) => {
        const { email, first_name, last_name, password, role, telefono } = req.body;

        try {
            const existingUser = await client.oneOrNone('SELECT * FROM users WHERE email = $1', [email]);
            if (existingUser) {
                return res.status(400).json({ message: 'El usuario ya existe' });
            }

            const newUser = await registerUser(email, first_name, last_name, password, role, telefono);
            res.status(201).json(newUser);
        } catch (error) {
            console.error('Error durante el registro:', error);
            res.status(500).json({ message: 'Error interno del servidor' });
        }
    },

    getUserRole: async (req, res) => {
        const { email } = req.body;
        console.log('Recibiendo solicitud para obtener el rol del usuario con email:', email);

        try {
            const user = await getUserByEmail(email);
            console.log('Usuario obtenido:', user);

            if (!user || user.length === 0) {
                return res.status(404).json({ message: 'Usuario no encontrado' });
            }

            res.status(200).json({ role: user[0].role });
        } catch (error) {
            console.error('Error obteniendo el rol del usuario:', error);
            res.status(500).json({ message: 'Error obteniendo el rol del usuario', error });
        }
    },

    getUser: async (req, res) => {
        const { email } = req.body;
        console.log('Recibiendo solicitud para obtener el usuario con email:', email);

        try {
            const user = await getUserByEmail(email);
            console.log('Usuario obtenido:', user);

            if (!user || user.length === 0) {
                return res.status(404).json({ message: 'Usuario no encontrado' });
            }

            res.json(user[0]);
        } catch (error) {
            console.error('Error obteniendo el usuario:', error);
            res.status(500).json({ message: 'Error obteniendo el usuario', error });
        }
    },

    getUsers: async (req, res) => {
        try {
            const filters = normalizeUsersQuery(req.query);
            const users = await getUsers(filters);
            res.json(users);
        } catch (error) {
            console.error('Error obteniendo usuarios:', error);
            res.status(500).json({ message: 'Error obteniendo usuarios' });
        }
    },

    updateUser: async (req, res) => {
        const userId = Number.parseInt(req.params.id, 10);
        const { email, first_name, last_name, role, telefono, password } = req.body;

        if (!Number.isInteger(userId) || userId <= 0) {
            return res.status(400).json({ message: 'ID de usuario invalido' });
        }

        if (!email || !first_name || !last_name || !role) {
            return res.status(400).json({ message: 'Email, nombre, apellido y rol son obligatorios' });
        }

        if (!VALID_USER_ROLES.has(role)) {
            return res.status(400).json({ message: 'Rol invalido' });
        }

        if (password && password.trim().length < 6) {
            return res.status(400).json({ message: 'La clave debe tener al menos 6 caracteres' });
        }

        try {
            const existingUser = await getUserById(userId);
            if (!existingUser) {
                return res.status(404).json({ message: 'Usuario no encontrado' });
            }

            const userWithEmail = await client.oneOrNone(
                'SELECT id FROM users WHERE email = $1 AND id <> $2',
                [email.trim(), userId]
            );
            if (userWithEmail) {
                return res.status(409).json({ message: 'Ya existe otro usuario con ese email' });
            }

            const updatedUser = await updateUser(userId, {
                email: email.trim(),
                first_name: first_name.trim(),
                last_name: last_name.trim(),
                role,
                telefono: telefono ? telefono.trim() : null,
                password: password ? password.trim() : ''
            });

            res.json(updatedUser);
        } catch (error) {
            console.error('Error actualizando usuario:', error);
            res.status(500).json({ message: 'Error actualizando usuario' });
        }
    }
};

module.exports = authController;
