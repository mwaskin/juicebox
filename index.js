// boilerplate for creating the server
const PORT = 3000;
const express = require('express');
const server = express();

//more imports
const apiRouter = require('./api');
const morgan = require('morgan');
const { client } = require('./db');

// logs out each incoming request without us having to write a log in each route
server.use(morgan('dev'));
// body-parser to turn incoming request bodies into useful objects
// request's header has to be Content-Type: application/json
server.use(express.json());


//server.use tells the server to always call this function
// pass in request object from client request body property
// the response object (which has methods to build and send back a response)
// the next function, which will move forward to the next matching middleware
server.use((req, res, next) => {
  console.log('<____Body Logger START___>');
  console.log(req.body);
  console.log('<____Body Logger END____>');
  
  next();
});

server.use('/api', apiRouter);

client.connect();

server.listen(PORT, () => {
  console.log('The server is up on port', PORT)
});
