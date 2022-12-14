const { Client } = require('pg');

const client = new Client('postgres://localhost:5432/juicebox-dev');

async function getAllUsers() {
  const { rows } = await client.query(`
    SELECT id, username
    FROM users;
  `);
  return rows;
}

async function createUser({ username, password }) {
  try {
    const { rows } = await client.query(`
      INSERT INTO users (username, password)
        VALUES ($1, $2);
    `, [username, password]);
    return rows;
  } catch (error) {
    console.error(error);
  }
}

module.exports = { client, getAllUsers, createUser };