const express = require('express');
const tagsRouter = express.Router();
const { getAllTags, getPostsByTagName } = require('../db');

tagsRouter.use((req, res, next) => {
  console.log('A request is being made to /posts');

  next();
});

tagsRouter.get('/', async (req, res) => {
  const tags = await getAllTags();
  
  res.send({
    tags
  });
});

tagsRouter.get('/:tagName/posts', async (req, res, next) => {
  const { tagName } = req.params;
  try {
    const allPosts = await getPostsByTagName(tagName);
    const posts = allPosts.filter(post => {
      if (post.active) {
        return true;
      }
    
      if (req.user && post.author.id === req.user.id) {
        return true;
      }
    
      return false;
    });
    if (posts.length){
      res.send({ posts })

    } else {
      next({
        name: 'TagNotFoundError',
        message: 'There are no posts with that tag'
      })
    }
  } catch ({name, message}) {
    next({name, message});
  }
})

module.exports = tagsRouter;