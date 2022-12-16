const { Client } = require('pg');

const client = new Client('postgres://localhost:5432/juicebox-dev');

async function getAllUsers() {
  const { rows } = await client.query(`
    SELECT id, username, name, location, active
    FROM users;
  `);
  return rows;
}

async function createUser({ username, password, name, location }) {
  try {
    const { rows: [user] } = await client.query(`
      INSERT INTO users (username, password, name, location)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (username) DO NOTHING
        RETURNING *;
    `, [username, password, name, location]);
    return user;
  } catch (error) {
    console.error(error);
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

// passed an array of strings (tagList)
async function createTags(tagList){
  if(tagList.length === 0){
    return;
  }

  // creates placeholder for each index in the tagList: '$1), ($2), ($3...'
  //will need to add open/close paren when interpolated
  const insertValues = tagList.map(
    (_, index) => `$${index + 1}`).join('), (');
  
  // creates placeholder for each index in the tagList: '$1, $2, $3,...'
  //will need to add open/close paren when interpolated
  const selectValues = tagList.map(
    (_, index) => `$${index + 1}`).join(', ');

  try {
    await client.query(`
      INSERT INTO tags(name)
        VALUES (${insertValues})
        ON CONFLICT (name) DO NOTHING;
    `, tagList);

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

module.exports = { client, getAllUsers, createUser, updateUser, createPost, updatePost, getAllPosts, getPostsByTagName, getUserById, createTags, addTagsToPost };