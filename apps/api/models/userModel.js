// userModel.js

const client = require('../db'); // Ajusta segun la configuracion de tu cliente de PostgreSQL
const bcrypt = require('bcryptjs');
const saltRounds = 10;

const USER_SAFE_FIELDS = 'id, email, first_name, last_name, role, telefono';

const registerUser = async (email, first_name, last_name, password, role, telefono) => {
    try {
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        return await client.one(
            `INSERT INTO users (email, first_name, last_name, password, role, telefono)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *`,
            [email, first_name, last_name, hashedPassword, role, telefono]
        );
    } catch (error) {
        console.error('Error al registrar el usuario:', error);
        throw error;
    }
};

const getUserByEmail = async (email) => {
    try {
        const query = 'SELECT * FROM users WHERE email = $1';
        const result = await client.any(query, [email]);
        console.log('Resultado de la consulta:', result);
        return result;
    } catch (error) {
        console.error('Error al obtener el usuario por correo electronico:', error);
        throw error;
    }
};

const getUserById = async (id) => {
    try {
        return await client.oneOrNone(`SELECT ${USER_SAFE_FIELDS} FROM users WHERE id = $1`, [id]);
    } catch (error) {
        console.error('Error al obtener usuario por ID:', error);
        throw error;
    }
};

const getUsers = async ({ page, limit, search, role }) => {
    try {
        const offset = (page - 1) * limit;
        const values = [];
        const conditions = [];

        if (search) {
            values.push(`%${search}%`);
            const placeholder = `$${values.length}`;
            conditions.push(`(
                first_name ILIKE ${placeholder}
                OR last_name ILIKE ${placeholder}
                OR email ILIKE ${placeholder}
                OR telefono ILIKE ${placeholder}
            )`);
        }

        if (role && role !== 'all') {
            values.push(role);
            conditions.push(`role = $${values.length}`);
        }

        const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
        const limitPlaceholder = `$${values.length + 1}`;
        const offsetPlaceholder = `$${values.length + 2}`;
        const query = `SELECT ${USER_SAFE_FIELDS}
            FROM users
            ${whereClause}
            ORDER BY id DESC
            LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`;
        const countQuery = `SELECT COUNT(*)::int AS total FROM users ${whereClause}`;

        const [users, countResult] = await client.task(t => t.batch([
            t.any(query, [...values, limit, offset]),
            t.one(countQuery, values)
        ]));

        const total = countResult.total;
        return {
            data: users,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        };
    } catch (error) {
        console.error('Error al obtener usuarios:', error);
        throw error;
    }
};

const updateUser = async (id, userData) => {
    try {
        const { email, first_name, last_name, role, telefono, password } = userData;
        const values = [email, first_name, last_name, role, telefono || null, id];
        let passwordClause = '';

        if (password) {
            const hashedPassword = await bcrypt.hash(password, saltRounds);
            values.push(hashedPassword);
            passwordClause = `, password = $${values.length}`;
        }

        return await client.one(
            `UPDATE users
             SET email = $1,
                 first_name = $2,
                 last_name = $3,
                 role = $4,
                 telefono = $5
                 ${passwordClause}
             WHERE id = $6
             RETURNING ${USER_SAFE_FIELDS}`,
            values
        );
    } catch (error) {
        console.error('Error al actualizar usuario:', error);
        throw error;
    }
};

module.exports = { registerUser, getUserByEmail, getUserById, getUsers, updateUser };
