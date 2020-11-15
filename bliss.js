'use strict';

/**
 * 
 * *** Server Entrypoint ***
 * 
 * This Server will handle all of the routes for the request and the response
 * of the Bliss Video Message being responded from the celeb on the request
 * from the clients.
 * 
 * All of the requests are backed by the Token Authorization, which will 
 * constitute only the Permanent Token Bearer and Admin API Key.
 * 
 */

 //Importing Modules
require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const chalk = require('./chalk.console');
const AWS = require('aws-sdk');
const blissRoutes = require('./routes/routes');

//Initializing Variables
const PORT = process.env.PORT || 5000;

AWS.config.update({region: 'us-east-2'});
const DynamoDBClient = new AWS.DynamoDB.DocumentClient({apiVersion: '2012-08-10'});
const S3Client = new AWS.S3({apiVersion: '2006-03-01'});
const SNSClient = new AWS.SNS({apiVersion: '2010-03-31'});

const app = express();


//Invoking Middlewares in the Routes and Route Handlers
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}));

app.use('/bliss', blissRoutes(DynamoDBClient, S3Client, SNSClient));
app.get('/ping', (req, res) => res.send('OK'));


//Server Listening
app.listen(PORT, () => console.log(chalk.info(`Server Is Running on Port ${PORT}`)));