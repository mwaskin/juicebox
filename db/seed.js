const { client, getAllUsers, createUser } = require('./index');

async function dropTables() {
  try {
    console.log('Dropping tables...');
    await client.query(`
      DROP TABLE IF EXISTS users;
    `);
    console.log('Finished dropping tables');
  } catch (error) {
    console.error('Error dropping tables: ', error);
  }
}

async function createTables() {
  try {
    console.log("Starting to build tables...");
    await client.query(`
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL
      );
    `);
    console.log("Finished building tables!");
  } catch (error) {
    console.error("Error building tables: ", error);
  }
}

async function createInitialUsers() {
  try {
    console.log('Starting to create users...');
    const albert = await createUser({username: 'albert', password: 'bertie99'});
    const sandra = await createUser({username: 'sandra', password: '2sandy4me'});
    const glamgal = await createUser({username: 'glamgal', password: 'soglam'});
    console.log(albert, sandra, glamgal);
    console.log("Finished creating users!");
  } catch (error) {
    console.error(error);
  }
}

async function rebuildDB(){
  try {
    client.connect();
    await dropTables();
    await createTables();
    await createInitialUsers();
  } catch (error) {
    console.error(error);
  }
}

async function testDB() {
  try {
    console.log("Starting to test database...");

    const users = await getAllUsers();
    console.log("getAllUsers:", users);

    console.log("Finished database tests!");
  } catch (error) {
    console.error("Error testing database!");
    throw error;
  }
}

rebuildDB()
  .then(testDB)
  .catch(console.error)
  .finally(() => client.end());
