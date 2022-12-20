/* 
INITIAL SETUP: 

npm init -y
npm install pg
npm install nodemon --save-dev (adds as dev dependency)
createdb juicebox-dev
psql juicebox-dev (to access in psql shell)
*/

//imports pg module
const { Client } = require('pg');

// gives location of db to client to connect to in seed.js
const client = new Client('postgres://localhost:5432/juicebox-dev');

// grabs the relevant fields for all users from the users table
// destructure the rows from the results object to only return the an array of objects representing each user
async function getAllUsers() {
  const { rows } = await client.query(`
    SELECT id, username, name, location, active
    FROM users;
  `);
  return rows;
}

// function to assign values to each of the fields (table columns) for each user added to the users table
// destructure the fields (table columns) object parameter for the specific fields we want to assign values to-- dont need to include "id" or "active" fields, as those are assigned automatically
// SERIAL (assigned in ascending order starting from 1 for each row added to the table); DEFAULT true (default value is set to true)
// if you attempt to assign a username belonging to a user already in the table, then this query will not run
// will be used within the createInitialUsers function in the seed.js to create each initial user for seeding the user table
async function createUser({ username, password, name, location }) {
  try {
    // result of the query is an object that contains field "rows" which contains an array, which contains an object for the user we created
    // destructure so we can assign the user object a variable (user) and return it after the query to be used for seeding the table
    const { rows: [user] } = await client.query(`
    INSERT INTO users (username, password, name, location)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (username) DO NOTHING
    RETURNING *;
    `, [username, password, name, location]);
    // query method has 2 parameters (is passed 2 argument): Argument 1 is the PSQL request; Argument 2 is a dependency array of data needed to execute the request
    // in this case, we pass in the fields we destructured from our parameter
    // use placeholders ($#) where # is the value's position (starting from 1; in other words, it's index in the dep array +1) in the dependency array makes the query dynamic so it can be reused for more new users
    return user; //return the user, which we destructured above from the results of the query
  } catch (error) {
    console.error("Error creating user: ", error);
  }
}

async function updateUser(id, fields = {}) {
  // build the set string
  const setString = Object.keys(fields).map(
    (key, index) => `"${key}"=$${index + 1}`
  ).join(', '); // don't necessarily need the .join(); can pass an array of strings into SET below

  // return early if this is called without fields
  if(setString.length === 0) {
    return;
  }

  try {
    const {rows: [user]} = await client.query(`
      UPDATE users
      SET ${setString}
      WHERE id=${id}
      RETURNING *;
    `, Object.values(fields));
    return user;
  } catch (error) {
    console.error(error);
  }
}

async function createPost({ authorId, title, content, tags = [] }) {
  try {
    const { rows: [post]} = await client.query(`
      INSERT INTO posts ("authorId", title, content)
      VALUES ($1, $2, $3)
      RETURNING *;
    `, [authorId, title, content]);

    const tagList = await createTags(tags);

    return await addTagsToPost(post.id, tagList);
  } catch (error) {
    console.error("Error creating post: ", error)
  }
}

async function updatePost(postId, fields = {}) {
  // read off the tags & remove that field 
  const { tags } = fields; // might be undefined
  delete fields.tags;

  // build the set string
  const setString = Object.keys(fields).map(
    (key, index) => `"${ key }"=$${ index + 1 }`
  ).join(', ');

  try {
    // update any fields that need to be updated
    if (setString.length > 0) {
      await client.query(`
        UPDATE posts
        SET ${ setString }
        WHERE id=${ postId }
        RETURNING *;
      `, Object.values(fields));
    }

    // return early if there's no tags to update
    if (tags === undefined) {
      return await getPostById(postId);
    }

    // make any new tags that need to be made
    const tagList = await createTags(tags);
    const tagListIdString = tagList.map(
      tag => `${ tag.id }`
    ).join(', ');

    // delete any post_tags from the database which aren't in that tagList
    await client.query(`
      DELETE FROM post_tags
      WHERE "tagId"
      NOT IN (${ tagListIdString })
      AND "postId"=$1;
    `, [postId]);

    // and create post_tags as necessary
    await addTagsToPost(postId, tagList);

    return await getPostById(postId);
  } catch (error) {
    console.error('Error upadting post: ', error);
  }
}
// async function updatePost(id, fields = {title, content, active}){
  
//   const setString = Object.keys(fields).map(
//     (key, index) => `"${key}"=$${index + 1}`
//   ).join(', ');

//   if(setString.length === 0) {
//     return;
//   }

//   try {
//     const {rows: [post]} = await client.query(`
//       UPDATE posts
//       SET ${setString}
//       WHERE id=${id}
//       RETURNING *;
//     `, Object.values(fields));
//     return post;
//   } catch (error) {
//     console.error('Error updating post: ', error);
//   }
// }

async function getAllPosts() {
  try {
    //originally destructured results on {rows} and returned rows
    const { rows: postIds } = await client.query(`
      SELECT id
      FROM posts;
    `);

    const posts = await Promise.all(postIds.map(
      post => getPostById(post.id)
    ));

    return posts;
    
  } catch (error) {
    console.error('Error getting all posts: ', error);
  }
}

async function getPostsByUser(userId){
  try {
    //originally destructured results on {rows} and returned rows
    const { rows: postIds } = await client.query(`
      SELECT id FROM posts
      WHERE "authorId"=${ userId };
    `);

    //added in refactored function
    const posts = await Promise.all(postIds.map(
      post => getPostById(post.id)
    ));

    return posts;
  } catch (error) {
    throw error;
  }
}

async function getUserById(userId){
  try {
    const {rows: [user]} = await client.query(`
      SELECT * FROM users
      WHERE id = ${userId};
    `)
  
    if(!user){
      return;
    }
  
    delete user.password;
    const posts = await getPostsByUser(userId);
    user.posts = posts;
    return user;
    
  } catch (error) {
    console.error('Error getting user by id: ', error);
  }
}

async function getUserByUsername(username){
  try {
    const {rows: [user]} = await client.query(`
      SELECT *
      FROM users
      WHERE username=$1;
    `, [username]);

    return user;

  } catch (error) {
    console.error('Error getting user by username: ', error);
  }
}

// passed an array of strings (tagList)
async function createTags(tagList){
  
  // if there's nothing in the array of tags, then don't create tags
  if(tagList.length === 0){
    return;
  }

  // creates placeholder for each index in the tagList: '$1), ($2), ($3...'
  //will need to add open/close paren when interpolated to add the first and last parens
  // maps across the array of tags passed into the createTags function
  const insertValues = tagList.map(
    // for each element in the array (we don't care about giving it a name here so we say _ )
    // we take the index of the element we're currently mapping across in the array, and we insert the value of that index +1 into the string to make the placeholder ($1, etc.)
    (_, index) => `$${index + 1}`).join('), (');// map returns and array of each string that was created; this joins it in a big string with each little string separated by the given separator
  
  // creates placeholder for each index in the tagList: '$1, $2, $3,...'
  //will need to add open/close paren when interpolated
  //same thing here, but different separator. see if you can figure out why from the small example screenshots in the workshop
  const selectValues = tagList.map(
    (_, index) => `$${index + 1}`).join(', ');

//write a query here to Insert each of the tag name values from the tagList array Into the tags table
//remember, you have something you could include in the query that adds the string of tag name placeholders for you
//remember, there's a little something you need to add to your query for it to know what array of tags it's supposed make placeholders for
  try {
    await client.query(`
      INSERT INTO tags(name)
        VALUES (${insertValues})
        ON CONFLICT (name) DO NOTHING;
    `, tagList);

    //now that you added the tags to the table, you want to grab all the information about them from the table so you can return them to use in another function later
    //write a query to Select all those tags whose names were In your tag list
    //remember, you have something you could include in the query that adds the string of tag name placeholders for you
    //remember, there's a little something you need to add to your query for it to know what array of tags it's supposed make placeholders for
    //remember, this query gives you a result object, which includes the tags you want. how can you break down that results object to get those rows of tags?
    //once you figure that out, might help to assign it as the variable for this query so you can return the tags after your query
    const {rows: tags} = await client.query(`
      SELECT * FROM tags
        WHERE name
        IN (${selectValues});
    `, tagList);

    return tags;
  } catch (error) {
    console.error("Error creating tags: ", error);
  }
}

async function getAllTags(){
  try {
    const { rows: tags } = await client.query(`
      SELECT *
      FROM tags;
    `)
    return tags;
  } catch (error) {
    console.error('Error getting all tags: ', error);
  }
}

async function createPostTag(postId, tagId){
  try {
    await client.query(`
      INSERT INTO post_tags
      VALUES ($1, $2)
      ON CONFLICT ("postId", "tagId") DO NOTHING;
    `, [postId, tagId]);
  } catch (error) {
    console.error('Error creating a post tag: ')
  }
}

async function addTagsToPost(postId, tagList){
  try {
    const createPostTagPromises = tagList.map(
      tag => createPostTag(postId, tag.id)
    );

    await Promise.all(createPostTagPromises);

    return await getPostById(postId);
  } catch (error) {
    console.error('Error adding tags to post: ', error);
  }
}

async function getPostById(postId){
  try {
    const {rows: [post]} = await client.query(`
      SELECT * FROM posts
      WHERE id = $1;
    `, [postId]);

    const {rows: tags} = await client.query(`
      SELECT tags.*
      FROM tags
      JOIN post_tags ON tags.id = post_tags."tagId"
      WHERE post_tags."postId" = $1;
    `, [postId])

    const {rows: [author]} = await client.query(`
      SELECT id, username, name, location
      FROM users
      WHERE id = $1;
    `, [post.authorId]);

    post.tags = tags;
    post.author = author;

    delete post.authorId;

    return post;

  } catch (error) {
    console.error('Error getting post by id: ', error);
  }
}

async function getPostsByTagName(tagName) {
  try {
    const { rows: postIds } = await client.query(`
      SELECT posts.id
      FROM posts
      JOIN post_tags ON posts.id=post_tags."postId"
      JOIN tags ON tags.id=post_tags."tagId"
      WHERE tags.name=$1;
    `, [tagName]);

    return await Promise.all(postIds.map(
      post => getPostById(post.id)
    ));
  } catch (error) {
    throw error;
  }
} 

// export client and helper functions to use in seed.js
module.exports = {
  client,
  getAllUsers,
  createUser,
  updateUser,
  createPost,
  updatePost,
  getAllPosts,
  getPostsByTagName,
  getUserById,
  getUserByUsername,
  createTags,
  getAllTags,
  addTagsToPost
};